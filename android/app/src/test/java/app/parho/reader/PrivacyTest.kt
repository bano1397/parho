package app.parho.reader

import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import kotlin.random.Random

// Ports of the web app's privacy, router, implausible and audit-regression tests.

private fun toUrdu(s: String) = s.map { if (it.isDigit()) (0x06F0 + (it - '0')).toChar() else it }.joinToString("")
private fun ex(docType: String, fields: List<Pair<String, String>>, title: String = "x", pvs: List<PrivateValue> = emptyList(), text: String = "") =
    Extraction(docType, title, fields.map { Field(it.first, it.second) }, pvs, text)
private fun sendable(e: Extraction) = try { buildCloudPayload(e, Lang.UR).toJson() } catch (x: PrivacyBlocked) { "BLOCKED" }

class SafetyNetTest {
    @Test fun findsEachKind() {
        val cases = listOf(
            "CNIC 35202-1234567-1" to PrivateKind.CNIC, "cnic 3520212345671" to PrivateKind.CNIC, "call 0300-1234567" to PrivateKind.PHONE,
            "+92 300 1234567" to PrivateKind.PHONE, "mail me a.b@x.pk" to PrivateKind.EMAIL, "ref 04123456789012" to PrivateKind.LONG_NUMBER,
            "img data:image/png;base64,AAAA" to PrivateKind.IMAGE_DATA,
        )
        for ((t, k) in cases) assertEquals(t, k, findPrivate(t))
    }
    @Test fun urduDigitCnic() = assertEquals(PrivateKind.CNIC, findPrivate(toUrdu("35202-1234567-1")))
    @Test fun leavesBillFactsAlone() {
        for (t in listOf("Amount Rs 18,450", "Due 24-11-2026", "Units 412", "Expiry 12-2027", "Take 2 tablets every 6 hours")) assertNull(t, findPrivate(t))
    }
    @Test fun knownNamesAnySpacing() = assertEquals(PrivateKind.KNOWN_VALUE, findPrivate("Dear AHMED   khan, pay now", listOf("Ahmed Khan")))
    @Test(expected = PrivacyBlocked::class) fun assertCleanThrows() = assertClean("{\"t\":\"0300 1234567\"}")
    @Test fun arabicIndicDigits() = assertEquals("35", normaliseDigits("٣٥"))
    @Test fun fullwidthAndDevanagari() {
        assertNotNull(findPrivate("CNIC ３５２０２-１２３４５６７-１"))
        assertNotNull(findPrivate("CNIC ३५२०२१२३४५६७१"))
    }
}

class RedactTest {
    @Test fun removesKnownValuesAndPatterns() {
        val out = redact("Ahmed Fake Khan, CNIC 00000-0000000-0, phone 0300-0000000, House 0 Street 0",
            listOf(PrivateValue("NAME", "Ahmed Fake Khan"), PrivateValue("ADDRESS", "House 0, Street 0")))
        assertTrue(out.contains("[NAME]")); assertTrue(out.contains("[ADDRESS]"))
        assertNull(findPrivate(out, listOf("Ahmed Fake Khan")))
    }
    @Test fun labelledLines() {
        val r = redact("To: Fatima Fake Bibi\nAddress: Flat 0, Block Z, Sample Colony, Karachi\nAccount No: ABC-12\nAmount due: Rs 6,780")
        assertFalse(r, Regex("Fatima|Block Z|ABC-12").containsMatchIn(r))
        assertTrue(r.contains("To: [NAME]")); assertTrue(r.contains("Address: [ADDRESS]")); assertTrue(r.contains("Rs 6,780"))
    }
    @Test fun keepsNonPrivateLines() = assertEquals("Total amount: Rs 500\nDue date: 30-11-2026", redact("Total amount: Rs 500\nDue date: 30-11-2026"))
    @Test fun noOverRedaction() {
        assertEquals("To pay: Rs 7,371 by 24 NOV 26", redact("To pay: Rs 7,371 by 24 NOV 26", listOf(PrivateValue("NAME", "Ali"))))
        assertEquals("Quality check", redact("Quality check", listOf(PrivateValue("NAME", "Ali"))))
        assertEquals("Units consumed 123, amount Rs 7,371 due 24 NOV 26", redact("Units consumed 123, amount Rs 7,371 due 24 NOV 26"))
        assertTrue(redact("Name of medicine: Panadol").contains("Panadol"))
    }
    @Test fun sampleBillOcrIsClean() {
        val ocr = "SAMPLE CITY POWER COMPANY\nElectricity Bill - November 2026\nConsumer Name: Ahmed Fake Khan\nCNIC: 00000-0000000-0\nAddress: House 0, Street 0, Sample Town, Lahore\nConsumer ID: 0000000000000\nPhone: 0300 0000000\nBilling Month: NOV-2026\nUnits Consumed: 412\nAmount Due Within Due Date: Rs 18,450\nDue Date: 24-11-2026"
        val r = redact(ocr)
        assertNull(r, findPrivate(r))
        assertFalse(r, Regex("Ahmed|Sample Town|0300").containsMatchIn(r))
        assertTrue(r.contains("Rs 18,450")); assertTrue(r.contains("412"))
    }
}

