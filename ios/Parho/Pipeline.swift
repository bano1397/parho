// Router: decides where each step runs and records why (shown to the user as a timeline).
import Foundation
import UIKit
import AVFoundation

@MainActor
@Observable
final class Pipeline {
    enum Phase: Equatable { case idle, reading, confirm, ready, explaining }

    var lang: Lang = .ur { didSet { if oldValue != lang { languageChanged() } } }
    var phase: Phase = .idle
    var progress = ""
    var image: UIImage?
    var extraction: Extraction?
    var payload: CloudPayload?
    var pendingRedacted = "" // fallback: the redacted OCR text waiting for the user's OK
    var answer = ""
    var error: String?
    var timeline: [TimelineEntry] = []
    var onDeviceReady = Engines.onDeviceStatus.ready
    var onDeviceText = Engines.onDeviceStatus.text

    private var confirmCont: CheckedContinuation<Bool, Never>?
    /// Each read/explain run gets a number; a run whose number is no longer current never writes state
    /// (deep-test findings: a second read or a language switch mid-call let an old run overwrite the new one).
    private var gen = 0
    private var task: Task<Void, Never>?
    private let speech = AVSpeechSynthesizer()

    func refreshStatus() {
        let s = Engines.onDeviceStatus
        onDeviceReady = s.ready; onDeviceText = s.text
    }

    func reset() {
        gen += 1
        task?.cancel(); task = nil
        stopSpeaking()
        extraction = nil; payload = nil; answer = ""; error = nil; timeline = []; pendingRedacted = ""; progress = ""
        confirmCont?.resume(returning: false); confirmCont = nil
    }

    private func log(_ step: String, _ onDevice: Bool, _ engine: String, _ reason: String, _ t0: Date, bytes: Int? = nil) {
        timeline.append(TimelineEntry(step: step, onDevice: onDevice, engine: engine, reason: reason, ms: Int(Date().timeIntervalSince(t0) * 1000), bytesOut: bytes))
    }

    func read(_ img: UIImage) {
        reset()
        image = img
        phase = .reading
        let g = gen
        task = Task { await runRead(img, g) }
    }

    private func runRead(_ img: UIImage, _ g: Int) async {
        @MainActor func stale() -> Bool { g != gen || Task.isCancelled }
        do {
            refreshStatus()
            progress = "Reading the text on this phone…"
            let t0 = Date()
            let raw = try await Engines.ocr(img)
            if stale() { return }
            log("read", true, "Apple Vision (this phone)", "Text read from the photo on this phone; the photo never leaves it", t0)
            if raw.trimmingCharacters(in: .whitespacesAndNewlines).count < 10 {
                throw Msg("No printed text found. Try a clearer, flatter photo in good light.")
            }

            var ex: Extraction?
            if onDeviceReady {
                progress = "Understanding it on this phone…"
                let t1 = Date()
                for _ in 0..<2 where ex == nil {
                    if stale() { return }
                    if let out = try? await Engines.structureOnDevice(raw), var e = try? Doc.parse(out, source: .onDevice) {
                        e.text = raw
                        ex = Doc.sanitize(e)
                    }
                }
                if stale() { return }
                log("read", true, "Apple on-device model", ex == nil ? "On-device model gave an unusable answer twice — switching to fallback" : "Apple's on-device model organised the text — nothing left the phone", t1)
            }

            if ex == nil {
                // Fallback: redact on this phone → user OKs → the cloud structures the TEXT only.
                let redacted = Privacy.redact(raw)
                let body = Prompts.structureFromText + redacted
                try Privacy.assertClean(body)
                pendingRedacted = redacted
                phase = .confirm
                let ok = await withCheckedContinuation { confirmCont = $0 }
                if stale() { return } // a newer read already reset the screen
                confirmCont = nil
                if !ok { phase = .idle; pendingRedacted = ""; return }
                phase = .reading
                progress = "Organising the redacted text in the cloud…"
                let t2 = Date()
                let out = try await Engines.cloud(body, json: true)
                if stale() { return }
                var e = try Doc.parse(out, source: .cloudFromOcr)
                e.text = redacted
                ex = Doc.sanitize(e)
                log("read", false, "Gemini cloud", "Cloud Gemini (via Firebase AI Logic) organised the redacted text — no photo was sent", t2, bytes: body.utf8.count)
            }

            guard let ex else { return }
            extraction = ex
            let t3 = Date()
            payload = try Doc.buildCloudPayload(ex, lang)
            #if DEBUG
            print("[Parho] cloud payload:", payload?.json ?? "")
            #endif
            log("redact", true, "this phone", "Names, CNIC, address, phone and account numbers removed on this phone", t3)
            phase = .ready
        } catch let b as PrivacyBlocked {
            if stale() { return }
            fail("Stopped to protect you: something that looks like a \(b.kind.rawValue.replacingOccurrences(of: "_", with: " ").lowercased()) was still in the text, so nothing was sent.")
        } catch {
            if stale() { return }
            fail(friendly(error))
        }
        progress = ""
    }

