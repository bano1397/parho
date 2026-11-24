package app.parho.reader

import org.json.JSONArray
import org.json.JSONObject
import java.util.regex.Pattern

// Port of src/ai/schema.ts + src/ai/router.ts (pure parts). No Android or Firebase here, so it is unit-tested on the JVM.

data class Field(val label: String, val value: String, val confidence: String = "high")
data class PrivateValue(val kind: String, val value: String)

enum class Source { NANO, CLOUD_FROM_OCR }

data class Extraction(
    val docType: String,
    val title: String?,
    val fields: List<Field>,
    val privateValues: List<PrivateValue>,
    val text: String,
    val source: Source = Source.NANO,
)

enum class Lang(val code: String) { UR("ur"), ROMAN_UR("roman_ur"), EN("en") }

data class CloudPayload(val docType: String, val title: String?, val fields: List<Field>, val redactedText: String, val language: Lang) {
    fun toJson(): String = JSONObject().apply {
        put("doc_type", docType)
        if (title != null) put("title", title)
        put("fields", JSONArray(fields.map { JSONObject().put("label", it.label).put("value", it.value) }))
        put("redacted_text", redactedText)
        put("language", language.code)
    }.toString(2).replace("\\/", "/")
}

private val DOC_TYPES = setOf("bill", "notice", "medicine", "other")
private val KINDS = setOf("NAME", "CNIC", "ADDRESS", "ACCOUNT", "PHONE", "EMAIL")
private val FENCE_START = Regex("^```(?:json)?\\s*", RegexOption.IGNORE_CASE)

/** Parse model output; tolerates ```json fences. Throws on invalid output. */
fun parseExtraction(raw: String, source: Source = Source.NANO): Extraction {
    val cleaned = FENCE_START.replace(raw.trim(), "").removeSuffix("```").trim()
    val o = JSONObject(cleaned)
    val dt = o.getString("doc_type")
    require(dt in DOC_TYPES) { "bad doc_type" }
    val fields = o.optJSONArray("fields")?.let { a ->
        (0 until a.length()).map { a.getJSONObject(it) }.map {
            Field(it.getString("label"), it.getString("value"), if (it.optString("confidence") == "low") "low" else "high")
        }
    } ?: emptyList()
    val pvs = o.optJSONArray("private_values")?.let { a ->
        (0 until a.length()).map { a.getJSONObject(it) }.map { PrivateValue(it.getString("kind"), it.getString("value")) }
            .filter { it.kind in KINDS }
    } ?: emptyList()
    val title = if (o.isNull("title")) null else o.optString("title").ifBlank { null }
    return Extraction(dt, title, fields, pvs, o.optString("text", ""), source)
}

private const val I = Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE
private fun rx(src: String, flags: Int = I): Regex = Pattern.compile(jsAscii(src), flags).toRegex()

private val PRIVATE_LABEL = rx("private|address|cnic|consumer|reference|ref\\.?\\s*(no|#)|account|acc\\.?\\s*(no|#)|meter\\s*(no|#|number)|phone|mobile|email|customer|cust\\.?\\s*(no|#|id)?\\b|recipient|holder|addressee|applicant|student|patient|father|husband|s/o|d/o|w/o|bill\\s*of|\\bid\\b|pata|walid|wald|sender|^\\s*(to|from)\\s*$|account\\s*title|iban")
private val MED_SAFE_LABEL = rx("^\\s*(brand\\s*)?(name|brand|title|product|drug|active[\\s_]*ingredients?|ingredients?|generic(\\s*name)?|composition|contains|strength|form|(medicine|drug|product|dawai|dawa)\\s*(ka\\s*)?(name|naam)?)\\s*$")
private val MED_RISKY_LABEL = rx("dos|per\\s*day|maximum|max|warning|caution|expir|exp\\.?\\s*date|direction|how\\s*to|frequency|every|usage|use|indicat|for\\b")
private val MED_RISKY_VALUE = rx("\\d\\s*\\+\\s*\\d|\\b(OD|BD|BID|TDS|TID|QID|HS|PRN|SOS|QDS)\\b|\\bx\\s*\\d|\\d\\s*x\\b|times|daily|hours?|hrs?|days?|weeks?|/\\s*kg|exceed|before|until|\\d{1,2}\\s*[/-]\\s*\\d{2,4}|child|adult|pregnan|take|tablets?\\s+every|every|baar|roz|din\\b|گولی|روزانہ|بار|دن|خوراک|max|maximum|up\\s*to|limit|per\\s*day|/\\s*day|a\\s*day|warning|caution|do not|don't|avoid|once|twice|thrice|morning|night|subah|shaam|raat|صبح|شام|رات")
private val STRENGTH_RE = rx("^\\s*\\d+(\\.\\d+)?\\s*(mg|mcg|µg|g|ml|%|iu)(\\s*/\\s*\\d*\\s*(ml|g|tab(let)?))?\\s*$")
private val FORM_RE = rx("^\\s*(tablets?|capsules?|syrup|suspension|drops?|cream|ointment|gel|injection|sachets?|inhaler|spray)\\s*$")
private val STRENGTH_ANY = rx("\\d+(\\.\\d+)?\\s*(mg|mcg|µg|g|ml|%|iu)\\b")
private val EMPTY_VALUE = rx("^(not specified|not readable|n/a|none|unknown|-)?$")

