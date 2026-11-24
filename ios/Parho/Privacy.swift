// Privacy: Safety Net + Redactor. A direct port of src/privacy/safetyNet.ts and src/privacy/redact.ts,
// so the iPhone app hides and blocks exactly what the web app does. Runs only on this device.
import Foundation

enum PrivateKind: String, Codable, CaseIterable, Sendable {
    case CNIC, PHONE, EMAIL, LONG_NUMBER, IMAGE_DATA, KNOWN_VALUE
}

struct PrivacyBlocked: Error, Equatable {
    let kind: PrivateKind
}

// MARK: - Regex helpers (ICU, same syntax as the JS patterns)

struct Rx: @unchecked Sendable {
    let re: NSRegularExpression
    /// `ascii: true` (the default) makes \w, \b and \d ASCII-only, like JavaScript regexes without the u flag.
    /// ICU treats them as Unicode, so an Urdu letter next to an ID would otherwise count as a "word" character
    /// and stop a pattern from matching (deep-test finding: Urdu-adjacent IDs reached the cloud on iOS).
    init(_ pattern: String, _ options: NSRegularExpression.Options = [], ascii: Bool = true) {
        // Patterns are constants checked by the tests, so a bad one is a programming error.
        re = try! NSRegularExpression(pattern: ascii ? Rx.asciiClasses(pattern) : pattern, options: options)
    }
    static let W = "[A-Za-z0-9_]"
    static let B = "(?:(?<=[A-Za-z0-9_])(?![A-Za-z0-9_])|(?<![A-Za-z0-9_])(?=[A-Za-z0-9_]))"
    /// Rewrites \w → [A-Za-z0-9_], \d → [0-9] (also inside character classes) and \b → an ASCII word boundary.
    static func asciiClasses(_ p: String) -> String {
        var out = ""
        var it = p.makeIterator()
        var inClass = false
        while let c = it.next() {
            if c == "\\" {
                guard let n = it.next() else { out.append(c); break }
                switch n {
                case "w": out += inClass ? "A-Za-z0-9_" : W
                case "d": out += inClass ? "0-9" : "[0-9]"
                case "b" where !inClass: out += B
                default: out.append(c); out.append(n)
                }
                continue
            }
            if c == "[" { inClass = true } else if c == "]" { inClass = false }
            out.append(c)
        }
        return out
    }
    var pattern: String { re.pattern }
    func test(_ s: String) -> Bool {
        re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil
    }
    func firstMatch(_ s: String) -> String? {
        guard let m = re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)), let r = Range(m.range, in: s) else { return nil }
        return String(s[r])
    }
    func matches(_ s: String) -> [String] {
        re.matches(in: s, range: NSRange(s.startIndex..., in: s)).compactMap { Range($0.range, in: s).map { String(s[$0]) } }
    }
    /// Replace every match; `f` receives the capture groups (index 0 = whole match, missing groups = "").
    func replace(_ s: String, _ f: ([String]) -> String) -> String {
        let ns = s as NSString
        var out = ""
        var last = 0
        for m in re.matches(in: s, range: NSRange(location: 0, length: ns.length)) {
            out += ns.substring(with: NSRange(location: last, length: m.range.location - last))
            let groups = (0..<m.numberOfRanges).map { i -> String in
                let r = m.range(at: i)
                return r.location == NSNotFound ? "" : ns.substring(with: r)
            }
            out += f(groups)
            last = m.range.location + m.range.length
        }
        out += ns.substring(from: last)
        return out
    }
    func replace(_ s: String, with t: String) -> String { replace(s) { _ in t } }
}

enum Privacy {
    /// Convert Urdu (۰-۹), Arabic-Indic (٠-٩), Devanagari and fullwidth digits to 0-9; drop zero-width characters.
    static func normaliseDigits(_ s: String) -> String {
        var out = s.precomposedStringWithCompatibilityMapping // NFKC: fullwidth ０-９ → 0-9
        out = out.replacingOccurrences(of: "[\\u200B-\\u200D\\u2060\\uFEFF]", with: "", options: .regularExpression)
        out = out.replacingOccurrences(of: "[\\u00A0\\u2007\\u202F]", with: " ", options: .regularExpression)
        out = out.replacingOccurrences(of: "[\\u2010\\u2011\\u2212]", with: "-", options: .regularExpression) // Unicode hyphens and minus → '-'
        var scalars = String.UnicodeScalarView()
        for u in out.unicodeScalars {
            let v = u.value
            if (0x0966...0x096F).contains(v) { scalars.append(Unicode.Scalar(v - 0x0966 + 0x30)!) }
            else if (0x06F0...0x06F9).contains(v) { scalars.append(Unicode.Scalar(v - 0x06F0 + 0x30)!) }
            else if (0x0660...0x0669).contains(v) { scalars.append(Unicode.Scalar(v - 0x0660 + 0x30)!) }
            else { scalars.append(u) }
        }
        return String(scalars)
    }

