// Router: decides where each step runs and records why (shown to the user as a timeline).
// Rule: the PHOTO is only ever processed on this device. The cloud only gets redacted text.
import type { Engines } from './engines';
import { EXTRACT_PROMPT, STRUCTURE_FROM_TEXT_PROMPT, explainPrompt, MED_END } from './prompts';
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

const PRIVATE_LABEL = /private|address|cnic|consumer|reference|ref\.?\s*(no|#)|account|acc\.?\s*(no|#)|meter\s*(no|#|number)|phone|mobile|email|customer|cust\.?\s*(no|#|id)?\b|recipient|holder|addressee|applicant|student|patient|father|husband|s\/o|d\/o|w\/o|bill\s*of|\bid\b|pata|walid|wald|sender|^\s*(to|from)\s*$|account\s*title|iban/i;
// Gemini Nano invents doses and dates that are not printed on small or blurry boxes, so a medicine
// reading keeps only what identifies the medicine; the explanation sends people to the pharmacist.
const MED_SAFE_LABEL = /^\s*(brand\s*)?(name|brand|title|product|drug|active[\s_]*ingredients?|ingredients?|generic(\s*name)?|composition|contains|strength|form|(medicine|drug|product|dawai|dawa)\s*(ka\s*)?(name|naam)?)\s*$/i;
const MED_RISKY_LABEL = /dos|per\s*day|maximum|max|warning|caution|expir|exp\.?\s*date|direction|how\s*to|frequency|every|usage|use|indicat|for\b/i;
// Anything that looks like a schedule, amount per time, limit, date or warning in a medicine VALUE.
const MED_RISKY_VALUE = /\d\s*\+\s*\d|\b(OD|BD|BID|TDS|TID|QID|HS|PRN|SOS|QDS)\b|\bx\s*\d|\d\s*x\b|times|daily|hours?|hrs?|days?|weeks?|\/\s*kg|exceed|before|until|\d{1,2}\s*[/-]\s*\d{2,4}|child|adult|pregnan|take|tablets?\s+every|every|baar|roz|din\b|گولی|روزانہ|بار|دن|خوراک|warning|caution|do not|don't|avoid|once|twice|thrice|morning|night|subah|shaam|raat|صبح|شام|رات/i;
const STRENGTH_RE = /^\s*\d+(\.\d+)?\s*(mg|mcg|µg|g|ml|%|iu)(\s*\/\s*\d*\s*(ml|g|tab(let)?))?\s*$/i;
const FORM_RE = /^\s*(tablets?|capsules?|syrup|suspension|drops?|cream|ointment|gel|injection|sachets?|inhaler|spray)\s*$/i;

function medicineFieldOk(f: { label: string; value: string }): boolean {
  if (!MED_SAFE_LABEL.test(f.label) || MED_RISKY_LABEL.test(f.label)) return false;
  if (/strength/i.test(f.label)) return STRENGTH_RE.test(f.value);
  if (/^\s*form\s*$/i.test(f.label)) return FORM_RE.test(f.value);
  if (MED_RISKY_VALUE.test(f.value)) return false;
  // Names/ingredients may carry a strength ("Paracetamol 500 mg") but no other numbers.
  const rest = f.value.replace(/\d+(\.\d+)?\s*(mg|mcg|µg|g|ml|%|iu)\b/gi, '');
  return !/\d/.test(rest);
}

/** Runs on the device: drops fields that are private by label, and medicine fields the model may have invented. */
export function sanitizeExtraction<T extends Extraction>(ex: T): T {
  const fields = ex.fields.filter((f) => {
    if (/^(not specified|not readable|n\/a|none|unknown|-)?$/i.test(f.value.trim())) return false;
    // Medicine: allow-list. A wrong dose is the one mistake Parho must never make.
    if (ex.doc_type === 'medicine') return medicineFieldOk(f);
    if (PRIVATE_LABEL.test(f.label)) return false;
    // On a medicine box "name" is the medicine; elsewhere it is a person.
    return !/name|naam/i.test(f.label);
  });
  return { ...ex, fields: ex.doc_type === 'bill' ? checkUnits(dropImplausible(fields)) : fields };
}

const MONEY_OR_COUNT_LABEL = /amount|charges?|current\s*bill|total|units?|consumption|reading(?!\s*date)|arrears?|\btax|duty|gst|\bfee/i;
const DATE_LABEL = /date|month|period/i;
const NUMBER_ONLY = /^\s*(rs\.?|pkr)?\s*-?[\d,]+(\.\d+)?\s*(\/-|units?|kwh)?\s*$/i;
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Runs on the device: hides bill fields that are clearly misread, so a wrong value is never shown or explained.
 *  - an amount, charge or units field whose value is not a plain number ("After 27/NOV-26")
 *  - a date other than the due date that copies the due date (the model reused it)
 *  - the same month or units value repeated under a second label */
export function dropImplausible<F extends { label: string; value: string }>(fields: F[]): F[] {
  const due = fields.find((f) => /due\s*date/i.test(f.label) && !/after|before/i.test(f.label));
  const seen = new Set<string>();
  return fields.filter((f) => {
    const isMoney = MONEY_OR_COUNT_LABEL.test(f.label) && !/prev\w*\s*months?|last|history/i.test(f.label);
    if (isMoney && !(DATE_LABEL.test(f.label) && !/amount|charges?|units?|total/i.test(f.label)) && !NUMBER_ONLY.test(f.value)) return false;
    if (due && f !== due && /date/i.test(f.label) && !/due/i.test(f.label) && norm(f.value) === norm(due.value)) return false;
    const kind = /month|period/i.test(f.label) ? 'month' : /^\s*(units?|consumption)\b/i.test(f.label) ? 'units' : '';
    if (kind) {
      const key = `${kind}:${norm(f.value)}`;
      if (seen.has(key)) return false;
      seen.add(key);
    }
    return true;
  });
}

const toNum = (v?: string) => {
  if (v === undefined) return NaN;
  const m = v.replace(/[,\s]/g, '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
};
const UNITS_LABEL = /^\s*(current\s*|billed\s*|net\s*|total\s*)?units?\s*(consumed|used|billed)?\s*(\(.*\))?\s*$/i;

/** On a bill, units used = (present − previous reading) × MF. If the model's "units" disagrees, trust the arithmetic.
 *  Skips anything it cannot be sure about: gas units, decimals, unreadable multipliers. */
function checkUnits<F extends { label: string; value: string }>(fields: F[]): F[] {
  const all = fields.map((f) => `${f.label} ${f.value}`).join(' ');
  if (/gas|hm3|mmbtu|\bm3\b|cubic/i.test(all)) return fields;
  const prev = fields.find((f) => /prev\w*\s*reading/i.test(f.label));
  const cur = fields.find((f) => /(present|current)\s*reading/i.test(f.label));
  if (!prev || !cur || /\./.test(prev.value + cur.value)) return fields;
  const mfField = fields.find((f) => /^\s*(mf|multiplying\s*factor|multiplier)\s*$/i.test(f.label));
  const mf = mfField ? toNum(mfField.value) : 1;
  if (!(mf >= 1) || !Number.isInteger(mf)) return fields;
  const diff = (toNum(cur.value) - toNum(prev.value)) * mf;
  if (!(diff > 0 && diff < 100000)) return fields;
  const i = fields.findIndex((f) => UNITS_LABEL.test(f.label));
  if (i >= 0 && (/\./.test(fields[i].value) || toNum(fields[i].value) === diff)) return fields;
  const fixed = { ...(i >= 0 ? fields[i] : prev), label: 'Units', value: String(diff) } as F;
  return i >= 0 ? fields.map((f, k) => (k === i ? fixed : f)) : [...fields, fixed];
}

/** A title the cloud may see: a fixed phrase per document type, never the model's free text (it can hold a name). */
function safeTitle(ex: Extraction): string | undefined {
  const t = `${ex.title ?? ''} ${ex.fields.map((f) => f.label).join(' ')}`;
  if (ex.doc_type === 'medicine') {
    const name = ex.fields.find((f) => /name|brand|product|drug|title/i.test(f.label));
    return name ? name.value : 'Medicine';
  }
  if (ex.doc_type === 'bill') return /gas|sngpl|ssgc/i.test(t) ? 'Gas bill' : /water|wasa/i.test(t) ? 'Water bill' : /electric|bijli|lesco|iesco|fesco|mepco|gepco|pesco|hesco|sepco|qesco|tesco|k-?electric|units|kwh/i.test(t) ? 'Electricity bill' : 'Bill';
  if (ex.doc_type === 'notice') return 'Notice';
  return 'Document';
}

/** Builds the ONLY object that may go to the cloud for the explanation. Throws PrivacyBlocked. */
export function buildCloudPayload(ex: Extraction, language: CloudPayload['language']): CloudPayload {
  const known = ex.private_values.map((p) => p.value);
  const payload: CloudPayload = {
    doc_type: ex.doc_type,
    title: safeTitle(sanitizeExtraction(ex)),
    fields: sanitizeExtraction(ex).fields
      .map((f) => ({ label: redact(f.label, ex.private_values), value: redact(f.value, ex.private_values) }))
      .filter((f) => !/\[(NAME|CNIC|ADDRESS|ACCOUNT|PHONE|EMAIL|LONG_NUMBER)\]/.test(f.value)),
    // Medicine: the explanation gets only the safe fields, never the raw text with its dose lines.
    redacted_text: ex.doc_type === 'medicine' ? '' : redact(ex.text, ex.private_values).slice(0, 4000),
    language,
  };
  assertClean(payload, known);
  return payload;
}

/** Computed on the device: does this bill jump sharply compared to earlier months? */
export function billNote(ex: Extraction): string | undefined {
  if (ex.doc_type !== 'bill') return undefined;
  const fields = sanitizeExtraction(ex).fields;
  const mf = toNum(fields.find((f) => /^\s*(mf|multiplying\s*factor|multiplier)\s*$/i.test(f.label))?.value);
  if (mf > 1) return undefined; // units and history may be on different bases
  const units = fields.find((f) => UNITS_LABEL.test(f.label) && !/prev|last|history/i.test(f.label));
  const hist = fields.filter((f) => /prev|last|history/i.test(f.label) && !/reading/i.test(f.label));
  // If a full history exists, ignore a separate "previous month" field so that month is not counted twice.
  const history = hist.some((f) => /history/i.test(f.label)) ? hist.filter((f) => /history/i.test(f.label)) : hist;
  const past = history
    .flatMap((f) => (f.value.replace(/[a-z]{3,9}(?:[-'’]?\d{2}|\.?\s*[-'’]?\s*(?:19|20)\d{2})(?!\d)/gi, ' ').match(/\d{1,5}/g) ?? []).map(Number))
    .filter((n) => n > 0 && n < 5000 && !(n >= 1990 && n <= 2100));
  if (!units || past.length === 0) return undefined;
  const cur = toNum(units.value);
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
  const text = r.text.trim();
  if (payload.doc_type !== 'medicine') return text;
  // The pharmacist line is a safety rule, so it is enforced here, not left to the model.
  return /pharmacist|فارماسسٹ/i.test(text) ? text : `${text}\n${MED_END[payload.language]}`;
}
