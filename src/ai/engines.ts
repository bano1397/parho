// The ONLY file that touches firebase/ai. Everything else uses the Engines interface,
// so the router can be tested with fakes.
import { getGenerativeModel, InferenceMode, type GenerativeModel } from 'firebase/ai';
import { CONFIG } from '../config';
import { EXTRACTION_JSON_SCHEMA } from './schema';

export type NanoStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable';

export interface Engines {
  nanoStatus(): Promise<NanoStatus>;
  downloadNano(onProgress: (p: number) => void): Promise<void>;
  /** Reads the image fully on this device. Throws if Nano can't run. */
  nanoRead(prompt: string, image: { base64: string; mimeType: string }): Promise<{ text: string; source: string }>;
  /** Text-only cloud call through Firebase AI Logic. */
  cloud(prompt: string, json?: boolean): Promise<{ text: string; source: string }>;
}

type LM = { availability: (o?: object) => Promise<string> };

let nanoModel: GenerativeModel | null = null;
let cloudModel: GenerativeModel | null = null;
let cloudJsonModel: GenerativeModel | null = null;

async function firebaseAi() {
  return (await import('../firebase')).ai;
}

async function getNano() {
  if (!nanoModel) {
    nanoModel = getGenerativeModel(await firebaseAi(), {
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: {
        createOptions: {
          expectedInputs: [{ type: 'image' }, { type: 'text', languages: ['en'] }],
          expectedOutputs: [{ type: 'text', languages: ['en'] }],
        },
        promptOptions: { responseConstraint: EXTRACTION_JSON_SCHEMA },
      },
    });
  }
  return nanoModel;
}

async function getCloud(json: boolean) {
  const ai = await firebaseAi();
  if (json) {
    cloudJsonModel ??= getGenerativeModel(ai, {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: { model: CONFIG.CLOUD_MODEL, generationConfig: { responseMimeType: 'application/json' } },
    });
    return cloudJsonModel;
  }
  cloudModel ??= getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: { model: CONFIG.CLOUD_MODEL, generationConfig: { temperature: 0.3, maxOutputTokens: 600 } },
  });
  return cloudModel;
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what} timed out`)), ms))]);
}

export const realEngines: Engines = {
  async nanoStatus() {
    const LanguageModel = (globalThis as unknown as { LanguageModel?: LM }).LanguageModel;
    if (!LanguageModel) return 'unavailable';
    try {
      const a = await LanguageModel.availability({
        expectedInputs: [{ type: 'image' }, { type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      });
      return (['available', 'downloadable', 'downloading'].includes(a) ? a : 'unavailable') as NanoStatus;
    } catch {
      return 'unavailable';
    }
  },
  async downloadNano(onProgress) {
    await (await getNano()).initializeDeviceModel(onProgress);
  },
  async nanoRead(prompt, image) {
    const m = await getNano();
    const r = await withTimeout(
      m.generateContent([prompt, { type: 'inlineData', inlineData: { data: image.base64, mimeType: image.mimeType } }]),
      CONFIG.NANO_TIMEOUT_MS,
      'On-device reading',
    );
    return { text: r.response.text(), source: String(r.response.inferenceSource ?? 'on_device') };
  },
  async cloud(prompt, json = false) {
    const m = await getCloud(json);
    // Retry briefly when the cloud model is overloaded (500/503/"high demand"); other errors fail fast.
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await withTimeout(m.generateContent(prompt), CONFIG.CLOUD_TIMEOUT_MS, 'Cloud');
        return { text: r.response.text(), source: String(r.response.inferenceSource ?? 'in_cloud') };
      } catch (e) {
        const busy = /\b(500|502|503)\b|high demand|overload|unavailable/i.test(String((e as Error)?.message ?? e));
        if (!busy || attempt >= 2) throw e;
        await new Promise((res) => setTimeout(res, 1500 * 2 ** attempt));
      }
    }
  },
};
