package app.parho.reader

import java.text.Normalizer
import java.util.regex.Pattern

// Port of src/privacy/safetyNet.ts and src/privacy/redact.ts. Keep the patterns in step with the web app.

enum class PrivateKind { CNIC, PHONE, EMAIL, LONG_NUMBER, IMAGE_DATA, KNOWN_VALUE }

class PrivacyBlocked(val kind: PrivateKind) : Exception("Privacy check blocked the cloud request ($kind)")

private const val I = Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE
private const val M = Pattern.MULTILINE
private fun rx(src: String, flags: Int = 0): Regex = Pattern.compile(src, flags).toRegex()

/** Convert Urdu (۰-۹), Arabic-Indic (٠-٩), Devanagari and fullwidth digits to 0-9; drop zero-width characters. */
fun normaliseDigits(s: String): String {
    val n = Normalizer.normalize(s, Normalizer.Form.NFKC)
    val sb = StringBuilder(n.length)
    for (c in n) {
        when (c) {
            in '\u200B'..'\u200D', '\u2060', '\uFEFF' -> {}
            '\u00A0', '\u2007', '\u202F' -> sb.append(' ')
            in '\u0966'..'\u096F' -> sb.append('0' + (c - '\u0966'))
            in '\u06F0'..'\u06F9' -> sb.append('0' + (c - '\u06F0'))
            in '\u0660'..'\u0669' -> sb.append('0' + (c - '\u0660'))
            else -> sb.append(c)
        }
    }
    return sb.toString()
}

private const val SEP = "\\s*[-.–—/]?\\s*"

data class KindPattern(val kind: PrivateKind, val re: Regex)

val PATTERNS: List<KindPattern> = listOf(
    KindPattern(PrivateKind.CNIC, rx("(?<!\\d)\\d{5}${SEP}\\d{7}${SEP}\\d(?!\\d)")),
    KindPattern(PrivateKind.CNIC, rx("(?<!\\d)\\d{4}\\s\\d{4}\\s\\d{4}\\s\\d(?!\\d)")),
    KindPattern(PrivateKind.PHONE, rx("(?<!\\d)(\\+\\s*92${SEP}|0092${SEP}|92${SEP}|\\(?0)\\s*3\\d{2}\\)?${SEP}\\d{3}${SEP}\\d{4}(?!\\d)")),
    KindPattern(PrivateKind.PHONE, rx("(?<![\\d-])0\\d{2,3}\\s*-\\s*\\d{7,8}(?!\\d)")),
    KindPattern(PrivateKind.CNIC, rx("(?<![\\d-])(?:\\d[\\s-]?){12}\\d(?![\\d-])")),
    KindPattern(PrivateKind.EMAIL, rx("\\b[\\w.+-]+\\s+at\\s+[\\w-]+\\s+dot\\s+(?:com|pk|net|org)\\b", I)),
    KindPattern(PrivateKind.LONG_NUMBER, rx("\\bPK\\s?\\d{2}\\s?[A-Z]{4}(?:\\s?\\d){16}\\b", I)),
    KindPattern(PrivateKind.EMAIL, rx("[\\w.+-]+\\s*(@|\\[at\\]|\\(at\\))\\s*[\\w-]+\\s*\\.\\s*[a-z]{2,}(\\.[a-z]{2,})*", I)),
    KindPattern(PrivateKind.LONG_NUMBER, rx("(?<![\\w-])(?=[\\w-]*[a-z])(?=(?:[\\w-]*?\\d){7})[a-z0-9]+(?:-[a-z0-9]+)+(?![\\w-])", I)),
    KindPattern(PrivateKind.LONG_NUMBER, rx("(?<!\\d)\\d{10,}(?!\\d)")),
)

private val IMAGE_RE = rx("data:image|[A-Za-z0-9+/=]{200,}")
private val SQUASH = rx("[\\s\\-.,_/–—'’()\\u200B-\\u200D]+")

/** Lower-case and remove spaces/punctuation so "Ahmed  KHAN" matches "ahmed khan". */
fun squash(s: String): String = SQUASH.replace(s.lowercase(), "")

/** Returns the first private kind found, or null if the text looks clean. */
fun findPrivate(text: String, knownValues: List<String> = emptyList()): PrivateKind? {
    if (IMAGE_RE.containsMatchIn(text)) return PrivateKind.IMAGE_DATA
    val t = normaliseDigits(text)
    for (p in PATTERNS) if (p.re.containsMatchIn(t)) return p.kind
    val flat = squash(t)
    for (v in knownValues) {
        val sv = squash(normaliseDigits(v))
        if (sv.length >= 3 && flat.contains(sv)) return PrivateKind.KNOWN_VALUE
    }
    return null
}

