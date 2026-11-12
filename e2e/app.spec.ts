// End-to-end tests on the production build. Headless Chromium has no Gemini Nano, so these
// exercise the OCR fallback. The cloud is mocked: tests never call real Gemini.
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const STRUCTURED = JSON.stringify({
  doc_type: 'notice', title: 'Final notice',
  fields: [
    { label: 'Amount', value: 'Rs 6,780', confidence: 'high' },
    { label: 'Deadline', value: '30-11-2026', confidence: 'high' },
    { label: 'Name', value: '[NAME]', confidence: 'high' },
  ],
  private_values: [], text: '',
});

/** Fake engines: no Nano, real on-device OCR (from the app), and a fake cloud that records every prompt. */
async function mockCloud(page: Page, sent: string[]) {
  await page.exposeFunction('__record', (p: string) => { sent.push(p); });
  await page.addInitScript((structured) => {
    const w = window as unknown as Record<string, unknown>;
    w.__parhoEngines = {
      nanoStatus: async () => 'unavailable',
      downloadNano: async () => {},
      nanoRead: async () => { throw new Error('no nano'); },
      cloud: async (prompt: string) => {
        await (w.__record as (p: string) => Promise<void>)(prompt);
        return { text: prompt.includes('OCR TEXT') ? structured : 'یہ گیس کا آخری نوٹس ہے۔ 6,780 روپے 30 نومبر تک ادا کریں۔', source: 'in_cloud' };
      },
    };
  }, STRUCTURED);
}

test('home page shows samples and status', async ({ page }) => {
  await mockCloud(page, []);
  await page.goto('/');
  await expect(page).toHaveTitle(/Parho/);
  for (const s of ['Electricity bill', 'Gas notice', 'Medicine box']) await expect(page.getByRole('button', { name: s })).toBeVisible();
  await expect(page.getByText(/On-device AI/)).toBeVisible();
});

test('fallback: private details are hidden before anything is sent, and Cancel sends nothing', async ({ page }) => {
  const sent: string[] = [];
  await mockCloud(page, sent);
  await page.goto('/');
  await page.getByRole('button', { name: 'Gas notice' }).click();
  const card = page.getByRole('heading', { name: /send redacted text/ });
  await expect(card).toBeVisible({ timeout: 150_000 });
  const main = await page.locator('main').innerText();
  expect(main).toContain('[NAME]');
  expect(main).toContain('[CNIC]');
  expect(main).not.toMatch(/Fatima|00000-0000000-0|Sample Colony/);
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(sent).toHaveLength(0);
});

test('fallback full flow: structured, explained in Urdu, cloud never sees private data or the photo', async ({ page }) => {
  const sent: string[] = [];
  await mockCloud(page, sent);
  await page.goto('/');
  await page.getByRole('button', { name: 'Gas notice' }).click();
  await page.getByRole('button', { name: 'کلاؤڈ کو بھیجیں', exact: true }).click({ timeout: 150_000 });
  await expect(page.getByText('Rs 6,780').first()).toBeVisible();
  await expect(page.locator('.field', { hasText: '[NAME]' })).toHaveCount(0); // placeholder rows hidden
  await page.getByRole('button', { name: /explain/ }).click();
  await expect(page.getByText(/آخری نوٹس/)).toBeVisible();
  await expect(page.getByText(/How Parho handled this/)).toBeVisible();
  expect(sent.length).toBe(2);
  for (const b of sent) {
    expect(b).not.toMatch(/Fatima|00000-?0000000-?0|Sample Colony|0000000000/);
    expect(b).not.toMatch(/data:image|inlineData|[A-Za-z0-9+/]{200,}/);
  }
});

test('rejects a file that is not an image', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
  await expect(page.getByText(/photo|image/i).first()).toBeVisible();
});

test('accessibility: no serious or critical axe violations', async ({ page }) => {
  await page.goto('/');
  const r = await new AxeBuilder({ page }).analyze();
  const bad = r.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
  expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});