class AuditRegressionTest {
    private val probes = listOf(
        "Consumer No 04 11234 1234567" to "1234567", "Ref No. 12 11234 1234567 U" to "1234567", "CNIC 35202-123456-71" to "123456",
        "C N I C: 3 5 2 0 2 1 2 3 4 5 6 7 1" to "3 5 2 0 2", "Name Ahmed Khan" to "Ahmed", "naam: Ahmed Khan" to "Ahmed", "Naam Ahmed Khan" to "Ahmed",
        "Bill To Ahmed Khan" to "Ahmed", "Account Title: Ahmed Khan" to "Ahmed", "Holder: Ahmed Khan" to "Ahmed", "ولد محمد اسلم" to "محمد",
        "pata: Gulberg Lahore" to "Gulberg", "Pata Model Road" to "Model", "پتا: گلبرگ لاہور" to "گلبرگ", "Plot 5 DHA Karachi" to "Plot 5",
        "Meter 123456" to "123456", "Ac No 12345678" to "12345678", "email ali at gmail dot com" to "gmail", "IBAN PK36SCBL0000001123456702" to "SCBL",
    )
    @Test fun probe19NovNeverReachesCloud() {
        for ((t, bad) in probes) { val out = redact(t); assertNull("$t -> $out", findPrivate(out)); assertFalse("$t -> $out", out.contains(bad)) }
    }
    private val leaks16Nov = listOf(
        "CNIC 35202 - 1234567 - 1", "CNIC 35202/1234567/1", "id 3520 2123 4567 1", "call +92 300 123 4567", "call 0300 123 4567",
        "call (0300) 1234567", "tel 042-35761234", "ali @ gmail.com", "ali [at] gmail.com", "Ref: LE-04-1234567-U due", "Consumer 041234567 due",
        "Dear Ahmed Khan, pay now", "House 12 Street 4 Gulberg Lahore", "Ck No 197 Bhagy Wala",
    )
    @Test fun audit16NovLeaksStayFixed() {
        for (t in leaks16Nov) { val out = redact(t); assertNull("$t -> $out", findPrivate(out)); assertFalse("$t -> $out", Regex("1234567|4567|gmail|Ahmed|Gulberg|Bhagy").containsMatchIn(out)) }
    }
    @Test fun privateLabelsDroppedOnNotices() {
        val s = sendable(ex("notice", listOf("Pata" to "Gulberg Lahore", "Walid" to "Ahmed Khan", "To" to "Ahmed Khan", "Sender" to "Ahmed Khan", "Amount" to "Rs 500")))
        assertFalse(s, Regex("Gulberg|Ahmed").containsMatchIn(s)); assertTrue(s.contains("Rs 500"))
    }
    @Test fun labelsTitlesHoldersNeverCarryName() {
        val s = sendable(ex("bill", listOf("Ahmed Khan" to "Rs 500", "Recipient" to "Ahmed Khan", "Holder" to "Ali s/o Zahid", "Cust #" to "LE1234567", "Amount due" to "Rs 500"),
            title = "Bill of Ahmed Khan", pvs = listOf(PrivateValue("NAME", "Ahmed Khan"))))
        assertFalse(s, Regex("Ahmed|Zahid|LE1234567").containsMatchIn(s)); assertTrue(s.contains("Rs 500"))
    }
}

