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

# OFFICIAL RULES (published; read 12 Nov 2026)
- **Pakistan is eligible** (excluded: Brazil, Italy, Quebec, Crimea, Cuba, Iran, Syria, N. Korea, Sudan, Belarus, Russia, OFAC).
- Submission period: **11 Nov 1:30 PM PT (12 Nov 02:30 PKT) → 30 Nov 2:00 PM PT (1 Dec 03:00 PKT)**. Judging 10–16 Dec. Winners ~21 Dec.
- Work started before the period (first commit 11 Nov ~22:20 PKT) → allowed, but **must disclose pre-existing work and give a summary of what was built during the period**. Most of the build happens after 12 Nov 02:30 PKT; keep commits honest.
- AI coding assistants allowed (disclose).
- Repo: public, open-source license in About (Apache preferred), Firebase AI Logic imported AND called. **No production API keys, live project secrets or PII in repo / form / testing instructions.**
- App must support English. Third-party logos/trademarks not allowed (samples use fictional companies ✔).
- Video ≤3 min, YouTube public, English or English subtitles. Judges may judge only from video + text.
- Commits after the deadline are not evaluated.
- Judging: Stage 1 pass/fail on requirements; Stage 2 — 4 equal criteria, 1–5 each: **Technological Implementation** (use of hybrid inference), **Design** (complete product, not PoC), **Potential Impact** (specific real problem + audience, shown), **Quality of the Idea** (creative, non-obvious, understanding of problem).
- Prizes: Grand $10k, 1st runner-up $7k, 2nd runner-up $4k; Best iOS / Android / **Web-Chrome $3k**. One grand + one best-of max. Multi-platform preferred.
- Payout: within 60 days of forms; W-8BEN; taxes may be withheld; forms due within 10 business days.
