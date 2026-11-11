# Parho — Task list (v2)

Each task has a **Done when** check. Don't move on until it passes.
- App code starts **only after submissions open** (tonight, 11 Nov PKT).
- Main build window: **20–29 Nov**.

## Day 0 — Setup (no code)
- [x] 0.1 Check Nano on this Mac. Done: `nano_v3_gpu_component` Ready 100%, device capable, 12 GB VRAM.
- [x] 0.2 Firebase: reusing project `firstapp-13a9a` (FirstApp, Spark; project limit reached). AI Logic on, Gemini Developer API; web app "parho" registered; config in `.env.local`.
- [x] 0.3 App Check: parho registered with Fraud Defense (reCAPTCHA Enterprise) site key — use `ReCaptchaEnterpriseProvider`. Site key in `.env.local`. Local dev uses a debug token.
- [ ] 0.4 Collect test set: ≥10 bills/notices (LESCO/IESCO/K-Electric/SNGPL…) + 2 medicine boxes. Write true values into `ground_truth.json`, kept private. Done when: 12 photos + JSON exist in a private folder.
- [x] 0.5 Make 3 fake Sample_Documents (fake name, CNIC `00000-0000000-0`). Done when: 3 images with no real data.
- [~] 0.6 Overview rules read (spec/hackathon-rules.md); Official Rules page not posted yet. Read the official rules when published: eligibility (Pakistan), required tech, video length, judging. Done when: this spec is updated if anything conflicts.
- [~] 0.7 SDK calls verified from docs (spec/sdk-notes.md); still watch the Firebase build session, Thu 12 Nov, 11 PM PKT. Done when: notes on the exact SDK calls.

## Day 1 — Go / no-go (after submissions open)
- [ ] 1.1 Create public repo `bano1397/parho` (Apache-2.0, README stub, .gitignore). Commit as Shehar Bano.
- [ ] 1.2 Vite + React + TS scaffold; `firebase.ts`; `ai/engines.ts` with nanoEngine (on-device only) and cloudEngine (cloud only).
- [ ] 1.3 A quick test page that runs EXTRACT_PROMPT on each private test photo and saves the JSON.
- [ ] 1.4 `eval/run_eval.ts` compares against ground truth. **Done when:** key-field accuracy, private recall and timing are printed.
- [ ] 1.5 **Decision:**
  - ≥ 80 % → GO.
  - Otherwise try OCR text with Nano.
  - Still < 80 % → switch to the backup (scam-SMS checker) and rewrite this spec.

## Day 2 — Reading pipeline
- [ ] 2.1 `image/prepare.ts` + tests (types, 15 MB limit, resize ≤ 1600 px).
- [ ] 2.2 `ai/schema.ts` (zod) + `ai/prompts.ts` + repair retry.
- [ ] 2.3 `ai/nanoStatus.ts` + StatusChip (all 4 states, download on click).
- [ ] 2.4 `ocr/tesseract.ts` + `ocr/rules.ts` fallback + tests on OCR text samples.
- [ ] 2.5 `ai/router.ts` + Timeline + router tests (Nano ok / unavailable / bad JSON).
- [ ] **Done when:** a sample opens, its fields show with the "On this laptop 🔒" badge, and the network test passes.

## Day 3 — Privacy
- [ ] 3.1 `privacy/safetyNet.ts` + unit tests + **fast-check property test** (write tests first).
- [ ] 3.2 `privacy/redact.ts` + tests (spacing/case/hyphens/Urdu digits).
- [ ] 3.3 `privacy/blur.ts` (Tesseract word boxes → canvas blur on the preview).
- [ ] 3.4 CloudSeesPanel (payload, bytes, Send/Cancel) + privacy-blocked state.
- [ ] **Done when:** 0 leaks in tests and the eval, and the payload test passes.

## Day 4 — Cloud Urdu, voice, accessibility
- [ ] 4.1 cloudEngine call with EXPLAIN_PROMPT_UR / Roman; busy/429/timeout handling (one retry max).
- [ ] 4.2 Bill comparison and medicine safety line. Shehar Bano reviews the Urdu wording.
- [ ] 4.3 `speech/speak.ts` (ur-PK → ur → Roman fallback note).
- [ ] 4.4 Large text, high contrast, RTL Nastaliq, keyboard focus, labelled icons.
- [ ] 4.5 Enforce App Check for AI Logic.
- [ ] **Done when:** sample → Urdu explanation spoken aloud; Lighthouse accessibility ≥ 90.

## Day 5 — Offline, proof, deploy
- [ ] 5.1 PWA offline shell; offline state; held payload sent on reconnect.
- [ ] 5.2 Run the full eval → commit `eval/results.json` → Numbers page.
- [ ] 5.3 Playwright smoke test + GitHub Actions CI green.
- [ ] 5.4 `firebase deploy` to Hosting; test the live link in a Chrome profile **without Nano** (fallback path).
- [ ] **Done when:** the live link works with Nano and without it, CI is green, and the numbers are shown.

## Day 6 — Video and submission (target 29 Nov)
- [ ] 6.1 README: problem, why hybrid, architecture diagram, numbers, how to run, limits, AI disclosure, "not advice".
- [ ] 6.2 Record the video on this Mac (script in PARHO_PLAN.md §7): badges, cloud-sees panel, **wifi off on camera**, fallback, numbers.
- [ ] 6.3 Devpost form from **banozahid1397**: text, repo, live link, video, built-with list.
- [ ] 6.4 Final check: no real personal data anywhere, no secrets, App Check on, Spark plan (Rs 0).
- [ ] **Done when:** submitted before 1 Dec 03:00 PKT (target 29 Nov).
