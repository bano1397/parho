// Ported from the web tests: src/privacy/privacy.test.ts, src/ai/router.test.ts, src/ai/implausible.test.ts,
// src/audit_regressions.test.ts. Every leak the audits found must stay fixed on iPhone too.
import XCTest
@testable import Parho

final class SafetyNetTests: XCTestCase {
    private func urdu(_ s: String) -> String {
        String(s.map { c in c.isASCII && c.isNumber ? Character(Unicode.Scalar(0x06F0 + Int(String(c))!)!) : c })
    }

    func testFindsPrivateKinds() {
        let cases: [(String, PrivateKind)] = [
            ("CNIC 35202-1234567-1", .CNIC), ("cnic 3520212345671", .CNIC), ("call 0300-1234567", .PHONE),
            ("+92 300 1234567", .PHONE), ("mail me a.b@x.pk", .EMAIL), ("ref 04123456789012", .LONG_NUMBER),
            ("img data:image/png;base64,AAAA", .IMAGE_DATA),
        ]
        for (t, k) in cases { XCTAssertEqual(Privacy.findPrivate(t), k, t) }
    }
    func testUrduDigitCnic() { XCTAssertEqual(Privacy.findPrivate(urdu("35202-1234567-1")), .CNIC) }
    func testLeavesBillFactsAlone() {
        for t in ["Amount Rs 18,450", "Due 24-11-2026", "Units 412", "Expiry 12-2027", "Take 2 tablets every 6 hours"] {
            XCTAssertNil(Privacy.findPrivate(t), t)
        }
    }
    func testKnownNames() { XCTAssertEqual(Privacy.findPrivate("Dear AHMED   khan, pay now", known: ["Ahmed Khan"]), .KNOWN_VALUE) }
    func testAssertCleanThrows() { XCTAssertThrowsError(try Privacy.assertClean("{\"t\":\"0300 1234567\"}")) }
    func testArabicIndicDigits() { XCTAssertEqual(Privacy.normaliseDigits("٣٥"), "35") }

    func testRedactKnownAndPatterns() {
        let out = Privacy.redact("Ahmed Fake Khan, CNIC 00000-0000000-0, phone 0300-0000000, House 0 Street 0",
                                 [PrivateValue(kind: .NAME, value: "Ahmed Fake Khan"), PrivateValue(kind: .ADDRESS, value: "House 0, Street 0")])
        XCTAssertTrue(out.contains("[NAME]")); XCTAssertTrue(out.contains("[ADDRESS]"))
        XCTAssertNil(Privacy.findPrivate(out, known: ["Ahmed Fake Khan"]))
    }

    /// Randomised version of the web property tests.
    func testInjectedSecretsAlwaysBlockedAndRedacted() {
        var g = SystemRandomNumberGenerator()
        func digits(_ n: Int) -> String { String((0..<n).map { _ in Character(String(Int.random(in: 0...9, using: &g))) }) }
        let seps = ["", "-", " "]
        let letters = Array("abcdefghij ABC,.:")
        func filler() -> String { String((0..<Int.random(in: 0...20, using: &g)).map { _ in letters.randomElement(using: &g)! }) }
        for _ in 0..<400 {
            let secret: String
            switch Int.random(in: 0..<4, using: &g) {
            case 0: secret = digits(5) + seps.randomElement()! + digits(7) + seps.randomElement()! + digits(1)
            case 1: secret = ["03", "+923", "923"].randomElement()! + digits(2) + seps.randomElement()! + digits(7)
            case 2: secret = "ab\(Int.random(in: 1...99))@mail.pk"
            default: secret = digits(12)
            }
            let text = "\(filler()) \(Bool.random() ? urdu(secret) : secret) \(filler())"
            XCTAssertNotNil(Privacy.findPrivate(text), text)
            XCTAssertNil(Privacy.findPrivate(Privacy.redact("\(filler()) \(secret) \(filler())")), secret)
        }
    }

