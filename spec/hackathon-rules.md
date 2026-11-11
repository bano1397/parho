# #BuildHybridAI — rules from the overview page (read 11 Nov 2026, 3:10 PM PKT)
Official Rules page still "not yet available" — re-check for Pakistan eligibility + judging criteria.

- Must: Firebase AI Logic hybrid (on-device + cloud). **ALL AI inference through Firebase AI Logic** — no other model APIs.
- Platforms: Web (Chrome, Gemini Nano 4), Android (Nano 4), iOS (Apple Foundation Models). Multi-platform gets "strong consideration" for Grand Prize; single-platform can still win.
- App Check required; debug tokens accepted.
- New projects OR significantly updated existing apps are eligible → OK to start now.
- Submit: working app, PUBLIC repo on GitHub/GitLab with an **open source license visible in About** (Apache preferred), Firebase AI Logic imported AND called in code, text description (how AI Logic is used, features, value proposition).
- Video: ≤ 3 min, public on **YouTube**, **English or English subtitles**, shows app running on its platform.
- Hosted URL strongly encouraged. Must be free of charge. All materials in English.
- Prizes: $30k total — $10k Grand Prize, $3k best app per platform.
- Optional Google Account Quota (TTS etc.) — not needed; we use browser speechSynthesis.

## Spec changes caused by these rules
1. License **Apache-2.0** (not MIT).
2. Video narration English (Urdu UI shown with English subtitles).
3. Tesseract stays only as plain OCR (not a model). When Nano is unavailable, the fallback is the **cloud via Firebase AI Logic** on redacted OCR text — this matches the hackathon's "falls back to cloud" story while the photo still never leaves the device.
4. Stretch (Grand Prize): Android build later only if web is finished early.
