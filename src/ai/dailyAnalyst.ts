/**
 * dailyAnalyst.ts — The daily analysis the server stores every day (pure parts). A snapshot keeps
 * each asset's price, 24-hour change and investment sentiment per horizon; the report keeps the
 * facts drawn from it (movers, sentiment changes since the previous snapshot, the strongest and
 * weakest scores, what the AI Advisor favors, how each method has scored so far, open retail SBN
 * offers), data-quality checks with a status, an optional Gemini narrative per language written
 * only from those facts, and notes added by an outside agent (e.g. Argon in Google AI Studio).
 * Stored per day so it can be read, compared and re-analyzed later.
 */
import type { MethodSummary, TraceHorizon, TraceLabel } from './recommendationTrace.ts';

export interface SnapAsset {
  /** Price (asset currency). */
  p: number;
  /** 24-hour change in %. */
  c24: number | null;
  /** Sentiment per horizon: [label, score 0–100]. */
  s?: Partial<Record<TraceHorizon, [TraceLabel, number]>>;
}

export interface DailySnapshot {
  version: 1;
  date: string;
  takenAt: number;
  assets: Record<string, SnapAsset>;
}

export function parseSnapshot(raw: unknown): DailySnapshot | null {
  const s = raw as Partial<DailySnapshot>;
  if (!s || s.version !== 1 || typeof s.date !== 'string' || !s.assets || typeof s.assets !== 'object') return null;
  return s as DailySnapshot;
}

export interface Mover {
  symbol: string;
  c24: number;
}

export interface SentimentChange {
  symbol: string;
  horizon: TraceHorizon;
  from: TraceLabel;
  to: TraceLabel;
  /** Score change in points. */
  delta: number;
}

export interface ScoreRow {
  symbol: string;
  label: TraceLabel;
  score: number;
}

export interface AnalystFacts {
  date: string;
  previousDate: string | null;
  assetsCovered: number;
  sentimentCovered: number;
  movers: { up: Mover[]; down: Mover[] };
  sentimentChanges: SentimentChange[];
  strongest: Record<TraceHorizon, ScoreRow[]>;
  weakest: Record<TraceHorizon, ScoreRow[]>;
  /** AI Advisor "favorable" symbols for the moderate profile, per horizon in trading days. */
  advisorFavorable: Record<string, string[]>;
  methods: MethodSummary[];
  sbnOpen: Array<{ code: string; couponPct: number | null; offerEnd: string | null }>;
  macro: { biRate: number | null; usdIdr: number | null };
}

export type CheckStatus = 'ok' | 'warn' | 'fail';
export interface QualityCheck {
  id: 'prices' | 'stale' | 'sentiment' | 'sources' | 'advisor' | 'forward' | 'database' | 'gemini';
  status: CheckStatus;
  /** Values for the message (counts, lists). */
  params: Record<string, string | number>;
}

export interface AgentNote {
  at: number;
  author: string;
  text: string;
}

export interface AnalystReport {
  version: 1;
  date: string;
  createdAt: number;
  facts: AnalystFacts;
  quality: QualityCheck[];
  /** Gemini narrative per language (absent without a key, out of quota, or on failure). */
  ai: { en?: string; id?: string; model?: string | null };
  notes: AgentNote[];
}

export function parseReport(raw: unknown): AnalystReport | null {
  const r = raw as Partial<AnalystReport>;
  if (!r || r.version !== 1 || typeof r.date !== 'string' || !r.facts) return null;
  return { ...r, quality: Array.isArray(r.quality) ? r.quality : [], ai: r.ai ?? {}, notes: Array.isArray(r.notes) ? r.notes : [] } as AnalystReport;
}

const HORIZONS: TraceHorizon[] = ['short', 'medium', 'long'];

/** Biggest 24-hour moves (both directions). */
export function topMovers(snap: DailySnapshot, n = 5): { up: Mover[]; down: Mover[] } {
  const rows = Object.entries(snap.assets)
    .filter(([, a]) => a.c24 !== null && Number.isFinite(a.c24))
    .map(([symbol, a]) => ({ symbol, c24: a.c24 as number }));
  return {
    up: rows.filter((r) => r.c24 > 0).sort((a, b) => b.c24 - a.c24).slice(0, n),
    down: rows.filter((r) => r.c24 < 0).sort((a, b) => a.c24 - b.c24).slice(0, n),
  };
}

/** Sentiment labels that changed since the previous snapshot, largest score change first. */
export function sentimentChanges(prev: DailySnapshot | null, cur: DailySnapshot, limit = 20): SentimentChange[] {
  if (!prev) return [];
  const out: SentimentChange[] = [];
  for (const [symbol, a] of Object.entries(cur.assets)) {
    const b = prev.assets[symbol];
    if (!a.s || !b?.s) continue;
    for (const h of HORIZONS) {
      const now = a.s[h];
      const before = b.s[h];
      if (now && before && now[0] !== before[0]) out.push({ symbol, horizon: h, from: before[0], to: now[0], delta: now[1] - before[1] });
    }
  }
  return out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, limit);
}