    func testLabelledLines() {
        let r = Privacy.redact("To: Fatima Fake Bibi\nAddress: Flat 0, Block Z, Sample Colony, Karachi\nAccount No: ABC-12\nAmount due: Rs 6,780")
        XCTAssertNil(r.range(of: "Fatima|Block Z|ABC-12", options: .regularExpression), r)
        XCTAssertTrue(r.contains("To: [NAME]")); XCTAssertTrue(r.contains("Address: [ADDRESS]")); XCTAssertTrue(r.contains("Rs 6,780"))
        XCTAssertEqual(Privacy.redact("Total amount: Rs 500\nDue date: 30-11-2026"), "Total amount: Rs 500\nDue date: 30-11-2026")
    }

    func testAuditTextsRedacted() {
        let texts = ["CNIC 35202 - 1234567 - 1", "CNIC 35202/1234567/1", "id 3520 2123 4567 1", "call +92 300 123 4567", "call 0300 123 4567",
                     "call (0300) 1234567", "tel 042-35761234", "CNIC ３５２０２-１２３４５６７-１", "CNIC ३५२०२१२३४५६७१", "ali @ gmail.com", "ali [at] gmail.com",
                     "Ref: LE-04-1234567-U due", "Consumer 041234567 due", "Dear Ahmed Khan, pay now", "House 12 Street 4 Gulberg Lahore", "Ck No 197 Bhagy Wala"]
        for t in texts {
            let out = Privacy.redact(t)
            XCTAssertNil(Privacy.findPrivate(out), "\(t) → \(out)")
            XCTAssertNil(out.range(of: "1234567|4567|gmail|Ahmed|Gulberg|Bhagy", options: .regularExpression), "\(t) → \(out)")
        }
    }

    func testProbe19Nov() {
        let cases: [(String, String)] = [
            ("Consumer No 04 11234 1234567", "1234567"), ("Ref No. 12 11234 1234567 U", "1234567"),
            ("CNIC 35202-123456-71", "123456"), ("C N I C: 3 5 2 0 2 1 2 3 4 5 6 7 1", "3 5 2 0 2"),
            ("Name Ahmed Khan", "Ahmed"), ("naam: Ahmed Khan", "Ahmed"), ("Naam Ahmed Khan", "Ahmed"), ("Bill To Ahmed Khan", "Ahmed"),
            ("Account Title: Ahmed Khan", "Ahmed"), ("Holder: Ahmed Khan", "Ahmed"), ("ولد محمد اسلم", "محمد"),
            ("pata: Gulberg Lahore", "Gulberg"), ("Pata Model Road", "Model"), ("پتا: گلبرگ لاہور", "گلبرگ"), ("Plot 5 DHA Karachi", "Plot 5"),
            ("Meter 123456", "123456"), ("Ac No 12345678", "12345678"), ("email ali at gmail dot com", "gmail"),
            ("IBAN PK36SCBL0000001123456702", "1123456702"),
        ]
        for (t, bad) in cases {
            let out = Privacy.redact(t)
            XCTAssertNil(Privacy.findPrivate(out), "\(t) → \(out)")
            XCTAssertFalse(out.contains(bad), "\(t) → \(out)")
        }
    }

    func testNoOverRedaction() {
        XCTAssertEqual(Privacy.redact("To pay: Rs 7,371 by 24 NOV 26", [PrivateValue(kind: .NAME, value: "Ali")]), "To pay: Rs 7,371 by 24 NOV 26")
        XCTAssertEqual(Privacy.redact("Quality check", [PrivateValue(kind: .NAME, value: "Ali")]), "Quality check")
        XCTAssertEqual(Privacy.redact("Units consumed 123, amount Rs 7,371 due 24 NOV 26"), "Units consumed 123, amount Rs 7,371 due 24 NOV 26")
        XCTAssertTrue(Privacy.redact("Name of medicine: Panadol").contains("Panadol"))
    }
}

