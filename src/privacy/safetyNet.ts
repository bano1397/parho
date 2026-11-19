// Safety_Net: the last check before anything goes to the cloud.
// If any private-looking value survives redaction, the send is BLOCKED.

export type PrivateKind = 'CNIC' | 'PHONE' | 'EMAIL' | 'LONG_NUMBER' | 'IMAGE_DATA' | 'KNOWN_VALUE';

export class PrivacyBlocked extends Error {
  kind: PrivateKind;
  constructor(kind: PrivateKind) {
    super(`Privacy check blocked the cloud request (${kind})`);
    this.kind = kind;
    this.name = 'PrivacyBlocked';
  }
}

/** Convert Urdu (۰-۹) and Arabic-Indic (٠-٩) digits to 0-9. */
export function normaliseDigits(s: string): string {
  return s
    .normalize('NFKC') // fullwidth ０-９ → 0-9
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '') // zero-width characters
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

// Separators people use inside numbers: spaces around one hyphen, dot, slash or dash.
const SEP = '\\s*[-.–—/]?\\s*';

export const PATTERNS: { kind: PrivateKind; re: RegExp }[] = [
  { kind: 'CNIC', re: new RegExp(`(?<!\\d)\\d{5}${SEP}\\d{7}${SEP}\\d(?!\\d)`) },
  { kind: 'CNIC', re: /(?<!\d)\d{4}\s\d{4}\s\d{4}\s\d(?!\d)/ },
  { kind: 'PHONE', re: new RegExp(`(?<!\\d)(\\+\\s*92${SEP}|0092${SEP}|92${SEP}|\\(?0)\\s*3\\d{2}\\)?${SEP}\\d{3}${SEP}\\d{4}(?!\\d)`) },
  { kind: 'PHONE', re: /(?<![\d-])0\d{2,3}\s*-\s*\d{7,8}(?!\d)/ }, // landline 042-35761234
  // CNIC with misplaced hyphens or OCR-spaced digits: any 13 digits joined by single spaces/hyphens.
  { kind: 'CNIC', re: /(?<![\d-])(?:\d[\s-]?){12}\d(?![\d-])/ },
  { kind: 'EMAIL', re: /\b[\w.+-]+\s+at\s+[\w-]+\s+dot\s+(?:com|pk|net|org)\b/i },
  { kind: 'LONG_NUMBER', re: /\bPK\s?\d{2}\s?[A-Z]{4}(?:\s?\d){16}\b/i }, // IBAN
  { kind: 'EMAIL', re: /[\w.+-]+\s*(@|\[at\]|\(at\))\s*[\w-]+\s*\.\s*[a-z]{2,}(\.[a-z]{2,})*/i },
  // Account/reference IDs mixing letters and 7+ digits, e.g. "LE-04-1234567-U".
  { kind: 'LONG_NUMBER', re: /(?<![\w-])(?=[\w-]*[a-z])(?=(?:[\w-]*?\d){7})[a-z0-9]+(?:-[a-z0-9]+)+(?![\w-])/i },
  { kind: 'LONG_NUMBER', re: /(?<!\d)\d{10,}(?!\d)/ },
];

const IMAGE_RE = /data:image|[A-Za-z0-9+/=]{200,}/;

/** Returns the first private kind found, or null if the text looks clean. */
export function findPrivate(text: string, knownValues: string[] = []): PrivateKind | null {
  if (IMAGE_RE.test(text)) return 'IMAGE_DATA';
  const t = normaliseDigits(text);
  for (const { kind, re } of PATTERNS) if (re.test(t)) return kind;
  const flat = squash(t);
  for (const v of knownValues) {
    const sv = squash(normaliseDigits(v));
    if (sv.length >= 3 && flat.includes(sv)) return 'KNOWN_VALUE';
  }
  return null;
}

/** Lower-case and remove spaces/punctuation so "Ahmed  KHAN" matches "ahmed khan". */
export function squash(s: string): string {
  return s.toLowerCase().replace(/[\s\-.,_/–—'’()\u200B-\u200D]+/g, '');
}

/** Throws PrivacyBlocked if the payload contains anything private. */
export function assertClean(payload: unknown, knownValues: string[] = []): void {
  const kind = findPrivate(JSON.stringify(payload), knownValues);
  if (kind) throw new PrivacyBlocked(kind);
}