class SanitizeTest {
    private fun keepMed(vararg f: Pair<String, String>) = sanitizeExtraction(ex("medicine", f.toList())).fields.map { "${it.label}=${it.value}" }
    @Test fun medicineDosesDropped() {
        val doses = listOf("Uses" to "1+0+1 after meals", "Used for" to "Fever. 500mg BD", "Indications" to "Pain; take TDS", "Strength" to "500 mg x3 daily",
            "Form" to "Syrup 5 ml OD", "Uses" to "10 mg/kg", "Uses" to "din mein 3 baar", "Uses" to "روزانہ 2 گولی",
            "Composition" to "Paracetamol 500mg. Do not exceed 8 in 24 hours", "Contains" to "Paracetamol, not for children under 12",
            "Uses" to "Use before 12/2027", "Do not take more than" to "8 tablets in 24 hours.", "Expiry" to "11/2026", "Indication" to "take 2 tablets every 6 hours",
            "Composition" to "Paracetamol 500mg twice")
        for (d in doses) assertEquals(d.toString(), emptyList<String>(), keepMed(d))
    }
    @Test fun medicineKeepsIdentifyingFields() = assertEquals(
        listOf("Name=Panadol", "Medicine name=Panadol", "Strength=500 mg", "Form=Tablet", "Active ingredient=Paracetamol 500 mg"),
        keepMed("Name" to "Panadol", "Medicine name" to "Panadol", "Strength" to "500 mg", "Form" to "Tablet", "Active ingredient" to "Paracetamol 500 mg"))
    @Test fun medicineSendsNoRawText() = assertEquals("", buildCloudPayload(ex("medicine", listOf("Name" to "X"), text = "Dosage: 2 tablets every 4 hours"), Lang.UR).redactedText)
    @Test fun privateByLabelDropped() = assertEquals(listOf("Amount Due"),
        sanitizeExtraction(ex("bill", listOf("Consumer ID" to "113302611", "Amount Due" to "5568", "Name & Address" to "X Y"))).fields.map { it.label })

    private fun units(vararg f: Pair<String, String>) = sanitizeExtraction(ex("bill", f.toList())).fields.firstOrNull { Regex("units", RegexOption.IGNORE_CASE).containsMatchIn(it.label) }?.value
    @Test fun printedUnitsWin() = assertEquals("1", units("UNITS" to "1", "PREVIOUS READING" to "12603", "CURRENT READING" to "12634"))
    @Test fun fillsUnitsWhenMissing() = assertEquals("84", units("PREVIOUS READING" to "81940", "CURRENT READING" to "82024"))
    @Test fun unitsSafeCases() {
        assertEquals("2000", units("Units" to "2000", "Previous Reading" to "1000", "Present Reading" to "1050", "MF" to "40"))
        assertEquals("100", units("Units" to "100", "Previous Reading" to "1234.5", "Present Reading" to "1334.5"))
        assertEquals("1.25", units("Units (hm3)" to "1.25", "Previous Reading" to "100", "Present Reading" to "230"))
        assertEquals("200", units("Units" to "200", "Previous Reading" to "33,413", "Present Reading" to "33,613"))
    }
    @Test fun dropImplausibleCases() {
        fun f(l: String, v: String) = Field(l, v)
        assertEquals(listOf("AMOUNT DUE"), dropImplausible(listOf(f("AMOUNT DUE", "5568"), f("AMOUNT AFTER DUE DATE", "After 27/NOV-26"))).map { it.label })
        assertEquals(3, dropImplausible(listOf(f("Amount Due", "Rs. 4,508"), f("Net Electricity Charges", "1,043/-"), f("Units", "84"))).size)
        assertEquals(listOf("Due Date", "Units"), dropImplausible(listOf(f("Due Date", "24 NOV 26"), f("Previous Reading Date", "24 NOV 26"), f("Units", "96"))).map { it.label })
        assertEquals(2, dropImplausible(listOf(f("Due Date", "24 NOV 26"), f("Reading Date", "17 NOV 26"))).size)
        assertEquals(listOf("Bill Month", "Units"), dropImplausible(listOf(f("Bill Month", "Nov 26"), f("Units", "123"), f("Billing Month", "NOV26"), f("Consumption", "123"))).map { it.label })
    }
    @Test fun billNoteJumpAndNoFalseJump() {
        val bill = ex("bill", listOf("Units consumed" to "412", "Previous months units" to "Oct 188 | Sep 205 | Aug 260"))
        assertTrue(billNote(bill)!!.contains("higher than the average"))
        assertNull(billNote(ex("bill", listOf("Units" to "120", "Previous Reading" to "33413", "History" to "Nov25 110 Dec25 115 Jan26 118"))))
    }
    @Test fun parseFencedJson() {
        assertEquals(emptyList<Field>(), parseExtraction("```json\n{\"doc_type\":\"medicine\"}\n```").fields)
        assertThrows(Exception::class.java) { parseExtraction("hello") }
    }
    @Test fun medicinePharmacistLineEnforced() {
        val p = CloudPayload("medicine", "Panadol", emptyList(), "", Lang.UR)
        assertTrue(finishExplanation("یہ پیناڈول ہے۔", p).contains("فارماسسٹ"))
    }
}