private fun medicineFieldOk(f: Field): Boolean {
    if (!MED_SAFE_LABEL.containsMatchIn(f.label) || MED_RISKY_LABEL.containsMatchIn(f.label)) return false
    if (rx("strength").containsMatchIn(f.label)) return STRENGTH_RE.containsMatchIn(f.value)
    if (rx("^\\s*form\\s*$").containsMatchIn(f.label)) return FORM_RE.containsMatchIn(f.value)
    if (MED_RISKY_VALUE.containsMatchIn(f.value)) return false
    // At most one strength per value: a second one is usually a daily maximum ("500 mg, 4 g").
    if (STRENGTH_ANY.findAll(f.value).count() > 1) return false
    return !Regex("\\d").containsMatchIn(STRENGTH_ANY.replace(f.value, ""))
}

/** Runs on the device: drops fields that are private by label, and medicine fields the model may have invented. */
fun sanitizeExtraction(ex: Extraction): Extraction {
    val fields = ex.fields.filter { f ->
        if (EMPTY_VALUE.containsMatchIn(f.value.trim())) return@filter false
        if (ex.docType == "medicine") return@filter medicineFieldOk(f)
        if (PRIVATE_LABEL.containsMatchIn(f.label)) return@filter false
        !rx("name|naam").containsMatchIn(f.label)
    }
    return ex.copy(fields = if (ex.docType == "bill") checkUnits(dropImplausible(fields)) else fields)
}

private val MONEY_OR_COUNT_LABEL = rx("amount|charges?|current\\s*bill|total|units?|consumption|reading(?!\\s*date)|arrears?|\\btax|duty|gst|\\bfee")
private val DATE_LABEL = rx("date|month|period")
private val NUMBER_ONLY = rx("^\\s*(rs\\.?|pkr)?\\s*-?[\\d,]+(\\.\\d+)?\\s*(/-|units?|kwh)?\\s*$")
private fun norm(v: String) = v.lowercase().replace(Regex("[^a-z0-9]"), "")

/** Hides bill fields that are clearly misread (non-number amount, copied due date, repeated month/units). */
fun dropImplausible(fields: List<Field>): List<Field> {
    val due = fields.firstOrNull { rx("due\\s*date").containsMatchIn(it.label) && !rx("after|before").containsMatchIn(it.label) }
    val seen = HashSet<String>()
    return fields.filter { f ->
        val isMoney = MONEY_OR_COUNT_LABEL.containsMatchIn(f.label) && !rx("prev\\w*\\s*months?|last|history").containsMatchIn(f.label)
        val dateOnly = DATE_LABEL.containsMatchIn(f.label) && !rx("amount|charges?|units?|total").containsMatchIn(f.label)
        if (isMoney && !dateOnly && !NUMBER_ONLY.containsMatchIn(f.value)) return@filter false
        if (due != null && f !== due && rx("date").containsMatchIn(f.label) && !rx("due").containsMatchIn(f.label) && norm(f.value) == norm(due.value)) return@filter false
        val kind = when {
            rx("month|period").containsMatchIn(f.label) -> "month"
            rx("^\\s*(units?|consumption)\\b").containsMatchIn(f.label) -> "units"
            else -> ""
        }
        if (kind.isNotEmpty()) {
            val key = "$kind:${norm(f.value)}"
            if (!seen.add(key)) return@filter false
        }
        true
    }
}

