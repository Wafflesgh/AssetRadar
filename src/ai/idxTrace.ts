/**
 * idxTrace.ts — The recommendation trace for every IDX-listed stock (the ~960-stock universe, not
 * only the app's core assets). After the IDX close the server walks the universe in batches (one
 * per cron tick), saves each stock's sentiment call per horizon with that day's close in its own
 * record (`idxtrace:<SYMBOL>`), and scores older calls when their horizon has passed using the same
 * daily closes. Running totals per horizon and label (`idxtrace:stats`) give the accuracy over the
 * whole market without reading every record. Pure helpers: the trading day to record, and the
 * totals and their summaries (same shape as methodSummaries in recommendationTrace.ts).
 */
import { callHit, direction, type MethodSummary, type SentimentCall, type TraceHorizon } from './recommendationTrace.ts';

const LABELS = ['Strong Bullish', 'Bullish', 'Neutral', 'Bearish', 'Strong Bearish'];
const HORIZONS: TraceHorizon[] = ['short', 'medium', 'long'];
const WIB_MS = 7 * 3600_000;

/** Calls kept per stock (three horizons a trading day for about 15 months). */
export const IDX_TRACE_MAX_CALLS = 1000;

/**
 * The trading day whose calls are recorded now: a weekday from 16:15 WIB (after the close) until
 * 08:45 WIB on the next weekday (before the next open). Null outside that window.
 */
export function idxTraceDay(nowMs: number): string | null {
  const wib = new Date(nowMs + WIB_MS);
  const minutes = wib.getUTCHours() * 60 + wib.getUTCMinutes();
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const weekday = (d: Date) => d.getUTCDay() >= 1 && d.getUTCDay() <= 5;
  if (weekday(wib)) {
    if (minutes >= 16 * 60 + 15) return day(wib);
    // The trading day is under way: nothing to record until the close
    if (minutes >= 8 * 60 + 45) return null;
  }
  // Before the open on a weekday, or a weekend: the last weekday before today
  const prev = new Date(wib);
  do prev.setUTCDate(prev.getUTCDate() - 1);
  while (!weekday(prev));
  return day(prev);
}

type Cell = { n: number; up: number; ret: number };

export interface IdxTraceStats {
  version: 1;
  firstDate: string | null;
  /** Calls saved per horizon. */
  saved: Record<TraceHorizon, number>;
  /** Scored calls per horizon and label. */
  scored: Record<TraceHorizon, Record<string, Cell>>;
}

export function emptyIdxStats(): IdxTraceStats {
  const h = () => Object.fromEntries(LABELS.map((l) => [l, { n: 0, up: 0, ret: 0 }])) as Record<string, Cell>;
  return { version: 1, firstDate: null, saved: { short: 0, medium: 0, long: 0 }, scored: { short: h(), medium: h(), long: h() } };
}

export function parseIdxStats(raw: unknown): IdxTraceStats {
  const s = raw as Partial<IdxTraceStats> | null;
  if (!s || s.version !== 1 || !s.saved || !s.scored) return emptyIdxStats();
  const base = emptyIdxStats();
  for (const h of HORIZONS) {
    base.saved[h] = Number(s.saved[h]) || 0;
    for (const l of LABELS) {
      const c = s.scored[h]?.[l];
      if (c) base.scored[h][l] = { n: Number(c.n) || 0, up: Number(c.up) || 0, ret: Number(c.ret) || 0 };
    }
  }
  base.firstDate = typeof s.firstDate === 'string' ? s.firstDate : null;
  return base;
}

/** Adds newly saved calls and newly scored calls to the totals (returns a new object). */
export function addToIdxStats(stats: IdxTraceStats, saved: SentimentCall[], scored: SentimentCall[]): IdxTraceStats {
  const next = parseIdxStats(JSON.parse(JSON.stringify(stats)));
  for (const c of saved) {
    next.saved[c.horizon] += 1;
    if (!next.firstDate || c.date < next.firstDate) next.firstDate = c.date;
  }
  for (const c of scored) {
    if (!c.outcome) continue;
    const cell = next.scored[c.horizon][c.label] ?? (next.scored[c.horizon][c.label] = { n: 0, up: 0, ret: 0 });
    cell.n += 1;
    cell.up += c.outcome.up ? 1 : 0;
    cell.ret += c.outcome.ret;
  }
  return next;
}

const rate = (n: number, of: number) => (of ? n / of : null);

/** Accuracy per horizon from the totals, in the same shape as the core-asset summaries. */
export function idxStatsSummaries(stats: IdxTraceStats): MethodSummary[] {
  return HORIZONS.map((h) => {
    const cells = stats.scored[h];
    const all = LABELS.map((l) => cells[l]);
    const done = all.reduce((a, c) => a + c.n, 0);
    const ups = all.reduce((a, c) => a + c.up, 0);
    let dirN = 0;
    let dirUps = 0;
    let hits = 0;
    for (const l of LABELS) {
      const c = cells[l];
      if (direction(l) === 0) continue;
      dirN += c.n;
      dirUps += c.up;
      hits += callHit(l, true) ? c.up : c.n - c.up;
    }
    const hitRate = rate(hits, dirN);
    const baseline = dirN ? Math.max(dirUps, dirN - dirUps) / dirN : null;
    return {
      method: 'sentiment' as const,
      horizon: h,
      saved: stats.saved[h],
      evaluated: done,
      baseUpRate: rate(ups, done),
      rows: LABELS.map((l) => ({
        call: l,
        samples: cells[l].n,
        upRate: rate(cells[l].up, cells[l].n),
        avgReturn: cells[l].n ? cells[l].ret / cells[l].n : null,
        hitRate: direction(l) === 0 ? null : rate(callHit(l, true) ? cells[l].up : cells[l].n - cells[l].up, cells[l].n),
      })),
      hitRate,
      edge: hitRate === null || baseline === null ? null : hitRate - baseline,
      firstDate: stats.firstDate,
    };
  });
}
