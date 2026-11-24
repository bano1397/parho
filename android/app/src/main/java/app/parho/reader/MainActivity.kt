package app.parho.reader

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.speech.tts.TextToSpeech
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.File
import java.util.Locale
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

private val Green = Color(0xFF0B6E4F)
private val Saffron = Color(0xFFFFC048)

class MainActivity : ComponentActivity() {
    private var tts: TextToSpeech? = null
    private var ttsReady = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        tts = TextToSpeech(this) { ttsReady = it == TextToSpeech.SUCCESS }
        setContent { ParhoTheme { ParhoScreen(::speak) } }
    }

    /** Returns false when no voice for the language exists on this phone. */
    private fun speak(text: String, lang: Lang): Boolean {
        val t = tts ?: return false
        if (!ttsReady) return false
        val loc = if (lang == Lang.EN) Locale.UK else if (lang == Lang.ROMAN_UR) Locale("en", "IN") else Locale("ur", "PK")
        val ok = t.isLanguageAvailable(loc) >= TextToSpeech.LANG_AVAILABLE
        if (!ok) return false
        t.language = loc
        t.speak(text, TextToSpeech.QUEUE_FLUSH, null, "parho")
        return true
    }

    override fun onDestroy() { tts?.shutdown(); super.onDestroy() }
}

@Composable
fun ParhoTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val scheme = if (dark) darkColorScheme(primary = Color(0xFF3FBF8F), onPrimary = Color.Black, secondary = Saffron, background = Color(0xFF14130F), surface = Color(0xFF1E1D19))
    else lightColorScheme(primary = Green, onPrimary = Color.White, secondary = Saffron, background = Color(0xFFFAF7F0), surface = Color.White)
    MaterialTheme(colorScheme = scheme, content = content)
}

private val UI = mapOf(
    Lang.UR to listOf("تصویر لیں", "تصویر چنیں", "بھیجیں اور سمجھائیں", "سنائیں"),
    Lang.ROMAN_UR to listOf("Tasveer lein", "Tasveer chunein", "Bhejein aur samjhayein", "Sunayein"),
    Lang.EN to listOf("Take a photo", "Choose a photo", "Send & explain", "Read aloud"),
)

data class Sample(val file: String, val label: String, val ur: String)
private val SAMPLES = listOf(
    Sample("sample_bill.png", "Electricity bill", "بجلی کا بل"),
    Sample("sample_notice.png", "Gas notice", "گیس کا نوٹس"),
    Sample("sample_medicine.png", "Medicine box", "دوا کا ڈبہ"),
)

private suspend fun ocr(bmp: Bitmap): String = suspendCancellableCoroutine { c ->
    TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS).process(InputImage.fromBitmap(bmp, 0))
        .addOnSuccessListener { r -> c.resume(r.textBlocks.joinToString("\n") { b -> b.lines.joinToString("\n") { it.text } }) }
        .addOnFailureListener { c.resumeWithException(it) }
}

private fun scaled(b: Bitmap): Bitmap {
    val m = maxOf(b.width, b.height)
    if (m <= 1600) return b
    val k = 1600f / m
    return Bitmap.createScaledBitmap(b, (b.width * k).toInt(), (b.height * k).toInt(), true)
}

private fun friendly(e: Throwable): String = when (e) {
    is PrivacyBlocked -> "Stopped to protect you: something that looks like a ${e.kind.name.replace('_', ' ').lowercase()} was still in the text, so nothing was sent."
    is UserCancelled -> "Cancelled. Nothing was sent."
    else -> {
        val s = e.toString()
        when {
            Regex("app.?check|403|permission", RegexOption.IGNORE_CASE).containsMatchIn(s) -> "The cloud refused the request (App Check). Nothing private was sent. ($s)"
            Regex("Unable to resolve host|network|timeout", RegexOption.IGNORE_CASE).containsMatchIn(s) -> "No internet. Reading works on this phone; the explanation needs a connection."
            else -> "Something went wrong: ${s.take(200)}"
        }
    }
}

