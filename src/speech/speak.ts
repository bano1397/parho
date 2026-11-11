// Read aloud with the browser's built-in voices (free, on this device).
export function pickVoice(voices: { lang: string; name: string }[], lang: 'ur' | 'roman_ur' | 'en') {
  const want = lang === 'en' ? ['en-PK', 'en-IN', 'en-GB', 'en'] : ['ur-PK', 'ur-IN', 'ur'];
  for (const w of want) {
    const v = voices.find((x) => x.lang.toLowerCase().startsWith(w.toLowerCase()));
    if (v) return v;
  }
  // Roman Urdu reads acceptably with an Indian/Pakistani English voice.
  if (lang === 'roman_ur') return voices.find((x) => /^(en-IN|en-PK|hi)/i.test(x.lang)) ?? null;
  return null;
}

export function speak(text: string, lang: 'ur' | 'roman_ur' | 'en'): boolean {
  if (!('speechSynthesis' in window)) return false;
  speechSynthesis.cancel();
  const voice = pickVoice(speechSynthesis.getVoices(), lang);
  if (!voice && lang === 'ur') return false;
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice as SpeechSynthesisVoice;
  u.lang = voice?.lang ?? (lang === 'en' ? 'en-GB' : 'ur-PK');
  u.rate = 0.9;
  speechSynthesis.speak(u);
  return true;
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
