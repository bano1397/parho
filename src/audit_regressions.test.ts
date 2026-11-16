// Regression tests from the 16 Nov 2026 ten-tester audit: every leak they found must stay fixed.
import { describe, it, expect } from 'vitest';
import { buildCloudPayload, sanitizeExtraction, billNote } from './ai/router';
import { findPrivate } from './privacy/safetyNet';
import { redact } from './privacy/redact';
import type { Extraction } from './ai/schema';

const ex = (doc_type: Extraction['doc_type'], fields: { label: string; value: string }[], extra: Partial<Extraction> = {}) =>
  ({ doc_type, title: 'x', fields, private_values: [], text: '', source: 'nano', ...extra }) as unknown as Extraction;
const sendable = (e: Extraction) => { try { return JSON.stringify(buildCloudPayload(e, 'ur')); } catch { return 'BLOCKED'; } };

describe('privacy: nothing private reaches the cloud', () => {
  it.each([
    'CNIC 35202 - 1234567 - 1', 'CNIC 35202/1234567/1', 'id 3520 2123 4567 1', 'call +92 300 123 4567', 'call 0300 123 4567',
    'call (0300) 1234567', 'tel 042-35761234', 'CNIC ３５２０２-１２３４５６７-１', 'CNIC ३५२०२१२३४५६७१', 'ali @ gmail.com', 'ali [at] gmail.com',
    'Ref: LE-04-1234567-U due', 'Consumer 041234567 due', 'Dear Ahmed Khan, pay now', 'House 12 Street 4 Gulberg Lahore', 'Ck No 197 Bhagy Wala',
  ])('text %s is redacted or blocked', (t) => {
    const out = redact(t);
    expect(findPrivate(out)).toBeNull();
    expect(out).not.toMatch(/1234567|4567|gmail|Ahmed|Gulberg|Bhagy/);
  });
  it('labels, titles and holder fields never carry a name', () => {
    const s = sendable(ex('bill', [{ label: 'Ahmed Khan', value: 'Rs 500' }, { label: 'Recipient', value: 'Ahmed Khan' },
      { label: 'Holder', value: 'Ali s/o Zahid' }, { label: 'Cust #', value: 'LE1234567' }, { label: 'Amount due', value: 'Rs 500' }],
      { title: 'Bill of Ahmed Khan', private_values: [{ kind: 'NAME', value: 'Ahmed Khan' }] } as Partial<Extraction>));
    expect(s).not.toMatch(/Ahmed|Zahid|LE1234567/);
    expect(s).toMatch(/Rs 500/);
  });
  it('does not over-redact amounts, dates or "To pay"', () => {
    expect(redact('To pay: Rs 7,371 by 24 NOV 26', [{ kind: 'NAME', value: 'Ali' }] as never)).toBe('To pay: Rs 7,371 by 24 NOV 26');
    expect(redact('Quality check', [{ kind: 'NAME', value: 'Ali' }] as never)).toBe('Quality check');
  });
});

describe('medicine: no dose survives', () => {
  const keep = (fields: { label: string; value: string }[]) => sanitizeExtraction(ex('medicine', fields)).fields.map((f) => `${f.label}=${f.value}`);
  it.each([
    ['Uses', '1+0+1 after meals'], ['Used for', 'Fever. 500mg BD'], ['Indications', 'Pain; take TDS'], ['Strength', '500 mg x3 daily'],
    ['Form', 'Syrup 5 ml OD'], ['Uses', '10 mg/kg'], ['Uses', 'din mein 3 baar'], ['Uses', 'روزانہ 2 گولی'],
    ['Composition', 'Paracetamol 500mg. Do not exceed 8 in 24 hours'], ['Contains', 'Paracetamol, not for children under 12'],
    ['Uses', 'Use before 12/2027'], ['Do not take more than', '8 tablets in 24 hours.'], ['Expiry', '11/2026'],
  ])('%s = %s is dropped', (label, value) => expect(keep([{ label, value }])).toEqual([]));
  it('keeps identifying fields', () => {
    expect(keep([{ label: 'Name', value: 'Panadol' }, { label: 'Medicine name', value: 'Panadol' }, { label: 'Strength', value: '500 mg' },
      { label: 'Form', value: 'Tablet' }, { label: 'Active ingredient', value: 'Paracetamol 500 mg' }]))
      .toEqual(['Name=Panadol', 'Medicine name=Panadol', 'Strength=500 mg', 'Form=Tablet', 'Active ingredient=Paracetamol 500 mg']);
  });
  it('sends no raw text for medicine', () => {
    expect(buildCloudPayload(ex('medicine', [{ label: 'Name', value: 'X' }], { text: 'Dosage: 2 tablets every 4 hours' } as Partial<Extraction>), 'ur').redacted_text).toBe('');
  });
});

describe('bills: units check is safe', () => {
  const units = (fields: { label: string; value: string }[]) => sanitizeExtraction(ex('bill', fields)).fields.find((f) => /units/i.test(f.label))?.value;
  it('uses the MF multiplier', () => expect(units([{ label: 'Units', value: '2000' }, { label: 'Previous Reading', value: '1000' }, { label: 'Present Reading', value: '1050' }, { label: 'MF', value: '40' }])).toBe('2000'));
  it('leaves decimal readings alone', () => expect(units([{ label: 'Units', value: '100' }, { label: 'Previous Reading', value: '1234.5' }, { label: 'Present Reading', value: '1334.5' }])).toBe('100'));
  it('leaves gas bills alone', () => expect(units([{ label: 'Units (hm3)', value: '1.25' }, { label: 'Previous Reading', value: '100' }, { label: 'Present Reading', value: '230' }])).toBe('1.25'));
  it('handles commas', () => expect(units([{ label: 'Units', value: '200' }, { label: 'Previous Reading', value: '33,413' }, { label: 'Present Reading', value: '33,613' }])).toBe('200'));
  it('no false jump from meter readings or years', () => {
    expect(billNote(ex('bill', [{ label: 'Units', value: '120' }, { label: 'Previous Reading', value: '33413' }, { label: 'History', value: 'Nov25 110 Dec25 115 Jan26 118' }]))).toBeUndefined();
  });
});