fun toNum(v: String?): Double {
    if (v == null) return Double.NaN
    val m = Regex("-?\\d+(\\.\\d+)?").find(v.replace(Regex("[,\\s]"), "")) ?: return Double.NaN
    return m.value.toDouble()
}

private val UNITS_LABEL = rx("^\\s*(current\\s*|billed\\s*|net\\s*|total\\s*)?units?\\s*(consumed|used|billed)?\\s*(\\(.*\\))?\\s*$")
private val MF_LABEL = rx("^\\s*(mf|multiplying\\s*factor|multiplier)\\s*$")

/** Units used = (present − previous reading) × MF, only when no units were read: the printed units win. */
private fun checkUnits(fields: List<Field>): List<Field> {
    val all = fields.joinToString(" ") { "${it.label} ${it.value}" }
    if (rx("gas|hm3|mmbtu|\\bm3\\b|cubic").containsMatchIn(all)) return fields
    val prev = fields.firstOrNull { rx("prev\\w*\\s*reading").containsMatchIn(it.label) } ?: return fields
    val cur = fields.firstOrNull { rx("(present|current)\\s*reading").containsMatchIn(it.label) } ?: return fields
    if ((prev.value + cur.value).contains('.')) return fields
    val mfField = fields.firstOrNull { MF_LABEL.containsMatchIn(it.label) }
    val mf = if (mfField != null) toNum(mfField.value) else 1.0
    if (!(mf >= 1) || mf != Math.floor(mf)) return fields
    val diff = (toNum(cur.value) - toNum(prev.value)) * mf
    if (!(diff > 0 && diff < 100000)) return fields
    if (fields.any { UNITS_LABEL.containsMatchIn(it.label) }) return fields
    return fields + prev.copy(label = "Units", value = diff.toLong().toString())
}

/** A title the cloud may see: a fixed phrase per document type, never the model's free text. */
private fun safeTitle(ex: Extraction): String {
    val t = "${ex.title ?: ""} ${ex.fields.joinToString(" ") { it.label }}"
    return when (ex.docType) {
        "medicine" -> ex.fields.firstOrNull { rx("name|brand|product|drug|title").containsMatchIn(it.label) }?.value ?: "Medicine"
        "bill" -> when {
            rx("gas|sngpl|ssgc").containsMatchIn(t) -> "Gas bill"
            rx("water|wasa").containsMatchIn(t) -> "Water bill"
            rx("electric|bijli|lesco|iesco|fesco|mepco|gepco|pesco|hesco|sepco|qesco|tesco|k-?electric|units|kwh").containsMatchIn(t) -> "Electricity bill"
            else -> "Bill"
        }
        "notice" -> "Notice"
        else -> "Document"
    }
}

private val PRIVATE_TOKEN = Regex("\\[(NAME|CNIC|ADDRESS|ACCOUNT|PHONE|EMAIL|LONG_NUMBER)\\]")

/** Builds the ONLY object that may go to the cloud for the explanation. Throws PrivacyBlocked. */
fun buildCloudPayload(ex: Extraction, language: Lang): CloudPayload {
    val known = ex.privateValues.map { it.value }
    val clean = sanitizeExtraction(ex)
    val payload = CloudPayload(
        docType = ex.docType,
        title = safeTitle(clean),
        fields = clean.fields
            .map { Field(redact(it.label, ex.privateValues), redact(it.value, ex.privateValues)) }
            .filter { !PRIVATE_TOKEN.containsMatchIn(it.value) },
        redactedText = if (ex.docType == "medicine") "" else redact(ex.text, ex.privateValues).take(4000),
        language = language,
    )
    assertClean(payload.toJson(), known)
    return payload
}

