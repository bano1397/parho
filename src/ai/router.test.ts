import { describe, it, expect, vi } from 'vitest';
import { readDocument, buildCloudPayload, explain, billNote, UserCancelled } from './router';
import type { Engines } from './engines';
import type { Extraction, TimelineEntry } from './schema';
import { PrivacyBlocked } from '../privacy/safetyNet';

const nanoJson = JSON.stringify({
  doc_type: 'bill',
  title: 'Electricity bill',
  fields: [
    { label: 'Amount due', value: 'Rs 18,450', confidence: 'high' },
    { label: 'Due date', value: '24-11-2026', confidence: 'high' },
    { label: 'Units consumed', value: '412', confidence: 'high' },
    { label: 'Previous months units', value: 'Oct 188 | Sep 205 | Aug 260', confidence: 'high' },
    { label: 'Consumer ID', value: '0000000000000', confidence: 'high' },
  ],
  private_values: [
    { kind: 'NAME', value: 'Ahmed Fake Khan' },
    { kind: 'CNIC', value: '00000-0000000-0' },
  ],
  text: 'Consumer Name: Ahmed Fake Khan CNIC 00000-0000000-0 Amount Rs 18,450 due 24-11-2026',
});

function fakes(over: Partial<Engines> = {}): Engines {
  return {
    nanoStatus: async () => 'available',
    downloadNano: async () => {},
    nanoRead: async () => ({ text: nanoJson, source: 'on_device' }),
    cloud: async () => ({ text: 'ok', source: 'in_cloud' }),
    ...over,
  };
}
const img = { blob: new Blob(['x']), base64: 'AAAA', mimeType: 'image/png' };

function deps(engines: Engines, confirm = true) {
  const log: TimelineEntry[] = [];
  return { log, d: { engines, ocr: vi.fn(async () => 'Name Ahmed CNIC 35202-1234567-1 Amount Rs 500'), confirmSend: vi.fn(async () => confirm), log: (e: TimelineEntry) => log.push(e) } };
}