/** Highest and lowest scores per horizon. */
export function extremes(snap: DailySnapshot, n = 5): { strongest: AnalystFacts['strongest']; weakest: AnalystFacts['weakest'] } {
  const strongest = {} as AnalystFacts['strongest'];
  const weakest = {} as AnalystFacts['weakest'];
  for (const h of HORIZONS) {
    const rows = Object.entries(snap.assets)
      .map(([symbol, a]) => (a.s?.[h] ? { symbol, label: a.s[h]![0], score: a.s[h]![1] } : null))
      .filter((r): r is ScoreRow => r !== null);
    strongest[h] = [...rows].sort((a, b) => b.score - a.score).slice(0, n);
    weakest[h] = [...rows].sort((a, b) => a.score - b.score).slice(0, n);
  }
  return { strongest, weakest };
}

export interface QualityInput {
  assetsTotal: number;
  pricesMissing: string[];
  pricesStale: string[];
  sentimentTried: number;
  sentimentFailed: string[];
  sourcesProblem: string[];
  advisorAssets: number;
  advisorExpected: number;
  forwardLastRun: string | null;
  today: string;
  database: boolean;
  gemini: { configured: boolean; lastError: string | null };
}

const list = (xs: string[], n = 8) => (xs.length > n ? `${xs.slice(0, n).join(', ')} +${xs.length - n}` : xs.join(', '));

/** Data checks with a status; the page words them in the reader's language. */
export function qualityChecks(q: QualityInput): QualityCheck[] {
  const daysSince = (d: string | null) => (d ? Math.round((Date.parse(q.today) - Date.parse(d)) / 86_400_000) : null);
  const fwd = daysSince(q.forwardLastRun);
  return [
    {
      id: 'prices',
      status: q.pricesMissing.length === 0 ? 'ok' : q.pricesMissing.length > q.assetsTotal * 0.1 ? 'fail' : 'warn',
      params: { n: q.pricesMissing.length, total: q.assetsTotal, list: list(q.pricesMissing) },
    },
    { id: 'stale', status: q.pricesStale.length ? 'warn' : 'ok', params: { n: q.pricesStale.length, list: list(q.pricesStale) } },
    {
      id: 'sentiment',
      status: q.sentimentFailed.length === 0 ? 'ok' : q.sentimentFailed.length > q.sentimentTried * 0.2 ? 'fail' : 'warn',
      params: { n: q.sentimentFailed.length, total: q.sentimentTried, list: list(q.sentimentFailed) },
    },
    { id: 'sources', status: q.sourcesProblem.length ? 'warn' : 'ok', params: { n: q.sourcesProblem.length, list: list(q.sourcesProblem) } },
    {
      id: 'advisor',
      status: q.advisorAssets === 0 ? 'fail' : q.advisorAssets < q.advisorExpected * 0.8 ? 'warn' : 'ok',
      params: { n: q.advisorAssets, total: q.advisorExpected },
    },
    { id: 'forward', status: fwd === null ? 'warn' : fwd > 4 ? 'warn' : 'ok', params: { date: q.forwardLastRun ?? '—', days: fwd ?? '—' } },
    { id: 'database', status: q.database ? 'ok' : 'warn', params: {} },
    {
      id: 'gemini',
      status: !q.gemini.configured ? 'warn' : q.gemini.lastError === 'quota' || q.gemini.lastError === 'auth' ? 'warn' : 'ok',
      params: { error: !q.gemini.configured ? 'noKey' : q.gemini.lastError === 'quota' || q.gemini.lastError === 'auth' ? q.gemini.lastError : '' },
    },
  ];
}

/** Prompt for the Gemini narrative: facts only, no advice, ends with the disclaimer. */
export function analystPrompt(facts: AnalystFacts, quality: QualityCheck[], names: Record<string, string>, lang: 'en' | 'id'): string {
  const language = lang === 'id' ? 'Indonesian (Bahasa Indonesia)' : 'English';
  const disclaimer = lang === 'id' ? 'Ini analisis otomatis untuk informasi dan edukasi, bukan nasihat investasi.' : 'This is an automated analysis for information and education, not investment advice.';
  return `You are the daily data analyst of AssetRadar, a personal market-tracking app for an Indonesian investor. Using ONLY the JSON facts below, write 6-9 plain ${language} sentences:
1) the overall mood and the most notable moves; 2) sentiment labels that changed since the previous day and what that suggests about momentum (no predictions of returns); 3) what the AI Advisor screen currently favors; 4) how each method has scored so far — quote hit rate vs baseline only for methods with at least 30 scored results, otherwise say there are not enough results yet; flag a method whose edge is zero or negative with 30+ results as "needs review"; 5) data-quality problems (checks with status warn/fail) and what to fix; 6) if an SBN retail offer is open, mention it neutrally.
Never give buy/sell advice, never promise returns. Use asset names from NAMES. End with: "${disclaimer}"
NAMES: ${JSON.stringify(names)}
FACTS: ${JSON.stringify(facts)}
CHECKS: ${JSON.stringify(quality)}`;
}

/** Cleans an agent note: plain text only, limited length. */
export function cleanNote(author: unknown, text: unknown): AgentNote | null {
  if (typeof text !== 'string') return null;
  const t = text.replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, 4000);
  if (t.length < 3) return null;
  const a = typeof author === 'string' && /^[\w .()-]{1,40}$/.test(author.trim()) ? author.trim() : 'agent';
  return { at: Date.now(), author: a, text: t };
}

/** Dates (YYYY-MM-DD) from stored keys like "analysis:2026-10-20", newest first. */
export function datesFromKeys(keys: string[], prefix: string): string[] {
  return keys
    .map((k) => k.slice(prefix.length))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
    .reverse();
}
