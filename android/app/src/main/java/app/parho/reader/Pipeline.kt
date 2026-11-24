package app.parho.reader

// Port of the router: decides where each step runs and records why (shown as a timeline).
// Rule: the PHOTO never leaves the phone. Unredacted text only ever goes to the ON-DEVICE model.

enum class NanoStatus { AVAILABLE, DOWNLOADING, UNAVAILABLE }

interface Engines {
    suspend fun nanoStatus(): NanoStatus
    /** Text-only Gemini Nano call that must run on this phone (ONLY_ON_DEVICE). Throws if it can't. */
    suspend fun nano(prompt: String): String
    /** Text-only cloud call through Firebase AI Logic (ONLY_IN_CLOUD). */
    suspend fun cloud(prompt: String, json: Boolean = false): String
}

data class TimelineEntry(val step: String, val onDevice: Boolean, val engine: String, val reason: String, val ms: Long, val bytesOut: Int? = null)

class UserCancelled : Exception("Cancelled")

class Pipeline(
    private val engines: Engines,
    private val log: (TimelineEntry) -> Unit,
    private val clock: () -> Long = { System.currentTimeMillis() },
) {
    /** ocrText was read on this phone (ML Kit). confirmSend shows the redacted text and returns true to send it. */
    suspend fun read(ocrText: String, ocrMs: Long, confirmSend: suspend (String) -> Boolean): Extraction {
        log(TimelineEntry("read", true, "ML Kit OCR (this device)", "Text read on this phone; the photo never leaves it", ocrMs))
        val status = runCatching { engines.nanoStatus() }.getOrDefault(NanoStatus.UNAVAILABLE)
        if (status == NanoStatus.AVAILABLE) {
            val t0 = clock()
            repeat(2) {
                try {
                    val ex = parseExtraction(engines.nano(Prompts.EXTRACT_FROM_OCR + ocrText), Source.NANO)
                    log(TimelineEntry("read", true, "Gemini Nano (this device)", "Gemini Nano organised the text on this phone", clock() - t0))
                    return sanitizeExtraction(ex.copy(text = ocrText))
                } catch (e: Exception) {
                    if (e is PrivacyBlocked) throw e
                    // Leaving the screen must stop the work; only a Nano timeout counts as "unusable answer".
                    if (e is kotlinx.coroutines.CancellationException && e !is kotlinx.coroutines.TimeoutCancellationException) throw e
                }
            }
            log(TimelineEntry("read", true, "Gemini Nano (this device)", "Gemini Nano gave an unusable answer twice — switching to fallback", clock() - t0))
        }
        // Fallback: redact on this phone → user confirms → cloud structures the REDACTED text only.
        val redacted = redact(ocrText)
        val body = Prompts.STRUCTURE_FROM_TEXT + redacted
        assertClean(body)
        log(TimelineEntry("redact", true, "this device", "Names, CNIC, address, phone and account numbers removed on this phone", 0))
        if (!confirmSend(redacted)) throw UserCancelled()
        val t2 = clock()
        val ex = parseExtraction(engines.cloud(body, json = true), Source.CLOUD_FROM_OCR)
        log(TimelineEntry("read", false, "Gemini cloud", "Cloud Gemini (via Firebase AI Logic) organised the redacted text — no photo was sent", clock() - t2, body.toByteArray().size))
        return sanitizeExtraction(ex.copy(text = redacted, privateValues = emptyList()))
    }

    suspend fun explain(payload: CloudPayload, ex: Extraction): String {
        assertClean(payload.toJson(), ex.privateValues.map { it.value })
        val prompt = Prompts.explain(payload, billNote(ex))
        assertClean(prompt, ex.privateValues.map { it.value })
        val t0 = clock()
        val text = engines.cloud(prompt)
        log(TimelineEntry("explain", false, "Gemini cloud", "The explanation in Urdu needs the cloud model — only redacted text was sent", clock() - t0, prompt.toByteArray().size))
        return finishExplanation(text, payload)
    }
}
