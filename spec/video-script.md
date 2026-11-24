# Parho demo video script (target 2:45, max 3:00, English, upload to YouTube)

Record the screen at 1080p. Shehar Bano narrates in English, then adds English subtitles in YouTube.
Use the **fake samples** or real papers with private parts covered. Never show a real CNIC, name or address.

| Time | Screen | Narration |
|---|---|---|
| 0:00–0:15 | Ammi's or Abbu's **hands only** (no face) holding a real electricity bill, private parts covered, then the Parho home screen | "In Pakistan, millions of people get bills, disconnection notices and medicine boxes they can't easily read. To get help, they show the paper to someone else, along with their CNIC, address and account number." |
| 0:15–0:25 | Parho title and status chip "🔒 On-device AI ready". Tap **English**, then back to **اردو** | "Parho reads the paper on your own device, removes your private details, and explains it in simple Urdu, or in English with one tap." |
| 0:25–1:05 | Click **Gas notice**. Show "Reading on this device…", then the fields and the 🔒 badge | "The photo is read by Gemini Nano, running inside Chrome through Firebase AI Logic's on-device mode. The photo never leaves this laptop. Nano finds the amount, the deadline and what happens if it's ignored, and it flags every private detail." |
| 1:05–1:30 | Scroll to **What the cloud will see**. Point at `[NAME]`, `[CNIC]` and the byte count | "Before anything goes online, the user sees exactly what will be sent: about one kilobyte of text, no photo, and every name and number replaced. A Safety Net in code blocks the request if a CNIC or phone number is still there. We test that with property-based tests." |
| 1:30–2:00 | Click **Send & explain**. Show the Urdu answer and press 🔊 | "Gemini Nano doesn't write Urdu, so only this step uses cloud Gemini. The answer comes back in simple Urdu and can be read aloud: pay 6,780 rupees by 30 November at any bank, or the gas will be cut off." |
| 2:00–2:15 | Electricity bill sample: the "units are higher than usual" note | "For bills, Parho compares this month's units with earlier months on the device and gently flags a big jump." |
| 2:15–2:35 | Open the same link in **Safari** (no Nano there): OCR progress, the **send redacted text?** card, then the timeline | "No Gemini Nano? Parho falls back to on-device OCR, removes private details, and asks before sending anything. The timeline shows which engine ran each step, how long it took, and how many bytes left the device." |
| 2:35–2:50 | Text on screen: "8 real documents · 21/22 key facts (95%) · 0 leaks" (live re-test, 20 Nov), large-text mode, GitHub repo | "On 8 real Pakistani documents, six electricity bills and two medicine boxes, Parho read 21 of 22 key facts correctly, 95%, on the device, and zero private details reached the cloud. It's open source under Apache 2.0. Parho: read any paper, privately." |

Numbers are from the real 20 Nov live re-test (eval/private, 21/22 key facts, 0 leaks).

**Editing tip:** each cloud step takes about 25 s and the Nano read about 20 s. Cut those waits in the edit, and show a small "sped up" label so it stays honest.
