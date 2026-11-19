# Parho demo video: recording guide (one sitting, Mac)

Target length ~2:53 (hard max 3:00). Public YouTube, English narration, upload `spec/video-subtitles.srt` as English captions.
Judges may only see the video, so every claim must be visible on screen.

## A. Setup (do once, ~20 min, before recording)

1. **Chrome 139+ desktop** (`chrome://version`). Use a clean profile with no bookmarks bar (View → Always Show Bookmarks Bar off).
2. Open `chrome://flags` and set:
   - `#optimization-guide-on-device-model` → **Enabled BypassPerfRequirement**
   - `#prompt-api-for-gemini-nano` → **Enabled**
   - `#prompt-api-for-gemini-nano-multimodal-input` → **Enabled** (image input)
   Click **Relaunch**.
3. Open `chrome://on-device-internals` → **Model Status** tab. Wait until the model shows as ready/installed (a few GB, can take 10–30 min). If it says "not downloaded", open https://firstapp-13a9a.web.app and press **Download Gemini Nano** in the app.
4. Open https://firstapp-13a9a.web.app. The top-right chips must read **🔒 On-device AI ready** and **☁️ Online**. Do a full dry run once (sample + real bill) so the OCR/model are warm.
5. Second browser for the fallback scene (Safari, or Chrome with a different profile and flags off). Open the app there too: it should show "Gemini Nano isn't available in this browser".
6. Urdu voice: System Settings → Accessibility → Spoken Content → System voice → Manage Voices → add an Urdu voice. Test 🔊 once. If none exists, use **Roman Urdu** for the read-aloud shot.
7. Mac: turn on Do Not Disturb, hide the Dock (⌥⌘D), close other tabs, set display to 1920×1080 or "Larger text" scaling. Browser zoom 125% (⌘+) so text is readable on YouTube.
8. Recorder: **⌘⇧5** → Record Selected Portion (just the Chrome window) or QuickTime. Options → Microphone → your mic. Phone camera for the paper shots.

### Preparing the real bill (privacy)
- Use a **photocopy** of a FESCO bill. Cover name, address, CNIC, reference/consumer number, meter number and barcode/QR with **sticky notes or strips of paper** before photographing. Leave amount, due date, units and month history visible.
- Photograph it flat, daylight, no glare. AirDrop to the Mac (Desktop folder).
- The app blurs its own preview, but still check the photo full-screen before recording. Never show the uncovered original.
- Note: covered fields mean Nano will find fewer private details on this photo. Use the **Gas notice sample** for the redaction close-up (its private details are fake and visible).

## B. Shot list

Record each shot as its own clip. Cut between them (iMovie/CapCut). Times are the final edit.

| # | Final time | What to record (exact actions) | Cut / edit note |
|---|---|---|---|
| 1 | 0:00–0:14 | Phone camera: hand places the covered FESCO bill and a medicine box on a table. | Slow push-in. |
| 2 | 0:14–0:24 | Chrome, app home. Hover over the two chips **🔒 On-device AI ready** and **☁️ Online**. | Zoom-in (edit) on chips. |
| 3 | 0:24–0:40 | Quick cut: `chrome://on-device-internals` Model Status showing the model installed. Back to app tab. | Max 4 s on the internals page. |
| 4 | 0:40–1:05 | **Wi-Fi off proof.** Click the Wi-Fi icon in the menu bar → toggle **off** *on camera*. App chip changes to **📴 Offline**. Click **🖼️ Choose a photo** → pick the covered bill. "Reading on this device…" appears; card **2. What it says** fills with fields and **🔒 Read on this device**. | Keep the menu-bar clock visible: it is your timer. Speed up the wait 2× in edit if >12 s, and add an on-screen "real time: 14 s" label. Do not hide the wait completely. |
| 5 | 1:05–1:15 | Still offline: scroll to **3. What the cloud will see**. The button is disabled and the text says "Offline — connect to the internet to get the explanation." | Shows nothing leaves without network. |
| 6 | 1:15–1:45 | Wi-Fi **on** (chip back to ☁️ Online). Scroll up, click sample **Gas notice**. When card 2 fills, scroll to card 3. Zoom (edit) on `[NAME]`, `[CNIC]` in the payload and the line "**N bytes · text only · no photo**". | Freeze-frame 2 s on the byte count. |
| 7 | 1:45–2:10 | Language = **اردو (Urdu)**. Click **☁️ … & explain**. "Asking Gemini in the cloud…" → card **4. In simple words** with **☁️ Cloud Gemini** chip. Click **🔊 سنائیں** and let 3–4 s of audio play. | Lower narration volume under the Urdu voice. |
| 8 | 2:10–2:22 | Scroll to **How Parho handled this**: each step with 🔒/☁️ engine, seconds, and "bytes sent". | Slow scroll. |
| 9 | 2:22–2:34 | Fallback browser: click sample **Medicine box**. OCR progress → card "Gemini Nano isn't available — send redacted text?" with the preview. Hover over **Send to cloud** / **Cancel** (Cancel is fine). | Speed up OCR progress. |
| 10 | 2:34–2:53 | Title card (Keynote/Canva): results text below, then repo URL and "Apache 2.0". End on the app with **Large text** ticked. | Static card, 6–8 s. |

Results card text (honest, from the measured eval):
"Real tests: 6 FESCO bills + 2 medicine boxes · 86–95% of key facts correct · 0 private-detail leaks · on-device reading 10–17 s · cloud gets ~0.7 KB redacted text, not a ~600 KB photo · 77 unit + 5 end-to-end tests."

## C. Narration (≈330 words, ~2:45 at a calm pace)

Record narration separately in a quiet room (QuickTime → New Audio Recording), one shot at a time. Text matches the .srt.

1. "In Pakistan, millions of people get bills and medicine boxes they can't easily read. To get help, they show the paper to someone else. That means sharing their name, address and CNIC."
2. "Parho reads the paper on your own device. It hides your private details. Then it explains the paper in simple Urdu."
3. "The reader is Gemini Nano, running inside Chrome, through Firebase AI Logic's on-device mode."
4. "Watch. I turn the Wi-Fi off. Now I choose a real electricity bill, with private parts covered. Parho still reads it. The amount, the due date, the units. All on this laptop, in about fifteen seconds."
5. "With no internet, nothing can be sent. The cloud button simply waits."
6. "Back online, with a sample notice. Before anything leaves, you see exactly what the cloud will get. Text only, no photo. Names and CNIC numbers are replaced. And a safety check in code blocks the request if a CNIC or phone number slips through."
7. "Gemini Nano can't write Urdu yet. So only this step uses Gemini in the cloud. The answer is short and simple. And it can be read aloud."
8. "Parho shows how it handled every step. Which model ran, where, how long it took, and how many bytes left the device."
9. "No Gemini Nano? Parho reads with on-device OCR instead. Then it asks before sending any redacted text."
10. "We tested Parho on six real FESCO bills and two medicine boxes. It got eighty-six to ninety-five percent of key facts right, with zero private details leaked. The cloud gets under one kilobyte of text, instead of a six-hundred-kilobyte photo. Parho is open source. Read any paper, privately."

## D. Editing and upload checklist
- Total ≤ 2:55 (subtitles end at 2:53). Add the .srt in YouTube Studio → Subtitles → English → Upload file (with timing); re-time if your cuts shift.
- Visibility **Public**. Title: "Parho – private on-device bill & medicine reader (Gemini Nano + Firebase AI Logic)".
- Watch the final export once at full screen, pausing on every frame with paper, to confirm no real private data is visible.
- Do not claim numbers not on the results card.
