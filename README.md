# Parho (پڑھو)

**Photograph a bill, notice or medicine box. Parho reads it on your device with Gemini Nano, removes your private details, and explains it in simple Urdu.**

Millions of people in Pakistan receive electricity bills, disconnection notices and medicine leaflets they can't easily read. The usual fix is to ask someone else, which means showing them your CNIC, address and account number. Parho keeps the paper private and still gives a clear answer in Urdu, read aloud.

## Why hybrid AI

| Step | Where it runs | Why |
|---|---|---|
| Read the photo | **On-device**: Gemini Nano via Firebase AI Logic (`InferenceMode.ONLY_ON_DEVICE`) | The photo holds a CNIC, name and address, so it never leaves the device |
| Remove private details | **On-device**: Redactor + Safety Net (plain code) | Names, CNIC, phone, email, address and account numbers are replaced with labels |
| Explain in Urdu | **Cloud**: Gemini via Firebase AI Logic (`InferenceMode.ONLY_IN_CLOUD`) | Gemini Nano doesn't write Urdu, so this step needs the cloud model. It receives redacted text only |
| Fallback when Nano isn't available | On-device OCR (tesseract.js) → redact → **cloud** organises the text | The app still works on any browser. The user sees exactly what will be sent and must press **Send** |

The **"How Parho handled this"** timeline shows, for every document, which engine ran each step, how long it took, and how many bytes were sent.

## Privacy guarantees (tested)

- The photo is never uploaded or stored.
- The **"What the cloud will see"** panel shows the exact payload before you send it.
- A **Safety Net** blocks any cloud request that still contains a CNIC, phone number, email, long ID number, a known private value, or image data. Urdu and Arabic digits are handled too.
- Property-based tests (fast-check) inject random CNICs, phone numbers and emails in every common format and check that they are always blocked. See `src/privacy/privacy.test.ts`.

## Features

- Reads electricity, gas and water bills, official notices and medicine boxes.
- Explanations in Urdu (Nastaliq), Roman Urdu or English, with read-aloud.
- Spots an unusual bill: compares this month's units with earlier months, on the device, and mentions it gently.
- Medicine: repeats only what is printed and always ends with "confirm with a doctor or pharmacist".
- Large-text and high-contrast settings; keyboard accessible.
- Gemini Nano status chip with a one-click download and progress bar.

## Run it

Requirements: Node 20+, and desktop Chrome 139+ for on-device AI. For image input, enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`.

```bash
npm install
cp .env.example .env.local   # fill in your Firebase web config + App Check keys
npm run dev
npm test
```

Firebase setup:
1. Create a Firebase project and enable **AI Logic** with the **Gemini Developer API**.
2. Register a web app.
3. Register the app in **App Check** with Fraud Defense (reCAPTCHA Enterprise).
4. For local development, add your `VITE_APPCHECK_DEBUG_TOKEN` under App Check → Manage debug tokens.

## Code map

- `src/ai/engines.ts`: the only file that calls `firebase/ai` (on-device and cloud models).
- `src/ai/router.ts`: decides where each step runs, builds the cloud payload, and writes the timeline.
- `src/privacy/`: Safety Net and Redactor.
- `src/ai/prompts.ts`: extraction and explanation prompts.

## Limits

- On-device AI needs desktop Chrome; other browsers use the OCR fallback.
- Urdu read-aloud depends on an Urdu voice being installed. Roman Urdu and English work everywhere.
- Parho explains what is printed. It is **not** medical, legal or financial advice.
- The sample documents contain fake data only.

## Built with

Firebase AI Logic (hybrid inference), Gemini Nano, Gemini, Firebase App Check, React, TypeScript, Vite, tesseract.js, Vitest, fast-check.

AI disclosure: built by Shehar Bano with help from Claude Code, an AI coding assistant.

## License

Apache-2.0
