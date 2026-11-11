import { z } from 'zod';

export const DOC_TYPES = ['bill', 'notice', 'medicine', 'other'] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const PRIVATE_KINDS = ['NAME', 'CNIC', 'ADDRESS', 'ACCOUNT', 'PHONE', 'EMAIL'] as const;

export const ExtractionSchema = z.object({
  doc_type: z.enum(DOC_TYPES),
  title: z.string().nullable().default(null),
  // Key facts: amount, due date, units, dosage, expiry, action required…
  fields: z
    .array(z.object({ label: z.string(), value: z.string(), confidence: z.enum(['high', 'low']).default('high') }))
    .default([]),
  private_values: z.array(z.object({ kind: z.enum(PRIVATE_KINDS), value: z.string() })).default([]),
  text: z.string().default(''),
});

export type Extraction = z.infer<typeof ExtractionSchema> & { source: 'nano' | 'cloud_from_ocr' };
export type PrivateValue = z.infer<typeof ExtractionSchema>['private_values'][number];
export type Field = z.infer<typeof ExtractionSchema>['fields'][number];

/** Plain JSON schema for Nano's responseConstraint. */
export const EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    doc_type: { type: 'string', enum: [...DOC_TYPES] },
    title: { type: 'string' },
    fields: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          value: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'low'] },
        },
        required: ['label', 'value', 'confidence'],
      },
    },
    private_values: {
      type: 'array',
      items: {
        type: 'object',
        properties: { kind: { type: 'string', enum: [...PRIVATE_KINDS] }, value: { type: 'string' } },
        required: ['kind', 'value'],
      },
    },
    text: { type: 'string' },
  },
  required: ['doc_type', 'fields', 'private_values'],
} as const;

/** Parse model output; tolerates ```json fences. Throws on invalid output. */
export function parseExtraction(raw: string) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  return ExtractionSchema.parse(JSON.parse(cleaned));
}

export interface CloudPayload {
  doc_type: DocType;
  title?: string;
  fields: { label: string; value: string }[];
  redacted_text: string;
  language: 'ur' | 'roman_ur' | 'en';
}

export interface TimelineEntry {
  step: 'read' | 'redact' | 'explain';
  engine: 'nano' | 'local_ocr' | 'cloud' | 'this_device';
  reason: string;
  ms: number;
  bytes_out?: number;
}
