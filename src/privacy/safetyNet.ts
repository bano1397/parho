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
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

// Separators people use inside numbers: space, hyphen, dot, en dash.
const SEP = '[-\\s.–]?';

export const PATTERNS: { kind: PrivateKind; re: RegExp }[] = [
  { kind: 'CNIC', re: new RegExp(`(?<!\\d)\\d{5}${SEP}\\d{7}${SEP}\\d(?!\\d)`) },
  { kind: 'PHONE', re: new RegExp(`(?<!\\d)(\\+?92${SEP}|0)3\\d{2}${SEP}\\d{7}(?!\\d)`) },
  { kind: 'EMAIL', re: /[\w.+-]+@[\w-]+\.[\w.-]+/ },
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
  return s.toLowerCase().replace(/[\s\-.,_/–]+/g, '');
}

/** Throws PrivacyBlocked if the payload contains anything private. */
export function assertClean(payload: unknown, knownValues: string[] = []): void {
  const kind = findPrivate(JSON.stringify(payload), knownValues);
  if (kind) throw new PrivacyBlocked(kind);
}