class PropertyTest {
    private val rnd = Random(1397)
    private fun digits(n: Int) = (1..n).joinToString("") { rnd.nextInt(10).toString() }
    private fun sep() = listOf("", "-", " ")[rnd.nextInt(3)]
    private fun secret(): String = when (rnd.nextInt(4)) {
        0 -> "${digits(5)}${sep()}${digits(7)}${sep()}${digits(1)}"
        1 -> "${listOf("03", "+923", "923")[rnd.nextInt(3)]}${digits(2)}${sep()}${digits(7)}"
        2 -> "${letters()}@${letters()}.pk"
        else -> digits(12)
    }
    private fun letters() = (1..(1 + rnd.nextInt(8))).joinToString("") { ('a' + rnd.nextInt(26)).toString() }
    private fun filler() = (0 until rnd.nextInt(40)).joinToString("") { "ABCabc ,.:xyz"[rnd.nextInt(13)].toString() }

    @Test fun injectedSecretsAlwaysBlockedAndRedacted() {
        repeat(500) {
            val s = secret(); val urdu = rnd.nextBoolean()
            val text = "${filler()} ${if (urdu) toUrdu(s) else s} ${filler()}"
            assertNotNull(text, findPrivate(text))
            val plain = "${filler()} $s ${filler()}"
            assertNull(plain, findPrivate(redact(plain)))
        }
    }
}

class PipelineTest {
    private val nanoJson = """{"doc_type":"bill","title":"Electricity bill","fields":[{"label":"Amount due","value":"Rs 18,450","confidence":"high"},{"label":"Units consumed","value":"412","confidence":"high"},{"label":"Consumer ID","value":"0000000000000","confidence":"high"}],"private_values":[{"kind":"NAME","value":"Ahmed Fake Khan"},{"kind":"CNIC","value":"00000-0000000-0"}],"text":""}"""
    private val ocr = "Consumer Name: Ahmed Fake Khan\nCNIC 35202-1234567-1\nAmount Rs 500"

    class Fake(val status: NanoStatus, val nanoOut: String = "", val cloudOut: String = """{"doc_type":"bill","fields":[],"private_values":[],"text":""}""") : Engines {
        val cloudCalls = mutableListOf<String>(); var nanoCalls = 0
        override suspend fun nanoStatus() = status
        override suspend fun nano(prompt: String): String { nanoCalls++; return nanoOut }
        override suspend fun cloud(prompt: String, json: Boolean): String { cloudCalls += prompt; return cloudOut }
    }

    @Test fun nanoPathNeverCallsCloud() = runBlocking {
        val f = Fake(NanoStatus.AVAILABLE, nanoJson); val log = mutableListOf<TimelineEntry>()
        val e = Pipeline(f, { log += it }).read(ocr, 10) { fail("must not ask"); false }
        assertEquals(Source.NANO, e.source); assertTrue(f.cloudCalls.isEmpty())
        assertFalse(e.fields.any { it.label == "Consumer ID" })
        val p = buildCloudPayload(e, Lang.UR).toJson()
        assertFalse(p, Regex("Ahmed|35202|00000-0000000-0").containsMatchIn(p))
    }
    @Test fun badNanoRetriesOnceThenFallsBackWithRedactedTextOnly() = runBlocking {
        val f = Fake(NanoStatus.AVAILABLE, "not json"); var asked = 0
        val e = Pipeline(f, {}).read(ocr, 10) { asked++; true }
        assertEquals(2, f.nanoCalls); assertEquals(1, asked); assertEquals(Source.CLOUD_FROM_OCR, e.source)
        val sent = f.cloudCalls.single()
        assertFalse(sent.contains("35202")); assertFalse(sent.contains("Ahmed")); assertTrue(sent.contains("[CNIC]"))
    }
    @Test fun cancelStopsBeforeCloud() = runBlocking {
        val f = Fake(NanoStatus.UNAVAILABLE)
        try { Pipeline(f, {}).read(ocr, 10) { false }; fail("expected cancel") } catch (_: UserCancelled) {}
        assertTrue(f.cloudCalls.isEmpty())
    }
    @Test fun explainRefusesDirtyPayload() = runBlocking {
        val f = Fake(NanoStatus.AVAILABLE)
        try { Pipeline(f, {}).explain(CloudPayload("bill", null, emptyList(), "call 0300-1234567", Lang.UR), ex("bill", emptyList())); fail("expected block") } catch (_: PrivacyBlocked) {}
        assertTrue(f.cloudCalls.isEmpty())
    }
    @Test fun billNoteReadsHistoryFromTextWhenFieldsMissIt() {
        val e = Extraction("bill", "x", listOf(Field("Units Consumed", "412"), Field("Previous Month Units", "188")), emptyList(),
            "Units Consumed: 412\nHistory: Oct 188 | Sep 205 | Aug 260 | Jul 274", Source.CLOUD_FROM_OCR)
        assertTrue(billNote(e)!!.contains("78% higher"))
    }
}