    // Separators people use inside numbers: spaces around one hyphen, dot, slash or dash.
    static let SEP = "\\s*[-.–—/]?\\s*"

    /// (kind, pattern, caseInsensitive) — the `i` flag matters: findPrivate keeps it, redact drops it (like the JS).
    static let patternSpecs: [(PrivateKind, String, Bool)] = [
        (.CNIC, "(?<!\\d)\\d{5}\(SEP)\\d{7}\(SEP)\\d(?!\\d)", false),
        (.CNIC, "(?<!\\d)\\d{4}\\s\\d{4}\\s\\d{4}\\s\\d(?!\\d)", false),
        (.PHONE, "(?<!\\d)(\\+\\s*92\(SEP)|0092\(SEP)|92\(SEP)|\\(?0)\\s*3\\d{2}\\)?\(SEP)\\d{3}\(SEP)\\d{4}(?!\\d)", false),
        (.PHONE, "(?<![\\d-])0\\d{2,3}\\s*-\\s*\\d{7,8}(?!\\d)", false), // landline 042-35761234
        // CNIC with misplaced hyphens or OCR-spaced digits: any 13 digits joined by single spaces/hyphens.
        (.CNIC, "(?<![\\d-])(?:\\d[\\s-]?){12}\\d(?![\\d-])", false),
        (.EMAIL, "\\b[\\w.+-]+\\s+at\\s+[\\w-]+\\s+dot\\s+(?:com|pk|net|org)\\b", true),
        (.LONG_NUMBER, "\\bPK\\s?\\d{2}\\s?[A-Z]{4}(?:\\s?\\d){16}\\b", true), // IBAN
        (.EMAIL, "[\\w.+-]+\\s*(@|\\[at\\]|\\(at\\))\\s*[\\w-]+\\s*\\.\\s*[a-z]{2,}(\\.[a-z]{2,})*", true),
        // Account/reference IDs mixing letters and 7+ digits, e.g. "LE-04-1234567-U".
        (.LONG_NUMBER, "(?<![\\w-])(?=[\\w-]*[a-z])(?=(?:[\\w-]*?\\d){7})[a-z0-9]+(?:-[a-z0-9]+)+(?![\\w-])", true),
        (.LONG_NUMBER, "(?<!\\d)\\d{10,}(?!\\d)", false),
        // WAPDA-style reference numbers printed in groups: "04 11111 1111111 U".
        (.LONG_NUMBER, "(?<!\\d)(?<!\\d-)\\d{2}[\\s-]?\\d{5}[\\s-]?\\d{7}(?:\\s?[A-Z](?![A-Za-z]))?(?![\\d-])", false),
    ]
    static let findPatterns: [(PrivateKind, Rx)] = patternSpecs.map { ($0.0, Rx($0.1, $0.2 ? [.caseInsensitive] : [])) }
    static let redactPatterns: [(PrivateKind, Rx)] = patternSpecs.map { ($0.0, Rx($0.1)) }

    static let imageRe = Rx("data:image|[A-Za-z0-9+/=]{200,}")

    /// Lower-case and remove spaces/punctuation so "Ahmed  KHAN" matches "ahmed khan".
    static func squash(_ s: String) -> String {
        s.lowercased().replacingOccurrences(of: "[\\s\\-.,_/–—'’()\\u200B-\\u200D]+", with: "", options: .regularExpression)
    }

    /// Returns the first private kind found, or nil if the text looks clean.
    static func findPrivate(_ text: String, known: [String] = []) -> PrivateKind? {
        if imageRe.test(text) { return .IMAGE_DATA }
        let t = normaliseDigits(text)
        for (kind, re) in findPatterns where re.test(t) { return kind }
        let flat = squash(t)
        for v in known {
            let sv = squash(normaliseDigits(v))
            if sv.count >= 3 && flat.contains(sv) { return .KNOWN_VALUE }
        }
        return nil
    }

    /// Throws PrivacyBlocked if the text (usually JSON of the payload) contains anything private.
    static func assertClean(_ text: String, known: [String] = []) throws {
        if let k = findPrivate(text, known: known) { throw PrivacyBlocked(kind: k) }
    }

    // MARK: - Redactor

    private static func escapeRe(_ s: String) -> String { NSRegularExpression.escapedPattern(for: s) }

    /// A regex that matches a known value with flexible spacing, case and punctuation, as whole words only.
    static func flexibleRe(_ value: String) -> Rx? {
        let chars = Array(squash(normaliseDigits(value)))
        if chars.count < 2 { return nil }
        let body = chars.map { escapeRe(String($0)) }.joined(separator: "[\\s\\-.,_/–—'’()]*")
        return Rx("(?<![\\p{L}\\p{N}])\(body)(?![\\p{L}\\p{N}])", [.caseInsensitive], ascii: false)
    }

