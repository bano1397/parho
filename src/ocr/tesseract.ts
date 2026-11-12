// Plain OCR on this device (not an AI model). Used only when Gemini Nano is unavailable.
import { createWorker, type Worker } from 'tesseract.js';

let worker: Promise<Worker> | null = null;
let listener: ((msg: string, p: number) => void) | null = null;

/** Receives progress updates ("loading language data", "recognizing text") for the UI. */
export function onOcrProgress(fn: typeof listener) {
  listener = fn;
}

export async function ocr(blob: Blob): Promise<string> {
  worker ??= createWorker('eng', 1, { logger: (m) => listener?.(m.status, m.progress ?? 0) });
  const w = await worker;
  const { data } = await w.recognize(blob);
  return data.text;
}