    func confirmSend(_ ok: Bool) { confirmCont?.resume(returning: ok); confirmCont = nil }

    private func languageChanged() {
        // Drop an explanation still on its way in the old language.
        if phase == .explaining { gen += 1; task?.cancel(); task = nil; phase = .ready }
        stopSpeaking(); answer = ""
        // The old explanation is gone, so its row leaves the trace too (one cloud call per answer shown).
        timeline.removeAll { $0.step == "explain" }
        if let ex = extraction { payload = try? Doc.buildCloudPayload(ex, lang) }
    }

    func explain() {
        guard let p = payload, let ex = extraction else { return }
        phase = .explaining; answer = ""; error = nil
        gen += 1
        let g = gen
        task = Task { @MainActor in
            @MainActor func stale() -> Bool { g != gen || Task.isCancelled }
            do {
                try Privacy.assertClean(p.json, known: ex.privateValues.map(\.value))
                let prompt = Prompts.explain(p, note: Doc.billNote(ex))
                let t0 = Date()
                let text = try await Engines.cloud(prompt)
                if stale() { return }
                log("explain", false, "Gemini cloud", "\(lang == .en ? "The explanation" : "Urdu explanation") needs the cloud model — only redacted text was sent", t0, bytes: prompt.utf8.count)
                answer = Doc.finishExplanation(text, p)
                phase = .ready
            } catch let b as PrivacyBlocked {
                if stale() { return }
                fail("Stopped to protect you (\(b.kind.rawValue)): nothing was sent.")
                phase = .ready
            } catch {
                if stale() { return }
                fail(friendly(error)); phase = .ready
            }
        }
    }

    private func fail(_ m: String) { error = m; if phase == .reading || phase == .confirm { phase = .idle } }

    private func friendly(_ e: Error) -> String {
        if let m = e as? Msg { return m.text }
        if e is Doc.BadOutput { return "The answer could not be read. Please try again." }
        let s = String(describing: e)
        if s.range(of: "403|app.?check|PERMISSION_DENIED", options: [.regularExpression, .caseInsensitive]) != nil {
            #if DEBUG
            return "The cloud refused this app (App Check). Register this device's debug token in Firebase, then try again."
            #else
            return "The cloud could not verify this app right now. Nothing was sent. Please try again later."
            #endif
        }
        if s.range(of: "offline|network|internet|NSURLErrorDomain", options: [.regularExpression, .caseInsensitive]) != nil {
            return "No internet. Reading works on the phone; the explanation needs a connection."
        }
        return (e as? LocalizedError)?.errorDescription ?? "Something went wrong: \(e.localizedDescription)"
    }

    // MARK: read aloud (on this phone)

    /// Returns false when no suitable voice exists (e.g. no Urdu voice installed).
    func speak() -> Bool {
        stopSpeaking()
        let want = lang == .en ? ["en-PK", "en-IN", "en-GB", "en"] : ["ur-PK", "ur-IN", "ur"]
        let voices = AVSpeechSynthesisVoice.speechVoices()
        var voice: AVSpeechSynthesisVoice?
        for w in want where voice == nil { voice = voices.first { $0.language.lowercased().hasPrefix(w.lowercased()) } }
        if voice == nil && lang == .roman_ur { voice = voices.first { $0.language.hasPrefix("en-IN") || $0.language.hasPrefix("hi") } }
        if voice == nil && lang == .ur { return false }
        let u = AVSpeechUtterance(string: answer)
        u.voice = voice ?? AVSpeechSynthesisVoice(language: lang == .en ? "en-GB" : "ur-PK")
        u.rate = AVSpeechUtteranceDefaultSpeechRate * 0.9
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        speech.speak(u)
        return true
    }
    func stopSpeaking() { speech.stopSpeaking(at: .immediate) }
}

struct Msg: Error { let text: String; init(_ t: String) { text = t } }
