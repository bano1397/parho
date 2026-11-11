# Firebase AI Logic hybrid SDK — verified notes (11 Nov 2026, from firebase.google.com docs)

- `npm install firebase` **v13+** (hybrid needs ≥12.5; default cloud model `gemini-3.5-flash-lite` from v13).
- Users: desktop Chrome ≥139. For image input enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`.
- Init: `getAI(app, { backend: new GoogleAIBackend() })`, `getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE | ONLY_IN_CLOUD, onDeviceParams: { createOptions, promptOptions }, inCloudParams: { model, generationConfig } })`.
- Image + text: `model.generateContent([prompt, { inlineData: { data: base64, mimeType } }])`. On-device: JPEG/PNG only, inline only, max 9216 tokens, single-turn only, no tools.
- Download: `model.initializeDeviceModel(progress => …)` on a user click, before generateContent. ONLY_ON_DEVICE waits for download.
- Which engine ran: `result.response.inferenceSource` → `ON_DEVICE` | `IN_CLOUD`.
- JSON output on-device: `onDeviceParams.promptOptions.responseConstraint = schema`; cloud: `generationConfig.responseMimeType: 'application/json', responseSchema`. Use `Schema.object(...)` from `firebase/ai`.
- App Check is already **enforced** for AI Logic (auto from 2 Nov 2026). Local dev: debug token (`self.FIREBASE_APPCHECK_DEBUG_TOKEN = true`, register token in console). Do NOT put localhost in reCAPTCHA domains. Optional `useLimitedUseAppCheckTokens: true` (≥12.14).
- To verify on Day 2: exact `expectedInputs: [{ type: 'image' }]` syntax.
- App Check provider: **ReCaptchaEnterpriseProvider** (Classic v3 deprecated in console).
