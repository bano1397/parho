// Scores Parho readings against hand-typed true values. All files stay in eval/private/ (gitignored).
// 1. Put photos in eval/private/, open each in Parho, click "Save this reading", rename to <photo>.json.
// 2. Copy truth.example.json to eval/private/truth.json and type the real values.
// 3. node eval/score.mjs
import { readFileSync, existsSync } from 'node:fs';
const dir = new URL('./private/', import.meta.url);
const truth = JSON.parse(readFileSync(new URL('truth.json', dir)));
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9.]/g, '');
let hit = 0, total = 0, typeOk = 0, docs = 0, leaks = 0, nano = 0, ms = [];
for (const [photo, want] of Object.entries(truth)) {
  const f = new URL(photo.replace(/\.\w+$/, '') + '.json', dir);
  if (!existsSync(f)) { console.log('missing reading for', photo); continue; }
  const got = JSON.parse(readFileSync(f)); docs++;
  if (got.source === 'nano') nano++;
  const read = got.timeline?.find((t) => t.step === 'read'); if (read) ms.push(read.ms);
  if (got.doc_type === want.doc_type) typeOk++;
  const values = got.fields.map((x) => norm(x.value));
  for (const [k, v] of Object.entries(want)) {
    if (k === 'doc_type') continue; total++;
    const ok = values.some((x) => x.includes(norm(v))); if (ok) hit++;
    else console.log(`${photo}: "${k}" expected ${v}`);
  }
  if (/\d{5}-?\d{7}-?\d/.test(JSON.stringify(got.fields))) leaks++;
}
ms.sort((a, b) => a - b);
console.log({ documents: docs, doc_type_accuracy: `${typeOk}/${docs}`, field_accuracy: `${hit}/${total} (${Math.round((100 * hit) / Math.max(total, 1))}%)`,
  read_on_device: `${nano}/${docs}`, median_read_seconds: ms.length ? (ms[ms.length >> 1] / 1000).toFixed(1) : null, cnic_in_fields: leaks });
