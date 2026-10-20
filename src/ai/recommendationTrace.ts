/**
 * recommendationTrace.ts — The app's memory of what it said and what happened next. Each day the
 * server saves every asset's investment sentiment per horizon (short / medium / long) with the
 * price; when the horizon has passed, the real daily closes decide whether the call was right
 * (Bullish → the price rose, Bearish → it fell; Neutral is recorded but not scored). Together
 * with the AI Advisor's forward test (forwardTest.ts) this gives, per asset, the history of
 * calls ("on 20 Oct 2026 the medium-term sentiment was Bullish at Rp9,000; 3 months later
 * +4.2%, correct") and, over all assets, the hit rate of each method against the base rate —
 * to judge whether a method works or needs updating. Missed days are never filled in.
 */
import type { DailyClose, ForwardLog, VerdictSnapshot } from './forwardTest.ts';

export type TraceHorizon = 'short' | 'medium' | 'long';
export type TraceLabel = 'Strong Bearish' | 'Bearish' | 'Neutral' | 'Bullish' | 'Strong Bullish';

/** Trading bars after which a sentiment call is scored (crypto trades every day). */
export const TRACE_BARS: Record<TraceHorizon, { default: number; crypto: number }> = {
  short: { default: 10, crypto: 7 },
  medium: { default: 63, crypto: 42 },
  long: { default: 252, crypto: 365 },
};

export interface SentimentCall {
  date: string;
  symbol: string;
  horizon: TraceHorizon;
  label: TraceLabel;
  score: number;
  price: number;
  /** Bars until scoring (fixed when saved). */
  bars: number;
  outcome?: { dueDate: string; ret: number; up: boolean };
}

export interface SentimentLog {
  version: 1;
  calls: SentimentCall[];
}

export const MAX_CALLS_PER_MONTH = 20_000;

export function emptySentimentLog(): SentimentLog {
  return { version: 1, calls: [] };
}

export function parseSentimentLog(raw: unknown): SentimentLog | null {
  const l = raw as Partial<SentimentLog>;
  if (!l || l.version !== 1 || !Array.isArray(l.calls)) return null;
  return {
    version: 1,
    calls: l.calls.filter(
      (c): c is SentimentCall =>
        Boolean(c) && typeof c.date === 'string' && typeof c.symbol === 'string' && typeof c.label === 'string' && typeof c.price === 'number' && typeof c.bars === 'number'
    ),
  };
}

/** Adds one day's calls unless that day was already saved for the symbol. Same object when nothing changed. */
export function recordSentimentCalls(
  log: SentimentLog,
  date: string,
  rows: Array<{ symbol: string; crypto: boolean; price: number | null | undefined; horizons: Partial<Record<TraceHorizon, { label: TraceLabel; score: number | null } | null>> }>
): SentimentLog {
  const have = new Set(log.calls.filter((c) => c.date === date).map((c) => `${c.symbol}|${c.horizon}`));
  const fresh: SentimentCall[] = [];
  for (const r of rows) {
    if (!(typeof r.price === 'number' && Number.isFinite(r.price) && r.price > 0)) continue;
    for (const h of ['short', 'medium', 'long'] as TraceHorizon[]) {
      const v = r.horizons[h];
      if (!v || v.score === null || !Number.isFinite(v.score) || have.has(`${r.symbol}|${h}`)) continue;
      fresh.push({ date, symbol: r.symbol, horizon: h, label: v.label, score: Math.round(v.score), price: r.price, bars: TRACE_BARS[h][r.crypto ? 'crypto' : 'default'] });
    }
  }
  if (!fresh.length) return log;
  return { version: 1, calls: [...log.calls, ...fresh].slice(-MAX_CALLS_PER_MONTH) };
}

/** Index of the last close on or before `date`, or -1. */
function closeIndex(bars: DailyClose[], date: string): number {
  let i = -1;
  for (let k = 0; k < bars.length; k++) {
    if (bars[k].date <= date) i = k;
    else break;
  }
  return i;
}

