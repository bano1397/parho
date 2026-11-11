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