// Deep-test regressions (24 Nov): ports of the web "24 Nov" tests plus the Android ICU \w/\b cases.
class DeepTest24Nov {
    private fun bill(vararg f: Pair<String, String>, text: String = "") =
        Extraction("bill", "x", f.map { Field(it.first, it.second) }, emptyList(), text)

    @Test fun commaGroupedHistoryUnitsAreWholeNumbers() =
        assertNull(billNote(bill("Units" to "1,300", "History" to "NOV-25 1,250 DEC-25 1,100 JAN-26 1,180")))

    @Test fun monthYearWithSpaceIsNotUnits() =
        assertTrue(billNote(bill("Units" to "450", "History" to "NOV 25 300 DEC 25 280"))!!.contains("55% higher"))

    @Test fun paymentHistoryLineIgnored() {
        assertNull(billNote(bill("Units Consumed" to "300", text = "Payment History: 12-10-2026 Rs 5,000")))
        assertNull(billNote(bill("Units Consumed" to "300", text = "Billing History: Paid 05/10/2026 Rs 1,200")))
        assertNull(billNote(bill("Units Consumed" to "300", text = "CNIC history: 35202-1234567-1")))
    }

    @Test fun groupedWapdaReferenceAndUnicodeHyphenBlocked() {
        for (t in listOf("بل 04 11111 1111111 U", "Consumer ID‐04 11111 1111111", "صارف04-12345-1234567", "Ref 04 11111 1111111"))
            assertNotNull(t, findPrivate(t))
        assertTrue(redact("Consumer I.D. 0412345678901").contains("[ACCOUNT]"))
    }

    @Test fun readingsAndDatesNotFlagged() = assertNull(findPrivate("Present 12634 Previous 12603 Units 31 Due 24-11-2026"))

    private fun keepMed(v: String) = sanitizeExtraction(Extraction("medicine", "x", listOf(Field("Active ingredient", v)), emptyList(), "")).fields.size

    @Test fun dailyMaximumAsSecondStrengthDropped() {
        for (v in listOf("Paracetamol 500 mg, max 4 g", "Ibuprofen 200 mg up to 1200 mg", "Paracetamol 500 mg (4 g limit)")) assertEquals(v, 0, keepMed(v))
        assertEquals(1, keepMed("Paracetamol 500 mg"))
    }

    @Test fun exactPharmacistLineAlwaysAppended() {
        val p = CloudPayload("medicine", "Panadol", listOf(Field("Name", "Panadol")), "", Lang.EN)
        val out = finishExplanation("Panadol has paracetamol 500 mg. Your pharmacist may say take 2 tablets.", p)
        assertTrue(out.contains("Ask a doctor or pharmacist how much to take and when."))
    }

    // On a phone, ICU makes \w and \b include Urdu letters; jsAscii() keeps them ASCII like the web app.
    @Test fun urduAdjacentIdsAndEmailsBlockedAndRedacted() {
        for (t in listOf("حوالہLE-04-1234567-U", "LE-04-1234567-Uنمبر", "ali at gmail dot comپر")) {
            assertNotNull(t, findPrivate(t))
            assertNull(t, findPrivate(redact(t)))
        }
    }

    @Test fun jsAsciiRewritesWordClasses() {
        assertEquals("[A-Za-z0-9_.+-]", jsAscii("[\\w.+-]"))
        assertTrue(jsAscii("\\bx\\w").contains("(?<![A-Za-z0-9_])"))
        assertEquals("\\d\\s\\[", jsAscii("\\d\\s\\["))
    }
}
