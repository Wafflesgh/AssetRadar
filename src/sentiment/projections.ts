/**
 * projections.ts — Technical projections as statistical ranges, never forecasts:
 *  1. Likely ranges: empirical quantiles of the asset's own h-bar returns (68% and 90%), scaled by
 *     today's EWMA volatility (λ 0.94) relative to the historical volatility, with a calibration
 *     check: how often the price really ended inside the range on past dates (point-in-time:
 *     each past range uses only data up to that date). Off by more than 5 points → warning.
 *  2. ATR(14) and ±1/±2/±3 ATR levels.
 *  3. Support & resistance: swing pivots, 20/50/200-bar averages, 52-week high/low, classic
 *     daily/weekly pivots (P, R1–R3, S1–S3) and high-volume nodes; levels within 0.5 ATR merge, and
 *     strength = how many sources and touches back them.
 *  4. Pattern targets: measured moves of the detected patterns with their historical hit rate on
 *     this asset when there are at least 20 past cases ("too few past cases" otherwise).
 *  5. Nearest resistance/support, upside/downside and reward/risk.
 *  6. Position size (education): volatility targeting (AMP: weight = target vol ÷ asset vol) and
 *     risk per trade (capital × risk% ÷ (entry − stop), IDX lots of 100). The user enters every number.
 */
import { detectPatterns, findPivots, type ChartPattern } from '../ai/technical.ts';
import type { OhlcCandle } from '../config/assets.ts';

export const EWMA_LAMBDA = 0.94;

const logRet = (a: number, b: number) => Math.log(b / a);

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function stdev(x: number[]): number {
  if (x.length < 2) return NaN;
  const m = x.reduce((a, b) => a + b, 0) / x.length;
  return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1));
}

/** EWMA volatility of one-bar log returns (RiskMetrics λ = 0.94), seeded with the sample variance. */
export function ewmaVol(closes: number[], lambda = EWMA_LAMBDA): number | null {
  if (closes.length < 30) return null;
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) r.push(logRet(closes[i - 1], closes[i]));
  let v = stdev(r.slice(0, 20)) ** 2;
  for (const x of r) v = lambda * v + (1 - lambda) * x * x;
  return Math.sqrt(v);
}

export interface RangeBand {
  horizonBars: number;
  /** Price bounds of the 68% and 90% ranges. */
  low68: number;
  high68: number;
  low90: number;
  high90: number;
  /** Volatility scaling applied (EWMA ÷ historical). */
  volScale: number;
  calibration: { hit68: number | null; hit90: number | null; samples: number; warning: boolean };
}

/** Quantile range of h-bar returns from `closes` (needs `minBars`), scaled to today's volatility. */
function rangeAt(closes: number[], h: number, minBars: number): { q: number[]; scale: number } | null {
  if (closes.length < Math.max(minBars, h + 30)) return null;
  const rets: number[] = [];
  for (let i = h; i < closes.length; i++) rets.push(logRet(closes[i - h], closes[i]));
  rets.sort((a, b) => a - b);
  const one: number[] = [];
  for (let i = 1; i < closes.length; i++) one.push(logRet(closes[i - 1], closes[i]));
  const hist = stdev(one);
  const ew = ewmaVol(closes);
  const scale = hist > 0 && ew ? Math.max(0.5, Math.min(2.5, ew / hist)) : 1;
  return { q: [0.05, 0.16, 0.84, 0.95].map((p) => quantile(rets, p)), scale };
}

/**
 * Likely price range after `h` bars, plus its calibration on past dates (every `step` bars from
 * the first date with `minBars` of history; each past range uses only earlier data).
 */
export function likelyRange(closes: number[], h: number, minBars = 504, step = 5): RangeBand | null {
  const now = rangeAt(closes, h, minBars);
  if (!now) return null;
  const price = closes[closes.length - 1];
  const at = (q: number) => price * Math.exp(q * now.scale);
  let in68 = 0;
  let in90 = 0;
  let n = 0;
  for (let t = minBars; t + h < closes.length; t += step) {
    const past = rangeAt(closes.slice(0, t + 1), h, minBars);
    if (!past) continue;
    const r = logRet(closes[t], closes[t + h]);
    const [q05, q16, q84, q95] = past.q.map((q) => q * past.scale);
    if (r >= q16 && r <= q84) in68++;
    if (r >= q05 && r <= q95) in90++;
    n++;
  }
  const hit68 = n ? (in68 / n) * 100 : null;
  const hit90 = n ? (in90 / n) * 100 : null;
  return {
    horizonBars: h,
    low90: at(now.q[0]),
    low68: at(now.q[1]),
    high68: at(now.q[2]),
    high90: at(now.q[3]),
    volScale: now.scale,
    calibration: {
      hit68,
      hit90,
      samples: n,
      warning: n > 0 && ((hit68 !== null && Math.abs(hit68 - 68) > 5) || (hit90 !== null && Math.abs(hit90 - 90) > 5)),
    },
  };
}

