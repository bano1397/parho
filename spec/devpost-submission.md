# Devpost submission draft (submit from Shehar Bano's account banozahid1397 by 29 Nov 2026)

**Name:** Parho (پڑھو)
**Tagline:** Photograph a bill, notice or medicine box. Gemini Nano reads it on your device, and Parho explains it in simple Urdu without sharing your private details.
**Links:** live demo https://firstapp-13a9a.web.app · code https://github.com/bano1397/parho · video (YouTube link)

## Inspiration
Many people in Pakistan can't comfortably read the English printed on their electricity bills, gas disconnection notices or medicine boxes. The usual fix is to hand the paper to a neighbour or a shop, which shares their CNIC, address and account number. Parho gives them an answer without giving anything away.

## What it does
- Reads the photo **on the device** with Gemini Nano (Firebase AI Logic, `ONLY_ON_DEVICE`), producing structured JSON: amount, due date, units, deadline, consequences, dose and expiry.
- Flags every private value and **redacts it on the device**. A Safety Net blocks any cloud request that still contains a CNIC, phone number, email, long ID number or image data.
- Shows **exactly what the cloud will see** (about 1 KB of text, never the photo).
- Explains the paper in **simple Urdu**, with a one-tap **English / اردو** switch (and Roman Urdu) with cloud Gemini (`ONLY_IN_CLOUD`), with read-aloud.
- Flags an unusual jump in units, computed on the device. For medicine, it repeats only what is printed and adds "confirm with a doctor or pharmacist".
- **Fallback:** without Nano, it uses on-device OCR, then redaction, then asks the user before sending the text.
- A timeline shows which engine ran each step, how long it took, and how many bytes were sent.

## On every platform
- **Web (desktop Chrome):** Gemini Nano reads the photo on the device (Firebase AI Logic, `ONLY_ON_DEVICE`).
- **iPhone (native SwiftUI):** Apple Vision reads the text on the phone, Apple's on-device Foundation Model organises it, and the same redaction + Safety Net run on the phone before Gemini (Firebase AI Logic) explains it.
- **Android (native Jetpack Compose):** ML Kit reads the text on the phone; Gemini Nano organises it on devices that support it (Firebase AI Logic on-device, `ONLY_ON_DEVICE`), otherwise the text is redacted on the phone and the user is asked before it goes to the cloud.
- The privacy rules are ported line by line to Swift and Kotlin, with their own tests.

## How we built it
React + TypeScript + Vite, Firebase AI Logic (hybrid inference), Firebase App Check (reCAPTCHA Enterprise), Firebase Hosting, tesseract.js, zod, Vitest + fast-check. The app shell loads offline (PWA) and Nano reads without internet; the Urdu explanation needs a connection.

## Why hybrid
The step that sees the photo is the private one, so it runs on the device. The step that needs Urdu, which Nano can't write, runs in the cloud, and it only gets data that has already been made safe.

## Challenges
- Nano's first answers took 60+ s. Dropping the full-text transcription from the prompt brought them down to about 20 s.
- Raw OCR text can't be redacted by number patterns alone. Lines labelled "To:", "Address:" or "Account No:" are now redacted too.
- Cloud "high demand" errors are retried automatically.

## Accomplishments / Numbers
Tested on **8 real documents** (6 FESCO electricity bills from Faisalabad + 2 medicine boxes), read by Gemini Nano on a MacBook, 16 Nov 2026:
- Across repeated runs: **due date 6/6 every time**, amount to pay 5–6/6, units used 4–5/6, medicine name + ingredient 4/4. Overall **86–95% of key facts** (19–21 of 22). Nano's answers vary a little between runs, so Parho always shows what it read.
- **0 private details** (names, addresses, consumer/reference numbers) reached the cloud.
- **0 invented doses.** Testing showed Nano writes doses that are not printed on small boxes, so Parho now keeps only the medicine's name, ingredient and strength and sends the person to a pharmacist.
- Misread bill fields are hidden on the device (a non-number amount, a copied date, a repeated month). Units printed on the bill win; units are only worked out from (present − previous reading) × MF when none were read.
- Re-test on the live site, 20 Nov 2026: **21 of 22 key facts (95%)**, 0 leaks.
- A 10-agent audit tried to break privacy and medicine safety. A second 7-tester audit (19 Nov) found 10 more privacy edge cases (LESCO-style reference numbers, unlabelled names, "pata" addresses, IBANs); all are fixed. Every leak found is now a permanent test: 106 unit tests and 5 browser tests (Playwright + axe).
- Reading takes about **10–17 s on the device**; the cloud receives about **0.7 KB of text** instead of a ~600 KB photo.

## What's next
Publishing the iPhone and Android apps to the stores, more Pakistani languages (Sindhi, Pashto, Punjabi), and help with tax and school notices.

## Built before vs during the submission period
The spec, scaffold and first working version were made on 11 Nov 2026 (first commit). Everything after commit `de09f38` was built during the period: deploy, App Check, notice improvements, OCR-fallback privacy fix, retries, PWA, CI, progress UI and the evaluation kit.

## AI disclosure
Built by Shehar Bano with help from Claude Code, an AI coding assistant.

## Testing instructions for judges
Open https://firstapp-13a9a.web.app in desktop Chrome 139+. For on-device reading, enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` and click **Download Gemini Nano**. Then click a sample (fake data). Without Nano, the OCR fallback runs automatically.
