# Parho — complete plan (requirements, build steps, zero cost)

> **Strong version (v2):** formal spec in [`spec/requirements.md`](spec/requirements.md) (11 requirements, EARS), [`spec/design.md`](spec/design.md) and [`spec/tasks.md`](spec/tasks.md) (day-by-day with done-checks). This file is the overview; the spec wins if they differ.

**One line:** Parho reads English paperwork (bills, school notices, medicine boxes) for people who can't, hides private details **on the laptop**, and explains it in **simple Urdu, read aloud**.

**Hackathon:** #BuildHybridAI 2026 (Devpost, Firebase AI Logic hybrid inference).
- Deadline **30 Nov 2026, 2:00 PM PT = 1 Dec, 03:00 PKT**. Aim to submit **29 Nov**.
- Builder: Shehar Bano, solo.
- Separate repo from Ghost Khata: **no shared code**.

> ⚠️ Re-check the official rules as soon as they are posted.
> - Pakistan eligibility, judging criteria, video length and the required tech.
> - Change this plan if anything conflicts.

---

## 1. Who it is for (the story judges must feel)

- **Ammi / Abbu at home:** an electricity or gas bill arrives in English. They can't tell how much to pay, by when, or whether it's too high. Today they wait for a child to read it.
- **Low-vision or low-literacy adults:** they need large text and the explanation spoken aloud.
- **Literacy NGO / union-council help desk:** one laptop that explains documents for visitors without uploading their CNIC to the internet.

**Why hybrid:**
- **On-device (private, offline, free):** reading the photo and finding private details. The raw photo **never leaves the laptop**.
- **Cloud (smarter, multilingual):** Urdu explanation, since Nano doesn't support Urdu, plus deeper checks.
  - Only **redacted text** is sent.

---

## 2. Zero-cost stack (everything free)