final class DocTests: XCTestCase {
    private func ex(_ t: DocType, _ fields: [(String, String)], title: String = "x", pv: [PrivateValue] = [], text: String = "") -> Extraction {
        Extraction(docType: t, title: title, fields: fields.map { Field(label: $0.0, value: $0.1) }, privateValues: pv, text: text, source: .onDevice)
    }
    private func sendable(_ e: Extraction) -> String { (try? Doc.buildCloudPayload(e, .ur).json) ?? "BLOCKED" }

    private let nano = Extraction(docType: .bill, title: "Electricity bill", fields: [
        Field(label: "Amount due", value: "Rs 18,450"), Field(label: "Due date", value: "24-11-2026"), Field(label: "Units consumed", value: "412"),
        Field(label: "Previous months units", value: "Oct 188 | Sep 205 | Aug 260"), Field(label: "Consumer ID", value: "0000000000000"),
    ], privateValues: [PrivateValue(kind: .NAME, value: "Ahmed Fake Khan"), PrivateValue(kind: .CNIC, value: "00000-0000000-0")],
       text: "Consumer Name: Ahmed Fake Khan CNIC 00000-0000000-0 Amount Rs 18,450 due 24-11-2026", source: .onDevice)

    func testParseToleratesFences() throws {
        let e = try Doc.parse("```json\n{\"doc_type\":\"bill\",\"fields\":[{\"label\":\"Amount\",\"value\":\"Rs 5\"}],\"private_values\":[]}\n```", source: .onDevice)
        XCTAssertEqual(e.docType, .bill); XCTAssertEqual(e.fields.count, 1)
        XCTAssertThrowsError(try Doc.parse("not json", source: .onDevice))
    }

    func testPayloadHasNoPrivateValues() throws {
        let p = try Doc.buildCloudPayload(nano, .ur)
        XCTAssertNil(p.json.range(of: "Ahmed|00000-0000000-0|0000000000000|data:image", options: .regularExpression), p.json)
        XCTAssertFalse(p.fields.map(\.label).contains("Consumer ID"))
        XCTAssertEqual(p.title, "Electricity bill")
    }

    func testBillNoteUsesHistoryLineFromText() {
        let e = ex(.bill, [("Units Consumed", "412"), ("Previous Month Units", "188")],
                   text: "Units Consumed: 412\nHistory: Oct 188 | Sep 205 | Aug 260 | Jul 274")
        XCTAssertTrue(Doc.billNote(e)?.contains("78% higher") ?? false, Doc.billNote(e) ?? "nil")
    }

    func testBillNoteFlagsJump() { XCTAssertNotNil(Doc.billNote(nano)?.range(of: "higher than the average")) }

    func testDropsPrivateByLabel() {
        let s = Doc.sanitize(ex(.bill, [("Consumer ID", "113302611"), ("Amount Due", "5568"), ("Name & Address", "X Y")]))
        XCTAssertEqual(s.fields.map(\.label), ["Amount Due"])
    }

    func testMedicineAllowList() {
        let s = Doc.sanitize(ex(.medicine, [("Brand Name", "Panadol"), ("Active Ingredient", "Paracetamol"), ("Dose", "1 tablet"),
                                            ("Maximum per day", "4"), ("expiry date", "11/2026"), ("Warnings", "x")]))
        XCTAssertEqual(s.fields.map(\.label), ["Brand Name", "Active Ingredient"])
        let m = Doc.sanitize(ex(.medicine, [("Do not take more than", "8 tablets in 24 hours."), ("Directions", "2 tabs"),
            ("Adults", "1-2 tablets every 4-6 hours"), ("Manufacturing Date", "01-2026"), ("Retail Price", "Rs 45"),
            ("Name", "Panadol"), ("Strength", "500 mg"), ("Active Ingredient", "Paracetamol")]))
        XCTAssertEqual(m.fields.map(\.label), ["Name", "Strength", "Active Ingredient"])
        XCTAssertTrue(Doc.sanitize(ex(.medicine, [("Indication", "take 2 tablets every 6 hours")])).fields.isEmpty)
    }