/** Throws PrivacyBlocked if the serialised payload contains anything private. */
fun assertClean(serialised: String, knownValues: List<String> = emptyList()) {
    findPrivate(serialised, knownValues)?.let { throw PrivacyBlocked(it) }
}

// ---- Redactor ----

private fun flexibleRe(value: String): Regex? {
    val chars = squash(normaliseDigits(value)).toList()
    if (chars.size < 2) return null
    val body = chars.joinToString("[\\s\\-.,_/–—'’()]*") { Pattern.quote(it.toString()) }
    return rx("(?<![\\p{L}\\p{N}])$body(?![\\p{L}\\p{N}])", I)
}

private val LABELLED: List<Pair<String, Regex>> = listOf(
    "NAME" to rx("^(\\s*(?:(?:to|name|patient|bill\\s*to)\\s*:|(?:consumer(?:'s)?|customer|father(?:'s)?|patient)\\s*name\\s*[:\\-–.]?|s/o|d/o|w/o|mr\\.?|mrs\\.?|ms\\.?|نام\\s*:?|بنام)\\s*)(?!\\s*\\[)(\\S.*)$", I or M),
    "NAME" to rx("^(\\s*dear\\s+)(?!\\[)([^,\\n]+)", I or M),
    "NAME" to rx("^(\\s*(?:name(?!\\s*of\\b)|naam|bill\\s*to|account\\s*title|title\\s*of\\s*account|holder|walid|wald|sender)\\s*[:\\-–.]?\\s*)(?!\\[)((?:\\p{Lu}|[\\u0600-\\u06FF]).*)$", I or M),
    "NAME" to rx("^(\\s*(?:ولد|بنت|زوجہ|ولدیت\\s*:?)\\s*)(?!\\[)(\\S.*)$", M),
    "ADDRESS" to rx("^(\\s*(?:address|addr\\.?|service\\s*address|postal\\s*address|pata|پتہ|پتا)\\s*[:\\-–.]?\\s*)(?!\\[)(\\S.*)$", I or M),
    "ACCOUNT" to rx("(\\b(?:account\\s*(?:no|#|number|id)|acc\\.?\\s*(?:no|#)|a/c\\s*(?:no|#)?|consumer(?:\\s*(?:no|id|#|number))?|reference\\s*(?:no|#|number)?|ref\\.?\\s*(?:no|#)?|customer\\s*(?:id|no|#)|cust\\.?\\s*(?:id|no|#)|meter(?:\\s*(?:no|#|number))?|ac\\.?\\s*(?:no|#)|iban)\\.?\\s*[:\\-–.]?\\s*)(?!\\[)(\\d[\\d\\s-]{6,}\\d(?:\\s?[A-Z]\\b)?|(?=[\\w-]*\\d)[\\w-]{5,}(?:\\s\\d{3,})*)", I or M),
)

private val ADDRESS_WORDS = rx("\\b(?:house|h\\.\\s*no|h#|street|st\\.\\s*no|gali|block|sector|mohalla|muhalla|chak|ck\\s*no|village|tehsil|colony|town|phase|plot|dha|road)\\b\\.?\\s*(?:no\\.?|#)?\\s*[\\w-]*[^,\\n]{0,60}", I)
private val LABEL_TOKEN = rx("^\\[[A-Z_]+\\]$")

fun redactLabelledLines(text: String): String {
    var out = text
    for ((kind, re) in LABELLED) {
        out = re.replace(out) { m ->
            val head = m.groupValues[1]; val v = m.groupValues[2]
            if (LABEL_TOKEN.matches(v.trim())) head + v else "$head[$kind]"
        }
    }
    return ADDRESS_WORDS.replace(out) { m -> if (m.value.startsWith("[")) m.value else "[ADDRESS]" }
}

fun redact(text: String, privateValues: List<PrivateValue> = emptyList()): String {
    var out = normaliseDigits(text)
    for (pv in privateValues.sortedByDescending { it.value.length }) {
        val re = flexibleRe(pv.value) ?: continue
        out = re.replace(out) { "[${pv.kind}]" }
    }
    out = redactLabelledLines(out)
    for (p in PATTERNS) out = p.re.replace(out) { "[${p.kind}]" }
    return out
}