    // Labelled lines whose VALUE is private (used when no model flagged them, e.g. raw OCR).
    static let labelled: [(String, Rx)] = [
        // Short labels ("To", "Name", "Patient") need a colon so "To pay: Rs 500" is never touched.
        ("NAME", Rx("^(\\s*(?:(?:to|name|patient|bill\\s*to)\\s*:|(?:consumer(?:'s)?|customer|father(?:'s)?|patient)\\s*name\\s*[:\\-–.]?|s/o|d/o|w/o|mr\\.?|mrs\\.?|ms\\.?|نام\\s*:?|بنام)\\s*)(?!\\s*\\[)(\\S.*)$", [.caseInsensitive, .anchorsMatchLines])),
        ("NAME", Rx("^(\\s*dear\\s+)(?!\\[)([^,\\n]+)", [.caseInsensitive, .anchorsMatchLines])),
        // Name labels without a colon only when a capitalised or Urdu word follows.
        ("NAME", Rx("^(\\s*(?:name(?!\\s*of\\b)|naam|bill\\s*to|account\\s*title|title\\s*of\\s*account|holder|walid|wald|sender)\\s*[:\\-–.]?\\s*)(?!\\[)((?:\\p{Lu}|[\\u0600-\\u06FF]).*)$", [.caseInsensitive, .anchorsMatchLines])),
        ("NAME", Rx("^(\\s*(?:ولد|بنت|زوجہ|ولدیت\\s*:?)\\s*)(?!\\[)(\\S.*)$", [.anchorsMatchLines])),
        ("ADDRESS", Rx("^(\\s*(?:address|addr\\.?|service\\s*address|postal\\s*address|pata|پتہ|پتا)\\s*[:\\-–.]?\\s*)(?!\\[)(\\S.*)$", [.caseInsensitive, .anchorsMatchLines])),
        // ID labels anywhere in a line: "Consumer 041234567 due", "Ref: LE-04-1234567-U".
        ("ACCOUNT", Rx("(\\b(?:account\\s*(?:no|#|number|id)|acc\\.?\\s*(?:no|#)|a/c\\s*(?:no|#)?|consumer(?:\\s*(?:no|id|i\\.d\\.?|#|number))?|حوالہ\\s*نمبر|ریفرنس(?:\\s*نمبر)?|صارف(?:\\s*نمبر)?|بل\\s*نمبر|اکاؤنٹ(?:\\s*نمبر)?|reference\\s*(?:no|#|number)?|ref\\.?\\s*(?:no|#)?|customer\\s*(?:id|no|#)|cust\\.?\\s*(?:id|no|#)|meter(?:\\s*(?:no|#|number))?|ac\\.?\\s*(?:no|#)|iban)\\.?\\s*[:\\-–.]?\\s*)(?!\\[)(\\d[\\d\\s-]{6,}\\d(?:\\s?[A-Z]\\b)?|(?=[\\w-]*\\d)[\\w-]{5,}(?:\\s\\d{3,})*)", [.caseInsensitive, .anchorsMatchLines])),
    ]

    // Address words common on Pakistani paperwork; the rest of that segment is treated as an address.
    static let addressWords = Rx("\\b(?:house|h\\.\\s*no|h#|street|st\\.\\s*no|gali|block|sector|mohalla|muhalla|chak|ck\\s*no|village|tehsil|colony|town|phase|plot|dha|road)\\b\\.?\\s*(?:no\\.?|#)?\\s*[\\w-]*[^,\\n]{0,60}", [.caseInsensitive])

    static let labelOnly = Rx("^\\[[A-Z_]+\\]$")

    static func redactLabelledLines(_ text: String) -> String {
        var out = text
        for (kind, re) in labelled {
            out = re.replace(out) { g in
                let head = g[1], val = g[2]
                return labelOnly.test(val.trimmingCharacters(in: .whitespaces)) ? head + val : "\(head)[\(kind)]"
            }
        }
        return addressWords.replace(out) { g in g[0].hasPrefix("[") ? g[0] : "[ADDRESS]" }
    }

    static func redact(_ text: String, _ privateValues: [PrivateValue] = []) -> String {
        var out = normaliseDigits(text)
        // Known values first (names, addresses, account numbers the reader flagged), longest first.
        for pv in privateValues.sorted(by: { $0.value.count > $1.value.count }) {
            if let re = flexibleRe(pv.value) { out = re.replace(out, with: "[\(pv.kind.rawValue)]") }
        }
        out = redactLabelledLines(out)
        // Then pattern-based values the reader may have missed.
        for (kind, re) in redactPatterns { out = re.replace(out, with: "[\(kind.rawValue)]") }
        return out
    }
}
