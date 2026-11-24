// The only file that touches Vision, Foundation Models and Firebase AI Logic.
// Rule: the PHOTO is only ever processed on this phone. The cloud only gets redacted text.
import Foundation
import UIKit
import Vision
import FoundationModels
import FirebaseAILogic

enum Engines {
    static let cloudModelName = "gemini-3.5-flash-lite"

    // MARK: On-device OCR (Apple Vision)

    /// Reads the printed text of the photo on this phone. Nothing leaves the device.
    static func ocr(_ image: UIImage) async throws -> String {
        guard let cg = image.cgImage else { return "" }
        let orientation = CGImagePropertyOrientation(image.imageOrientation)
        return try await withCheckedThrowingContinuation { cont in
            let req = VNRecognizeTextRequest { req, err in
                if let err { cont.resume(throwing: err); return }
                let obs = (req.results as? [VNRecognizedTextObservation]) ?? []
                cont.resume(returning: Self.joinLines(obs))
            }
            req.recognitionLevel = .accurate
            req.usesLanguageCorrection = false // keep numbers exactly as printed
            req.recognitionLanguages = ["en-US"]
            DispatchQueue.global(qos: .userInitiated).async {
                do { try VNImageRequestHandler(cgImage: cg, orientation: orientation).perform([req]) }
                catch { cont.resume(throwing: error) }
            }
        }
    }

    /// Groups recognised boxes into lines top-to-bottom, left-to-right, so "Label: value" pairs stay together.
    static func joinLines(_ obs: [VNRecognizedTextObservation]) -> String {
        let items = obs.compactMap { o -> (CGRect, String)? in o.topCandidates(1).first.map { (o.boundingBox, $0.string) } }
            .sorted { $0.0.midY > $1.0.midY }
        var lines: [[(CGRect, String)]] = []
        for it in items {
            if let last = lines.last?.first, abs(last.0.midY - it.0.midY) < max(last.0.height, it.0.height) * 0.5 {
                lines[lines.count - 1].append(it)
            } else { lines.append([it]) }
        }
        return lines.map { $0.sorted { $0.0.minX < $1.0.minX }.map(\.1).joined(separator: " ") }.joined(separator: "\n")
    }

    // MARK: On-device model (Apple Foundation Models)

    static var deviceModel: SystemLanguageModel { SystemLanguageModel(guardrails: .permissiveContentTransformations) }

    static var onDeviceStatus: (ready: Bool, text: String) {
        switch deviceModel.availability {
        case .available: return (true, "On-device AI ready")
        case .unavailable(let r):
            switch r {
            case .deviceNotEligible: return (false, "On-device AI not supported on this phone")
            case .appleIntelligenceNotEnabled: return (false, "Turn on Apple Intelligence for on-device AI")
            case .modelNotReady: return (false, "On-device AI is downloading")
            @unknown default: return (false, "On-device AI unavailable")
            }
        }
    }

    /// Structures the (still private) OCR text into fields ON THIS PHONE. Throws if the model can't run or answers badly.
    static func structureOnDevice(_ text: String) async throws -> String {
        let session = LanguageModelSession(model: deviceModel)
        let r = try await session.respond(to: Prompts.extractFromText + text, options: GenerationOptions(temperature: 0, maximumResponseTokens: 900))
        return r.content
    }

    // MARK: Cloud (Firebase AI Logic → Gemini), text only

    private static let ai = FirebaseAI.firebaseAI(backend: .googleAI(), useLimitedUseAppCheckTokens: true)
    private static let textModel = ai.generativeModel(modelName: cloudModelName, generationConfig: GenerationConfig(temperature: 0.3, maxOutputTokens: 600))
    private static let jsonModel = ai.generativeModel(modelName: cloudModelName, generationConfig: GenerationConfig(responseMIMEType: "application/json"))

    /// Text-only cloud call. Retries briefly when Gemini is overloaded (500/502/503/"high demand").
    static func cloud(_ prompt: String, json: Bool = false) async throws -> String {
        let model = json ? jsonModel : textModel
        var attempt = 0
        while true {
            do {
                let r = try await withTimeout(seconds: 30) { try await model.generateContent(prompt) }
                return r.text ?? ""
            } catch {
                let msg = String(describing: error)
                let busy = msg.range(of: "\\b(500|502|503)\\b|high demand|overload|unavailable", options: [.regularExpression, .caseInsensitive]) != nil
                if !busy || attempt >= 2 { throw error }
                try await Task.sleep(for: .milliseconds(1500 * (1 << attempt)))
                attempt += 1
            }
        }
    }

    struct Timeout: LocalizedError { var errorDescription: String? { "The cloud took too long. Check the internet and try again." } }

    static func withTimeout<T: Sendable>(seconds: Double, _ op: @escaping @Sendable () async throws -> T) async throws -> T {
        try await withThrowingTaskGroup(of: T.self) { g in
            g.addTask { try await op() }
            g.addTask { try await Task.sleep(for: .seconds(seconds)); throw Timeout() }
            let r = try await g.next()!
            g.cancelAll()
            return r
        }
    }
}

extension CGImagePropertyOrientation {
    init(_ o: UIImage.Orientation) {
        switch o {
        case .up: self = .up
        case .down: self = .down
        case .left: self = .left
        case .right: self = .right
        case .upMirrored: self = .upMirrored
        case .downMirrored: self = .downMirrored
        case .leftMirrored: self = .leftMirrored
        case .rightMirrored: self = .rightMirrored
        @unknown default: self = .up
        }
    }
}
