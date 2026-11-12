// Redactor: replaces private values with labels like [CNIC] before the cloud sees text.
import { PATTERNS, normaliseDigits, squash } from './safetyNet';
import type { PrivateValue } from '../ai/schema';

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build a regex that matches a known value with flexible spacing, case and punctuation. */
function flexibleRe(value: string): RegExp | null {
  const chars = squash(normaliseDigits(value)).split('');
  if (chars.length < 3) return null;
  return new RegExp(chars.map(escapeRe).join('[\\s\\-.,_/–]*'), 'gi');
}

// Labelled lines on bills/notices whose VALUE is private (used when no model flagged them, e.g. raw OCR).
const LABELLED: { kind: PrivateValue['kind']; re: RegExp }[] = [
  { kind: 'NAME', re: /^(\s*(?:to|name|consumer(?:'s)?\s*name|customer\s*name|patient(?:\s*name)?|father(?:'s)?\s*name|s\/o|d\/o|w\/o|mr\.?|mrs\.?|ms\.?|نام|بنام)\s*[:\-–.]?\s+)(.+)$/gim },
  { kind: 'ADDRESS', re: /^(\s*(?:address|addr\.?|service\s*address|postal\s*address|پتہ)\s*[:\-–.]?\s+)(.+)$/gim },
  { kind: 'ACCOUNT', re: /^(\s*(?:account|acc(?:ount)?\s*(?:no|#|number)|consumer\s*(?:no|id|#|number)|reference\s*(?:no|#|number)|ref\.?\s*no|customer\s*id|meter\s*(?:no|#|number))\.?\s*[:\-–.]?\s+)(.+)$/gim },
];

export function redactLabelledLines(text: string): string {
  let out = text;
  for (const { kind, re } of LABELLED) out = out.replace(re, (_m, head: string, val: string) => (/^\[[A-Z_]+\]$/.test(val.trim()) ? head + val : `${head}[${kind}]`));
  return out;
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
