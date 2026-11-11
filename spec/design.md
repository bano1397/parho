# Parho — Design (v2)

## 1. Stack (all free)

| Layer | Choice |
|---|---|
| App | Vite + React 18 + TypeScript + Tailwind CSS |
| Hybrid AI | `firebase` JS SDK ≥ 12.5, `firebase/ai` (Firebase AI Logic), Gemini Developer API backend |
| On-device | Gemini Nano via Firebase AI Logic on-device mode (desktop Chrome) |
| Cloud | Gemini Flash model via Firebase AI Logic. The model name lives in **one** config constant. If Google retires a model, change one line. |
| Fallback OCR | `tesseract.js` (eng), worker loaded from the app bundle so it works offline |
| Protection | Firebase App Check + reCAPTCHA v3 |
| Hosting | Firebase Hosting (Spark) |
| Offline | `vite-plugin-pwa` |
| Tests | Vitest + fast-check (property tests) + Playwright (one end-to-end smoke test) |
| CI | GitHub Actions |

> Exact SDK names (`InferenceMode`, `getGenerativeModel` options) must be checked against the Firebase docs on Day 2. Wrap them in `ai/engines.ts` so only one file changes if the API differs.

## 2. Architecture

```
            ┌──────────────── Browser (Parho) ─────────────────┐
Photo ──►   │ prepare.ts (EXIF, resize ≤1600px)                 │
            │        │                                           │
            │   Router ──► nanoEngine (ONLY_ON_DEVICE) ──┐       │
            │        └──► ocrEngine (tesseract.js) ──────┤       │
            │                                            ▼       │
            │                               Extraction (JSON)    │
            │                                            │       │
            │   Redactor + SafetyNet ──► Redacted payload │       │
            │   blur.ts (canvas preview only)            │       │
            │   CloudSeesPanel (user presses Send)       │       │
            └───────────────────────────────┬─────────────┘
                                            │ text only + App Check
                                            ▼
                         Firebase AI Logic ─► Gemini (ONLY_IN_CLOUD)
                                            │
                                   Explanation (Urdu) ─► speak.ts
```

**Why our own Router instead of one PREFER_ON_DEVICE call?**
- The badge and timeline must say truthfully where each step ran.
- Nano can't do Urdu, so the Urdu step must always be cloud.
- Privacy needs a hard rule: images go on-device only.

The Router uses **ONLY_ON_DEVICE for reading** and **ONLY_IN_CLOUD for explaining**, and records why. This custom routing is the hybrid story for judges.

## 3. Modules

```
src/
  config.ts            # CLOUD_MODEL, limits, thresholds (one place)
  firebase.ts          # initializeApp, App Check, getAI
  ai/engines.ts        # nanoEngine, cloudEngine wrappers (only file touching firebase/ai)
  ai/nanoStatus.ts     # availability + download trigger + progress
  ai/router.ts         # decides engine per step, writes Timeline entries
  ai/prompts.ts        # EXTRACT_PROMPT, REPAIR_PROMPT, EXPLAIN_PROMPT_UR / _ROMAN
  ai/schema.ts         # Extraction JSON schema + zod validator
  ocr/tesseract.ts     # OCR text + word boxes
  ocr/rules.ts         # label-based field extraction from OCR text (bills/notices/medicine)
  privacy/redact.ts    # Redactor
  privacy/safetyNet.ts # patterns + assertClean(payload)
  privacy/blur.ts      # boxes → blurred canvas
  image/prepare.ts     # decode, EXIF, resize, size checks
  speech/speak.ts      # voice pick ur-PK → ur → fallback
  state/session.ts     # in-memory only; no localStorage for documents
  ui/ CaptureScreen, StatusChip, ResultCard, SourceBadge, CloudSeesPanel,
      ExplanationCard, Timeline, NumbersPage, SettingsSheet (language, large text, contrast, auto-send)
eval/
  run_eval.ts          # reads private ./eval/private/*.jpg + ground_truth.json → results.json
  results.json         # committed numbers only
samples/               # 3 fake documents (made by Shehar Bano, fake names/CNIC 00000-0000000-0)
```

## 4. Data shapes

```ts
type DocType = 'bill' | 'notice' | 'medicine' | 'other';
type Engine = 'nano' | 'local_ocr' | 'cloud';

interface Extraction {
  doc_type: DocType;
  fields: Record<string, string | number | null>;
  private_values: { kind: 'NAME'|'CNIC'|'ADDRESS'|'ACCOUNT'|'PHONE'|'EMAIL'; value: string }[];
  confidence: Record<string, 'high' | 'low'>;
  text: string;            // full readable text (local only)
  source: 'nano' | 'local_ocr';
}

interface CloudPayload {   // the ONLY thing that goes to the cloud
  doc_type: DocType;
  fields: Record<string, string | number | null>;  // non-private only
  redacted_text: string;
  language: 'ur' | 'roman_ur';
  question?: string;
}

interface TimelineEntry { step: 'read'|'redact'|'explain'; engine: Engine; reason: string; ms: number; bytes_out?: number }
```

