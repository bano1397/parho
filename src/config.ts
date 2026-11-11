// Every tunable in one place.
export const CONFIG = {
  // Cloud model. If Google retires a model, change this one line.
  CLOUD_MODEL: 'gemini-3.5-flash-lite',
  MAX_UPLOAD_BYTES: 15 * 1024 * 1024,
  MAX_SIDE_PX: 1600,
  CLOUD_TIMEOUT_MS: 30_000,
  NANO_TIMEOUT_MS: 90_000,
  // Bill comparison: flag when this month is more than this much above the average of previous months.
  BILL_JUMP_RATIO: 0.5,
};

export const env = {
  apiKey: import.meta.env.VITE_FB_API_KEY as string,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FB_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FB_APP_ID as string,
  recaptchaSiteKey: import.meta.env.VITE_RECAPTCHA_SITE_KEY as string,
};
