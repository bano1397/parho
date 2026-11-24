// Extraction model + on-device checks. A port of src/ai/schema.ts and the pure parts of src/ai/router.ts.
import Foundation

enum DocType: String, Codable, CaseIterable, Sendable { case bill, notice, medicine, other }
enum PVKind: String, Codable, CaseIterable, Sendable { case NAME, CNIC, ADDRESS, ACCOUNT, PHONE, EMAIL }
enum Lang: String, Codable, CaseIterable, Sendable { case ur, roman_ur, en }

struct Field: Codable, Hashable, Sendable {
    var label: String
    var value: String
    var confidence: String? = "high"
}

struct PrivateValue: Codable, Hashable, Sendable {
    var kind: PVKind
    var value: String
}

enum ExtractionSource: String, Sendable { case onDevice = "on_device", cloudFromOcr = "cloud_from_ocr" }

struct Extraction: Sendable {
    var docType: DocType
    var title: String?
    var fields: [Field]
    var privateValues: [PrivateValue]
    var text: String
    var source: ExtractionSource
}

struct CloudPayload: Codable, Sendable, Equatable {
    struct PField: Codable, Sendable, Equatable { var label: String; var value: String }
    var doc_type: DocType
    var title: String?
    var fields: [PField]
    var redacted_text: String
    var language: Lang

    var json: String {
        let e = JSONEncoder()
        e.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        return (try? String(data: e.encode(self), encoding: .utf8)) ?? "{}"
    }
}

struct TimelineEntry: Identifiable, Sendable {
    let id = UUID()
    let step: String // read | redact | explain
    let onDevice: Bool
    let engine: String
    let reason: String
    let ms: Int
    var bytesOut: Int? = nil
}

enum Doc {
    // MARK: parsing (tolerates ```json fences and missing keys, like zod defaults)

    private struct Raw: Decodable {
        var doc_type: String?
        var title: String?
        var fields: [RawField]?
        var private_values: [RawPV]?
        var text: String?
    }
    private struct RawField: Decodable { var label: String?; var value: String?; var confidence: String? }
    private struct RawPV: Decodable { var kind: String?; var value: String? }

    struct BadOutput: Error {}

