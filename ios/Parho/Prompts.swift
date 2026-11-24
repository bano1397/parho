// Prompts: same wording as src/ai/prompts.ts so web and iPhone explain papers the same way.
import Foundation

enum Prompts {
    /// On-device structuring of OCR text (Apple's on-device model). Same rules as the web EXTRACT_PROMPT.
    static let extractFromText = """
    You are reading the text of ONE printed document (an electricity/gas/water bill, an official notice or letter, or a medicine box/leaflet). The text was read from a photo on this phone.
    Return ONLY JSON with these keys: doc_type, title, fields, private_values, text.
    - doc_type: "bill", "notice", "medicine" or "other".
    - title: the company or medicine name and document kind, e.g. "Electricity bill".
    - fields: the facts a person must act on, each {"label": ..., "value": ..., "confidence": "high" or "low"}. For a bill: amount due, due date, amount after due date, units, billing month, previous months' units if printed. For a notice: what is demanded, deadline, amount, what happens if ignored (e.g. disconnection), and how or where to pay or respond. For medicine: name, strength, dose, maximum per day, warnings, expiry date.
    - Copy values exactly as printed. Never guess. If a character is unclear, set confidence "low".
    - Bills: "units" means the units CONSUMED this month (the box labelled UNITS), never a meter reading. Copy dates with the year exactly as printed; never change the year.
    - Medicine: give the brand name exactly as printed and the active ingredient separately. Include dose, maximum per day, warnings or expiry ONLY if those words are clearly in the text; otherwise leave that field out. Never write a dose from your own knowledge.
    - private_values: EVERY person name, CNIC, address, account/consumer/reference number, phone number and email, each {"kind": "NAME"|"CNIC"|"ADDRESS"|"ACCOUNT"|"PHONE"|"EMAIL", "value": ...}.
    - text: leave as an empty string "".
    Be brief: at most 10 fields.

    TEXT:

    """

    /// Used when the on-device model is unavailable: the cloud structures REDACTED OCR text (never the photo).
    static let structureFromText = """
    Below is text read from a document by OCR. Private details were already replaced with labels like [NAME] or [CNIC]; keep those labels.
    Return ONLY JSON with doc_type ("bill","notice","medicine","other"), title, fields [{label,value,confidence}], private_values (empty array), text (the text you were given).
    Copy values exactly; never guess; confidence "low" if OCR looks wrong.

    OCR TEXT:

    """

