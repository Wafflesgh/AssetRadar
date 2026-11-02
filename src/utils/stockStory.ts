/**
 * stockStory.ts — Facts behind a stock's story page, from data the app already has: daily closes
 * (1-year and 5-year change, 52-week range, yearly returns, the deepest fall and when it happened),
 * the saved daily sentiment calls (latest label per horizon, the last change of mind, and how often
 * the scored calls were right), the dividend summary and the annual financial ratios (latest year
 * against the year before). Pure: the page turns these numbers into sentences.
 */
import type { TraceRow } from '../ai/recommendationTrace.ts';

export interface StoryBar {
  date: string;
  close: number;
}

export interface PriceFacts {
  last: number;
  lastDate: string;
  /** Changes as fractions (null when the history is shorter). */
  change1y: number | null;
  change5y: number | null;
  high52: number;
  low52: number;
  /** Distance below the 52-week high, as a fraction (≤ 0). */
  fromHigh: number;
  yearly: Array<{ year: number; ret: number }>;
  best: { year: number; ret: number } | null;
  worst: { year: number; ret: number } | null;
  maxDrawdown: { pct: number; peakDate: string; troughDate: string } | null;
  /** Weekly closes for the chart (last close of each ISO week). */
  weekly: StoryBar[];
}

function closeAtOrBefore(bars: StoryBar[], date: string): number | null {
  let found: number | null = null;
  for (const b of bars) {
    if (b.date > date) break;
    found = b.close;
  }
  return found;
}

function minusYears(date: string, years: number): string {
  return `${Number(date.slice(0, 4)) - years}${date.slice(4)}`;
}

