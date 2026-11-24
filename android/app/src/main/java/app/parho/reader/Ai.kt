@file:OptIn(PublicPreviewAPI::class)
package app.parho.reader

import android.util.Log
import com.google.firebase.Firebase
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.OnDeviceModelStatus
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.PublicPreviewAPI
import com.google.firebase.ai.type.generationConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout

/** The ONLY file that touches Firebase AI Logic. */
object RealEngines : Engines {
    private val ai by lazy { Firebase.ai(backend = GenerativeBackend.googleAI()) }

    // Private step: ONLY_ON_DEVICE, so unredacted text can never fall through to the cloud.
    private val nanoModel by lazy {
        ai.generativeModel(
            modelName = BuildConfig.CLOUD_MODEL,
            onDeviceConfig = OnDeviceConfig(mode = InferenceMode.ONLY_ON_DEVICE, maxOutputTokens = 800, temperature = 0f),
        )
    }
    private val cloudModel by lazy {
        ai.generativeModel(
            modelName = BuildConfig.CLOUD_MODEL,
            generationConfig = generationConfig { temperature = 0.3f; maxOutputTokens = 600 },
            onDeviceConfig = OnDeviceConfig(mode = InferenceMode.ONLY_IN_CLOUD),
        )
    }
    private val cloudJsonModel by lazy {
        ai.generativeModel(
            modelName = BuildConfig.CLOUD_MODEL,
            generationConfig = generationConfig { responseMimeType = "application/json" },
            onDeviceConfig = OnDeviceConfig(mode = InferenceMode.ONLY_IN_CLOUD),
        )
    }

    var lastStatus: String = "checking"; private set

    override suspend fun nanoStatus(): NanoStatus = try {
        val s = withTimeout(5_000) { nanoModel.onDeviceExtension?.checkStatus() }
        lastStatus = s?.toString() ?: "UNAVAILABLE"
        when (s) {
            OnDeviceModelStatus.AVAILABLE -> NanoStatus.AVAILABLE
            OnDeviceModelStatus.DOWNLOADABLE -> { startDownload(); NanoStatus.DOWNLOADING }
            OnDeviceModelStatus.DOWNLOADING -> NanoStatus.DOWNLOADING
            else -> NanoStatus.UNAVAILABLE
        }
    } catch (e: Throwable) {
        Log.i("Parho", "Gemini Nano not available: $e"); lastStatus = "UNAVAILABLE"; NanoStatus.UNAVAILABLE
    }

    private val bg = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    @Volatile private var downloading = false

    /** Supported phones (Pixel, Galaxy…) download Gemini Nano once; until then Parho uses the redacted cloud fallback. */
    private fun startDownload() {
        if (downloading) return
        downloading = true
        bg.launch {
            try { nanoModel.onDeviceExtension?.download()?.collect { Log.i("Parho", "Gemini Nano download: $it") } }
            catch (e: Throwable) { Log.i("Parho", "Gemini Nano download failed: $e") }
            finally { downloading = false }
        }
    }

    override suspend fun nano(prompt: String): String =
        withTimeout(90_000) { nanoModel.generateContent(prompt).text ?: error("empty on-device answer") }

    override suspend fun cloud(prompt: String, json: Boolean): String {
        val m = if (json) cloudJsonModel else cloudModel
        var attempt = 0
        while (true) {
            try {
                return withTimeout(45_000) { m.generateContent(prompt).text ?: error("empty cloud answer") }
            } catch (e: Exception) {
                val busy = Regex("\\b(500|502|503)\\b|high demand|overload|unavailable", RegexOption.IGNORE_CASE).containsMatchIn(e.toString())
                if (!busy || attempt >= 2) throw e
                delay(1500L shl attempt); attempt++
            }
        }
    }
}
