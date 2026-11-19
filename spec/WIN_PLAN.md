# Parho: plan to finish and win (checked 18 Nov 2026)

Deadline: **1 Dec, 03:00 PKT**. Our target is to submit on **28 Nov**.
Judging has 4 equal criteria: Technology (hybrid), Design (finished product), Impact, and Idea.
Prizes: Grand ($10k), runners-up ($7k and $4k), Best Web/Chrome ($3k).

## Checked today
| Item | Result |
|---|---|
| Unit tests | 77/77 pass |
| Build | OK (128 KB gzipped) |
| Live site firstapp-13a9a.web.app | Up (HTTP 200) |
| GitHub repo bano1397/parho | Public, Apache-2.0, last CI run green |
| App Check and Firebase AI Logic | In the code |
| PWA (sw.js and manifest) | Present |
| Real-bill accuracy | 86–95% of key facts, 0 private leaks |
| Browser tests (Playwright) | 5/5 pass (19 Nov, after the OCR fix; CDNs blocked in the tests) |

## Still to do
| # | Task | Who | When |
|---|---|---|---|
| 1 | ✅ DONE 19 Nov (commit 8e84453, deployed; live fallback reads the sample in 1.9 s). Was: **Fallback e2e tests FAILED (2 of 5):** the OCR worker loads from cdn.jsdelivr.net, which was slow (7.5 s) and failed. Fix: bundle the Tesseract worker, core and eng data with the app (served from our own Hosting), so the fallback and offline mode don't depend on any outside site. Re-run the e2e tests and redeploy. | Claude | 18–19 Nov |
| 2 | Accuracy: bill_02 units (31 should be 1), and make the bill_03 amount more stable | Claude | 19–20 Nov |
| 3 | Re-run the real-bill eval 3 times and record the range | Claude + Shehar Bano (Chrome with Nano) | 20 Nov |
| 4 | Shehar Bano reads the Urdu and medicine wording and says "Urdu ok" | Shehar Bano | 19 Nov |
| 5 | Set the repo website field to the live link; fix the description typos ("wit", "viacloud") | Shehar Bano clicks, Claude gives the text | 19 Nov |
| 6 | Polish (judges score Design): add PNG app icons; empty and error states | Claude | 20–21 Nov |
| 7 | Live check in a fresh Chrome profile without Nano (fallback path) and with Nano | Claude + Shehar Bano | 21 Nov |
| 8 | Final video script with real numbers | Claude | 21 Nov |
| 9 | Record the video: real bill (private details covered), hands of a family member who can't read English (with their OK), wifi-off moment, privacy panel, Urdu read aloud | Shehar Bano | 22–24 Nov |
| 10 | Edit to 2:45 or less; add English subtitles; upload to YouTube as Public | Shehar Bano | 24–25 Nov |
| 11 | Fill in the Devpost form: text, Built with, testing steps, before/during-the-period section, AI disclosure, video link, repo, live link | Claude fills it in, Shehar Bano reviews | 26–27 Nov |
| 12 | Shehar Bano clicks **Submit** | Shehar Bano | **28 Nov** |
| 13 | After submitting, check video, repo and link in a logged-out browser. No commits after the deadline. | Claude | 28 Nov |

## What makes it win (each criterion)
- **Technology:** show on camera that Nano reads the photo on the device, the cloud gets only about 0.7 KB of redacted text, and the timeline shows which engine ran each step.
- **Design:** one-click samples, large text and RTL Urdu, read aloud, a fallback that works without Nano, and no crashes.
- **Impact:** open with a real person in Pakistan and a real FESCO bill; say who it's for (people who can't read English paperwork).
- **Idea:** privacy is the reason it has to be hybrid. Show the "what the cloud sees" panel and the Safety Net.
- **Do not claim:** Android or iOS support, numbers better than the measured range, or any feature not in the code.

## Risks
- **Nano gives different answers each run:** show the range; record the demo with the run that worked, without hiding the range.
- **Judges without Nano:** the fallback path is tested, and the testing steps explain the Chrome flag.
- **Last-day Devpost or YouTube trouble:** submit 3 days early.