export function priceFacts(input: StoryBar[]): PriceFacts | null {
  const bars = input.filter((b) => b.close > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (bars.length < 2) return null;
  const end = bars[bars.length - 1];
  const yearAgo = minusYears(end.date, 1);
  const fiveAgo = minusYears(end.date, 5);
  const c1 = bars[0].date <= yearAgo ? closeAtOrBefore(bars, yearAgo) : null;
  const c5 = bars[0].date <= fiveAgo ? closeAtOrBefore(bars, fiveAgo) : null;
  const lastYear = bars.filter((b) => b.date > yearAgo);
  const high52 = Math.max(...lastYear.map((b) => b.close));
  const low52 = Math.min(...lastYear.map((b) => b.close));

  // Calendar-year returns (first year only when it starts in January; the current year so far)
  const firstOfYear = new Map<number, number>();
  const lastOfYear = new Map<number, number>();
  for (const b of bars) {
    const y = Number(b.date.slice(0, 4));
    if (!firstOfYear.has(y)) firstOfYear.set(y, b.close);
    lastOfYear.set(y, b.close);
  }
  const yearly: Array<{ year: number; ret: number }> = [];
  for (const y of [...lastOfYear.keys()].sort()) {
    const prevClose = lastOfYear.get(y - 1) ?? (bars[0].date.slice(5, 7) === '01' && Number(bars[0].date.slice(0, 4)) === y ? firstOfYear.get(y) : undefined);
    if (prevClose && prevClose > 0) yearly.push({ year: y, ret: lastOfYear.get(y)! / prevClose - 1 });
  }
  const recent = yearly.filter((r) => r.year >= Number(end.date.slice(0, 4)) - 5);
  const fullYears = recent.filter((r) => r.year < Number(end.date.slice(0, 4)));
  const pick = (cmp: (a: number, b: number) => boolean) => fullYears.reduce<{ year: number; ret: number } | null>((acc, r) => (!acc || cmp(r.ret, acc.ret) ? r : acc), null);

  // Deepest fall over the last five years
  let peak = { close: 0, date: '' };
  let dd: PriceFacts['maxDrawdown'] = null;
  for (const b of bars) {
    if (b.date < fiveAgo) continue;
    if (b.close > peak.close) peak = { close: b.close, date: b.date };
    const pct = b.close / peak.close - 1;
    if (pct < 0 && (!dd || pct < dd.pct)) dd = { pct, peakDate: peak.date, troughDate: b.date };
  }

  const weekly: StoryBar[] = [];
  const weekOf = (d: string) => Math.floor((Date.parse(d) / 86_400_000 + 3) / 7);
  for (const b of bars) {
    if (b.date < fiveAgo) continue;
    const last = weekly[weekly.length - 1];
    if (last && weekOf(last.date) === weekOf(b.date)) weekly[weekly.length - 1] = b;
    else weekly.push(b);
  }

  return {
    last: end.close,
    lastDate: end.date,
    change1y: c1 ? end.close / c1 - 1 : null,
    change5y: c5 ? end.close / c5 - 1 : null,
    high52,
    low52,
    fromHigh: end.close / high52 - 1,
    yearly: recent,
    best: pick((a, b) => a > b),
    worst: pick((a, b) => a < b),
    maxDrawdown: dd,
    weekly,
  };
}

export type StoryHorizon = 'short' | 'medium' | 'long';
export const STORY_HORIZONS: StoryHorizon[] = ['short', 'medium', 'long'];

export interface SentimentFacts {
  latest: Partial<Record<StoryHorizon, { date: string; label: string; score: number | null }>>;
  /** Most recent change of label per horizon (from → to on date). */
  lastChange: Partial<Record<StoryHorizon, { date: string; from: string; to: string }>>;
  /** Scored calls and how many were right, per horizon. */
  accuracy: Partial<Record<StoryHorizon, { scored: number; hits: number }>>;
  /** Daily labels per horizon, oldest first (for the strip chart). */
  timeline: Record<StoryHorizon, Array<{ date: string; label: string }>>;
}

export function sentimentFacts(rows: TraceRow[], days = 90): SentimentFacts {
  const out: SentimentFacts = { latest: {}, lastChange: {}, accuracy: {}, timeline: { short: [], medium: [], long: [] } };
  for (const h of STORY_HORIZONS) {
    const calls = rows.filter((r) => r.method === 'sentiment' && r.horizon === h).sort((a, b) => a.date.localeCompare(b.date));
    if (calls.length === 0) continue;
    const last = calls[calls.length - 1];
    out.latest[h] = { date: last.date, label: last.call, score: last.score };
    for (let i = calls.length - 1; i > 0; i--) {
      if (calls[i].call !== calls[i - 1].call) {
        out.lastChange[h] = { date: calls[i].date, from: calls[i - 1].call, to: calls[i].call };
        break;
      }
    }
    const scored = calls.filter((c) => c.outcome && c.outcome.hit !== null);
    if (scored.length) out.accuracy[h] = { scored: scored.length, hits: scored.filter((c) => c.outcome!.hit).length };
    out.timeline[h] = calls.slice(-days).map((c) => ({ date: c.date, label: c.call }));
  }
  return out;
}

/** Units as statements.ts gives them: roe, netMargin, dividendYield are fractions; revenueYoY is percent; der and pe are multiples. */
export interface RatioYear {
  year: string;
  roe?: number;
  netMargin?: number;
  revenueYoY?: number;
  der?: number;
  pe?: number;
  dividendYield?: number;
}

/** Annual ratios, newest first (at most five years). */
export function ratioYears(rows: Array<{ end: string; months: number; missing?: boolean; ratios: Omit<RatioYear, 'year'> }>): RatioYear[] {
  return rows
    .filter((r) => r.months === 12 && !r.missing)
    .sort((a, b) => b.end.localeCompare(a.end))
    .slice(0, 5)
    .map((r) => ({
      year: r.end.slice(0, 4),
      roe: r.ratios.roe,
      netMargin: r.ratios.netMargin,
      revenueYoY: r.ratios.revenueYoY,
      der: r.ratios.der,
      pe: r.ratios.pe,
      dividendYield: r.ratios.dividendYield,
    }));
}
