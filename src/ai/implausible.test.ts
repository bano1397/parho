import { describe, it, expect } from 'vitest';
import { dropImplausible, sanitizeExtraction } from './router';

const f = (label: string, value: string) => ({ label, value });

describe('dropImplausible (20 Nov real-bill findings)', () => {
  it('hides an amount whose value is not a number', () => {
    const out = dropImplausible([f('AMOUNT DUE', '5568'), f('AMOUNT AFTER DUE DATE', 'After 27/NOV-26')]);
    expect(out.map((x) => x.label)).toEqual(['AMOUNT DUE']);
  });
  it('keeps amounts written with Rs, commas or /-', () => {
    const out = dropImplausible([f('Amount Due', 'Rs. 4,508'), f('Net Electricity Charges', '1,043/-'), f('Units', '84')]);
    expect(out).toHaveLength(3);
  });
  it('hides a non-due date that copies the due date', () => {
    const out = dropImplausible([f('Due Date', '24 NOV 26'), f('Previous Reading Date', '24 NOV 26'), f('Units', '96')]);
    expect(out.map((x) => x.label)).toEqual(['Due Date', 'Units']);
  });
  it('keeps the due date and different dates', () => {
    const out = dropImplausible([f('Due Date', '24 NOV 26'), f('Reading Date', '17 NOV 26')]);
    expect(out).toHaveLength(2);
  });
  it('removes a repeated month or units value', () => {
    const out = dropImplausible([f('Bill Month', 'Nov 26'), f('Units', '123'), f('Billing Month', 'NOV26'), f('Consumption', '123')]);
    expect(out.map((x) => x.label)).toEqual(['Bill Month', 'Units']);
  });
  it('is applied to bills by sanitizeExtraction', () => {
    const ex = sanitizeExtraction({ doc_type: 'bill', title: 'x', fields: [f('Amount Due', '5568'), f('Amount After Due Date', 'After 27/NOV-26')], redacted_text: '' } as never);
    expect((ex as { fields: unknown[] }).fields).toHaveLength(1);
  });
});