    func testNoDoseSurvives() {
        let bad: [(String, String)] = [("Uses", "1+0+1 after meals"), ("Used for", "Fever. 500mg BD"), ("Indications", "Pain; take TDS"), ("Strength", "500 mg x3 daily"),
            ("Form", "Syrup 5 ml OD"), ("Uses", "10 mg/kg"), ("Uses", "din mein 3 baar"), ("Uses", "روزانہ 2 گولی"),
            ("Composition", "Paracetamol 500mg. Do not exceed 8 in 24 hours"), ("Contains", "Paracetamol, not for children under 12"),
            ("Uses", "Use before 12/2027"), ("Do not take more than", "8 tablets in 24 hours."), ("Expiry", "11/2026")]
        for f in bad { XCTAssertTrue(Doc.sanitize(ex(.medicine, [f])).fields.isEmpty, "\(f)") }
        let keep = Doc.sanitize(ex(.medicine, [("Name", "Panadol"), ("Medicine name", "Panadol"), ("Strength", "500 mg"), ("Form", "Tablet"), ("Active ingredient", "Paracetamol 500 mg")]))
        XCTAssertEqual(keep.fields.map { "\($0.label)=\($0.value)" }, ["Name=Panadol", "Medicine name=Panadol", "Strength=500 mg", "Form=Tablet", "Active ingredient=Paracetamol 500 mg"])
        XCTAssertEqual(try Doc.buildCloudPayload(ex(.medicine, [("Name", "X")], text: "Dosage: 2 tablets every 4 hours"), .ur).redacted_text, "")
        XCTAssertFalse(sendable(ex(.medicine, [("Composition", "Paracetamol 500mg twice")])).contains("twice"))
    }

    func testHolderFieldsNeverCarryName() {
        let s = sendable(ex(.bill, [("Ahmed Khan", "Rs 500"), ("Recipient", "Ahmed Khan"), ("Holder", "Ali s/o Zahid"), ("Cust #", "LE1234567"), ("Amount due", "Rs 500")],
                            title: "Bill of Ahmed Khan", pv: [PrivateValue(kind: .NAME, value: "Ahmed Khan")]))
        XCTAssertNil(s.range(of: "Ahmed|Zahid|LE1234567", options: .regularExpression), s)
        XCTAssertTrue(s.contains("Rs 500"))
        let n = sendable(ex(.notice, [("Pata", "Gulberg Lahore"), ("Walid", "Ahmed Khan"), ("To", "Ahmed Khan"), ("Sender", "Ahmed Khan"), ("Amount", "Rs 500")]))
        XCTAssertNil(n.range(of: "Gulberg|Ahmed", options: .regularExpression), n)
        XCTAssertTrue(n.contains("Rs 500"))
    }

    private func units(_ f: [(String, String)]) -> String? { Doc.sanitize(ex(.bill, f)).fields.first { $0.label.lowercased().contains("units") }?.value }

    func testUnitsCheck() {
        XCTAssertEqual(units([("UNITS", "1"), ("PREVIOUS READING", "12603"), ("CURRENT READING", "12634")]), "1") // printed units win
        XCTAssertEqual(Doc.sanitize(ex(.bill, [("PREVIOUS READING", "81940"), ("CURRENT READING", "82024")])).fields.first { $0.label == "Units" }?.value, "84")
        XCTAssertEqual(units([("Units", "31"), ("Previous Reading", "12630"), ("Current Reading", "12630")]), "31")
        XCTAssertEqual(units([("Units", "2000"), ("Previous Reading", "1000"), ("Present Reading", "1050"), ("MF", "40")]), "2000")
        XCTAssertEqual(units([("Units", "100"), ("Previous Reading", "1234.5"), ("Present Reading", "1334.5")]), "100")
        XCTAssertEqual(units([("Units (hm3)", "1.25"), ("Previous Reading", "100"), ("Present Reading", "230")]), "1.25")
        XCTAssertEqual(units([("Units", "200"), ("Previous Reading", "33,413"), ("Present Reading", "33,613")]), "200")
        XCTAssertNil(Doc.billNote(ex(.bill, [("Units", "120"), ("Previous Reading", "33413"), ("History", "Nov25 110 Dec25 115 Jan26 118")])))
    }

