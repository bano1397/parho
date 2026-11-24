import SwiftUI
import PhotosUI
import UIKit

extension Color {
    static let parhoGreen = Color(red: 0x0B / 255, green: 0x6E / 255, blue: 0x4F / 255)
    static let parhoYellow = Color(red: 1, green: 0xC0 / 255, blue: 0x48 / 255)
}

struct T {
    let take, choose, send, sendExplain, listen, noVoice: String
    static func of(_ l: Lang) -> T {
        switch l {
        case .ur: T(take: "تصویر لیں", choose: "تصویر چنیں", send: "کلاؤڈ کو بھیجیں", sendExplain: "بھیجیں اور سمجھائیں", listen: "سنائیں", noVoice: "اس فون میں اردو آواز موجود نہیں۔ رومن اردو یا انگریزی آزمائیں۔\nNo Urdu voice on this phone.")
        case .roman_ur: T(take: "Tasveer lein", choose: "Tasveer chunein", send: "Cloud ko bhejein", sendExplain: "Bhejein aur samjhayein", listen: "Sunayein", noVoice: "No voice found on this phone. Try English.")
        case .en: T(take: "Take a photo", choose: "Choose a photo", send: "Send to cloud", sendExplain: "Send & explain", listen: "Read aloud", noVoice: "No voice found on this phone.")
        }
    }
}

struct Sample: Identifiable { let id: String; let label: String; let ur: String }
let samples = [
    Sample(id: "sample_bill", label: "Electricity bill", ur: "بجلی کا بل"),
    Sample(id: "sample_notice", label: "Gas notice", ur: "گیس کا نوٹس"),
    Sample(id: "sample_medicine", label: "Medicine box", ur: "دوا کا ڈبہ"),
]

struct RootView: View {
    @State private var p = Pipeline()
    @State private var pick: PhotosPickerItem?
    @State private var showCamera = false
    @State private var voiceError = false
    @AppStorage("largeText") private var large = false
    @AppStorage("contrast") private var contrast = false
    @Environment(\.colorScheme) private var scheme