`assertClean(payload: CloudPayload)` throws `PrivacyBlocked(kind)` when any Safety_Net pattern matches anywhere in `JSON.stringify(payload)`, or when the string contains `data:image` or base64 longer than 200 characters.

## 5. Safety_Net patterns

| Kind | Pattern (after converting Urdu/Arabic digits to 0-9) |
|---|---|
| CNIC | `\b\d{5}[-\s]?\d{7}[-\s]?\d\b` |
| PHONE | `(\+?92|0)3\d{2}[-\s]?\d{7}\b` |
| EMAIL | `[\w.+-]+@[\w-]+\.[\w.]+` |
| LONG_NUMBER | `\b\d{10,}\b` (consumer IDs, reference numbers) |

Names and addresses come from the Extraction's `private_values`, matched with normalised spacing and case.

## 6. Prompts (v1, Shehar Bano reviews the Urdu)

**EXTRACT_PROMPT (Nano):**
> You are reading a photo of one printed document. Return ONLY JSON matching the schema. doc_type: bill, notice, medicine or other. Copy values exactly as printed; null if not visible; never guess. Put every person name, CNIC, address, account/consumer/reference number, phone and email in private_values. Mark a field confidence "low" if any character is unclear.

**EXPLAIN_PROMPT_UR (cloud):**
> آپ ایک مددگار ہیں جو کم پڑھے لکھے بزرگوں کو کاغذات سمجھاتے ہیں۔ نیچے دیے گئے ڈیٹا میں ذاتی معلومات چھپی ہوئی ہیں۔ صرف اسی ڈیٹا کی بنیاد پر، زیادہ سے زیادہ 6 آسان جملوں میں بتائیں: یہ کیا ہے، کیا کرنا ہے، کب تک، کتنی رقم، اور کوئی غیر معمولی بات۔ جو معلومات موجود نہ ہو اس کے لیے لکھیں "کاغذ پر واضح نہیں"۔ دوا کے بارے میں کوئی مشورہ نہ دیں، آخر میں لکھیں "ڈاکٹر یا فارماسسٹ سے تصدیق کریں"۔ بل میں دھوکہ دہی کا الزام نہ لگائیں۔

(Meaning: "You help elderly people with little schooling understand papers. Personal details in the data below are hidden. Using only this data, in at most 6 simple sentences, say what this is, what to do, by when, how much, and anything unusual. For missing information write 'not clear on the paper'. Don't give medicine advice; end with 'confirm with a doctor or pharmacist'. Don't accuse a bill of fraud.")

## 7. Screens

1. **Home:** big "Tasveer lein / Photo chunein" (take or choose a photo) buttons, the 3 sample cards, and the status chip.
2. **Result:** photo preview (blurred), Source_Badge, key fields as large cards, and low-confidence fields highlighted.
3. **What the cloud will see:** monospace payload, byte count, and **Send** / **Cancel**.
4. **Explanation:** Urdu text (RTL, Nastaliq), "Sunao" button, Cloud badge, and the "How Parho handled this" timeline.
5. **Numbers:** a table from `eval/results.json`, plus the test date.
6. **Settings:** language, large text, high contrast, auto-send (off by default).

UI states that must exist: Nano ready / needs download / downloading n% / unavailable, offline, busy, privacy-blocked, invalid photo.

## 8. Testing

- **Unit (Vitest):** `redact`, `safetyNet`, `rules` (OCR label parsing), `prepare` (size limits), `speak` (voice choice).
- **Property (fast-check):** random text plus injected CNIC/phone/email/long numbers in all forms, including Urdu digits. `assertClean` must always throw. Clean text must never throw.
- **Router tests:** fake engines for every path in Requirements 3, 5 and 7, and a timeline entry for each step.
- **Network test:** patch `fetch`/`XMLHttpRequest` to throw during Extraction. It must still succeed with the fake Nano or the OCR engine.
- **Payload test:** a CloudPayload never contains `data:image` or long base64.
- **E2E (Playwright):** open a sample, see the fields, open the cloud panel. Cloud mocked, Nano unavailable path.
- **CI:** GitHub Actions runs lint, typecheck and tests on every push.

## 9. Security and cost

- Firebase web config is public by design. Abuse is limited by App Check enforcement and the free-tier quota.
- No Firestore, Storage or Analytics are used, so there's nothing to leak and nothing to bill.
- `.gitignore`: `eval/private/`, `.env*`, `*.jpg`/`*.png` outside `samples/` and `public/`.
- The Spark plan cannot incur charges.
