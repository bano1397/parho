import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { assertClean, findPrivate, PrivacyBlocked, normaliseDigits } from './safetyNet';
import { redact } from './redact';

const toUrdu = (s: string) => s.replace(/\d/g, (d) => String.fromCharCode(0x06f0 + Number(d)));

describe('safetyNet', () => {
  it.each([
    ['CNIC 35202-1234567-1', 'CNIC'],
    ['cnic 3520212345671', 'CNIC'],
    ['call 0300-1234567', 'PHONE'],
    ['+92 300 1234567', 'PHONE'],
    ['mail me a.b@x.pk', 'EMAIL'],
    ['ref 04123456789012', 'LONG_NUMBER'],
    ['img data:image/png;base64,AAAA', 'IMAGE_DATA'],
  ])('finds %s', (text, kind) => expect(findPrivate(text)).toBe(kind));

  it('finds Urdu-digit CNIC', () => expect(findPrivate(toUrdu('35202-1234567-1'))).toBe('CNIC'));

  it('leaves normal bill facts alone', () => {
    for (const t of ['Amount Rs 18,450', 'Due 24-11-2026', 'Units 412', 'Expiry 12-2027', 'Take 2 tablets every 6 hours'])
      expect(findPrivate(t)).toBeNull();
  });

  it('blocks known names regardless of spacing/case', () => {
    expect(findPrivate('Dear AHMED   khan, pay now', ['Ahmed Khan'])).toBe('KNOWN_VALUE');
  });

  it('assertClean throws PrivacyBlocked', () => {
    expect(() => assertClean({ t: '0300 1234567' })).toThrow(PrivacyBlocked);
  });

  it('normalises Arabic-Indic digits', () => expect(normaliseDigits('٣٥')).toBe('35'));
});

describe('redact', () => {
  it('removes known values and patterns', () => {
    const out = redact('Ahmed Fake Khan, CNIC 00000-0000000-0, phone 0300-0000000, House 0 Street 0', [
      { kind: 'NAME', value: 'Ahmed Fake Khan' },
      { kind: 'ADDRESS', value: 'House 0, Street 0' },
    ]);
    expect(out).toContain('[NAME]');
    expect(out).toContain('[ADDRESS]');
    expect(findPrivate(out, ['Ahmed Fake Khan'])).toBeNull();
  });
});

// Property: any text with an injected private number in any common format must be blocked,
// and redact() must always make it clean.
const digits = (n: number) => fc.array(fc.integer({ min: 0, max: 9 }), { minLength: n, maxLength: n }).map((a) => a.join(''));
const sep = fc.constantFrom('', '-', ' ');
const cnic = fc.tuple(digits(5), sep, digits(7), sep, digits(1)).map(([a, s1, b, s2, c]) => `${a}${s1}${b}${s2}${c}`);
const phone = fc.tuple(fc.constantFrom('03', '+923', '923'), digits(2), sep, digits(7)).map(([p, a, s, b]) => `${p}${a}${s}${b}`);
const email = fc.tuple(fc.stringMatching(/^[a-z]{1,8}$/), fc.stringMatching(/^[a-z]{1,8}$/)).map(([u, d]) => `${u}@${d}.pk`);
const secret = fc.oneof(cnic, phone, email, digits(12));
const filler = fc.stringMatching(/^[A-Za-z ,.:]{0,40}$/);

describe('property tests', () => {
  it('injected private values are always blocked (incl. Urdu digits)', () => {
    fc.assert(
      fc.property(filler, secret, filler, fc.boolean(), (a, s, b, urdu) => {
        const text = `${a} ${urdu ? toUrdu(s) : s} ${b}`;
        expect(() => assertClean({ text })).toThrow(PrivacyBlocked);
      }),
      { numRuns: 500 },
    );
  });

  it('redact always produces clean text', () => {
    fc.assert(
      fc.property(filler, secret, filler, (a, s, b) => {
        expect(findPrivate(redact(`${a} ${s} ${b}`))).toBeNull();
      }),
      { numRuns: 500 },
    );
  });

  it('clean filler never throws', () => {
    fc.assert(fc.property(filler, (a) => { expect(() => assertClean({ a })).not.toThrow(); }), { numRuns: 300 });
  });
});