const val BILL_JUMP_RATIO = 0.5

private val MONTH_TOKEN = rx("\\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\b")
private val NUM_DATE = rx("\\b\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{2,4}\\b")
private val THOUSANDS = rx("(\\d),(?=\\d{3}(?!\\d))")
private val MONTH_YEAR = rx("[a-z]{3,9}\\.?\\s*[-'’]?\\s*(?:19|20)\\d{2}(?!\\d)")
// Two-digit years only when joined ("NOV-25", "NOV'25", "NOV25") or followed by another number ("NOV 25 300").
private val MONTH_YEAR2 = rx("[a-z]{3,9}(?:\\.?[-'’]|\\.?)\\d{2}(?!\\d)|[a-z]{3,9}\\.?\\s+\\d{2}(?=\\s+\\d)")

/** Units numbers from a history value: drops dates, month-year tokens ("NOV-25", "NOV 25", "Nov 2025") and thousands commas. */
fun historyNumbers(value: String): List<Int> {
    var v = NUM_DATE.replace(value, " ")
    v = THOUSANDS.replace(v, "$1")
    v = MONTH_YEAR.replace(v, " ")
    v = MONTH_YEAR2.replace(v, " ")
    return Regex("\\d{1,5}").findAll(v).map { it.value.toInt() }.filter { it in 1..4999 && it !in 1990..2100 }.toList()
}

/** Computed on the device: does this bill jump sharply compared to earlier months? */
fun billNote(ex: Extraction): String? {
    if (ex.docType != "bill") return null
    val fields = sanitizeExtraction(ex).fields
    val mf = toNum(fields.firstOrNull { MF_LABEL.containsMatchIn(it.label) }?.value)
    if (mf > 1) return null
    val units = fields.firstOrNull { UNITS_LABEL.containsMatchIn(it.label) && !rx("prev|last|history").containsMatchIn(it.label) } ?: return null
    val hist = fields.filter { rx("prev|last|history").containsMatchIn(it.label) && !rx("reading").containsMatchIn(it.label) }
    val history = if (hist.any { rx("history").containsMatchIn(it.label) }) hist.filter { rx("history").containsMatchIn(it.label) } else hist
    // If the reader left the printed history line out of its fields, read it from the (redacted) text,
    // but only a line that looks like a units history (not "Payment History: 12-10-2026 Rs 5,000").
    val histMatch = rx("^.*\\bhistory\\b[^:\\n]*:(.*)$", I or Pattern.MULTILINE).find(ex.text)
    val lineOk = histMatch != null && !rx("\\b(rs|pkr|paid|payment)\\b|rs\\.|\\[").containsMatchIn(histMatch.value) &&
        (rx("units?|kwh|consumption").containsMatchIn(histMatch.value) || MONTH_TOKEN.findAll(histMatch.groupValues[1]).count() >= 3)
    val fromText = !hist.any { rx("history").containsMatchIn(it.label) } && lineOk
    val source = if (fromText) listOf(Field("History", histMatch!!.groupValues[1])) else history
    val past = source.flatMap { historyNumbers(it.value) }
    if (fromText && past.size < 3) return null
    if (past.isEmpty()) return null
    val cur = toNum(units.value)
    val avg = past.average()
    if (cur.isNaN() || cur == 0.0 || avg == 0.0) return null
    val ratio = (cur - avg) / avg
    if (ratio > BILL_JUMP_RATIO) {
        return "This month's units (${fmt(cur)}) are ${Math.round(ratio * 100)}% higher than the average of earlier months (${Math.round(avg)}). " +
            "Mention this gently and suggest checking the meter reading or asking the company; do not say it is fraud."
    }
    return null
}

private fun fmt(d: Double) = if (d == Math.floor(d)) d.toLong().toString() else d.toString()

/** The pharmacist line is a safety rule, so it is enforced in code, not left to the model. */
fun finishExplanation(text: String, payload: CloudPayload): String {
    val t = text.trim()
    if (payload.docType != "medicine") return t
    val end = Prompts.medEnd(payload.language)
    return if (t.contains(end)) t else "$t\n$end"
}