/** Scores calls whose horizon has passed (close on the call day vs `bars` closes later). */
export function evaluateSentimentCalls(log: SentimentLog, history: Map<string, DailyClose[]>): SentimentLog {
  let changed = false;
  const calls = log.calls.map((c) => {
    if (c.outcome) return c;
    const bars = history.get(c.symbol);
    if (!bars?.length) return c;
    const i = closeIndex(bars, c.date);
    const due = i >= 0 ? bars[i + c.bars] : undefined;
    if (!due || bars[i].close <= 0) return c;
    changed = true;
    const ret = due.close / bars[i].close - 1;
    return { ...c, outcome: { dueDate: due.date, ret, up: ret > 0 } };
  });
  return changed ? { version: 1, calls } : log;
}

/** Symbols with calls old enough to be scored (≈ 7/5 calendar days per trading bar). */
export function pendingCallSymbols(log: SentimentLog, today: string): string[] {
  const t = Date.parse(today);
  return [...new Set(log.calls.filter((c) => !c.outcome && t - Date.parse(c.date) >= Math.floor((c.bars * 7) / 5) * 86_400_000).map((c) => c.symbol))];
}

export const direction = (label: string): 1 | -1 | 0 => (/Bullish/.test(label) ? 1 : /Bearish/.test(label) ? -1 : 0);

/** Whether a scored call was right: bullish and up, or bearish and down; neutral → null. */
export function callHit(label: string, up: boolean): boolean | null {
  const d = direction(label);
  return d === 0 ? null : d > 0 ? up : !up;
}

export interface MethodRow {
  /** e.g. "Bullish" or "favorable". */
  call: string;
  samples: number;
  upRate: number | null;
  avgReturn: number | null;
  /** Share of correct calls (bullish → rose, bearish → fell); null for neutral calls. */
  hitRate: number | null;
}

export interface MethodSummary {
  method: 'sentiment' | 'advisor';
  /** Sentiment horizon, or the advisor's "20d" / "60d". */
  horizon: string;
  profile?: string;
  saved: number;
  evaluated: number;
  /** Share of all scored calls followed by a rise (what guessing "up" would have scored). */
  baseUpRate: number | null;
  rows: MethodRow[];
  /** Directional hit rate over all bullish + bearish calls. */
  hitRate: number | null;
  /** hit rate − the better of always-up / always-down; > 0 means the method beat the base rate. */
  edge: number | null;
  firstDate: string | null;
}

const rate = (n: number, of: number) => (of ? n / of : null);

function summarize(
  method: MethodSummary['method'],
  horizon: string,
  items: Array<{ date: string; call: string; outcome?: { ret: number; up: boolean } }>,
  calls: string[],
  profile?: string
): MethodSummary {
  const done = items.filter((x) => x.outcome) as Array<{ date: string; call: string; outcome: { ret: number; up: boolean } }>;
  const ups = done.filter((x) => x.outcome.up).length;
  const baseUpRate = rate(ups, done.length);
  const rows: MethodRow[] = calls.map((call) => {
    const list = done.filter((x) => x.call === call);
    const up = list.filter((x) => x.outcome.up).length;
    const hits = list.filter((x) => callHit(method === 'advisor' ? advisorAsLabel(call) : call, x.outcome.up) === true).length;
    const dir = direction(method === 'advisor' ? advisorAsLabel(call) : call);
    return {
      call,
      samples: list.length,
      upRate: rate(up, list.length),
      avgReturn: list.length ? list.reduce((a, x) => a + x.outcome.ret, 0) / list.length : null,
      hitRate: dir === 0 ? null : rate(hits, list.length),
    };
  });
  const directional = done.filter((x) => direction(method === 'advisor' ? advisorAsLabel(x.call) : x.call) !== 0);
  const hits = directional.filter((x) => callHit(method === 'advisor' ? advisorAsLabel(x.call) : x.call, x.outcome.up)).length;
  const hitRate = rate(hits, directional.length);
  // Baseline: always calling the more common direction among the same directional calls
  const dirUps = directional.filter((x) => x.outcome.up).length;
  const baseline = directional.length ? Math.max(dirUps, directional.length - dirUps) / directional.length : null;
  return {
    method,
    horizon,
    profile,
    saved: items.length,
    evaluated: done.length,
    baseUpRate,
    rows,
    hitRate,
    edge: hitRate === null || baseline === null ? null : hitRate - baseline,
    firstDate: items.length ? items.reduce((m, x) => (x.date < m ? x.date : m), items[0].date) : null,
  };
}

/** The advisor's verdicts read as directions: favorable = bullish, unfavorable = bearish. */
export function advisorAsLabel(verdict: string): string {
  return verdict === 'favorable' ? 'Bullish' : verdict === 'unfavorable' ? 'Bearish' : 'Neutral';
}

