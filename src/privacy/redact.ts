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

export function redact(text: string, privateValues: PrivateValue[] = []): string {
  let out = normaliseDigits(text);
  // Known values first (names, addresses, account numbers the reader flagged).
  const sorted = [...privateValues].sort((a, b) => b.value.length - a.value.length);
  for (const pv of sorted) {
    const re = flexibleRe(pv.value);
    if (re) out = out.replace(re, `[${pv.kind}]`);
  }
  // Then pattern-based values the reader may have missed.
  for (const { kind, re } of PATTERNS) {
    out = out.replace(new RegExp(re.source, 'g'), `[${kind}]`);
  }
  return out;
}
