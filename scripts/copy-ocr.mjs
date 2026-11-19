// Copies the Tesseract OCR worker and core from node_modules into public/tesseract,
// so the OCR fallback is served from our own site and never depends on a CDN.
import { copyFileSync, mkdirSync } from 'node:fs';
const out = 'public/tesseract';
mkdirSync(out, { recursive: true });
copyFileSync('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`);
for (const v of ['lstm', 'simd-lstm', 'relaxedsimd-lstm'])
  copyFileSync(`node_modules/tesseract.js-core/tesseract-core-${v}.wasm.js`, `${out}/tesseract-core-${v}.wasm.js`);