describe('readDocument', () => {
  it('uses Nano when available and never calls the cloud or OCR', async () => {
    const cloud = vi.fn();
    const { d, log } = deps(fakes({ cloud }));
    const ex = await readDocument(img, d);
    expect(ex.source).toBe('nano');
    expect(cloud).not.toHaveBeenCalled();
    expect(d.ocr).not.toHaveBeenCalled();
    expect(log[0].engine).toBe('nano');
  });

  it('retries bad Nano JSON once, then falls back to OCR + cloud on redacted text', async () => {
    const nanoRead = vi.fn(async () => ({ text: 'not json', source: 'on_device' }));
    const cloud = vi.fn(async (_p: string) => ({ text: JSON.stringify({ doc_type: 'bill', fields: [], private_values: [], text: '' }), source: 'in_cloud' }));
    const { d, log } = deps(fakes({ nanoRead, cloud }));
    const ex = await readDocument(img, d);
    expect(nanoRead).toHaveBeenCalledTimes(2);
    expect(ex.source).toBe('cloud_from_ocr');
    const sent = cloud.mock.calls[0][0];
    expect(sent).not.toContain('35202');
    expect(sent).toContain('[CNIC]');
    expect(sent).not.toContain('AAAA'); // image never sent
    expect(log.map((l) => l.engine)).toEqual(['nano', 'local_ocr', 'cloud']);
  });

  it('when Nano is unavailable, uses OCR and asks before sending', async () => {
    const { d } = deps(fakes({ nanoStatus: async () => 'unavailable', cloud: async () => ({ text: '{"doc_type":"other"}', source: 'in_cloud' }) }));
    await readDocument(img, d);
    expect(d.confirmSend).toHaveBeenCalledOnce();
  });

  it('stops if the user cancels the send', async () => {
    const cloud = vi.fn();
    const { d } = deps(fakes({ nanoStatus: async () => 'unavailable', cloud }), false);
    await expect(readDocument(img, d)).rejects.toBeInstanceOf(UserCancelled);
    expect(cloud).not.toHaveBeenCalled();
  });

  it('works with no network during on-device reading', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (() => { throw new Error('network used!'); }) as typeof fetch;
    try {
      const { d } = deps(fakes());
      await expect(readDocument(img, d)).resolves.toMatchObject({ source: 'nano' });
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe('cloud payload', () => {
  const ex: Extraction = { ...JSON.parse(nanoJson), source: 'nano' };

  it('contains no private values and no image', () => {
    const p = buildCloudPayload(ex, 'ur');
    const s = JSON.stringify(p);
    expect(s).not.toMatch(/Ahmed|00000-0000000-0|0000000000000|data:image/);
    expect(p.fields.map((f) => f.label)).not.toContain('Consumer ID');
  });

  it('explain refuses a dirty payload', async () => {
    const { d } = deps(fakes());
    await expect(explain({ doc_type: 'bill', fields: [], redacted_text: 'call 0300-1234567', language: 'ur' }, ex, d)).rejects.toBeInstanceOf(PrivacyBlocked);
  });

  it('bill note flags a big jump in units', () => {
    expect(billNote(ex)).toMatch(/higher than the average/);
  });
});

import { sanitizeExtraction as _san } from './router';
describe('sanitizeExtraction', () => {
  const base = { title: 'x', private_values: [], text: '' };
  it('drops private-by-label fields even when the value was misread', () => {
    const ex = _san({ ...base, doc_type: 'bill', fields: [
      { label: 'Consumer ID', value: '113302611' }, { label: 'Amount Due', value: '5568' }, { label: 'Name & Address', value: 'X Y' } ] } as never);
    expect((ex as { fields: { label: string }[] }).fields.map((f) => f.label)).toEqual(['Amount Due']);
  });
  it('keeps only identifying medicine fields', () => {
    const ex = _san({ ...base, doc_type: 'medicine', fields: [
      { label: 'Brand Name', value: 'Panadol' }, { label: 'Active Ingredient', value: 'Paracetamol' },
      { label: 'Dose', value: '1 tablet' }, { label: 'Maximum per day', value: '4' }, { label: 'expiry date', value: '11/2026' }, { label: 'Warnings', value: 'x' } ] } as never);
    expect((ex as { fields: { label: string }[] }).fields.map((f) => f.label)).toEqual(['Brand Name', 'Active Ingredient']);
  });
});

describe('units check', () => {
  const b = (fields: { label: string; value: string }[]) => (_san({ title: 'x', private_values: [], text: '', doc_type: 'bill', fields } as never) as { fields: { label: string; value: string }[] }).fields;
  it('keeps the units printed on the bill even when the readings disagree (real bill: 1 unit, readings 31 apart)', () => {
    expect(b([{ label: 'UNITS', value: '1' }, { label: 'PREVIOUS READING', value: '12603' }, { label: 'CURRENT READING', value: '12634' }])[0]).toEqual({ label: 'UNITS', value: '1' });
  });
  it('fills units from present minus previous reading when none were read', () => {
    expect(b([{ label: 'PREVIOUS READING', value: '81940' }, { label: 'CURRENT READING', value: '82024' }]).find((f) => f.label === 'Units')?.value).toBe('84');
  });
  it('leaves units alone when readings are unusable', () => {
    expect(b([{ label: 'Units', value: '31' }, { label: 'Previous Reading', value: '12630' }, { label: 'Current Reading', value: '12630' }])[0].value).toBe('31');
  });
});

describe('medicine allow-list', () => {
  const m = (fields: { label: string; value: string }[]) => (_san({ title: 'x', private_values: [], text: '', doc_type: 'medicine', fields } as never) as { fields: { label: string }[] }).fields.map((f) => f.label);
  it('drops dose lines whatever the label', () => {
    expect(m([{ label: 'Do not take more than', value: '8 tablets in 24 hours.' }, { label: 'Directions', value: '2 tabs' },
      { label: 'Adults', value: '1-2 tablets every 4-6 hours' }, { label: 'Manufacturing Date', value: '01-2026' }, { label: 'Retail Price', value: 'Rs 45' },
      { label: 'Name', value: 'Panadol' }, { label: 'Strength', value: '500 mg' }, { label: 'Active Ingredient', value: 'Paracetamol' }])).toEqual(['Name', 'Strength', 'Active Ingredient']);
  });
  it('drops a safe-looking label that hides a dose in its value', () => {
    expect(m([{ label: 'Indication', value: 'take 2 tablets every 6 hours' }])).toEqual([]);
  });
});
