// Redactor: replaces private values with labels like [CNIC] before the cloud sees text.
import { PATTERNS, normaliseDigits, squash } from './safetyNet';
import type { PrivateValue } from '../ai/schema';

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build a regex that matches a known value with flexible spacing, case and punctuation. */
function flexibleRe(value: string): RegExp | null {
  const chars = squash(normaliseDigits(value)).split('');
  if (chars.length < 2) return null;
  // Whole words/numbers only, so "Ali" never eats part of "Quality" or an amount.
  return new RegExp(`(?<![\\p{L}\\p{N}])${chars.map(escapeRe).join("[\\s\\-.,_/–—'’()]*")}(?![\\p{L}\\p{N}])`, 'giu');
}

// Labelled lines on bills/notices whose VALUE is private (used when no model flagged them, e.g. raw OCR).
const LABELLED: { kind: PrivateValue['kind']; re: RegExp }[] = [
  // Short labels ("To", "Name", "Patient") need a colon so "To pay: Rs 500" is never touched.
  { kind: 'NAME', re: /^(\s*(?:(?:to|name|patient|bill\s*to)\s*:|(?:consumer(?:'s)?|customer|father(?:'s)?|patient)\s*name\s*[:\-–.]?|s\/o|d\/o|w\/o|mr\.?|mrs\.?|ms\.?|نام\s*:?|بنام)\s*)(?!\s*\[)(\S.*)$/gim },
  { kind: 'NAME', re: /^(\s*dear\s+)(?!\[)([^,\n]+)/gim },
  { kind: 'ADDRESS', re: /^(\s*(?:address|addr\.?|service\s*address|postal\s*address|پتہ)\s*[:\-–.]?\s*)(?!\[)(\S.*)$/gim },
  // ID labels anywhere in a line, not only at its start: "Consumer 041234567 due", "Ref: LE-04-1234567-U".
  { kind: 'ACCOUNT', re: /(\b(?:account\s*(?:no|#|number|id)|acc\.?\s*(?:no|#)|a\/c\s*(?:no|#)?|consumer(?:\s*(?:no|id|#|number))?|reference\s*(?:no|#|number)?|ref\.?\s*(?:no|#)?|customer\s*(?:id|no|#)|cust\.?\s*(?:id|no|#)|meter\s*(?:no|#|number))\.?\s*[:\-–.]?\s*)(?!\[)((?=[\w-]*\d)[\w-]{5,}(?:\s\d{3,})*)/gim },
];

// Address words common on Pakistani paperwork; the rest of that line segment is treated as an address.
const ADDRESS_WORDS = /\b(?:house|h\.\s*no|h#|street|st\.\s*no|gali|block|sector|mohalla|muhalla|chak|ck\s*no|village|tehsil|colony|town|phase)\b\.?\s*(?:no\.?|#)?\s*[\w-]*[^,\n]{0,60}/gi;

export function redactLabelledLines(text: string): string {
  let out = text;
  for (const { kind, re } of LABELLED) out = out.replace(re, (_m, head: string, val: string) => (/^\[[A-Z_]+\]$/.test(val.trim()) ? head + val : `${head}[${kind}]`));
  return out.replace(ADDRESS_WORDS, (m) => (/^\[/.test(m) ? m : '[ADDRESS]'));
}

export function redact(text: string, privateValues: PrivateValue[] = []): string {
  let out = normaliseDigits(text);
  // Known values first (names, addresses, account numbers the reader flagged).
  const sorted = [...privateValues].sort((a, b) => b.value.length - a.value.length);
  for (const pv of sorted) {
    const re = flexibleRe(pv.value);
    if (re) out = out.replace(re, `[${pv.kind}]`);
  }
  out = redactLabelledLines(out);
  // Then pattern-based values the reader may have missed.
  for (const { kind, re } of PATTERNS) {
    out = out.replace(new RegExp(re.source, 'g'), `[${kind}]`);
  }
  return out;
}