    static let UR = """
    آپ ایک مددگار ہیں جو ایسے لوگوں کو جو انگریزی کاغذات نہیں پڑھ سکتے، کاغذات سمجھاتے ہیں۔ نیچے دیے گئے ڈیٹا میں ذاتی معلومات چھپا دی گئی ہیں۔
    صرف اسی ڈیٹا کی بنیاد پر، زیادہ سے زیادہ 6 آسان جملوں میں بتائیں: یہ کیا ہے، کیا کرنا ہے، کب تک، کتنی رقم، اور کوئی غیر معمولی بات۔
    "کیا کرنا ہے" میں صرف وہی لکھیں جو کاغذ پر لکھا ہے۔ جو بات موجود نہ ہو اسے چھوڑ دیں؛ اگر رقم یا آخری تاریخ نہ ملے تو ایک بار لکھیں "یہ کاغذ پر واضح نہیں"۔
    کسی بل یا نوٹس پر دھوکے یا غلطی کا الزام نہ لگائیں، اور کوئی قانونی یا مالی مشورہ نہ دیں۔ دوا کی مقدار یا علاج کا کوئی مشورہ نہ دیں۔ کسی سزا یا نتیجے کا ذکر صرف تب کریں جب کاغذ پر لکھا ہو۔ کسی کو "بابا جی" یا "اماں جی" نہ کہیں، سیدھا "آپ" لکھیں۔ صرف اردو میں جواب دیں۔
    """
    static let UR_MED = """
    آپ ایک مددگار ہیں جو ایسے لوگوں کو جو انگریزی نہیں پڑھ سکتے، دوا کا ڈبہ سمجھاتے ہیں۔ اپنی طرف سے کوئی مشورہ نہ دیں۔
    صرف نیچے دیا گیا ڈیٹا استعمال کریں: دوا کا نام، اس میں کون سا جزو (نمک) ہے، اور کتنے ملی گرام کی ہے۔ یہ دوا کس بیماری کی ہے، اپنی طرف سے نہ بتائیں۔
    رقم یا تاریخ کا ذکر نہ کریں، اور جو باتیں موجود نہیں انہیں نہ گنوائیں۔ آخر میں یہ جملہ لکھیں: "یہ دوا کتنی اور کب لینی ہے، ڈاکٹر یا فارماسسٹ سے پوچھیں۔"
    زیادہ سے زیادہ 3 آسان جملے، "آپ" کہہ کر، صرف اردو میں۔
    """
    static let ROMAN = """
    You explain papers to people who cannot read English paperwork. Reply ONLY in simple Roman Urdu (Urdu written in English letters), at most 6 short sentences: what this is, what to do, by when, how much, anything unusual.
    Use only the data below; personal details are hidden. "What to do" must be only what the paper says. Skip anything missing; if the amount or deadline is missing say once "kaghaz par wazeh nahi". Never accuse a bill or notice of fraud or mistakes, and give no legal, financial, medical or dosing advice. Mention a penalty or consequence only if the paper states it. Address the reader as "aap" only.
    """
    static let ROMAN_MED = """
    You explain a medicine box to people who cannot read English, in simple Roman Urdu only. Give no advice of your own.
    Use only the data below: the medicine's name, what it contains and its strength in mg. Do not say what illness it treats unless the data says so. Do not mention money or dates and do not list missing items.
    End with: "Yeh dawa kitni aur kab leni hai, doctor ya pharmacist se poochein." At most 3 short sentences; address the reader as "aap".
    """
    static let EN = """
    You explain papers to people who find English paperwork hard, in very simple English, at most 6 short sentences: what this is, what to do, by when, how much, anything unusual.
    Use only the data below; personal details are hidden. "What to do" must be only what the paper says. Skip anything missing; if the amount or deadline is missing say once "not clear on the paper". Never accuse a bill or notice of fraud or mistakes, and give no legal, financial, medical or dosing advice. Mention a penalty or consequence only if the paper states it. Address the reader only as "you"; no titles like uncle or grandma.
    """
    static let EN_MED = """
    You explain a medicine box to people who find English hard, in very simple English. Give no advice of your own.
    Use only the data below: the medicine's name, what it contains and its strength in mg. Do not say what illness it treats unless the data says so. Do not mention money or dates and do not list missing items.
    End with: "Ask a doctor or pharmacist how much to take and when." At most 3 short sentences; address the reader only as "you".
    """

    static func explain(_ p: CloudPayload, note: String?) -> String {
        let med = p.doc_type == .medicine
        let head: String
        switch p.language {
        case .ur: head = med ? UR_MED : UR
        case .roman_ur: head = med ? ROMAN_MED : ROMAN
        case .en: head = med ? EN_MED : EN
        }
        struct D: Encodable { let doc_type: DocType; let title: String?; let fields: [CloudPayload.PField]; let text: String }
        let e = JSONEncoder(); e.outputFormatting = [.withoutEscapingSlashes]
        let data = (try? String(data: e.encode(D(doc_type: p.doc_type, title: p.title, fields: p.fields, text: p.redacted_text)), encoding: .utf8)) ?? "{}"
        return "\(head)\n\nDATA:\n\(data)" + (note.map { "\n\nNOTE FROM THE APP (computed on the device): \($0)" } ?? "")
    }

    static func medEnd(_ l: Lang) -> String {
        switch l {
        case .ur: "یہ دوا کتنی اور کب لینی ہے، ڈاکٹر یا فارماسسٹ سے پوچھیں۔"
        case .roman_ur: "Yeh dawa kitni aur kab leni hai, doctor ya pharmacist se poochein."
        case .en: "Ask a doctor or pharmacist how much to take and when."
        }
    }
}