/** Average true range (Wilder, 14). */
export function atr(candles: OhlcCandle[], n = 14): number | null {
  if (candles.length < n + 1) return null;
  const tr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const pc = candles[i - 1].close;
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc)));
  }
  let a = tr.slice(0, n).reduce((s, x) => s + x, 0) / n;
  for (let i = n; i < tr.length; i++) a = (a * (n - 1) + tr[i]) / n;
  return a;
}

export function classicPivots(h: number, l: number, c: number) {
  const p = (h + l + c) / 3;
  return { P: p, R1: 2 * p - l, S1: 2 * p - h, R2: p + (h - l), S2: p - (h - l), R3: h + 2 * (p - l), S3: l - 2 * (h - p) };
}

/** Price levels with the most traded volume over the window (local maxima of a binned profile). */
export function volumeNodes(candles: OhlcCandle[], bins = 30, top = 3): number[] {
  const rows = candles.filter((c) => c.volume !== undefined && c.volume > 0);
  if (rows.length < 30) return [];
  const lo = Math.min(...rows.map((c) => c.low));
  const hi = Math.max(...rows.map((c) => c.high));
  if (!(hi > lo)) return [];
  const w = (hi - lo) / bins;
  const vol = new Array<number>(bins).fill(0);
  for (const c of rows) vol[Math.min(bins - 1, Math.floor((c.close - lo) / w))] += c.volume as number;
  const peaks = vol
    .map((v, i) => ({ v, i }))
    .filter(({ v, i }) => v > 0 && v >= (vol[i - 1] ?? 0) && v >= (vol[i + 1] ?? 0))
    .sort((a, b) => b.v - a.v)
    .slice(0, top);
  return peaks.map(({ i }) => lo + (i + 0.5) * w);
}

export type LevelSource = 'pivot' | 'ma20' | 'ma50' | 'ma200' | 'high52w' | 'low52w' | 'dailyPivot' | 'weeklyPivot' | 'volumeNode' | 'fibonacci';

export interface Level {
  price: number;
  kind: 'support' | 'resistance';
  sources: LevelSource[];
  /** Sources merged + closes that touched the level (within 0.25 ATR). */
  strength: number;
  distancePct: number;
}

const smaLast = (c: number[], n: number) => (c.length >= n ? c.slice(-n).reduce((a, b) => a + b, 0) / n : null);

/** Weekly H/L/C of the previous complete week from daily candles (UTC weeks). */
function previousWeek(candles: OhlcCandle[]): { h: number; l: number; c: number } | null {
  const weekOf = (t: number) => Math.floor((t / 86_400 + 3) / 7); // weeks starting Monday
  const last = weekOf(candles[candles.length - 1].time);
  const prev = candles.filter((c) => weekOf(c.time) === last - 1);
  if (!prev.length) return null;
  return { h: Math.max(...prev.map((c) => c.high)), l: Math.min(...prev.map((c) => c.low)), c: prev[prev.length - 1].close };
}

/**
 * Support and resistance from several sources, merged within 0.5 ATR. Fibonacci retracements of
 * the 52-week range are added only when asked (`fibonacci`), labelled as low-evidence.
 */
export function supportResistance(candles: OhlcCandle[], opts: { fibonacci?: boolean; yearBars?: number } = {}): { levels: Level[]; atr: number | null } {
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];
  const a = atr(candles);
  if (!a || closes.length < 60) return { levels: [], atr: a };
  const yearBars = opts.yearBars ?? 252;
  const raw: Array<{ price: number; source: LevelSource }> = [];
  const { highs, lows } = findPivots(closes, Math.max(0, closes.length - yearBars), closes.length - 1, 5);
  for (const p of [...highs, ...lows]) raw.push({ price: p.v, source: 'pivot' });
  for (const [n, src] of [[20, 'ma20'], [50, 'ma50'], [200, 'ma200']] as Array<[number, LevelSource]>) {
    const m = smaLast(closes, n);
    if (m) raw.push({ price: m, source: src });
  }
  const year = candles.slice(-yearBars);
  const hi52 = Math.max(...year.map((c) => c.high));
  const lo52 = Math.min(...year.map((c) => c.low));
  raw.push({ price: hi52, source: 'high52w' }, { price: lo52, source: 'low52w' });
  const y = candles[candles.length - 2];
  if (y) for (const v of Object.values(classicPivots(y.high, y.low, y.close))) raw.push({ price: v, source: 'dailyPivot' });
  const w = previousWeek(candles);
  if (w) for (const v of Object.values(classicPivots(w.h, w.l, w.c))) raw.push({ price: v, source: 'weeklyPivot' });
  for (const v of volumeNodes(year)) raw.push({ price: v, source: 'volumeNode' });
  if (opts.fibonacci) for (const f of [0.236, 0.382, 0.5, 0.618, 0.786]) raw.push({ price: hi52 - (hi52 - lo52) * f, source: 'fibonacci' });

  // Merge levels closer than 0.5 ATR
  const sorted = raw.filter((r) => Number.isFinite(r.price) && r.price > 0).sort((x, z) => x.price - z.price);
  const clusters: Array<{ prices: number[]; sources: LevelSource[] }> = [];
  for (const r of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && r.price - last.prices[last.prices.length - 1] <= 0.5 * a) {
      last.prices.push(r.price);
      last.sources.push(r.source);
    } else clusters.push({ prices: [r.price], sources: [r.source] });
  }
  const levels: Level[] = clusters.map((c) => {
    const lv = c.prices.reduce((s, x) => s + x, 0) / c.prices.length;
    const touches = year.filter((k) => k.low - 0.25 * a <= lv && k.high + 0.25 * a >= lv).length;
    return {
      price: lv,
      kind: lv >= price ? 'resistance' : 'support',
      sources: [...new Set(c.sources)],
      strength: c.sources.length + Math.min(10, Math.round(touches / 5)),
      distancePct: (lv / price - 1) * 100,
    };
  });
  return { levels: levels.filter((l) => Math.abs(l.price - price) > 0.05 * a), atr: a };
}