    func testDropImplausible() {
        XCTAssertTrue(Doc.dropImplausible([Field(label: "Amount after due date", value: "After 27/NOV-26")]).isEmpty)
        XCTAssertEqual(Doc.dropImplausible([Field(label: "Amount", value: "Rs. 7,371/-")]).count, 1)
        XCTAssertEqual(Doc.dropImplausible([Field(label: "Due Date", value: "24 NOV 26"), Field(label: "Reading Date", value: "24 NOV 26")]).map(\.label), ["Due Date"])
        XCTAssertEqual(Doc.dropImplausible([Field(label: "Due Date", value: "24 NOV 26"), Field(label: "Issue Date", value: "17 NOV 26")]).count, 2)
        XCTAssertEqual(Doc.dropImplausible([Field(label: "Billing Month", value: "NOV 26"), Field(label: "Bill Month", value: "NOV-26"),
                                            Field(label: "Units", value: "123"), Field(label: "Units consumed", value: "123")]).map(\.label), ["Billing Month", "Units"])
        XCTAssertEqual(Doc.dropImplausible([Field(label: "Previous months units", value: "Oct 188 | Sep 205")]).count, 1)
    }

    func testExplainPromptAndMedicineLine() throws {
        let p = try Doc.buildCloudPayload(nano, .en)
        let prompt = Prompts.explain(p, note: Doc.billNote(nano))
        XCTAssertTrue(prompt.contains("NOTE FROM THE APP")); XCTAssertNil(Privacy.findPrivate(prompt, known: ["Ahmed Fake Khan"]))
        let med = CloudPayload(doc_type: .medicine, title: "Panadol", fields: [], redacted_text: "", language: .ur)
        XCTAssertTrue(Doc.finishExplanation("یہ پیناڈول ہے۔", med).contains("فارماسسٹ"))
        // Mentioning a pharmacist is not enough: the exact closing line is always added (24 Nov deep test).
        XCTAssertEqual(Doc.finishExplanation("Ask a pharmacist.", CloudPayload(doc_type: .medicine, title: nil, fields: [], redacted_text: "", language: .en)), "Ask a pharmacist.\nAsk a doctor or pharmacist how much to take and when.")
    }

    func testExplainRefusesDirtyPayload() {
        let dirty = CloudPayload(doc_type: .bill, title: nil, fields: [], redacted_text: "call 0300-1234567", language: .ur)
        XCTAssertThrowsError(try Privacy.assertClean(dirty.json))
    }

    /// The OCR fallback: what goes to the cloud is redacted text, with no CNIC.
    func testFallbackBodyIsClean() throws {
        let body = Prompts.structureFromText + Privacy.redact("Name Ahmed CNIC 35202-1234567-1 Amount Rs 500")
        XCTAssertFalse(body.contains("35202")); XCTAssertTrue(body.contains("[CNIC]"))
        XCTAssertNoThrow(try Privacy.assertClean(body))
    }
}

/// 24 Nov deep-test regressions (same cases as the web tests marked "24 Nov", plus iOS-only ICU cases).
final class DeepTest24NovTests: XCTestCase {
    private func bill(_ f: [(String, String)], text: String = "") -> Extraction {
        Extraction(docType: .bill, title: "x", fields: f.map { Field(label: $0.0, value: $0.1) }, privateValues: [], text: text, source: .onDevice)
    }
    private func keepMed(_ v: String) -> Int {
        Doc.sanitize(Extraction(docType: .medicine, title: "x", fields: [Field(label: "Active ingredient", value: v)], privateValues: [], text: "", source: .onDevice)).fields.count
    }

