/**
 * indicators.ts — Pure technical/macro feature engineering for the AI outlook model.
 * Every feature at day t only uses data up to and including t (no look-ahead). Series are
 * daily closes aligned to the asset's own trading calendar; macro series (T-bill yield,
 * 10-year yield, dollar index, and for Indonesian assets the policy-rate proxy and inflation,
 * dated by their release) are forward-filled onto that calendar by date.
 */

export interface DailyBar {
  date: string; // YYYY-MM-DD (exchange-local trading day)
  close: number;
}

/** Simple return over `n` bars ending at t; null if not enough history. */
export function pctChange(closes: number[], t: number, n: number): number | null {
  if (t - n < 0 || closes[t - n] <= 0) return null;
  return closes[t] / closes[t - n] - 1;
}

export function sma(closes: number[], t: number, n: number): number | null {
  if (t - n + 1 < 0) return null;
  let sum = 0;
  for (let i = t - n + 1; i <= t; i++) sum += closes[i];
  return sum / n;
}

/** Standard deviation of daily log returns over the last n bars, annualized (√252). */
export function annualizedVol(closes: number[], t: number, n: number, periodsPerYear = 252): number | null {
  if (t - n < 0) return null;
  const rets: number[] = [];
  for (let i = t - n + 1; i <= t; i++) {
    if (closes[i - 1] <= 0 || closes[i] <= 0) return null;
    rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(periodsPerYear);
}

/** Wilder-style RSI over n bars using simple averages of gains/losses (0–100). */
export function rsi(closes: number[], t: number, n = 14): number | null {
  if (t - n < 0) return null;
  let gain = 0;
  let loss = 0;
  for (let i = t - n + 1; i <= t; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  if (gain + loss === 0) return 50;
  return (100 * gain) / (gain + loss);
}

/** Drawdown from the highest close of the last n bars (≤ 0). */
export function drawdown(closes: number[], t: number, n = 252): number | null {
  if (t - n + 1 < 0) return null;
  let max = -Infinity;
  for (let i = t - n + 1; i <= t; i++) max = Math.max(max, closes[i]);
  return max > 0 ? closes[t] / max - 1 : null;
}

/** Largest peak-to-trough decline over the whole series (≤ 0). */
export function maxDrawdown(closes: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const c of closes) {
    peak = Math.max(peak, c);
    if (peak > 0) worst = Math.min(worst, c / peak - 1);
  }
  return worst;
}

/** Forward-fills a dated macro series onto target dates (value on or before each date). */
export function alignByDate(target: string[], series: DailyBar[]): Array<number | null> {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const out: Array<number | null> = [];
  let j = -1;
  for (const date of target) {
    while (j + 1 < sorted.length && sorted[j + 1].date <= date) j++;
    out.push(j >= 0 ? sorted[j].close : null);
  }
  return out;
}

export const FEATURE_NAMES = [
  'mom5',
  'mom20',
  'mom60',
  'mom120',
  'vol20',
  'trend50',
  'trend200',
  'rsi14',
  'drawdown252',
  'tbill20',
  'yield10y20',
  'dollar20',
  'fedStance',
  // Indonesian assets only (appended when the inputs are given)
  'idRate60',
  'idInflation60',
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];

/** Human-readable labels for the outlook UI. */
export const FEATURE_LABELS: Record<FeatureName, string> = {
  mom5: '1-week momentum',
  mom20: '1-month momentum',
  mom60: '3-month momentum',
  mom120: '6-month momentum',
  vol20: '1-month volatility',
  trend50: 'Price vs 50-day average',
  trend200: 'Price vs 200-day average',
  rsi14: 'RSI (14)',
  drawdown252: 'Distance from 1-year high',
  tbill20: 'US 3-month rate change (1M)',
  yield10y20: 'US 10-year yield change (1M)',
  dollar20: 'US dollar index change (1M)',
  fedStance: 'Fed stance (last decisions)',
  idRate60: 'Indonesian policy rate change (3M)',
  idInflation60: 'Indonesian inflation change (3M)',
};

export interface MacroInputs {
  /** US 13-week T-bill yield (%) aligned to the asset's dates. */
  tbill: Array<number | null>;
  /** US 10-year Treasury yield (%) aligned to the asset's dates. */
  yield10y: Array<number | null>;
  /** US dollar index aligned to the asset's dates (null for DXY itself to avoid a self-feature). */
  dollar: Array<number | null>;
  /** Fed stance per date: +1 recent cuts (easing), −1 recent hikes (tightening), 0 neutral. */
  fedStance: number[];
  /** Indonesian interbank overnight rate (%, BI-Rate proxy), dated by release. */
  idRate?: Array<number | null>;
  /** Indonesian CPI inflation y/y (%), dated by release. */
  idInflation?: Array<number | null>;
}

const WARMUP = 252;

/** Feature vector at day t, or null while the indicators are still warming up. */
export function featuresAt(closes: number[], t: number, macro: MacroInputs): number[] | null {
  if (t < WARMUP) return null;
  const sma50 = sma(closes, t, 50);
  const sma200 = sma(closes, t, 200);
  const values = [
    pctChange(closes, t, 5),
    pctChange(closes, t, 20),
    pctChange(closes, t, 60),
    pctChange(closes, t, 120),
    annualizedVol(closes, t, 20),
    sma50 ? closes[t] / sma50 - 1 : null,
    sma200 ? closes[t] / sma200 - 1 : null,
    ((rsi(closes, t, 14) ?? 50) - 50) / 50,
    drawdown(closes, t, 252),
    diff(macro.tbill, t, 20),
    diff(macro.yield10y, t, 20),
    ratioChange(macro.dollar, t, 20) ?? 0,
    macro.fedStance[t] ?? 0,
  ];
  if (macro.idRate && macro.idInflation) values.push(diff(macro.idRate, t, 60), diff(macro.idInflation, t, 60));
  if (values.some((v) => v === null || !Number.isFinite(v))) return null;
  return values as number[];
}

function diff(series: Array<number | null>, t: number, n: number): number | null {
  const a = series[t];
  const b = series[t - n];
  return a === null || b === null || a === undefined || b === undefined ? null : a - b;
}

function ratioChange(series: Array<number | null>, t: number, n: number): number | null {
  const a = series[t];
  const b = series[t - n];
  if (a === null || b === null || a === undefined || b === undefined || b <= 0) return null;
  return a / b - 1;
}