const LABELS: TraceLabel[] = ['Strong Bullish', 'Bullish', 'Neutral', 'Bearish', 'Strong Bearish'];
const VERDICTS = ['favorable', 'watch', 'unfavorable', 'no-signal', 'not-suitable'];

/** Accuracy of the sentiment per horizon and of the advisor per horizon / profile. */
export function methodSummaries(sentiment: SentimentCall[], advisor: VerdictSnapshot[], profile = 'moderate'): MethodSummary[] {
  const out: MethodSummary[] = [];
  for (const h of ['short', 'medium', 'long'] as TraceHorizon[]) {
    out.push(summarize('sentiment', h, sentiment.filter((c) => c.horizon === h).map((c) => ({ date: c.date, call: c.label, outcome: c.outcome })), LABELS));
  }
  for (const days of [...new Set(advisor.map((s) => s.horizonDays))].sort((a, b) => a - b)) {
    const list = advisor.filter((s) => s.horizonDays === days && s.profile === profile);
    out.push(summarize('advisor', `${days}d`, list.map((s) => ({ date: s.date, call: s.verdict, outcome: s.outcome })), VERDICTS, profile));
  }
  return out;
}

export interface TraceRow {
  date: string;
  method: 'sentiment' | 'advisor';
  /** Sentiment horizon or "20d" / "60d". */
  horizon: string;
  call: string;
  score: number | null;
  chance: number | null;
  price: number;
  /** Change from the call price to the live price (reference; the result uses closes). */
  sinceNow: number | null;
  dueBars: number;
  outcome: { dueDate: string; ret: number; up: boolean; hit: boolean | null } | null;
}

/** One asset's history of calls, newest first (advisor rows for one profile). */
export function assetTrace(symbol: string, sentiment: SentimentCall[], forward: ForwardLog[], livePrice: number | null, profile = 'moderate'): TraceRow[] {
  const since = (p: number) => (livePrice && p > 0 ? livePrice / p - 1 : null);
  const rows: TraceRow[] = [];
  for (const c of sentiment) {
    if (c.symbol !== symbol) continue;
    rows.push({
      date: c.date,
      method: 'sentiment',
      horizon: c.horizon,
      call: c.label,
      score: c.score,
      chance: null,
      price: c.price,
      sinceNow: since(c.price),
      dueBars: c.bars,
      outcome: c.outcome ? { ...c.outcome, hit: callHit(c.label, c.outcome.up) } : null,
    });
  }
  for (const log of forward) {
    for (const s of log.snapshots) {
      if (s.symbol !== symbol || s.profile !== profile) continue;
      rows.push({
        date: s.date,
        method: 'advisor',
        horizon: `${s.horizonDays}d`,
        call: s.verdict,
        score: null,
        chance: s.chance,
        price: s.price,
        sinceNow: since(s.price),
        dueBars: s.horizonDays,
        outcome: s.outcome ? { ...s.outcome, hit: callHit(advisorAsLabel(s.verdict), s.outcome.up) } : null,
      });
    }
  }
  const order = ['short', 'medium', 'long', '20d', '60d'];
  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.method.localeCompare(b.method) || order.indexOf(a.horizon) - order.indexOf(b.horizon));
}

/**
 * Collapses consecutive days with the same call into one "since" row so a long history stays
 * readable: e.g. Bullish from 1 Oct to 20 Oct (14 saved days), first price and the latest result.
 */
export function collapseTrace(rows: TraceRow[]): Array<TraceRow & { firstDate: string; days: number }> {
  const groups = new Map<string, TraceRow[]>();
  for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    const key = `${r.method}|${r.horizon}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  const out: Array<TraceRow & { firstDate: string; days: number }> = [];
  for (const list of groups.values()) {
    let run: TraceRow[] = [];
    const flush = () => {
      if (!run.length) return;
      const first = run[0];
      const last = run[run.length - 1];
      // The run's result is the first call's (the earliest decision), the newest row shows the latest
      out.push({ ...first, date: last.date, firstDate: first.date, days: run.length, outcome: first.outcome });
      run = [];
    };
    for (const r of list) {
      if (run.length && run[run.length - 1].call !== r.call) flush();
      run.push(r);
    }
    flush();
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
