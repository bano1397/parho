# Parho — Requirements (v2, strong)

**Status:** draft for review by Shehar Bano.
- Re-check against the official #BuildHybridAI rules when they are published.
- Any conflict with the rules overrides this file.

## Introduction

Parho is a web app that helps people who cannot easily read English paperwork. Typical users are elderly parents, low-literacy adults, low-vision users, and help-desk volunteers. It handles a photo of a printed document (utility bill, school notice, medicine box) in four steps:

1. Reads it **on the laptop** with Gemini Nano.
2. Hides private details **on the laptop**.
3. Sends only the **redacted text** to cloud Gemini, which explains it in simple Urdu.
4. Reads the explanation aloud.

The raw photo never leaves the device.

**Platform:**
- Desktop Chrome, using Firebase AI Logic hybrid inference.
- Cloud model: Gemini Developer API (free tier, Firebase Spark plan).
- Hosted on Firebase Hosting.
- Total cost: zero.

## Glossary

- **Parho_App**: the web application.
- **Document_Photo**: a JPEG or PNG image chosen or captured by the user.
- **Prepared_Image**: the Document_Photo after orientation fix and resize (longest side ≤ 1,600 px, JPEG quality 0.85).
- **Nano**: Gemini Nano running in Chrome through Firebase AI Logic in on-device mode.
- **Cloud_Model**: Gemini in the cloud through Firebase AI Logic in cloud mode.
- **Router**: the Parho_App component that decides, per step, whether to use Nano, Local_OCR or the Cloud_Model, and records the decision.
- **Local_OCR**: Tesseract.js text recognition running in the browser.
- **Extraction**: the structured result of reading a document: `doc_type`, `fields`, `private_values`, `confidence`, `source` (`nano` | `local_ocr`).
- **Doc_Type**: one of `bill`, `notice`, `medicine`, `other`.
- **Private_Value**: a person's name, CNIC, address, account/consumer/reference number, phone number, or email.
- **Redactor**: the component that replaces Private_Values in text with tokens.
- **Redaction_Token**: `[NAME]`, `[CNIC]`, `[ADDRESS]`, `[ACCOUNT]`, `[PHONE]`, `[EMAIL]`.
- **Redacted_Text**: document text after the Redactor and the Safety_Net have run.
- **Safety_Net**: pattern checks that run on the outgoing payload:
  - CNIC: 13 digits in `#####-#######-#` or plain form;
  - Pakistani mobile: `03XX-XXXXXXX`, `+923XXXXXXXXX`, `923XXXXXXXXX`;
  - email addresses;
  - any run of 10 or more digits.
- **Cloud_Payload**: the exact data sent to the Cloud_Model.
- **Explanation**: the Cloud_Model's answer, in Urdu script or Roman Urdu.
- **Source_Badge**: a visible label on each result: "On this laptop 🔒" (Nano or Local_OCR) or "Cloud ☁️".
- **Nano_Status**: `available`, `downloadable`, `downloading`, `unavailable`.
- **Sample_Document**: one of 3 built-in fake documents with no real personal data.

---

## Requirement 1: Capture and prepare a photo

**User story:** As a user, I want to give Parho a photo of my paper, so that it can read it for me.

