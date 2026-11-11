import { useEffect, useRef, useState } from 'react';
import { realEngines, type NanoStatus } from './ai/engines';
import { readDocument, buildCloudPayload, explain, UserCancelled } from './ai/router';
import type { CloudPayload, Extraction, TimelineEntry } from './ai/schema';
import { PrivacyBlocked } from './privacy/safetyNet';
import { checkFile, prepare, InvalidPhoto } from './image/prepare';
import { ocr } from './ocr/tesseract';
import { speak, stopSpeaking } from './speech/speak';

type Lang = CloudPayload['language'];
type Phase = 'idle' | 'reading' | 'confirm-ocr' | 'read' | 'explaining' | 'explained';

const SAMPLES = [
  { file: 'sample_bill.png', label: 'Electricity bill' },
  { file: 'sample_notice.png', label: 'Gas notice' },
  { file: 'sample_medicine.png', label: 'Medicine box' },
];

const T = {
  ur: { take: 'تصویر لیں', choose: 'تصویر چنیں', send: 'کلاؤڈ کو بھیجیں', listen: 'سنائیں' },
  roman_ur: { take: 'Tasveer lein', choose: 'Tasveer chunein', send: 'Cloud ko bhejein', listen: 'Sunao' },
  en: { take: 'Take a photo', choose: 'Choose a photo', send: 'Send to cloud', listen: 'Read aloud' },
};

function friendly(e: unknown): string {
  if (e instanceof PrivacyBlocked) return `Stopped to protect you: something that looks like a ${e.kind.replace('_', ' ').toLowerCase()} was still in the text, so nothing was sent.`;
  if (e instanceof InvalidPhoto) return e.message;
  const m = String((e as Error)?.message ?? e);
  if (/429|quota|exhausted/i.test(m)) return 'The free cloud limit is used up for now. Please try again in a minute.';
  if (/503|busy|overload|timed out/i.test(m)) return 'The cloud is busy right now. Your reading is safe on this device — try “Explain” again in a moment.';
  if (/app.?check|403|permission/i.test(m)) return 'This copy of Parho is not verified with Firebase App Check, so the cloud refused. (Developer: register the debug token.)';
  if (!navigator.onLine) return 'You are offline. The reading worked on this device; the explanation will need internet.';
  return 'Something went wrong: ' + m;
}

