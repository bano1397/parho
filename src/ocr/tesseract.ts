// Plain OCR on this device (not an AI model). Used only when Gemini Nano is unavailable.
import { createWorker, type Worker } from 'tesseract.js';

let worker: Promise<Worker> | null = null;

export async function ocr(blob: Blob): Promise<string> {
  worker ??= createWorker('eng');
  const w = await worker;
  const { data } = await w.recognize(blob);
  return data.text;
}