1. THE Parho_App SHALL let the user choose a JPEG or PNG file, drop a file, or capture a photo with the laptop camera.
2. WHEN a Document_Photo is received, THE Parho_App SHALL apply EXIF orientation and resize it to a Prepared_Image in the browser.
3. IF the file is not JPEG/PNG, is empty, is larger than 15 MB, or cannot be decoded, THEN THE Parho_App SHALL show "Yeh tasveer nahi khul saki" (this picture couldn't be opened) with the reason, and SHALL NOT call any model.
4. THE Parho_App SHALL offer 3 Sample_Documents (bill, school notice, medicine box) that a first-time user or judge can open in one click.
5. THE Parho_App SHALL never upload the Document_Photo or Prepared_Image to any server, storage bucket or analytics service.

## Requirement 2: Nano status and model download

**User story:** As a user, I want to know whether private on-device reading is available, so that I trust what happens to my paper.

1. WHEN the Parho_App starts, THE Parho_App SHALL check Nano_Status and show it in a status chip: "Private reading ready", "Needs download", "Downloading n%", or "Not available on this computer".
2. WHERE Nano_Status is `downloadable`, THE Parho_App SHALL start the download only after the user presses a "Download private reader" button, as Chrome requires.
3. WHILE Nano is downloading, THE Parho_App SHALL show progress and SHALL keep the app usable through the Local_OCR path.
4. WHERE Nano_Status is `unavailable`, THE Parho_App SHALL explain why in plain words (for example, "Chrome on a laptop is needed") and SHALL use the Local_OCR path.

## Requirement 3: On-device reading (Extraction)

**User story:** As a user, I want my paper read on my own laptop, so that my personal details stay with me.

1. WHERE Nano_Status is `available`, THE Router SHALL send the Prepared_Image to Nano with the extraction prompt and the Extraction JSON schema, using on-device-only mode for this step.
2. THE Extraction SHALL contain:
   - `doc_type`;
   - `fields`:
     - bill: `company`, `amount_due`, `due_date`, `amount_after_due`, `units`, `billing_month`, `previous_amounts`;
     - notice: `issuer`, `date`, `action_needed`, `deadline`;
     - medicine: `name`, `strength`, `dose_as_printed`, `warnings_as_printed`, `expiry`;
   - `private_values`;
   - `confidence` per field (`high` | `low`).
3. THE Router SHALL instruct Nano to copy values exactly as printed and to return `null` for anything not visible.
4. IF Nano returns invalid JSON, THEN THE Router SHALL retry once with a repair prompt. IF it fails again, THEN THE Router SHALL use the Local_OCR path for this document.
5. WHERE Nano is not available, THE Router SHALL run Local_OCR on the Prepared_Image and build the Extraction from the OCR text with local rules (labels such as "Amount Due", "Due Date", "Payable Within Due Date", "Units", "Consumer ID", "Reference No"), with `source` = `local_ocr`.
6. THE Parho_App SHALL show the Source_Badge "On this laptop 🔒" on the Extraction, naming the engine (Nano or Local_OCR).
7. THE Parho_App SHALL highlight every field with `confidence` `low` and ask the user to check it against the photo.
8. THE Extraction step SHALL complete without any network request. A test SHALL prove this by running the step with the network blocked.

## Requirement 4: Privacy — redaction, blur and safety net

**User story:** As a user, I want to see exactly what leaves my laptop, so that I know my CNIC and name are safe.

1. WHEN an Extraction exists, THE Redactor SHALL replace every Private_Value in the document text and fields with the matching Redaction_Token. Matching SHALL ignore case, spacing and hyphen differences.
2. THE Redactor SHALL run the Safety_Net patterns over the Redacted_Text and replace any match with its Redaction_Token.
3. BEFORE any cloud request, THE Parho_App SHALL run the Safety_Net over the full Cloud_Payload.
   - IF any pattern still matches, THEN THE Parho_App SHALL block the request and show "Hifazat ke liye roka gaya" (stopped for safety), with the matched type (not the value).
4. THE Cloud_Payload SHALL contain only: Redacted_Text, `doc_type`, non-private `fields`, the chosen language, and the user's question if any. It SHALL NOT contain any image, file name, or Private_Value.
5. THE Parho_App SHALL show a "What the cloud will see" panel with the exact Cloud_Payload text before sending, and a "Send" button. A user setting may switch this to auto-send.
6. WHEN Local_OCR word boxes are available, THE Parho_App SHALL blur the image regions of Private_Values on the on-screen preview.
   - The blur SHALL be applied on a canvas copy only; the original image is never sent anywhere.
7. THE Parho_App SHALL NOT write Private_Values, document text or images to logs, analytics, Firestore, or localStorage.
8. THE Parho_App SHALL keep the last result only in memory. Closing or refreshing the tab SHALL erase it.

## Requirement 5: Cloud explanation in Urdu

**User story:** As a user, I want the paper explained in simple Urdu, so that I know what to do.

1. WHEN the user sends the Cloud_Payload, THE Router SHALL call the Cloud_Model in cloud-only mode with the explanation prompt.
2. THE Explanation SHALL answer, in at most 6 short sentences in the chosen language (Urdu script by default, or Roman Urdu):
   - what this paper is;
   - what to do;
   - by when;
   - how much;
   - anything unusual.
3. WHERE `doc_type` is `bill` and previous amounts are present, THE Explanation SHALL compare the current amount with the average of the previous amounts.
   - It SHALL describe an increase over 50% as "pichle mahinon se kaafi zyada — meter reading check karwa lein" (much higher than previous months — get the meter reading checked).
   - It SHALL NOT call it fraud.
4. WHERE `doc_type` is `medicine`, THE Explanation SHALL only restate what is printed and SHALL end with "Doctor ya pharmacist se tasdeeq karein" (confirm with a doctor or pharmacist). THE Explanation SHALL NOT recommend doses, substitutes or diagnoses.
5. THE Explanation SHALL NOT invent values that are not in the Cloud_Payload. When a value is missing, it SHALL say "kaghaz par wazeh nahi" (not clear on the paper).
6. THE Parho_App SHALL show the Source_Badge "Cloud ☁️" on the Explanation.
7. IF the cloud call fails with busy (HTTP 503), rate limit (429) or timeout, THEN THE Parho_App SHALL show "Abhi masroof hai, thori der baad koshish karein" (busy right now, try again in a while), keep the Extraction on screen, and offer a "Try again" button. It SHALL NOT retry automatically more than once.
8. THE cloud requests SHALL be protected with Firebase App Check (reCAPTCHA v3), enforced for AI Logic.

## Requirement 6: Read aloud and accessible design

**User story:** As a user with weak eyesight or reading, I want to hear the answer and use big, clear controls.

1. WHEN the user presses "Sunao" (listen), THE Parho_App SHALL read the Explanation aloud using the browser's speech synthesis, choosing an `ur-PK` or `ur` voice when present.
2. WHERE no Urdu voice exists, THE Parho_App SHALL read the Roman Urdu version with an available voice and show a small note "Urdu awaaz is computer par nahi" (no Urdu voice on this computer).
3. THE Parho_App SHALL provide a large-text mode (base font ≥ 22 px), a high-contrast mode, and full keyboard operation with visible focus.
4. THE Parho_App SHALL show Urdu text right-to-left in Noto Nastaliq Urdu, and SHALL label every icon button with text.
5. THE Parho_App SHALL score ≥ 90 for Accessibility in Lighthouse on the main screen.

## Requirement 7: Offline behaviour

**User story:** As a user during load-shedding or with no internet, I still want my paper read privately.

1. THE Parho_App SHALL be installable as a PWA and SHALL load its interface with no network after the first visit.
2. WHILE offline, THE Parho_App SHALL perform capture, Extraction (Nano or Local_OCR), redaction and blur.
3. WHILE offline, THE Parho_App SHALL show "Internet aate hi samjha denge" (we'll explain as soon as the internet is back) in place of the Explanation, and SHALL hold the Cloud_Payload in memory.
4. WHEN the connection returns and the user confirms, THE Parho_App SHALL send the held Cloud_Payload.

## Requirement 8: Router transparency and hybrid proof

**User story:** As a judge, I want to see exactly what ran where and why.

1. THE Router SHALL record, for every step, the engine used (`nano`, `local_ocr`, `cloud`), the reason (for example `nano_available`, `nano_unavailable`, `offline`, `urdu_needs_cloud`), and the duration in ms.
2. THE Parho_App SHALL show this record in a collapsible "How Parho handled this" timeline under each result.
3. THE Parho_App SHALL show, for each result, the size of the Document_Photo and of the Cloud_Payload in bytes.

## Requirement 9: Measured accuracy (Numbers page)

**User story:** As a judge, I want real numbers, not claims.

1. THE project SHALL include an evaluation script that runs Extraction on Shehar Bano's private test set (at least 10 bills/notices and 2 medicine boxes, never committed) against `ground_truth.json`.
2. THE script SHALL report:
   - key-field accuracy per Doc_Type and engine;
   - Private_Value recall (found / total);
   - Safety_Net leaks (must be 0);
   - median Nano and cloud latency;
   - median bytes sent versus photo size.
3. THE Parho_App SHALL show the latest committed results (numbers only, no images or values) on a "Numbers" page with the test date.

## Requirement 10: Honesty, safety and cost

1. THE README SHALL state which parts use AI, the measured accuracy, known limits (desktop Chrome for on-device, Nano has no Urdu), and that Parho is not legal, billing or medical advice.
2. THE repository SHALL NOT contain real personal data, real document photos, API secrets or service-account keys.
3. THE project SHALL run entirely on free tiers: Firebase Spark plan, Gemini Developer API free tier, Firebase Hosting, Tesseract.js, and browser APIs. No paid service and no card on file.

## Requirement 11: Tests

1. THE Redactor and Safety_Net SHALL have unit tests covering:
   - CNIC with and without hyphens;
   - Urdu or English digits;
   - mobile numbers in all listed forms;
   - emails;
   - names with different spacing and case;
   - a property-based test showing that random text with injected CNICs/phones never passes the Safety_Net.
2. THE Router SHALL have tests for every path: Nano available, Nano unavailable, Nano invalid JSON, offline, and cloud busy.
3. A test SHALL prove the Extraction step makes zero network requests.
4. A test SHALL prove the Cloud_Payload never contains image bytes or a data URL.
5. All tests SHALL pass in CI (GitHub Actions, free) on every push.

## Success targets (go/no-go and judging)

| Measure | Target |
|---|---|
| Key-field accuracy, Nano, bills (Day-1 test) | ≥ 80 % (otherwise switch to backup idea) |
| Private_Value recall | ≥ 95 % |
| Safety_Net leaks in tests and eval | 0 |
| Nano Extraction time (median) | ≤ 8 s on Shehar Bano's Mac |
| Lighthouse accessibility | ≥ 90 |
| Cost | Rs 0 |