export interface PatternTarget {
  id: string;
  name: string;
  status: ChartPattern['status'];
  bias: ChartPattern['bias'];
  keyLevel: number | null;
  target: number | null;
  /** Share of past detections whose target was reached within `withinBars` (null: too few). */
  hitRate: number | null;
  pastCases: number;
  withinBars: number;
}

/** Measured move of a pattern at the end of `closes` (null when the pattern has no textbook target). */
export function measuredMove(p: ChartPattern, closes: number[]): number | null {
  if (p.keyLevel === undefined) return null;
  const t = closes.length - 1;
  const win = (n: number) => closes.slice(Math.max(0, t - n), t + 1);
  if (p.id === 'double-top' || p.id === 'head-shoulders') return p.keyLevel - (Math.max(...win(150)) - p.keyLevel);
  if (p.id === 'double-bottom' || p.id === 'inverse-head-shoulders') return p.keyLevel + (p.keyLevel - Math.min(...win(150)));
  if (/triangle|wedge|channel/.test(p.id) && p.bias !== 0) {
    const w = win(70);
    return p.keyLevel + p.bias * (Math.max(...w) - Math.min(...w));
  }
  return null;
}

/**
 * Targets of today's patterns and their hit rate on the asset's own history: patterns detected
 * point-in-time every `step` bars, each counted once per 10 bars, reached when a later close within
 * `withinBars` crosses the target.
 */
export function patternTargets(closes: number[], withinBars = 60, step = 3, minCases = 20): PatternTarget[] {
  const today = detectPatterns(closes);
  if (!today.length) return [];
  const stats = new Map<string, { cases: number; hits: number; lastAt: number }>();
  for (let t = 200; t + withinBars < closes.length; t += step) {
    const hist = closes.slice(0, t + 1);
    for (const p of detectPatterns(hist)) {
      if (!today.some((x) => x.id === p.id)) continue;
      const target = measuredMove(p, hist);
      if (target === null) continue;
      const s = stats.get(p.id) ?? { cases: 0, hits: 0, lastAt: -100 };
      if (t - s.lastAt < 10) continue;
      s.lastAt = t;
      s.cases++;
      const future = closes.slice(t + 1, t + 1 + withinBars);
      if (p.bias > 0 ? future.some((c) => c >= target) : future.some((c) => c <= target)) s.hits++;
      stats.set(p.id, s);
    }
  }
  return today.map((p) => {
    const s = stats.get(p.id);
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      bias: p.bias,
      keyLevel: p.keyLevel ?? null,
      target: measuredMove(p, closes),
      hitRate: s && s.cases >= minCases ? (s.hits / s.cases) * 100 : null,
      pastCases: s?.cases ?? 0,
      withinBars,
    };
  });
}

/** Nearest levels around the price and the reward/risk between them. */
export function upsideDownside(levels: Level[], price: number) {
  const res = levels.filter((l) => l.kind === 'resistance').sort((a, b) => a.price - b.price)[0] ?? null;
  const sup = levels.filter((l) => l.kind === 'support').sort((a, b) => b.price - a.price)[0] ?? null;
  const up = res ? (res.price / price - 1) * 100 : null;
  const down = sup ? (sup.price / price - 1) * 100 : null;
  return { resistance: res, support: sup, upsidePct: up, downsidePct: down, rewardRisk: up !== null && down !== null && down < 0 ? up / -down : null };
}

/** Annualized volatility over the last `years` (daily bars), or EWMA for crypto. */
export function annualVol(closes: number[], yearBars = 252, years = 3, ewma = false): number | null {
  if (ewma) {
    const v = ewmaVol(closes);
    return v === null ? null : v * Math.sqrt(yearBars);
  }
  const c = closes.slice(-(yearBars * years + 1));
  if (c.length < 60) return null;
  const r: number[] = [];
  for (let i = 1; i < c.length; i++) r.push(logRet(c[i - 1], c[i]));
  const s = stdev(r);
  return Number.isFinite(s) ? s * Math.sqrt(yearBars) : null;
}