    static func parse(_ raw: String, source: ExtractionSource) throws -> Extraction {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        s = s.replacingOccurrences(of: "^```(?:json)?\\s*", with: "", options: [.regularExpression, .caseInsensitive])
        s = s.replacingOccurrences(of: "```$", with: "", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
        guard let data = s.data(using: .utf8), let r = try? JSONDecoder().decode(Raw.self, from: data),
              let dt = DocType(rawValue: (r.doc_type ?? "").lowercased()) else { throw BadOutput() }
        let fields = (r.fields ?? []).compactMap { f -> Field? in
            guard let l = f.label, let v = f.value else { return nil }
            return Field(label: l, value: v, confidence: f.confidence == "low" ? "low" : "high")
        }
        let pvs = (r.private_values ?? []).compactMap { p -> PrivateValue? in
            guard let k = PVKind(rawValue: (p.kind ?? "").uppercased()), let v = p.value, !v.isEmpty else { return nil }
            return PrivateValue(kind: k, value: v)
        }
        return Extraction(docType: dt, title: r.title, fields: fields, privateValues: pvs, text: r.text ?? "", source: source)
    }

    // MARK: sanitize

    static let PRIVATE_LABEL = Rx("private|address|cnic|consumer|reference|ref\\.?\\s*(no|#)|account|acc\\.?\\s*(no|#)|meter\\s*(no|#|number)|phone|mobile|email|customer|cust\\.?\\s*(no|#|id)?\\b|recipient|holder|addressee|applicant|student|patient|father|husband|s/o|d/o|w/o|bill\\s*of|\\bid\\b|pata|walid|wald|sender|^\\s*(to|from)\\s*$|account\\s*title|iban", [.caseInsensitive])
    static let MED_SAFE_LABEL = Rx("^\\s*(brand\\s*)?(name|brand|title|product|drug|active[\\s_]*ingredients?|ingredients?|generic(\\s*name)?|composition|contains|strength|form|(medicine|drug|product|dawai|dawa)\\s*(ka\\s*)?(name|naam)?)\\s*$", [.caseInsensitive])
    static let MED_RISKY_LABEL = Rx("dos|per\\s*day|maximum|max|warning|caution|expir|exp\\.?\\s*date|direction|how\\s*to|frequency|every|usage|use|indicat|for\\b", [.caseInsensitive])
    static let MED_RISKY_VALUE = Rx("\\d\\s*\\+\\s*\\d|\\b(OD|BD|BID|TDS|TID|QID|HS|PRN|SOS|QDS)\\b|\\bx\\s*\\d|\\d\\s*x\\b|times|daily|hours?|hrs?|days?|weeks?|/\\s*kg|exceed|before|until|\\d{1,2}\\s*[/-]\\s*\\d{2,4}|child|adult|pregnan|take|tablets?\\s+every|every|baar|roz|din\\b|گولی|روزانہ|بار|دن|خوراک|max|maximum|up\\s*to|limit|per\\s*day|/\\s*day|a\\s*day|warning|caution|do not|don't|avoid|once|twice|thrice|morning|night|subah|shaam|raat|صبح|شام|رات", [.caseInsensitive])
    static let STRENGTH_RE = Rx("^\\s*\\d+(\\.\\d+)?\\s*(mg|mcg|µg|g|ml|%|iu)(\\s*/\\s*\\d*\\s*(ml|g|tab(let)?))?\\s*$", [.caseInsensitive])
    static let FORM_RE = Rx("^\\s*(tablets?|capsules?|syrup|suspension|drops?|cream|ointment|gel|injection|sachets?|inhaler|spray)\\s*$", [.caseInsensitive])
    static let STRENGTH_ANY = Rx("\\d+(\\.\\d+)?\\s*(mg|mcg|µg|g|ml|%|iu)\\b", [.caseInsensitive])
    static let EMPTY_VALUE = Rx("^(not specified|not readable|n/a|none|unknown|-)?$", [.caseInsensitive])

    static func medicineFieldOk(_ f: Field) -> Bool {
        if !MED_SAFE_LABEL.test(f.label) || MED_RISKY_LABEL.test(f.label) { return false }
        if Rx("strength", [.caseInsensitive]).test(f.label) { return STRENGTH_RE.test(f.value) }
        if Rx("^\\s*form\\s*$", [.caseInsensitive]).test(f.label) { return FORM_RE.test(f.value) }
        if MED_RISKY_VALUE.test(f.value) { return false }
        // At most one strength per value: a second one is usually a daily maximum ("500 mg, 4 g").
        if STRENGTH_ANY.matches(f.value).count > 1 { return false }
        // Names/ingredients may carry a strength ("Paracetamol 500 mg") but no other numbers.
        let rest = Rx("\\d+(\\.\\d+)?\\s*(mg|mcg|µg|g|ml|%|iu)\\b", [.caseInsensitive]).replace(f.value, with: "")
        return !Rx("\\d").test(rest)
    }

    /// Runs on the device: drops private-by-label fields and medicine fields the model may have invented.
    static func sanitize(_ ex: Extraction) -> Extraction {
        let fields = ex.fields.filter { f in
            if EMPTY_VALUE.test(f.value.trimmingCharacters(in: .whitespacesAndNewlines)) { return false }
            if ex.docType == .medicine { return medicineFieldOk(f) }
            if PRIVATE_LABEL.test(f.label) { return false }
            return !Rx("name|naam", [.caseInsensitive]).test(f.label)
        }
        var out = ex
        out.fields = ex.docType == .bill ? checkUnits(dropImplausible(fields)) : fields
        return out
    }

    static let MONEY_OR_COUNT_LABEL = Rx("amount|charges?|current\\s*bill|total|units?|consumption|reading(?!\\s*date)|arrears?|\\btax|duty|gst|\\bfee", [.caseInsensitive])
    static let DATE_LABEL = Rx("date|month|period", [.caseInsensitive])
    static let NUMBER_ONLY = Rx("^\\s*(rs\\.?|pkr)?\\s*-?[\\d,]+(\\.\\d+)?\\s*(/-|units?|kwh)?\\s*$", [.caseInsensitive])
    static func norm(_ v: String) -> String { v.lowercased().replacingOccurrences(of: "[^a-z0-9]", with: "", options: .regularExpression) }

    /// Hides bill fields that are clearly misread: a non-number amount, a date copying the due date, a repeated month/units.
    static func dropImplausible(_ fields: [Field]) -> [Field] {
        let due = fields.first { Rx("due\\s*date", [.caseInsensitive]).test($0.label) && !Rx("after|before", [.caseInsensitive]).test($0.label) }
        var seen = Set<String>()
        var out: [Field] = []
        for f in fields {
            let isMoney = MONEY_OR_COUNT_LABEL.test(f.label) && !Rx("prev\\w*\\s*months?|last|history", [.caseInsensitive]).test(f.label)
            if isMoney && !(DATE_LABEL.test(f.label) && !Rx("amount|charges?|units?|total", [.caseInsensitive]).test(f.label)) && !NUMBER_ONLY.test(f.value) { continue }
            if let due, f != due, Rx("date", [.caseInsensitive]).test(f.label), !Rx("due", [.caseInsensitive]).test(f.label), norm(f.value) == norm(due.value) { continue }
            let kind = Rx("month|period", [.caseInsensitive]).test(f.label) ? "month" : Rx("^\\s*(units?|consumption)\\b", [.caseInsensitive]).test(f.label) ? "units" : ""
            if !kind.isEmpty {
                let key = "\(kind):\(norm(f.value))"
                if seen.contains(key) { continue }
                seen.insert(key)
            }
            out.append(f)
        }
        return out
    }

    static func toNum(_ v: String?) -> Double {
        guard let v else { return .nan }
        let c = v.replacingOccurrences(of: "[,\\s]", with: "", options: .regularExpression)
        guard let m = Rx("-?\\d+(\\.\\d+)?").firstMatch(c) else { return .nan }
        return Double(m) ?? .nan
    }
    static let UNITS_LABEL = Rx("^\\s*(current\\s*|billed\\s*|net\\s*|total\\s*)?units?\\s*(consumed|used|billed)?\\s*(\\(.*\\))?\\s*$", [.caseInsensitive])

    /// Units = (present − previous reading) × MF, used only when no units were read: the printed units win.
    static func checkUnits(_ fields: [Field]) -> [Field] {
        let all = fields.map { "\($0.label) \($0.value)" }.joined(separator: " ")
        if Rx("gas|hm3|mmbtu|\\bm3\\b|cubic", [.caseInsensitive]).test(all) { return fields }
        guard let prev = fields.first(where: { Rx("prev\\w*\\s*reading", [.caseInsensitive]).test($0.label) }),
              let cur = fields.first(where: { Rx("(present|current)\\s*reading", [.caseInsensitive]).test($0.label) }),
              !(prev.value + cur.value).contains(".") else { return fields }
        let mfField = fields.first { Rx("^\\s*(mf|multiplying\\s*factor|multiplier)\\s*$", [.caseInsensitive]).test($0.label) }
        let mf = mfField.map { toNum($0.value) } ?? 1
        if !(mf >= 1) || mf.rounded() != mf { return fields }
        let diff = (toNum(cur.value) - toNum(prev.value)) * mf
        if !(diff > 0 && diff < 100000) { return fields }
        if fields.contains(where: { UNITS_LABEL.test($0.label) }) { return fields }
        return fields + [Field(label: "Units", value: String(Int(diff)), confidence: prev.confidence)]
    }

    /// A fixed phrase per document type, never the model's free text (it can hold a name).
    static func safeTitle(_ ex: Extraction) -> String {
        let t = "\(ex.title ?? "") \(ex.fields.map(\.label).joined(separator: " "))"
        switch ex.docType {
        case .medicine:
            return ex.fields.first { Rx("name|brand|product|drug|title", [.caseInsensitive]).test($0.label) }?.value ?? "Medicine"
        case .bill:
            if Rx("gas|sngpl|ssgc", [.caseInsensitive]).test(t) { return "Gas bill" }
            if Rx("water|wasa", [.caseInsensitive]).test(t) { return "Water bill" }
            if Rx("electric|bijli|lesco|iesco|fesco|mepco|gepco|pesco|hesco|sepco|qesco|tesco|k-?electric|units|kwh", [.caseInsensitive]).test(t) { return "Electricity bill" }
            return "Bill"
        case .notice: return "Notice"
        case .other: return "Document"
        }
    }

    static let privateTag = Rx("\\[(NAME|CNIC|ADDRESS|ACCOUNT|PHONE|EMAIL|LONG_NUMBER)\\]")

    /// Builds the ONLY object that may go to the cloud. Throws PrivacyBlocked.
    static func buildCloudPayload(_ ex: Extraction, _ language: Lang) throws -> CloudPayload {
        let known = ex.privateValues.map(\.value)
        let s = sanitize(ex)
        let p = CloudPayload(
            doc_type: ex.docType,
            title: safeTitle(s),
            fields: s.fields
                .map { CloudPayload.PField(label: Privacy.redact($0.label, ex.privateValues), value: Privacy.redact($0.value, ex.privateValues)) }
                .filter { !privateTag.test($0.value) },
            // Medicine: the explanation gets only the safe fields, never the raw text with its dose lines.
            redacted_text: ex.docType == .medicine ? "" : String(Privacy.redact(ex.text, ex.privateValues).prefix(4000)),
            language: language)
        try Privacy.assertClean(p.json, known: known)
        return p
    }

    static let BILL_JUMP_RATIO = 0.5

    static let MONTH_TOKEN = Rx("\\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\b", [.caseInsensitive])
    /// Units numbers from a history value: drops dates, month-year tokens ("NOV-25", "NOV 25", "Nov 2025") and thousands commas.
    static func historyNumbers(_ value: String) -> [Double] {
        var v = Rx("\\b\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{2,4}\\b").replace(value, with: " ")
        v = Rx("(\\d),(?=\\d{3}(?!\\d))").replace(v) { g in g[1] }
        v = Rx("[a-z]{3,9}\\.?\\s*[-'’]?\\s*(?:19|20)\\d{2}(?!\\d)", [.caseInsensitive]).replace(v, with: " ")
        // Two-digit years only when joined ("NOV-25", "NOV'25", "NOV25") or followed by another number ("NOV 25 300").
        v = Rx("[a-z]{3,9}(?:\\.?[-'’]|\\.?)\\d{2}(?!\\d)|[a-z]{3,9}\\.?\\s+\\d{2}(?=\\s+\\d)", [.caseInsensitive]).replace(v, with: " ")
        return Rx("\\d{1,5}").matches(v).compactMap(Double.init).filter { $0 > 0 && $0 < 5000 && !($0 >= 1990 && $0 <= 2100) }
    }

    /// Computed on the device: does this bill jump sharply compared to earlier months?
    static func billNote(_ ex: Extraction) -> String? {
        guard ex.docType == .bill else { return nil }
        let fields = sanitize(ex).fields
        let mf = toNum(fields.first { Rx("^\\s*(mf|multiplying\\s*factor|multiplier)\\s*$", [.caseInsensitive]).test($0.label) }?.value)
        if mf > 1 { return nil }
        let hist = fields.filter { Rx("prev|last|history", [.caseInsensitive]).test($0.label) && !Rx("reading", [.caseInsensitive]).test($0.label) }
        guard let units = fields.first(where: { UNITS_LABEL.test($0.label) && !Rx("prev|last|history", [.caseInsensitive]).test($0.label) }) else { return nil }
        let history = hist.contains { Rx("history", [.caseInsensitive]).test($0.label) } ? hist.filter { Rx("history", [.caseInsensitive]).test($0.label) } : hist
        // If the reader left the printed history line out of its fields, read it from the (redacted) text,
        // but only a line that looks like a units history (not "Payment History: 12-10-2026 Rs 5,000").
        var line: (whole: String, value: String)?
        _ = Rx("^.*\\bhistory\\b[^:\\n]*:(.*)$", [.caseInsensitive, .anchorsMatchLines]).replace(ex.text) { g in
            if line == nil { line = (g[0], g[1]) }
            return g[0]
        }
        var lineOk = false
        if let line {
            lineOk = !Rx("\\b(rs|pkr|paid|payment)\\b|rs\\.|\\[", [.caseInsensitive]).test(line.whole) &&
                (Rx("units?|kwh|consumption", [.caseInsensitive]).test(line.whole) || MONTH_TOKEN.matches(line.value).count >= 3)
        }
        let fromText = !hist.contains(where: { Rx("history", [.caseInsensitive]).test($0.label) }) && lineOk
        let source = fromText ? [Field(label: "History", value: line!.value)] : history
        let past = source.flatMap { historyNumbers($0.value) }
        if fromText && past.count < 3 { return nil }
        if past.isEmpty { return nil }
        let cur = toNum(units.value)
        let avg = past.reduce(0, +) / Double(past.count)
        guard cur.isFinite, cur != 0, avg != 0 else { return nil }
        let ratio = (cur - avg) / avg
        if ratio > BILL_JUMP_RATIO {
            return "This month's units (\(cur == cur.rounded() ? String(Int(cur)) : String(cur))) are \(Int((ratio * 100).rounded()))% higher than the average of earlier months (\(Int(avg.rounded()))). Mention this gently and suggest checking the meter reading or asking the company; do not say it is fraud."
        }
        return nil
    }

    /// The pharmacist line is a safety rule, so it is enforced here, not left to the model.
    static func finishExplanation(_ text: String, _ p: CloudPayload) -> String {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if p.doc_type != .medicine { return t }
        // The exact closing line must be there; a reply that merely mentions a pharmacist is not enough.
        return t.contains(Prompts.medEnd(p.language)) ? t : "\(t)\n\(Prompts.medEnd(p.language))"
    }
}
