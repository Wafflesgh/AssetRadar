/**
 * gemini.ts — One place for every Gemini call on the server. Tries the model chain from
 * geminiPolicy.ts: a model that answers 429 / quota rests (the API's retryDelay or 60 s) and the
 * next model is tried; overloaded (503) and missing models also move on. Fallback models get no
 * thinkingConfig (older models reject "thinkingLevel"). Returns null when no model answered in
 * time, so callers keep their rule-based text. Status (last model used, last error kind, resting
 * models) is exposed for /api/diagnostics — never the key.
 */
import { GoogleGenAI, type GenerateContentConfig, type GenerateContentResponse } from '@google/genai';
import { classifyGeminiError, geminiModels, ModelCooldown, quotaRestMs, type GeminiErrorKind } from './geminiPolicy.ts';

const cooldown = new ModelCooldown();
const status = {
  lastModel: null as string | null,
  lastSuccessAt: null as number | null,
  lastError: null as { kind: GeminiErrorKind; model: string; at: number } | null,
  calls: 0,
  fallbacks: 0,
};

let client: { key: string; ai: GoogleGenAI } | null = null;

export function geminiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key && key !== 'MY_GEMINI_API_KEY' ? key : null;
}

function getClient(key: string): GoogleGenAI {
  if (!client || client.key !== key) client = { key, ai: new GoogleGenAI({ apiKey: key, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } }) };
  return client.ai;
}

export interface GeminiRequest {
  contents: string;
  config?: GenerateContentConfig;
  /** Overall time budget across all models (ms). */
  timeoutMs?: number;
  /** Label for the log, e.g. "brief". */
  tag?: string;
}

export interface GeminiResult {
  text: string;
  model: string;
  response: GenerateContentResponse;
}

/** Generates with the first model that answers; null when Gemini is off, out of quota or too slow. */
export async function geminiGenerate(req: GeminiRequest): Promise<GeminiResult | null> {
  const key = geminiKey();
  if (!key) return null;
  const ai = getClient(key);
  const models = cooldown.order(geminiModels(process.env));
  const deadline = Date.now() + (req.timeoutMs ?? 12_000);
  status.calls++;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const left = deadline - Date.now();
    if (left < 500) break;
    const primary = model === geminiModels(process.env)[0];
    const config: GenerateContentConfig | undefined = req.config
      ? primary
        ? req.config
        : (({ thinkingConfig: _drop, ...rest }) => rest)(req.config)
      : undefined;
    try {
      const response = await Promise.race([
        ai.models.generateContent({ model, contents: req.contents, config }),
        new Promise<null>((r) => setTimeout(() => r(null), left)),
      ]);
      if (!response) break; // out of time — another model would be late too
      const text = response.text?.trim();
      if (!text) continue;
      status.lastModel = model;
      status.lastSuccessAt = Date.now();
      if (i > 0) status.fallbacks++;
      return { text, model, response };
    } catch (err) {
      const kind = classifyGeminiError(err);
      status.lastError = { kind, model, at: Date.now() };
      if (kind === 'quota') cooldown.rest(model, quotaRestMs(err));
      else if (kind === 'overloaded') cooldown.rest(model, 30_000);
      else if (kind === 'notFound') cooldown.rest(model, 6 * 3600_000);
      console.warn(`[Gemini${req.tag ? ` ${req.tag}` : ''}] ${model}: ${kind}${i + 1 < models.length ? ', trying the next model' : ''}`);
      if (kind === 'auth') break; // a bad key fails on every model
    }
  }
  return null;
}

/** For /api/diagnostics: which model answered last and which models are resting (no key). */
export function geminiStatus() {
  return {
    configured: Boolean(geminiKey()),
    models: geminiModels(process.env),
    lastModel: status.lastModel,
    lastSuccessAt: status.lastSuccessAt,
    lastError: status.lastError,
    resting: cooldown.snapshot(),
    calls: status.calls,
    fallbacks: status.fallbacks,
  };
}
