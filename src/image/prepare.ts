import { CONFIG } from '../config';

export class InvalidPhoto extends Error {}

export const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

export function checkFile(f: { type: string; size: number }): void {
  if (!ACCEPTED.includes(f.type)) throw new InvalidPhoto('Please choose a JPG or PNG photo.');
  if (f.size > CONFIG.MAX_UPLOAD_BYTES) throw new InvalidPhoto('This photo is larger than 15 MB.');
  if (f.size === 0) throw new InvalidPhoto('This file is empty.');
}

export function scaledSize(w: number, h: number, max = CONFIG.MAX_SIDE_PX) {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * s), h: Math.round(h * s) };
}

/** Decode (respecting EXIF rotation), shrink to ≤1600 px, re-encode as JPEG. Runs on this device. */
export async function prepare(file: Blob): Promise<{ blob: Blob; base64: string; mimeType: string; url: string }> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { w, h } = scaledSize(bmp.width, bmp.height);
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { blob, base64: btoa(bin), mimeType: 'image/jpeg', url: URL.createObjectURL(blob) };
}