    private var t: T { T.of(p.lang) }
    private var busy: Bool { p.phase == .reading || p.phase == .explaining }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    header
                    paperCard
                    if p.phase == .reading { progressCard }
                    if let e = p.error { errorCard(e) }
                    if p.phase == .confirm { confirmCard.id("confirm") }
                    if let ex = p.extraction { fieldsCard(ex).id("fields") }
                    if p.payload != nil { cloudCard.id("cloud") }
                    if !p.answer.isEmpty { answerCard.id("answer") }
                    if !p.timeline.isEmpty { timelineCard }
                    settingsCard
                    Text("Hybrid AI with Firebase AI Logic: Apple's on-device model and Vision on this phone, Gemini in the cloud for the explanation. Photos are never uploaded or stored. Samples contain fake data. Not advice.")
                        .font(.footnote).foregroundStyle(.secondary).padding(.bottom, 30)
                }
                .padding(16)
            }
            .onChange(of: p.phase) { _, ph in
                withAnimation { if ph == .confirm { proxy.scrollTo("confirm", anchor: .top) } else if ph == .ready && p.answer.isEmpty { proxy.scrollTo("fields", anchor: .top) } }
            }
            .onChange(of: p.answer) { _, a in if !a.isEmpty { withAnimation { proxy.scrollTo("answer", anchor: .top) } } }
        }
        .background(contrast ? (scheme == .dark ? Color.black : Color.white) : Color(.systemGroupedBackground))
        // Respect the phone's text size (up to the accessibility sizes); "Large text" sets a bigger minimum.
        .dynamicTypeSize(large ? DynamicTypeSize.xxxLarge...DynamicTypeSize.accessibility5 : DynamicTypeSize.xSmall...DynamicTypeSize.accessibility5)
        .tint(.parhoGreen)
        .onChange(of: pick) { _, item in
            guard let item else { return }
            Task {
                if let d = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: d) { p.read(img) }
                pick = nil
            }
        }
        .sheet(isPresented: $showCamera) { CameraPicker { img in p.read(img) }.ignoresSafeArea() }
        .alert(t.noVoice, isPresented: $voiceError) { Button("OK", role: .cancel) {} }
        .onAppear { p.refreshStatus() }
    }

    // MARK: sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text("Parho").font(.largeTitle.bold())
                Text("پڑھو").font(.title).foregroundStyle(Color.parhoGreen)
            }
            Text("Photograph a bill, notice or medicine box. Parho reads it **on this phone** and explains it in simple \(p.lang == .en ? "English" : p.lang == .roman_ur ? "Roman Urdu" : "Urdu").")
                .foregroundStyle(.secondary)
            HStack(spacing: 8) {
                // Roman Urdu shows as اردو here (the globe menu picks Roman Urdu), so the switch never shows nothing selected.
                Picker("Language", selection: Binding(get: { p.lang == .en ? Lang.en : Lang.ur }, set: { p.lang = $0 })) {
                    Text("English").tag(Lang.en)
                    Text("اردو").tag(Lang.ur)
                }
                .pickerStyle(.segmented).frame(width: 170)
                .accessibilityIdentifier("langSwitch")
                Menu {
                    Button("اردو (Urdu)") { p.lang = .ur }
                    Button("Roman Urdu") { p.lang = .roman_ur }
                    Button("English") { p.lang = .en }
                } label: { Image(systemName: "globe").padding(6) }
                .accessibilityLabel("More languages")
                Spacer(minLength: 0)
            }
            Label(p.onDeviceText, systemImage: p.onDeviceReady ? "lock.fill" : "exclamationmark.triangle")
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Capsule().strokeBorder(p.onDeviceReady ? Color.parhoGreen : .orange))
                .foregroundStyle(p.onDeviceReady ? Color.parhoGreen : .orange)
                .accessibilityIdentifier("statusChip")
        }
    }

    private var paperCard: some View {
        Card(title: "1. Your paper") {
            HStack(spacing: 10) {
                Button { showCamera = true } label: { Label(t.take, systemImage: "camera").frame(maxWidth: .infinity) }
                    .buttonStyle(.borderedProminent).controlSize(.large)
                    .disabled(busy || !UIImagePickerController.isSourceTypeAvailable(.camera))
                PhotosPicker(selection: $pick, matching: .images) { Label(t.choose, systemImage: "photo").frame(maxWidth: .infinity) }
                    .buttonStyle(.bordered).controlSize(.large).disabled(busy)
            }
            Text("Or try a sample (fake data):").font(.subheadline).foregroundStyle(.secondary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(samples) { s in
                        Button {
                            if let img = UIImage(named: s.id) { p.read(img) }
                        } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                if let img = UIImage(named: s.id) {
                                    Image(uiImage: img).resizable().scaledToFill().frame(width: 140, height: 90, alignment: .top).clipped().cornerRadius(8)
                                }
                                Text(s.label).font(.subheadline.weight(.semibold))
                                Text(s.ur).font(.subheadline)
                            }
                            .padding(8).background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemGroupedBackground)))
                        }
                        .buttonStyle(.plain).disabled(busy)
                        .accessibilityIdentifier(s.id)
                    }
                }
            }
        }
    }

    private var progressCard: some View {
        Card(title: "Reading on this phone…") {
            HStack { ProgressView(); Text(p.progress).foregroundStyle(.secondary) }
        }
    }

    private func errorCard(_ e: String) -> some View {
        Card(title: "Heads up", tint: .red) { Text(e) }.accessibilityIdentifier("errorCard")
    }

    private var confirmCard: some View {
        Card(title: "On-device AI isn't available — send redacted text?") {
            Text("We read the text on this phone. Private details are replaced. Only this text would go to Gemini in the cloud — never the photo:").font(.subheadline)
            Text(p.pendingRedacted).font(.system(.footnote, design: .monospaced)).padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color(.tertiarySystemFill)))
                .accessibilityIdentifier("redactedText")
            HStack {
                Button(t.send) { p.confirmSend(true) }.buttonStyle(.borderedProminent).accessibilityIdentifier("confirmSend")
                Button("Cancel") { p.confirmSend(false) }.buttonStyle(.bordered)
            }
        }
    }

    private func fieldsCard(_ ex: Extraction) -> some View {
        Card(title: "2. What it says — \(Doc.safeTitle(ex))") {
            Label(ex.source == .onDevice ? "Read on this phone" : "Organised in cloud from redacted text",
                  systemImage: ex.source == .onDevice ? "lock.fill" : "cloud")
                .font(.caption.weight(.semibold)).foregroundStyle(ex.source == .onDevice ? Color.parhoGreen : .blue)
            ForEach(Array(ex.fields.enumerated()), id: \.offset) { _, f in
                HStack(alignment: .top) {
                    Text(f.label).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
                    Text(f.value + (f.confidence == "low" ? " ⚠︎" : "")).fontWeight(.semibold).frame(maxWidth: .infinity, alignment: .trailing)
                }
                Divider()
            }
            if !ex.privateValues.isEmpty {
                Text("\(ex.privateValues.count) private detail(s) found and kept on this phone.").font(.footnote).foregroundStyle(.secondary)
            }
        }
    }

    private var cloudCard: some View {
        Card(title: "3. What the cloud will see") {
            if let pl = p.payload {
                Text("\(pl.json.utf8.count) bytes · text only · no photo").font(.footnote).foregroundStyle(.secondary)
                ScrollView {
                    Text(pl.json).font(.system(.caption2, design: .monospaced)).textSelection(.enabled).padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(height: 220)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color(.tertiarySystemFill)))
                .accessibilityIdentifier("payload")
                Button { p.explain() } label: {
                    HStack { if p.phase == .explaining { ProgressView().tint(.white) } else { Image(systemName: "cloud") }; Text(t.sendExplain) }
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent).controlSize(.large).disabled(busy)
                .accessibilityIdentifier("explain")
            }
        }
    }

    private var answerCard: some View {
        Card(title: "4. In simple words") {
            Label("Cloud Gemini", systemImage: "cloud").font(.caption.weight(.semibold)).foregroundStyle(.blue)
            Text(p.answer)
                .font(p.lang == .ur ? .title3 : .body)
                // .leading is the right edge inside the right-to-left environment below (.trailing would flip to the left).
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .environment(\.layoutDirection, p.lang == .ur ? .rightToLeft : .leftToRight)
                .lineSpacing(p.lang == .ur ? 8 : 2)
                .textSelection(.enabled)
                .accessibilityIdentifier("answer")
            HStack {
                Button { if !p.speak() { voiceError = true } } label: { Label(t.listen, systemImage: "speaker.wave.2") }.buttonStyle(.bordered)
                Button("Stop") { p.stopSpeaking() }.buttonStyle(.bordered)
            }
            Text("Parho explains what is printed. It is not medical, legal or financial advice.").font(.footnote).foregroundStyle(.secondary)
        }
    }

    private var timelineCard: some View {
        Card(title: "How Parho handled this") {
            ForEach(p.timeline) { e in
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(e.step) · \(e.onDevice ? "🔒" : "☁️") \(e.engine) · \(String(format: "%.1f", Double(e.ms) / 1000)) s\(e.bytesOut.map { " · \($0) bytes sent" } ?? "")")
                        .font(.subheadline.weight(.semibold))
                    Text(e.reason).font(.footnote).foregroundStyle(.secondary)
                }
            }
        }
        .accessibilityIdentifier("timeline")
    }

    private var settingsCard: some View {
        Card(title: "Settings") {
            Toggle(isOn: $large) { Text("Large text  ") + Text("بڑا متن") }
            Toggle(isOn: $contrast) { Text("High contrast  ") + Text("زیادہ واضح رنگ") }
        }
    }
}

struct Card<Content: View>: View {
    let title: String
    var tint: Color = .primary
    @ViewBuilder let content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.headline).foregroundStyle(tint)
            content
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemGroupedBackground)))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(tint == .red ? Color.red : Color.clear))
    }
}

/// Camera via UIKit (the Mac's webcam is not used by the iOS Simulator; on a real iPhone this opens the camera).
struct CameraPicker: UIViewControllerRepresentable {
    let onImage: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let c = UIImagePickerController()
        c.sourceType = .camera
        c.delegate = context.coordinator
        return c
    }
    func updateUIViewController(_ vc: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coord { Coord(self) }
    final class Coord: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ p: CameraPicker) { parent = p }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let img = info[.originalImage] as? UIImage { parent.onImage(img) }
            parent.dismiss()
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}