| Need | Tool | Cost |
|---|---|---|
| Frontend | React + Vite + TypeScript + Tailwind | Free |
| Hybrid AI | **Firebase AI Logic** web SDK (`firebase` ≥ 12.5), mode `PREFER_ON_DEVICE` | Free |
| On-device model | Gemini Nano in **desktop Chrome** (Prompt API, multimodal) | Free |
| Cloud model | Gemini via **Gemini Developer API** through Firebase AI Logic | Free tier on Firebase **Spark** plan (no card) |
| Abuse protection | Firebase **App Check** with reCAPTCHA v3 | Free |
| Hosting (judges' live link) | **Firebase Hosting** (Spark) | Free |
| OCR fallback (no Nano) | **Tesseract.js** (runs in browser) | Free |
| Blurring | HTML Canvas (in browser) | Free |
| Read-aloud | Browser **Web Speech API** `speechSynthesis` | Free |
| Offline app shell | Vite PWA plugin (service worker) | Free |
| Code + licence | GitHub (**bano1397**), MIT licence | Free |
| Video | QuickTime screen recording + iMovie/CapCut | Free |

**Never pay for anything.**
- Stay on the Spark plan and never add a card.
- If Gemini free-tier limits are hit, the app shows a "busy, try again" message. It never retries in a loop.

---

## 3. Requirements (what the app must do)

### R1 — Capture
1. Upload a photo (JPEG/PNG) or take one with the laptop webcam.
2. Auto-shrink large photos in the browser, to stay under Nano's input limit.
3. Include 3 built-in sample documents (fake data) so judges can try it instantly.

### R2 — On-device reading (Gemini Nano)
1. Use Firebase AI Logic with `PREFER_ON_DEVICE`.
2. Nano reads the photo and returns **structured JSON**:
   - document type (bill / school notice / medicine / other);
   - key fields:
     - bill: amount, due date, units, company;
     - notice: date, what to do;
     - medicine: name, dose, warnings as printed.
3. Nano also returns the **private fields**: name, CNIC, address, account or reference number, phone.
4. A badge on every result shows **"On this laptop 🔒"** or **"Cloud ☁️"**.

### R3 — Private details stay private
1. Before anything goes to the cloud, the app **redacts** the private values in the text, replacing them with "[NAME]", "[CNIC]" and so on.
2. The app **blurs** the private areas on the photo preview, using Tesseract.js word boxes matched to the private values.
3. A **"What the cloud sees"** panel shows the exact text that will be sent. The raw image is **never** sent.
4. A regex safety net catches CNIC numbers (`\d{5}-?\d{7}-?\d`) and phone numbers (`03\d{2}-?\d{7}`) even if Nano misses them. If one is still found, the cloud call is blocked.

### R4 — Cloud explanation in Urdu
1. Send only the redacted text and fields to cloud Gemini.
2. Ask it for a short, simple explanation **in Urdu script**, or Roman Urdu if the user picks it:
   - "What is this?"
   - "What must I do?"
   - "By when?"
   - "How much?"
   - "Anything unusual?"
3. **Bills:** compare with last month if the bill shows it. Flag "much higher than usual" as a question to check, not an accusation.
4. **Medicine:** only explain what is printed. Never give medical advice. Always add: "Doctor ya pharmacist se tasdeeq karein" (confirm with a doctor or pharmacist).

### R5 — Read aloud and accessibility
1. **"Sunao" (listen) button:** reads the Urdu explanation using `speechSynthesis` with an Urdu voice (`ur-PK`).
   - If no Urdu voice exists, fall back to Roman Urdu with an English voice and show a note.
2. Large-text mode, high-contrast mode, full keyboard use, and big buttons with icons.
3. Right-to-left layout for Urdu, using the Noto Nastaliq Urdu font (Google Fonts, free).

### R6 — Offline and fallback
1. **Wifi off:** on-device reading and blurring still work. The Urdu step shows "Internet aate hi samjha denge" (we'll explain as soon as the internet is back), and the request is queued until online.
2. **No Nano on the judge's machine:** Tesseract.js extracts the text in the browser, and redaction still happens **locally**. Then only redacted text goes to the cloud. The privacy promise holds on every machine.
3. **Status chip:** "Nano ready / downloading / not available". The model download starts only after a user click, as Chrome requires.

### R7 — Proof and honesty
1. The **Numbers** page shows real measured results from your test set:
   - field accuracy;
   - private details caught;
   - average time on-device vs cloud;
   - bytes sent to the cloud vs photo size.
2. No fake testimonials. The README states what is AI and what is not.

### Out of scope (don't build)
Accounts and login, saving documents to a server, phone apps, payments, and sending messages.

---

## 4. How it works (architecture)

```
Photo ─► [Browser]
          ├─ resize (canvas)
          ├─ Nano available? ──yes─► Gemini Nano: read fields + private values (JSON)
          │                  └─no──► Tesseract.js OCR → text (local)
          ├─ Redactor: replace private values + regex safety net → redacted text
          ├─ Blur private boxes on preview (Tesseract word boxes)
          └─ "What the cloud sees" panel
                     │ (redacted text only, App Check token)
                     ▼
          [Firebase AI Logic → Gemini cloud] → Urdu explanation
                     ▼
          [Browser] show + speechSynthesis read-aloud
```

**Folder layout:**
```
parho/
  src/
    ai/hybrid.ts        # Firebase AI Logic setup, PREFER_ON_DEVICE, availability check
    ai/prompts.ts       # extraction prompt + JSON schema, Urdu explanation prompt
    privacy/redact.ts   # redaction + regex safety net (unit-tested)
    privacy/blur.ts     # Tesseract boxes → canvas blur
    ocr/tesseract.ts    # fallback OCR
    speech/speak.ts     # speechSynthesis Urdu voice pick
    ui/...              # Capture, Result, CloudSeesPanel, Badge, Numbers, Settings
  samples/              # 3 fake sample documents (no real CNIC!)
  tests/                # Vitest unit tests (redact, regex, router)
  eval/                 # test-set results script + results.json (real photos NOT committed)
  README.md  LICENSE  .env.example
```

---

## 5. Step by step (what to do, in order)

### Step 0 — Today and tomorrow (setup, about 1 hour, no cost)
1. **Chrome:** update desktop Chrome to the latest version.
2. **Nano:** check whether this Mac can run it. It needs macOS 13+ and about 22 GB free disk.
   - Open `chrome://on-device-internals`. If it isn't available, turn on `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`.
3. **Firebase project:** go to https://console.firebase.google.com, add a project named `parho`, and stay on the **Spark (free)** plan.
   - Build → **AI Logic** → Get started → choose **Gemini Developer API** (free).
   - Add a **Web app** to get the config. The web config is public by design and safe in code.
   - **App Check** → register with reCAPTCHA v3 (free). Enforce it for AI Logic after testing.
4. **GitHub:** create a public repo **`bano1397/parho`** while logged in as bano1397, not with the Mac's gh CLI.
5. **Test set:** collect **10 real bills and notices plus 2 medicine boxes**.
   - Keep them in a private folder. **Never commit them.**
   - Write the true values in `eval/ground_truth.json`.
6. Watch the **live build session, Thu 12 Nov, 11 PM PKT**.

### Step 1 — Day 1: go/no-go test (most important day)
1. Write a tiny test page that sends each test photo to Nano (`ONLY_ON_DEVICE`) with the extraction prompt.
2. Measure:
   - % of key fields correct;
   - % of private values found;
   - time per photo.
3. Decide:
   - **80% or higher on key fields → GO** with Parho.
   - **Below 80% →** try Tesseract text with Nano reading that text. If it's still below 80%, **switch to the backup idea** (scam-SMS checker, text-only).

### Step 2 — Day 2: on-device core
Scaffold Vite + React + TS + Tailwind, hook up Firebase AI Logic `PREFER_ON_DEVICE`, the availability chip, the extraction prompt with its JSON schema, and the badge.

### Step 3 — Day 3: privacy
`redact.ts` plus the regex safety net, with **unit tests first**. Then Tesseract fallback, canvas blur, and the "What the cloud sees" panel.

### Step 4 — Day 4: cloud Urdu and voice
Urdu explanation prompt, Roman Urdu option, medicine safety line, read-aloud, large text, high contrast, RTL, App Check on.

### Step 5 — Day 5: offline, proof, polish
- PWA offline shell and the queued Urdu step.
- Run `eval/` on the test set and fill in the **Numbers** page.
- Sample documents.
- Deploy with `firebase deploy` (free Hosting).
- Test the live link in another Chrome profile **without Nano** to confirm the fallback works.

### Step 6 — Day 6: video and submission
Record the video (section 7), write the README, and fill in the Devpost form. **Submit by 29 Nov.**

**When:** the main Ghost Khata build should be done around 20 Nov. Run Parho days 1–6 over about **20–29 Nov**. Day 1, the test, can happen earlier.

---

## 6. Prompts (starting point)

**On-device extraction (Nano, English):**
> You read a photo of a printed document. Return JSON only with: doc_type (bill|notice|medicine|other), fields {amount, due_date, units, company, issue_date, action_needed, medicine_name, dose_as_printed}, private {name, cnic, address, account_no, phone}. Copy values exactly as printed. Use null if not visible. Do not guess.

**Cloud explanation (Gemini, Urdu):**
> نیچے ایک دستاویز کا متن ہے جس میں ذاتی معلومات چھپا دی گئی ہیں۔ آسان اردو میں 5 مختصر جملوں میں بتائیں: یہ کیا ہے، کیا کرنا ہے، کب تک، کتنی رقم، اور کوئی غیر معمولی بات۔ اندازہ نہ لگائیں۔ دوا کے بارے میں مشورہ نہ دیں۔

(English meaning: "Below is a document's text with personal details hidden. In simple Urdu, in 5 short sentences, say what it is, what to do, by when, how much, and anything unusual. Don't guess. Don't give medicine advice.")

Shehar Bano reviews all Urdu wording, as a native speaker.

---

## 7. Demo video (about 2:30, recorded on the Mac with Nano)

1. **0:00–0:20 Story:** "My mother gets this bill every month and has to wait for someone to read it."
2. **0:20–1:00 Main flow:** photo → **"On this laptop 🔒"** badge → private details blur → **"What the cloud sees"** shows "[NAME] [CNIC]" → Urdu explanation spoken aloud.
3. **1:00–1:30 Wifi OFF on camera:** a second document is still read and blurred on-device, and the Urdu step waits. Turn wifi on and it explains.
4. **1:30–1:50 Fallback:** a Chrome profile without Nano switches to the cloud with a Tesseract badge, and redaction still happens locally.
5. **1:50–2:15 Numbers page:** real accuracy, privacy catches, speed, and bytes sent.
6. **2:15–2:30 Close:** who it helps, free to use, open source.

---

## 8. Submission checklist

- [ ] Public GitHub repo `bano1397/parho` with MIT licence, README (what, why hybrid, how to run, numbers, AI disclosure)
- [ ] Live link on Firebase Hosting, plus the 3 sample documents for judges
- [ ] Video uploaded to YouTube (unlisted or public) and linked on Devpost
- [ ] Devpost form: built with Firebase AI Logic, Gemini Nano, Gemini, React, Tesseract.js
- [ ] No real CNIC or personal data anywhere in the repo, video or screenshots
- [ ] No API keys or secrets committed; App Check enforced
- [ ] Submitted from **banozahid1397** before 1 Dec 03:00 PKT (target 29 Nov)

## 9. Risks and answers

| Risk | Answer |
|---|---|
| Nano reads Pakistani bills poorly | Day-1 test, Tesseract-assisted mode, backup idea |
| Judges have no Nano | Cloud fallback with local redaction, live link, video shows the Nano path |
| No Urdu voice in the browser | Roman Urdu read with an English voice, plus on-screen Urdu text |
| Gemini free-tier limit | Friendly "busy" message, no retry loops, samples cached for judges |
| Real personal data leaks | Fake samples only; test photos kept out of git; regex safety net blocks CNIC and phone numbers |
