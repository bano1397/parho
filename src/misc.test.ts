import { describe, it, expect } from 'vitest';
import { checkFile, scaledSize, InvalidPhoto } from './image/prepare';
import { pickVoice } from './speech/speak';
import { parseExtraction } from './ai/schema';

describe('prepare', () => {
  it('rejects wrong type, too big, empty', () => {
    expect(() => checkFile({ type: 'application/pdf', size: 10 })).toThrow(InvalidPhoto);
    expect(() => checkFile({ type: 'image/png', size: 16 * 1024 * 1024 })).toThrow(InvalidPhoto);
    expect(() => checkFile({ type: 'image/png', size: 0 })).toThrow(InvalidPhoto);
    expect(() => checkFile({ type: 'image/jpeg', size: 1000 })).not.toThrow();
  });
  it('scales the long side to 1600', () => {
    expect(scaledSize(4000, 3000)).toEqual({ w: 1600, h: 1200 });
    expect(scaledSize(800, 600)).toEqual({ w: 800, h: 600 });
  });
});

describe('speak', () => {
  const voices = [{ lang: 'en-US', name: 'a' }, { lang: 'en-IN', name: 'b' }, { lang: 'ur-PK', name: 'c' }];
  it('prefers ur-PK for Urdu', () => expect(pickVoice(voices, 'ur')?.name).toBe('c'));
  it('falls back to en-IN for Roman Urdu', () => expect(pickVoice(voices.slice(0, 2), 'roman_ur')?.name).toBe('b'));
  it('returns null when no Urdu voice', () => expect(pickVoice(voices.slice(0, 2), 'ur')).toBeNull());
});

describe('schema', () => {
  it('accepts fenced JSON and fills defaults', () => {
    const ex = parseExtraction('```json\n{"doc_type":"medicine"}\n```');
    expect(ex.fields).toEqual([]);
  });
  it('rejects junk', () => expect(() => parseExtraction('hello')).toThrow());
});
