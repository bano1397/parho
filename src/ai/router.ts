// Router: decides where each step runs and records why (shown to the user as a timeline).
// Rule: the PHOTO is only ever processed on this device. The cloud only gets redacted text.
import type { Engines } from './engines';
import { EXTRACT_PROMPT, STRUCTURE_FROM_TEXT_PROMPT, explainPrompt } from './prompts';
import { parseExtraction, type CloudPayload, type Extraction, type TimelineEntry } from './schema';
import { redact } from '../privacy/redact';
import { assertClean } from '../privacy/safetyNet';
import { CONFIG } from '../config';

export interface ReadDeps {
  engines: Engines;
  /** Local OCR (tesseract.js). Returns plain text. */
  ocr: (blob: Blob) => Promise<string>;
  /** Asks the user before redacted OCR text goes to the cloud. Resolve false to stop. */
  confirmSend: (payloadPreview: string) => Promise<boolean>;
  log: (e: TimelineEntry) => void;
}

export class UserCancelled extends Error {}

const now = () => performance.now();

export async function readDocument(
  image: { blob: Blob; base64: string; mimeType: string },
  d: ReadDeps,
): Promise<Extraction> {
  const status = await d.engines.nanoStatus();
  if (status === 'available') {
    const t0 = now();
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await d.engines.nanoRead(EXTRACT_PROMPT, image);
        const ex = parseExtraction(r.text);
        d.log({ step: 'read', engine: 'nano', reason: 'Gemini Nano is ready on this device — the photo never left it', ms: now() - t0 });
        return sanitizeExtraction({ ...ex, source: 'nano' });
      } catch {
        // one retry, then fall back
      }
    }
    d.log({ step: 'read', engine: 'nano', reason: 'Gemini Nano gave an unusable answer twice — switching to fallback', ms: now() - t0 });
  }

  // Fallback: OCR on this device → redact on this device → cloud structures the TEXT only.
  const t1 = now();
  const raw = await d.ocr(image.blob);
  d.log({
    step: 'read',
    engine: 'local_ocr',
    reason: status === 'available' ? 'Fallback after Nano failed' : `Gemini Nano is ${status} here, so text was read with on-device OCR`,
    ms: now() - t1,
  });
  const redacted = redact(raw);
  const body = STRUCTURE_FROM_TEXT_PROMPT + redacted;
  assertClean({ text: body });
  if (!(await d.confirmSend(redacted))) throw new UserCancelled();
  const t2 = now();
  const r = await d.engines.cloud(body, true);
  const ex = parseExtraction(r.text);
  d.log({
    step: 'read',
    engine: 'cloud',
    reason: 'Cloud Gemini (via Firebase AI Logic) organised the redacted text — no photo was sent',
    ms: now() - t2,
    bytes_out: new TextEncoder().encode(body).length,
  });
  return sanitizeExtraction({ ...ex, text: redacted, source: 'cloud_from_ocr' });
}

const PRIVATE_LABEL = /private|address|cnic|consumer|reference|ref\.?\s*no|account|acc\.?\s*no|meter\s*no|phone|mobile|email|customer\s*id/i;
// Gemini Nano invents doses and dates that are not printed on small or blurry boxes, so a
// medicine reading keeps only what identifies the medicine; the explanation sends people to the pharmacist.
const MED_SAFE_LABEL = /^\s*(brand\s*)?(name|brand|title|medicine|product|drug|active[\s_]*ingredients?|ingredients?|generic(\s*name)?|composition|contains|strength|form|indications?|used\s*for|uses?)\s*$/i;
const MED_RISKY_LABEL = /dos|tablet|per\s*day|maximum|max|warning|caution|expir|exp\.?\s*date|direction|how\s*to|frequency|every/i;

