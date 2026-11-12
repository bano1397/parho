import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  use: { baseURL: 'http://localhost:4180' },
  // Separate test build (dist-e2e) so fake engines can be injected; the deployed dist/ never contains this hook.
  webServer: {
    command: 'VITE_E2E=1 npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --port 4180 --strictPort',
    // CI has no .env.local: use harmless placeholders (the fake engines never call Firebase AI).
    env: {
      VITE_FB_API_KEY: process.env.VITE_FB_API_KEY ?? 'test', VITE_FB_PROJECT_ID: process.env.VITE_FB_PROJECT_ID ?? 'test',
      VITE_FB_APP_ID: process.env.VITE_FB_APP_ID ?? '1:1:web:1', VITE_RECAPTCHA_SITE_KEY: process.env.VITE_RECAPTCHA_SITE_KEY ?? 'test',
    },
    port: 4180, reuseExistingServer: false, timeout: 120_000,
  },
});