    func testCommaGroupedHistory() {
        XCTAssertNil(Doc.billNote(bill([("Units", "1,300"), ("History", "NOV-25 1,250 DEC-25 1,100 JAN-26 1,180")])))
    }
    func testMonthYearWithSpace() {
        XCTAssertNotNil(Doc.billNote(bill([("Units", "450"), ("History", "NOV 25 300 DEC 25 280")]))?.range(of: "55% higher"))
    }
    func testPaymentHistoryLineIgnored() {
        XCTAssertNil(Doc.billNote(bill([("Units Consumed", "300")], text: "Payment History: 12-10-2026 Rs 5,000")))
        XCTAssertNil(Doc.billNote(bill([("Units Consumed", "300")], text: "Billing History: Paid 05/10/2026 Rs 1,200")))
        XCTAssertNil(Doc.billNote(bill([("Units Consumed", "300")], text: "CNIC history: 35202-1234567-1")))
    }
    func testHistoryLineStillUsed() {
        let e = bill([("Units Consumed", "412"), ("Previous Month Units", "188")], text: "Units Consumed: 412\nHistory: Oct 188 | Sep 205 | Aug 260 | Jul 274")
        XCTAssertNotNil(Doc.billNote(e)?.range(of: "78% higher"))
    }
    func testMedicineDailyMaximumDropped() {
        for v in ["Paracetamol 500 mg, max 4 g", "Ibuprofen 200 mg up to 1200 mg", "Paracetamol 500 mg (4 g limit)"] { XCTAssertEqual(keepMed(v), 0, v) }
        XCTAssertEqual(keepMed("Paracetamol 500 mg"), 1)
    }
    func testExactPharmacistLine() {
        let med = CloudPayload(doc_type: .medicine, title: "Panadol", fields: [], redacted_text: "", language: .en)
        XCTAssertTrue(Doc.finishExplanation("Panadol has paracetamol 500 mg. Your pharmacist may say take 2 tablets.", med)
            .contains("Ask a doctor or pharmacist how much to take and when."))
    }
    func testGroupedReferenceNumbersAndUnicodeHyphens() {
        for t in ["بل 04 11111 1111111 U", "Consumer ID\u{2010}04 11111 1111111", "صارف04-12345-1234567", "Ref 04 11111 1111111"] {
            XCTAssertNotNil(Privacy.findPrivate(t), t)
        }
        XCTAssertTrue(Privacy.redact("Consumer I.D. 0412345678901").contains("[ACCOUNT]"))
    }
    func testReadingsAndDatesNotFlagged() {
        XCTAssertNil(Privacy.findPrivate("Present 12634 Previous 12603 Units 31 Due 24-11-2026"))
    }
    /// ICU treats \w and \b as Unicode; Parho makes them ASCII like the web, so Urdu touching an ID cannot hide it.
    func testUrduAdjacentIdsBlocked() {
        for t in ["حوالہ نمبرLE-04-1234567-U", "ریفرنسLE-04-1234567-U", "LE-04-1234567-Uنمبر", "éLE-04-1234567-U", "ali at gmail dot comپر"] {
            XCTAssertNotNil(Privacy.findPrivate(t), t)
            XCTAssertThrowsError(try Privacy.assertClean(t), t)
        }
        XCTAssertFalse(Privacy.redact("رابطہ ali at gmail dot comپر").contains("ali at gmail"))
    }
    func testAsciiRewriteKeepsPatternsValid() {
        XCTAssertEqual(Rx.asciiClasses("[\\w.+-]\\b\\d"), "[A-Za-z0-9_.+-]" + Rx.B + "[0-9]")
        XCTAssertTrue(Rx("\\bab\\b").test("x ab y")); XCTAssertFalse(Rx("\\bab\\b").test("xab"))
    }
}