@Composable
fun ParhoScreen(speak: (String, Lang) -> Boolean) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var lang by remember { mutableStateOf(Lang.UR) }
    var large by remember { mutableStateOf(false) }
    var contrast by remember { mutableStateOf(false) }
    var nano by remember { mutableStateOf("checking") }
    var busy by remember { mutableStateOf<String?>(null) }
    var photo by remember { mutableStateOf<Bitmap?>(null) }
    var ex by remember { mutableStateOf<Extraction?>(null) }
    var payload by remember { mutableStateOf<CloudPayload?>(null) }
    var answer by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmText by remember { mutableStateOf<String?>(null) }
    var confirm by remember { mutableStateOf<CompletableDeferred<Boolean>?>(null) }
    val timeline = remember { mutableStateListOf<TimelineEntry>() }
    val pipeline = remember { Pipeline(RealEngines, { e -> timeline.add(e) }) }
    val t = UI.getValue(lang)

    LaunchedEffect(Unit) { nano = if (RealEngines.nanoStatus() == NanoStatus.AVAILABLE) "ready" else "unavailable" }

    fun rebuild(l: Lang) {
        val e = ex ?: return
        payload = try { buildCloudPayload(e, l) } catch (x: Throwable) { error = friendly(x); null }
    }

    fun run(bmp: Bitmap) {
        photo = bmp; ex = null; payload = null; answer = ""; error = null; timeline.clear()
        scope.launch {
            try {
                busy = "Reading on this phone…"
                val t0 = System.currentTimeMillis()
                val text = ocr(scaled(bmp))
                if (text.isBlank()) throw IllegalStateException("No text found in this photo. Try a sharper, brighter photo.")
                busy = if (nano == "ready") "Gemini Nano is organising the text on this phone…" else "Hiding private details on this phone…"
                val result = pipeline.read(text, System.currentTimeMillis() - t0) { redacted ->
                    val d = CompletableDeferred<Boolean>(); confirmText = redacted; confirm = d; busy = null
                    val ok = d.await(); confirmText = null; confirm = null
                    if (ok) busy = "Cloud Gemini is organising the redacted text…"
                    ok
                }
                ex = result
                timeline.add(TimelineEntry("redact", true, "this device", "${result.privateValues.size} private detail(s) found and kept on this phone", 0))
                rebuild(lang)
            } catch (e: Throwable) { error = friendly(e) } finally { busy = null }
        }
    }

    val camUri = remember {
        val f = File(ctx.cacheDir, "photos").apply { mkdirs() }.let { File(it, "camera.jpg") }
        FileProvider.getUriForFile(ctx, "app.parho.reader.files", f)
    }
    fun load(uri: Uri) = ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) load(camUri)?.let(::run) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let { u -> load(u)?.let(::run) } }

    val scale = if (large) 1.3f else 1f
    val bg = if (contrast) Color.Black else MaterialTheme.colorScheme.background
    val fg = if (contrast) Color.Yellow else MaterialTheme.colorScheme.onBackground

    Surface(color = bg, contentColor = fg, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.verticalScroll(rememberScrollState()).safeDrawingPadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Parho ", fontSize = 28.sp * scale, fontWeight = FontWeight.Bold)
                Text("پڑھو", fontSize = 24.sp * scale, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            }
            Text("Photograph a bill, notice or medicine box. Parho reads it on this phone and explains it in simple ${if (lang == Lang.EN) "English" else "Urdu"}.", fontSize = 15.sp * scale)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically, modifier = Modifier.horizontalScroll(rememberScrollState())) {
                Row(Modifier.border(2.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(50))) {
                    listOf(Lang.EN to "English", Lang.UR to "اردو").forEach { (l, label) ->
                        val on = if (l == Lang.EN) lang == Lang.EN else lang != Lang.EN
                        Text(label, Modifier.clip(RoundedCornerShape(50)).background(if (on) MaterialTheme.colorScheme.primary else Color.Transparent)
                            .clickable { lang = l; answer = ""; rebuild(l) }.padding(horizontal = 16.dp, vertical = 8.dp).testTag("lang_${l.code}"),
                            color = if (on) MaterialTheme.colorScheme.onPrimary else fg, fontWeight = FontWeight.SemiBold, fontSize = 15.sp * scale)
                    }
                }
                Chip(if (nano == "ready") "🔒 On-device AI ready" else if (nano == "checking") "Checking on-device AI…" else "🔒 Reads on this phone (OCR)")
            }

            Card("1. Your paper") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { camera.launch(camUri) }, enabled = busy == null, modifier = Modifier.weight(1f).heightIn(min = 52.dp)) { Text("📷 ${t[0]}", fontSize = 16.sp * scale) }
                    OutlinedButton(onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, enabled = busy == null, modifier = Modifier.weight(1f).heightIn(min = 52.dp)) { Text("🖼 ${t[1]}", fontSize = 16.sp * scale) }
                }
                Text("Or try a sample (fake data):", fontSize = 14.sp * scale)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SAMPLES.forEach { s ->
                        val bmp = remember(s.file) { ctx.assets.open("samples/${s.file}").use { BitmapFactory.decodeStream(it) } }
                        Column(Modifier.weight(1f).border(1.dp, Color.Gray.copy(alpha = .4f), RoundedCornerShape(12.dp))
                            .clickable(enabled = busy == null) { run(bmp) }.padding(6.dp).semantics { contentDescription = s.label }) {
                            Image(bmp.asImageBitmap(), s.label, Modifier.fillMaxWidth().height(70.dp), contentScale = ContentScale.Crop, alignment = Alignment.TopCenter)
                            Text(s.label, fontSize = 12.sp * scale, fontWeight = FontWeight.SemiBold)
                            Text(s.ur, fontSize = 12.sp * scale)
                        }
                    }
                }
            }

            busy?.let { Card(it) { LinearProgressIndicator(Modifier.fillMaxWidth()) } }

            confirmText?.let { red ->
                Card("Gemini Nano isn’t available here — send redacted text?") {
                    Text("We read the text on this phone. Private details are replaced. Only this text would go to Gemini in the cloud — never the photo:", fontSize = 14.sp * scale)
                    Mono(red, scale)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { confirm?.complete(true) }, modifier = Modifier.testTag("confirm_send")) { Text("☁️ ${if (lang == Lang.UR) "کلاؤڈ کو بھیجیں" else "Send to cloud"}") }
                        OutlinedButton(onClick = { confirm?.complete(false) }) { Text("Cancel") }
                    }
                }
            }

            error?.let { Card("Heads up", border = Color(0xFFD9534F)) { Text(it, fontSize = 15.sp * scale) } }

            ex?.let { e ->
                Card("2. What it says") {
                    Chip(if (e.source == Source.NANO) "🔒 Read on this phone" else "☁️ Organised in cloud from redacted text")
                    sanitizeExtraction(e).fields.forEach { f ->
                        Column(Modifier.padding(vertical = 2.dp)) {
                            Text(f.label, fontSize = 13.sp * scale, color = fg.copy(alpha = .7f))
                            Text(f.value + if (f.confidence == "low") "  (check this)" else "", fontSize = 17.sp * scale, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    if (e.privateValues.isNotEmpty()) Text("${e.privateValues.size} private detail(s) found and kept on this phone.", fontSize = 13.sp * scale)
                }
            }

            payload?.let { p ->
                val json = p.toJson()
                Card("3. What the cloud will see") {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf(Lang.UR to "اردو", Lang.ROMAN_UR to "Roman Urdu", Lang.EN to "English").forEach { (l, n) ->
                            FilterChip(selected = lang == l, onClick = { lang = l; answer = ""; rebuild(l) }, label = { Text(n) })
                        }
                    }
                    Text("${json.toByteArray().size} bytes · text only · no photo", fontSize = 13.sp * scale)
                    Mono(json, scale)
                    Button(onClick = {
                        val e = ex ?: return@Button
                        error = null; answer = ""
                        scope.launch {
                            busy = "Cloud Gemini is writing the explanation…"
                            try { answer = pipeline.explain(p, e) } catch (x: Throwable) { error = friendly(x) } finally { busy = null }
                        }
                    }, enabled = busy == null, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).testTag("explain")) { Text("☁️ ${t[2]}", fontSize = 16.sp * scale) }
                }
            }

            if (answer.isNotBlank()) {
                Card("4. In simple words") {
                    Chip("☁️ Cloud Gemini")
                    val rtl = lang == Lang.UR
                    CompositionLocalProvider(LocalLayoutDirection provides if (rtl) LayoutDirection.Rtl else LayoutDirection.Ltr) {
                        Text(answer, Modifier.fillMaxWidth(), fontSize = (if (rtl) 20.sp else 17.sp) * scale, lineHeight = (if (rtl) 38.sp else 26.sp) * scale,
                            style = LocalTextStyle.current.copy(textDirection = if (rtl) TextDirection.Rtl else TextDirection.Ltr), textAlign = TextAlign.Start)
                    }
                    Button(onClick = { if (!speak(answer, lang)) error = "No ${if (lang == Lang.EN) "English" else "Urdu"} voice on this phone. Install one in Settings → Text-to-speech." }) { Text("🔊 ${t[3]}") }
                    Text("Parho explains what is printed. It is not medical, legal or financial advice.", fontSize = 12.sp * scale)
                }
            }

            if (timeline.isNotEmpty()) {
                Card("How Parho handled this") {
                    timeline.forEach { e ->
                        Text("${e.step} · ${if (e.onDevice) "🔒" else "☁️"} ${e.engine}${if (e.ms > 0) " · ${"%.1f".format(e.ms / 1000.0)} s" else ""}${e.bytesOut?.let { " · $it bytes sent" } ?: ""}", fontWeight = FontWeight.SemiBold, fontSize = 13.sp * scale)
                        Text(e.reason, fontSize = 12.sp * scale)
                    }
                }
            }

            Card("Settings") {
                Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(large, { large = it }); Text("Large text  بڑا متن") }
                Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(contrast, { contrast = it }); Text("High contrast  زیادہ واضح رنگ") }
            }
            Text("Hybrid AI with Firebase AI Logic: text is read on this phone (ML Kit, and Gemini Nano where available); Gemini in the cloud writes the Urdu from redacted text only. Photos are never uploaded. Samples contain fake data. Not advice.", fontSize = 12.sp, color = fg.copy(alpha = .7f))
        }
    }
}


@Composable
private fun Chip(text: String) {
    Text(text, Modifier.border(1.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(50)).padding(horizontal = 12.dp, vertical = 6.dp), fontSize = 13.sp)
}

@Composable
private fun Mono(text: String, scale: Float) {
    Text(text, Modifier.fillMaxWidth().background(Color.Gray.copy(alpha = .12f), RoundedCornerShape(8.dp)).padding(10.dp),
        fontFamily = FontFamily.Monospace, fontSize = 11.sp * scale)
}

@Composable
private fun Card(title: String, border: Color? = null, content: @Composable ColumnScope.() -> Unit) {
    ElevatedCard(Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
        Column(Modifier.then(if (border != null) Modifier.border(BorderStroke(2.dp, border), RoundedCornerShape(16.dp)) else Modifier).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            content()
        }
    }
}
