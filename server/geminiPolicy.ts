/**
 * geminiPolicy.ts — Pure rules for the Gemini model fallback: which models to try (env
 * GEMINI_MODELS overrides the default chain), how to classify an error (quota / overloaded / model
 * missing / bad request / other), how long a model rests after a quota error (the API's
 * "retryDelay" when given), and a small cooldown table so a model that answered 429 is skipped
 * until it may be used again. No network here; server/gemini.ts does the calls.
 */

export const DEFAULT_GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'];

/** The model chain: GEMINI_MODELS="a,b,c" when set, otherwise the default chain. */
export function geminiModels(env: Record<string, string | undefined>): string[] {
  const list = (env.GEMINI_MODELS ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter((m) => /^[a-z0-9][a-z0-9.\-]{2,60}$/i.test(m));
  return list.length ? [...new Set(list)] : DEFAULT_GEMINI_MODELS;
}

export type GeminiErrorKind = 'quota' | 'overloaded' | 'notFound' | 'badRequest' | 'auth' | 'other';

function statusOf(err: unknown): number | null {
  const e = err as { status?: unknown; code?: unknown; error?: { code?: unknown } } | null;
  for (const v of [e?.status, e?.code, e?.error?.code]) {
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{3}$/.test(v) ? Number(v) : null;
    if (n) return n;
  }
  const m = String((err as { message?: unknown })?.message ?? err ?? '').match(/\b(4\d\d|5\d\d)\b/);
  return m ? Number(m[1]) : null;
}

/** What went wrong, so the caller knows whether trying the next model makes sense. */
export function classifyGeminiError(err: unknown): GeminiErrorKind {
  const text = String((err as { message?: unknown })?.message ?? err ?? '');
  const status = statusOf(err);
  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(text)) return 'quota';
  if (status === 503 || status === 500 || /UNAVAILABLE|overloaded/i.test(text)) return 'overloaded';
  if (status === 404 || /NOT_FOUND|is not found|not supported for generateContent/i.test(text)) return 'notFound';
  if (status === 401 || status === 403 || /API key not valid|PERMISSION_DENIED|UNAUTHENTICATED/i.test(text)) return 'auth';
  if (status === 400 || /INVALID_ARGUMENT/i.test(text)) return 'badRequest';
  return 'other';
}

/** Rest time after a quota error: the API's retryDelay ("37s") when present, else 60 s; max 1 h. */
export function quotaRestMs(err: unknown): number {
  const text = String((err as { message?: unknown })?.message ?? err ?? '');
  const m = text.match(/retry(?:Delay|\s+in)["':\s]*([\d.]+)\s*(ms|s)\b/i);
  if (m) {
    const ms = m[2].toLowerCase() === 'ms' ? Number(m[1]) : Number(m[1]) * 1000;
    if (Number.isFinite(ms) && ms > 0) return Math.min(3600_000, Math.max(5000, Math.round(ms)));
  }
  // A daily quota ("PerDay") does not come back in a minute
  if (/per ?day/i.test(text)) return 3600_000;
  return 60_000;
}

/** Remembers until when each model is resting after a quota / overload error. */
export class ModelCooldown {
  private until = new Map<string, number>();

  rest(model: string, ms: number, now = Date.now()): void {
    this.until.set(model, now + ms);
  }

  ready(model: string, now = Date.now()): boolean {
    return (this.until.get(model) ?? 0) <= now;
  }

  /** Models in order, skipping resting ones (empty when all rest → the caller uses its non-AI text). */
  order(models: string[], now = Date.now()): string[] {
    return models.filter((m) => this.ready(m, now));
  }

  snapshot(now = Date.now()): Array<{ model: string; restingSec: number }> {
    return [...this.until]
      .filter(([, t]) => t > now)
      .map(([model, t]) => ({ model, restingSec: Math.round((t - now) / 1000) }));
  }
}