/** Runs on the device: drops fields that are private by label, and medicine fields the model may have invented. */
export function sanitizeExtraction<T extends Extraction>(ex: T): T {
  const fields = ex.fields.filter((f) => {
    if (PRIVATE_LABEL.test(f.label)) return false;
    // On a medicine box "name" is the medicine; elsewhere it is a person.
    if (ex.doc_type !== 'medicine' && /name/i.test(f.label)) return false;
    // Medicine: allow-list. Only what identifies the medicine survives; any dose/limit/date line is dropped
    // whatever the model called it, because a wrong dose is the one mistake Parho must never make.
    if (ex.doc_type === 'medicine') return MED_SAFE_LABEL.test(f.label) && !MED_RISKY_LABEL.test(f.label + ' ' + f.value);
    return !/^(not specified|n\/a|none|unknown)$/i.test(f.value.trim());
  });
  return { ...ex, fields: ex.doc_type === 'bill' ? checkUnits(fields) : fields };
}

/** On a bill, units used = present reading − previous reading. If the model's "units" disagrees, trust the arithmetic. */
function checkUnits<F extends { label: string; value: string }>(fields: F[]): F[] {
  const num = (f?: F) => (f ? Number(f.value.replace(/[^\d]/g, '')) : NaN);
  const prev = fields.find((f) => /prev\w*\s*reading/i.test(f.label));
  const cur = fields.find((f) => /(present|current)\s*reading/i.test(f.label));
  const diff = num(cur) - num(prev);
  if (!(diff > 0 && diff < 100000)) return fields;
  const i = fields.findIndex((f) => /^\s*(current\s*)?units?\s*(consumed|used)?\s*$/i.test(f.label));
  if (i >= 0 && num(fields[i]) === diff) return fields;
  const fixed = { ...(i >= 0 ? fields[i] : prev!), label: 'Units', value: String(diff) } as F;
  return i >= 0 ? fields.map((f, k) => (k === i ? fixed : f)) : [...fields, fixed];
}

/** Builds the ONLY object that may go to the cloud for the explanation. Throws PrivacyBlocked. */
export function buildCloudPayload(ex: Extraction, language: CloudPayload['language']): CloudPayload {
  const known = ex.private_values.map((p) => p.value);
  const payload: CloudPayload = {
    doc_type: ex.doc_type,
    title: ex.title ? redact(ex.title, ex.private_values) : undefined,
    fields: sanitizeExtraction(ex).fields
      .map((f) => ({ label: f.label, value: redact(f.value, ex.private_values) }))
      .filter((f) => !/\[(NAME|CNIC|ADDRESS|ACCOUNT|PHONE|EMAIL|LONG_NUMBER)\]/.test(f.value)),
    redacted_text: redact(ex.text, ex.private_values).slice(0, 4000),
    language,
  };
  assertClean(payload, known);
  return payload;
}

/** Computed on the device: does this bill jump sharply compared to earlier months? */
export function billNote(ex: Extraction): string | undefined {
  if (ex.doc_type !== 'bill') return undefined;
  const num = (s: string) => Number(s.replace(/[^\d.]/g, ''));
  const units = ex.fields.find((f) => /units?\s*(consumed)?$/i.test(f.label.trim()) && !/prev|last|history/i.test(f.label));
  const history = ex.fields.filter((f) => /prev|last|history/i.test(f.label));
  const past = history.flatMap((f) => (f.value.match(/\d{2,4}/g) ?? []).map(Number)).filter((n) => n > 0 && n < 5000);
  if (!units || past.length === 0) return undefined;
  const cur = num(units.value);
  const avg = past.reduce((a, b) => a + b, 0) / past.length;
  if (!cur || !avg) return undefined;
  const ratio = (cur - avg) / avg;
  if (ratio > CONFIG.BILL_JUMP_RATIO)
    return `This month's units (${cur}) are ${Math.round(ratio * 100)}% higher than the average of earlier months (${Math.round(avg)}). Mention this gently and suggest checking the meter reading or asking the company; do not say it is fraud.`;
  return undefined;
}

export async function explain(payload: CloudPayload, ex: Extraction, d: Pick<ReadDeps, 'engines' | 'log'>) {
  assertClean(payload, ex.private_values.map((p) => p.value));
  const prompt = explainPrompt(payload, billNote(ex));
  const t0 = now();
  const r = await d.engines.cloud(prompt);
  d.log({
    step: 'explain',
    engine: 'cloud',
    reason: 'Urdu explanation needs the cloud model (Gemini Nano does not write Urdu) — only redacted text was sent',
    ms: now() - t0,
    bytes_out: new TextEncoder().encode(prompt).length,
  });
  return r.text.trim();
}