export default function App() {
  const [nano, setNano] = useState<NanoStatus | 'checking'>('checking');
  const [dl, setDl] = useState<number | null>(null);
  const [lang, setLang] = useState<Lang>('ur');
  const [large, setLarge] = useState(false);
  const [contrast, setContrast] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [preview, setPreview] = useState<string | null>(null);
  const [ex, setEx] = useState<Extraction | null>(null);
  const [payload, setPayload] = useState<CloudPayload | null>(null);
  const [answer, setAnswer] = useState('');
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [ocrPreview, setOcrPreview] = useState('');
  const confirmRef = useRef<((ok: boolean) => void) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    realEngines.nanoStatus().then(setNano);
    const on = () => setOnline(navigator.onLine);
    addEventListener('online', on);
    addEventListener('offline', on);
    return () => { removeEventListener('online', on); removeEventListener('offline', on); };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('large', large);
    document.documentElement.classList.toggle('contrast', contrast);
  }, [large, contrast]);

  const log = (e: TimelineEntry) => setTimeline((t) => [...t, e]);

  async function download() {
    setDl(0);
    setNano('downloading');
    try {
      await realEngines.downloadNano((p) => setDl(p));
      setNano(await realEngines.nanoStatus());
    } catch (e) {
      setError(friendly(e));
      setNano(await realEngines.nanoStatus());
    } finally {
      setDl(null);
    }
  }

  function reset() {
    stopSpeaking();
    setEx(null); setPayload(null); setAnswer(''); setTimeline([]); setError(''); setOcrPreview('');
  }

  async function handle(file: Blob) {
    reset();
    try {
      checkFile(file);
      setPhase('reading');
      const img = await prepare(file);
      setPreview(img.url);
      const result = await readDocument(img, {
        engines: realEngines,
        ocr,
        log,
        confirmSend: (text) =>
          new Promise<boolean>((res) => {
            setOcrPreview(text);
            setPhase('confirm-ocr');
            confirmRef.current = res;
          }),
      });
      setEx(result);
      try {
        setPayload(buildCloudPayload(result, lang));
      } catch (e) {
        setError(friendly(e));
      }
      log({ step: 'redact', engine: 'this_device', reason: 'Names, CNIC, address, phone and account numbers removed on this device', ms: 0 });
      setPhase('read');
    } catch (e) {
      if (!(e instanceof UserCancelled)) setError(friendly(e));
      setPhase(ex ? 'read' : 'idle');
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) await handle(f);
  }

  async function onSample(file: string) {
    const r = await fetch(`/samples/${file}`);
    await handle(await r.blob());
  }

  async function doExplain() {
    if (!ex || !payload) return;
    setError('');
    setPhase('explaining');
    try {
      const p = { ...payload, language: lang };
      const text = await explain(p, ex, { engines: realEngines, log });
      setAnswer(text);
      setPhase('explained');
    } catch (e) {
      setError(friendly(e));
      setPhase('read');
    }
  }

  const t = T[lang];
  const busy = phase === 'reading' || phase === 'explaining';
  const payloadText = payload ? JSON.stringify({ ...payload, language: lang }, null, 2) : '';
  const bytes = new TextEncoder().encode(payloadText).length;

  return (
    <main>
      <header>
        <div>
          <h1>Parho <span lang="ur" className="urdu" style={{ fontSize: '0.8em' }}>پڑھو</span></h1>
          <p className="sub">Photograph a bill, notice or medicine box. Parho reads it <b>on this device</b> and explains it in simple Urdu.</p>
        </div>
        <StatusChip nano={nano} online={online} />
      </header>

      {nano === 'downloadable' && (
        <div className="card">
          <h2>Get the private on-device reader</h2>
          <p className="muted">Gemini Nano runs inside Chrome on this computer, so your photo never leaves it. One-time download.</p>
          <button onClick={download}>Download Gemini Nano</button>
        </div>
      )}
      {nano === 'downloading' && (
        <div className="card" aria-live="polite">
          <h2>Downloading Gemini Nano…</h2>
          <progress max={1} value={dl ?? undefined} aria-label="Download progress" />
          {dl !== null && <p className="muted">{Math.round(dl * 100)}%</p>}
        </div>
      )}
      {nano === 'unavailable' && (
        <div className="card">
          <p className="muted">Gemini Nano isn’t available in this browser (needs desktop Chrome 139+). Parho will read the text with on-device OCR instead, then <b>ask you</b> before sending the redacted text to the cloud.</p>
        </div>
      )}

      <section className="card" aria-labelledby="cap">
        <h2 id="cap">1. Your paper</h2>
        <div className="row">
          <button className="big" onClick={() => camRef.current?.click()} disabled={busy}>📷 {t.take}</button>
          <button className="big ghost" onClick={() => fileRef.current?.click()} disabled={busy}>🖼️ {t.choose}</button>
        </div>
        <input ref={camRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={onPick} aria-label={t.take} />
        <input ref={fileRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={onPick} aria-label={t.choose} />
        <p className="muted" style={{ marginTop: 14 }}>Or try a sample (fake data):</p>
        <div className="samples">
          {SAMPLES.map((s) => (
            <button key={s.file} onClick={() => onSample(s.file)} disabled={busy}>
              <img src={`/samples/${s.file}`} alt="" />
              {s.label}
            </button>
          ))}
        </div>
      </section>

      {phase === 'reading' && <div className="card" aria-live="polite"><h2>Reading on this device…</h2><progress /></div>}

      {phase === 'confirm-ocr' && (
        <div className="card">
          <h2>Gemini Nano isn’t available — send redacted text?</h2>
          <p className="muted">We read the text on this device. Private details are replaced. Only this text would go to Gemini in the cloud — never the photo:</p>
          <pre className="payload">{ocrPreview}</pre>
          <div className="row">
            <button onClick={() => { setPhase('reading'); confirmRef.current?.(true); }}>{t.send}</button>
            <button className="ghost" onClick={() => { confirmRef.current?.(false); setPhase('idle'); }}>Cancel</button>
          </div>
        </div>
      )}

      {error && (
        <div className="card error" role="alert">
          <h2>Heads up</h2>
          <p>{error}</p>
        </div>
      )}

      {ex && (
        <section className="card" aria-labelledby="res">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 id="res">2. What it says {ex.title ? `— ${ex.title}` : ''}</h2>
            {ex.source === 'nano'
              ? <span className="chip device">🔒 Read on this device</span>
              : <span className="chip cloud">☁️ Organised in cloud from redacted text</span>}
          </div>
          {preview && <img className="preview" src={preview} alt="Your photo, blurred for privacy" />}
          <div className="fields" style={{ marginTop: 12 }}>
            {ex.fields.map((f, i) => (
              <div key={i} className={`field ${f.confidence === 'low' ? 'low' : ''}`}>
                <div className="l">{f.label}{f.confidence === 'low' && ' · please check'}</div>
                <div className="v">{f.value}</div>
              </div>
            ))}
            {ex.fields.length === 0 && <p className="muted">No key facts found. Try a clearer, flatter photo.</p>}
          </div>
          <p className="muted">{ex.private_values.length} private detail(s) found and kept on this device.</p>
        </section>
      )}

      {ex && payload && (
        <section className="card" aria-labelledby="cloud">
          <h2 id="cloud">3. What the cloud will see</h2>
          <div className="row">
            <label>Language
              <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
                <option value="ur">اردو (Urdu)</option>
                <option value="roman_ur">Roman Urdu</option>
                <option value="en">English</option>
              </select>
            </label>
            <span className="muted">{bytes} bytes · text only · no photo</span>
          </div>
          <pre className="payload">{payloadText}</pre>
          <button onClick={doExplain} disabled={busy || !online}>☁️ {t.send} &amp; explain</button>
          {!online && <p className="muted">Offline — connect to the internet to get the explanation.</p>}
        </section>
      )}

      {phase === 'explaining' && <div className="card" aria-live="polite"><h2>Asking Gemini in the cloud…</h2><progress /></div>}

      {answer && (
        <section className="card" aria-labelledby="exp">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 id="exp">4. In simple words</h2>
            <span className="chip cloud">☁️ Cloud Gemini</span>
          </div>
          <p className={lang === 'ur' ? 'urdu' : ''} lang={lang === 'ur' ? 'ur' : undefined} aria-live="polite" style={{ whiteSpace: 'pre-wrap' }}>{answer}</p>
          <div className="row">
            <button onClick={() => { if (!speak(answer, lang)) setError('No Urdu voice is installed on this device. Try Roman Urdu or English.'); }}>🔊 {t.listen}</button>
            <button className="ghost" onClick={stopSpeaking}>Stop</button>
          </div>
          <p className="muted">Parho explains what is printed. It is not medical, legal or financial advice.</p>
        </section>
      )}

      {timeline.length > 0 && (
        <section className="card" aria-labelledby="tl">
          <h2 id="tl">How Parho handled this</h2>
          <ol className="timeline">
            {timeline.map((e, i) => (
              <li key={i} className={e.engine}>
                <b>{e.step}</b> · {label(e.engine)} {e.ms > 0 && <span className="muted">· {(e.ms / 1000).toFixed(1)} s</span>}
                {e.bytes_out !== undefined && <span className="muted"> · {e.bytes_out} bytes sent</span>}
                <div className="muted">{e.reason}</div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="card">
        <h2>Settings</h2>
        <div className="row">
          <label><input type="checkbox" checked={large} onChange={(e) => setLarge(e.target.checked)} /> Large text</label>
          <label><input type="checkbox" checked={contrast} onChange={(e) => setContrast(e.target.checked)} /> High contrast</label>
        </div>
      </section>

      <footer>
        Hybrid AI with Firebase AI Logic: Gemini Nano on-device for reading, Gemini in the cloud for Urdu. Photos are never uploaded or stored.
        Samples contain fake data. Not advice.
      </footer>
    </main>
  );
}

function label(e: TimelineEntry['engine']) {
  return { nano: '🔒 Gemini Nano (this device)', local_ocr: '🔒 OCR (this device)', this_device: '🔒 this device', cloud: '☁️ Gemini cloud' }[e];
}

function StatusChip({ nano, online }: { nano: NanoStatus | 'checking'; online: boolean }) {
  const map: Record<string, [string, string]> = {
    checking: ['', 'Checking on-device AI…'],
    available: ['device', '🔒 On-device AI ready'],
    downloadable: ['warn', '⬇️ On-device AI: download needed'],
    downloading: ['warn', '⬇️ Downloading on-device AI'],
    unavailable: ['warn', 'On-device AI unavailable'],
  };
  const [cls, text] = map[nano];
  return (
    <div className="row" role="status">
      <span className={`chip ${cls}`}>{text}</span>
      <span className={`chip ${online ? 'cloud' : 'warn'}`}>{online ? '☁️ Online' : '📴 Offline'}</span>
    </div>
  );
}
