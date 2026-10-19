/**
 * technical.ts — Rule-based technical analysis on daily closes: a scorecard of classic
 * indicators (moving-average trend, MACD, RSI, Bollinger Bands, 12-1 month momentum, 52-week
 * range, Donchian breakout), chart-pattern detection from swing pivots (double top/bottom,
 * head & shoulders, triangles, wedges, channels, golden/death cross), and an honest check of
 * how often the same scorecard reading was followed by a rise on this asset's own history.
 *
 * Everything at bar t uses only data up to t (no look-ahead). Patterns describe what the chart
 * looks like; their textbook bias is not a forecast, which is why the historical hit rate
 * (versus the base rate) is reported next to them.
 */

export type Bias = -1 | 0 | 1;

export interface TechnicalSignal {
  id: string;
  label: string;
  /** Plain-language reading, e.g. "Price 4.2% above the 200-day average". */
  reading: string;
  bias: Bias;
  weight: number;
  /** Method / study behind the rule. */
  method: string;
}

export type PatternStatus = 'forming' | 'confirmed';

export interface ChartPattern {
  id: string;
  name: string;
  bias: Bias;
  status: PatternStatus;
  /** Price level that confirms or invalidates the pattern (neckline, breakout line). */
  keyLevel?: number;
  description: string;
}

export interface HistoricalEdge {
  horizonDays: number;
  /** How the current scorecard leans; the study looks at past days that leaned the same way. */
  lean: 'bullish' | 'bearish' | 'neutral';
  /** Number of past days with the same lean. */
  samples: number;
  /** Share of those days followed by a higher price after horizonDays (0–1). */
  upRate: number;
  /** Share of all days followed by a higher price (the base rate). */
  baseUpRate: number;
  /** Average forward return after same-lean days, and over all days. */
  avgReturn: number;
  baseAvgReturn: number;
}

export interface TechnicalReport {
  lastClose: number;
  indicators: {
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
    rsi14: number | null;
    macd: number | null;
    macdSignal: number | null;
    macdHist: number | null;
    bollUpper: number | null;
    bollLower: number | null;
    pctB: number | null;
    high52w: number | null;
    low52w: number | null;
    momentum12_1: number | null;
    support: number | null;
    resistance: number | null;
  };
  signals: TechnicalSignal[];
  /** Weighted mean of the signal biases, −1 (all bearish) … +1 (all bullish). */
  score: number;
  patterns: ChartPattern[];
  edge: HistoricalEdge | null;
}

// ---- Indicator series (computed once for the whole history) -------------------------------

function emaSeries(values: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = new Array(values.length);
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

interface Series {
  closes: number[];
  prefix: number[];
  prefixSq: number[];
  macd: number[];
  macdSignal: number[];
}

function buildSeries(closes: number[]): Series {
  const prefix = [0];
  const prefixSq = [0];
  for (const c of closes) {
    prefix.push(prefix[prefix.length - 1] + c);
    prefixSq.push(prefixSq[prefixSq.length - 1] + c * c);
  }
  const e12 = emaSeries(closes, 12);
  const e26 = emaSeries(closes, 26);
  const macd = closes.map((_, i) => e12[i] - e26[i]);
  return { closes, prefix, prefixSq, macd, macdSignal: emaSeries(macd, 9) };
}

function smaAt(s: Series, t: number, n: number): number | null {
  if (t - n + 1 < 0) return null;
  return (s.prefix[t + 1] - s.prefix[t + 1 - n]) / n;
}

function stdAt(s: Series, t: number, n: number): number | null {
  if (t - n + 1 < 0) return null;
  const mean = (s.prefix[t + 1] - s.prefix[t + 1 - n]) / n;
  const meanSq = (s.prefixSq[t + 1] - s.prefixSq[t + 1 - n]) / n;
  return Math.sqrt(Math.max(meanSq - mean * mean, 0));
}

function rsiAt(closes: number[], t: number, n = 14): number | null {
  if (t - n < 0) return null;
  let gain = 0;
  let loss = 0;
  for (let i = t - n + 1; i <= t; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  return gain + loss === 0 ? 50 : (100 * gain) / (gain + loss);
}

function rangeAt(closes: number[], from: number, to: number): { max: number; min: number } | null {
  if (from < 0 || to < from) return null;
  let max = -Infinity;
  let min = Infinity;
  for (let i = from; i <= to; i++) {
    if (closes[i] > max) max = closes[i];
    if (closes[i] < min) min = closes[i];
  }
  return { max, min };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

// ---- Scorecard -----------------------------------------------------------------------------

/** The indicator scorecard at bar t (needs ≥ 200 bars for the full set). */
function signalsAt(s: Series, t: number, yearBars = 252): TechnicalSignal[] {
  const monthBars = Math.round(yearBars / 12);
  const c = s.closes;
  const price = c[t];
  const out: TechnicalSignal[] = [];
  const sma50 = smaAt(s, t, 50);
  const sma200 = smaAt(s, t, 200);

  if (sma200 !== null) {
    const gap = price / sma200 - 1;
    out.push({
      id: 'ma200',
      label: 'Long-term trend (200-day average)',
      reading: `Price ${pct(Math.abs(gap))} ${gap >= 0 ? 'above' : 'below'} the 200-day average`,
      bias: gap > 0.01 ? 1 : gap < -0.01 ? -1 : 0,
      weight: 1.5,
      method: 'Moving-average trend rule (Brock, Lakonishok & LeBaron 1992)',
    });
  }
  if (sma50 !== null && sma200 !== null) {
    out.push({
      id: 'cross',
      label: '50-day vs 200-day average',
      reading: sma50 >= sma200 ? '50-day above 200-day (golden-cross regime)' : '50-day below 200-day (death-cross regime)',
      bias: sma50 > sma200 * 1.002 ? 1 : sma50 < sma200 * 0.998 ? -1 : 0,
      weight: 1,
      method: 'Dual moving-average crossover',
    });
  }
  if (sma50 !== null) {
    const gap = price / sma50 - 1;
    out.push({
      id: 'ma50',
      label: 'Medium-term trend (50-day average)',
      reading: `Price ${pct(Math.abs(gap))} ${gap >= 0 ? 'above' : 'below'} the 50-day average`,
      bias: gap > 0.01 ? 1 : gap < -0.01 ? -1 : 0,
      weight: 1,
      method: 'Moving-average trend rule',
    });
  }
  if (t >= 35) {
    const hist = s.macd[t] - s.macdSignal[t];
    const prevHist = s.macd[t - 1] - s.macdSignal[t - 1];
    const rising = hist > prevHist;
    out.push({
      id: 'macd',
      label: 'MACD (12, 26, 9)',
      reading: `Histogram ${hist >= 0 ? 'positive' : 'negative'} and ${rising ? 'rising' : 'falling'}`,
      bias: hist > 0 && rising ? 1 : hist < 0 && !rising ? -1 : 0,
      weight: 1,
      method: 'Appel MACD momentum oscillator',
    });
  }
  const r = rsiAt(c, t);
  if (r !== null) {
    let bias: Bias = 0;
    let reading = `RSI ${r.toFixed(0)}`;
    if (r >= 70) {
      bias = -1;
      reading += ' — overbought, short-term pullback risk';
    } else if (r <= 30) {
      bias = 1;
      reading += ' — oversold, short-term rebound potential';
    } else if (r >= 55) {
      bias = 1;
      reading += ' — positive momentum';
    } else if (r <= 45) {
      bias = -1;
      reading += ' — negative momentum';
    } else reading += ' — neutral';
    out.push({ id: 'rsi', label: 'RSI (14)', reading, bias, weight: 0.75, method: 'Wilder RSI; extremes as short-term reversal (Jegadeesh 1990)' });
  }
  const mid = smaAt(s, t, 20);
  const sd = stdAt(s, t, 20);
  if (mid !== null && sd !== null && sd > 0) {
    const upper = mid + 2 * sd;
    const lower = mid - 2 * sd;
    const b = (price - lower) / (upper - lower);
    out.push({
      id: 'boll',
      label: 'Bollinger Bands (20, 2)',
      reading:
        b > 1
          ? 'Closed above the upper band — stretched'
          : b < 0
            ? 'Closed below the lower band — stretched to the downside'
            : `Inside the bands (%B ${(b * 100).toFixed(0)})`,
      bias: b > 1 ? -1 : b < 0 ? 1 : 0,
      weight: 0.5,
      method: 'Bollinger %B mean reversion',
    });
  }
  if (t >= yearBars) {
    const mom = c[t - monthBars] / c[t - yearBars] - 1;
    out.push({
      id: 'mom',
      label: '12-1 month momentum',
      reading: `${mom >= 0 ? '+' : ''}${pct(mom)} from 12 months to 1 month ago`,
      bias: mom > 0 ? 1 : mom < 0 ? -1 : 0,
      weight: 1.5,
      method: 'Time-series momentum (Moskowitz, Ooi & Pedersen 2012; Asness, Moskowitz & Pedersen 2013)',
    });
  }
  const yr = rangeAt(c, Math.max(0, t - yearBars + 1), t);
  if (yr && t >= 120 && yr.max > yr.min) {
    const pos = (price - yr.min) / (yr.max - yr.min);
    out.push({
      id: 'range52',
      label: '52-week range position',
      reading: `${(pos * 100).toFixed(0)}% of the way from the 52-week low to the high`,
      bias: pos >= 0.8 ? 1 : pos <= 0.2 ? -1 : 0,
      weight: 0.75,
      method: '52-week-high anchoring effect (George & Hwang 2004)',
    });
  }
  const prior = rangeAt(c, t - 55, t - 1);
  if (prior) {
    out.push({
      id: 'donchian',
      label: '55-day breakout',
      reading:
        price > prior.max ? 'New 55-day closing high (breakout)' : price < prior.min ? 'New 55-day closing low (breakdown)' : 'Inside the 55-day range',
      bias: price > prior.max ? 1 : price < prior.min ? -1 : 0,
      weight: 0.75,
      method: 'Donchian channel breakout (turtle-style trend rule)',
    });
  }
  return out;
}

function scoreOf(signals: TechnicalSignal[]): number {
  const w = signals.reduce((a, s) => a + s.weight, 0);
  return w > 0 ? signals.reduce((a, s) => a + s.bias * s.weight, 0) / w : 0;
}

export const LEAN_THRESHOLD = 0.25;

function leanOf(score: number): HistoricalEdge['lean'] {
  return score > LEAN_THRESHOLD ? 'bullish' : score < -LEAN_THRESHOLD ? 'bearish' : 'neutral';
}

/**
 * How the asset behaved after past days whose scorecard leaned the same way as today.
 * Overlapping windows make samples correlated, so this is descriptive, not a significance test.
 */
function historicalEdge(s: Series, lean: HistoricalEdge['lean'], horizon: number, yearBars: number): HistoricalEdge | null {
  const c = s.closes;
  const start = yearBars;
  const end = c.length - 1 - horizon;
  if (end - start < 120) return null;
  let all = 0;
  let allUp = 0;
  let allRet = 0;
  let n = 0;
  let up = 0;
  let ret = 0;
  for (let t = start; t <= end; t++) {
    const fwd = c[t + horizon] / c[t] - 1;
    all += 1;
    allRet += fwd;
    if (fwd > 0) allUp += 1;
    if (leanOf(scoreOf(signalsAt(s, t, yearBars))) === lean) {
      n += 1;
      ret += fwd;
      if (fwd > 0) up += 1;
    }
  }
  if (n === 0) return null;
  return {
    horizonDays: horizon,
    lean,
    samples: n,
    upRate: up / n,
    baseUpRate: allUp / all,
    avgReturn: ret / n,
    baseAvgReturn: allRet / all,
  };
}

// ---- Patterns ------------------------------------------------------------------------------

interface Pivot {
  i: number;
  v: number;
}

/** Swing highs/lows: a close that is the extreme of the k bars on each side. */
export function findPivots(closes: number[], from: number, to: number, k = 5): { highs: Pivot[]; lows: Pivot[] } {
  const highs: Pivot[] = [];
  const lows: Pivot[] = [];
  for (let i = Math.max(from, k); i <= Math.min(to, closes.length - 1 - k); i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (closes[j] >= closes[i]) isHigh = false;
      if (closes[j] <= closes[i]) isLow = false;
    }
    if (isHigh) highs.push({ i, v: closes[i] });
    if (isLow) lows.push({ i, v: closes[i] });
  }
  return { highs, lows };
}

/** Least-squares slope of pivots, as % of price per 20 bars. */
function slopePct(points: Pivot[], price: number): number {
  const n = points.length;
  const mx = points.reduce((a, p) => a + p.i, 0) / n;
  const my = points.reduce((a, p) => a + p.v, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.i - mx) * (p.v - my);
    den += (p.i - mx) ** 2;
  }
  return den > 0 ? ((num / den) * 20) / price : 0;
}

function lineAt(points: Pivot[], i: number): number {
  const n = points.length;
  const mx = points.reduce((a, p) => a + p.i, 0) / n;
  const my = points.reduce((a, p) => a + p.v, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.i - mx) * (p.v - my);
    den += (p.i - mx) ** 2;
  }
  const slope = den > 0 ? num / den : 0;
  return my + slope * (i - mx);
}

function minBetween(closes: number[], a: number, b: number): number {
  let m = Infinity;
  for (let i = a; i <= b; i++) m = Math.min(m, closes[i]);
  return m;
}

function maxBetween(closes: number[], a: number, b: number): number {
  let m = -Infinity;
  for (let i = a; i <= b; i++) m = Math.max(m, closes[i]);
  return m;
}

/** Detects classic chart patterns over the last ~150 bars (pivots confirmed with k = 5). */
export function detectPatterns(closes: number[]): ChartPattern[] {
  const t = closes.length - 1;
  if (t < 60) return [];
  const price = closes[t];
  const from = Math.max(0, t - 150);
  const { highs, lows } = findPivots(closes, from, t, 5);
  const recent = (p: Pivot) => t - p.i <= 45;
  const out: ChartPattern[] = [];

  // Double top / bottom: two similar swing extremes with a clear dip/rally between them
  if (highs.length >= 2) {
    const [h1, h2] = highs.slice(-2);
    const top = Math.max(h1.v, h2.v);
    const neckline = minBetween(closes, h1.i, h2.i);
    if (recent(h2) && h2.i - h1.i >= 8 && Math.abs(h1.v - h2.v) / top < 0.03 && neckline < top * 0.96 && price < top * 1.01) {
      out.push({
        id: 'double-top',
        name: 'Double top',
        bias: -1,
        status: price < neckline ? 'confirmed' : 'forming',
        keyLevel: neckline,
        description:
          price < neckline
            ? 'Two peaks at a similar level and price has closed below the neckline between them — a textbook bearish reversal.'
            : 'Two peaks at a similar level; a close below the neckline would confirm a bearish reversal, a close above the peaks would cancel it.',
      });
    }
  }
  if (lows.length >= 2) {
    const [l1, l2] = lows.slice(-2);
    const bottom = Math.min(l1.v, l2.v);
    const neckline = maxBetween(closes, l1.i, l2.i);
    if (recent(l2) && l2.i - l1.i >= 8 && Math.abs(l1.v - l2.v) / bottom < 0.03 && neckline > bottom * 1.04 && price > bottom * 0.99) {
      out.push({
        id: 'double-bottom',
        name: 'Double bottom',
        bias: 1,
        status: price > neckline ? 'confirmed' : 'forming',
        keyLevel: neckline,
        description:
          price > neckline
            ? 'Two troughs at a similar level and price has closed above the neckline — a textbook bullish reversal.'
            : 'Two troughs at a similar level; a close above the neckline would confirm a bullish reversal, a new low would cancel it.',
      });
    }
  }

  // Head & shoulders (and inverse): three swings, the middle one the most extreme
  if (highs.length >= 3) {
    const [l, h, r] = highs.slice(-3);
    const t1 = minBetween(closes, l.i, h.i);
    const t2 = minBetween(closes, h.i, r.i);
    const neckline = (t1 + t2) / 2;
    if (recent(r) && h.v > l.v * 1.02 && h.v > r.v * 1.02 && Math.abs(l.v - r.v) / Math.max(l.v, r.v) < 0.05 && price < h.v) {
      out.push({
        id: 'head-shoulders',
        name: 'Head and shoulders',
        bias: -1,
        status: price < neckline ? 'confirmed' : 'forming',
        keyLevel: neckline,
        description:
          price < neckline
            ? 'A higher peak (head) between two lower peaks (shoulders), and price broke the neckline — a textbook bearish top.'
            : 'A head between two shoulders; the pattern completes on a close below the neckline.',
      });
    }
  }
  if (lows.length >= 3) {
    const [l, h, r] = lows.slice(-3);
    const p1 = maxBetween(closes, l.i, h.i);
    const p2 = maxBetween(closes, h.i, r.i);
    const neckline = (p1 + p2) / 2;
    if (recent(r) && h.v < l.v * 0.98 && h.v < r.v * 0.98 && Math.abs(l.v - r.v) / Math.max(l.v, r.v) < 0.05 && price > h.v) {
      out.push({
        id: 'inverse-head-shoulders',
        name: 'Inverse head and shoulders',
        bias: 1,
        status: price > neckline ? 'confirmed' : 'forming',
        keyLevel: neckline,
        description:
          price > neckline
            ? 'A lower trough (head) between two higher troughs, and price broke above the neckline — a textbook bullish bottom.'
            : 'An inverse head and shoulders; it completes on a close above the neckline.',
      });
    }
  }

  // Triangles, wedges and channels from the trend lines through recent pivots
  const hs = highs.filter((p) => t - p.i <= 70);
  const ls = lows.filter((p) => t - p.i <= 70);
  if (hs.length >= 2 && ls.length >= 2 && hs.length + ls.length >= 5) {
    const hSlope = slopePct(hs, price);
    const lSlope = slopePct(ls, price);
    const flat = 0.012;
    const upperNow = lineAt(hs, t);
    const lowerNow = lineAt(ls, t);
    const above = price > upperNow * 1.005;
    const below = price < lowerNow * 0.995;
    const push = (id: string, name: string, bias: Bias, description: string, keyLevel: number) =>
      out.push({ id, name, bias, status: above || below ? 'confirmed' : 'forming', keyLevel, description });

    if (Math.abs(hSlope) < flat && lSlope > flat) {
      push('ascending-triangle', 'Ascending triangle', 1, 'Flat resistance with rising lows — buyers keep stepping in higher; textbook bias is an upside breakout.', upperNow);
    } else if (hSlope < -flat && Math.abs(lSlope) < flat) {
      push('descending-triangle', 'Descending triangle', -1, 'Flat support with falling highs — sellers keep pressing; textbook bias is a downside break.', lowerNow);
    } else if (hSlope < -flat && lSlope > flat) {
      push('symmetrical-triangle', 'Symmetrical triangle', 0, 'Falling highs and rising lows converge — a volatility squeeze; the break direction decides, and it more often follows the prior trend.', upperNow);
    } else if (hSlope > flat && lSlope > flat && lSlope > hSlope * 1.2) {
      push('rising-wedge', 'Rising wedge', -1, 'Both lines rise but the lows rise faster, so the range narrows — momentum is fading; textbook bias is bearish.', lowerNow);
    } else if (hSlope < -flat && lSlope < -flat && hSlope < lSlope * 1.2) {
      push('falling-wedge', 'Falling wedge', 1, 'Both lines fall but the highs fall faster, so selling pressure is fading; textbook bias is bullish.', upperNow);
    } else if (hSlope > flat && lSlope > flat) {
      push('channel-up', 'Rising channel', 1, 'Higher highs and higher lows in a parallel channel — an uptrend in progress.', lowerNow);
    } else if (hSlope < -flat && lSlope < -flat) {
      push('channel-down', 'Falling channel', -1, 'Lower highs and lower lows in a parallel channel — a downtrend in progress.', upperNow);
    }
    const last = out[out.length - 1];
    if (last && last.status === 'confirmed') {
      last.description += above ? ' Price has already closed above the upper line.' : ' Price has already closed below the lower line.';
      if (last.id === 'symmetrical-triangle') last.bias = above ? 1 : -1;
    }
  }

  // Moving-average crosses within the last 15 bars
  const s = buildSeries(closes);
  for (let i = t; i > t - 15 && i > 200; i--) {
    const a = smaAt(s, i, 50);
    const b = smaAt(s, i, 200);
    const pa = smaAt(s, i - 1, 50);
    const pb = smaAt(s, i - 1, 200);
    if (a === null || b === null || pa === null || pb === null) break;
    if (pa <= pb && a > b) {
      out.push({ id: 'golden-cross', name: 'Golden cross', bias: 1, status: 'confirmed', keyLevel: b, description: `The 50-day average crossed above the 200-day ${t - i} trading days ago.` });
      break;
    }
    if (pa >= pb && a < b) {
      out.push({ id: 'death-cross', name: 'Death cross', bias: -1, status: 'confirmed', keyLevel: b, description: `The 50-day average crossed below the 200-day ${t - i} trading days ago.` });
      break;
    }
  }
  return out;
}

// ---- Report --------------------------------------------------------------------------------

/**
 * @param yearBars bars per year: 252 for exchange-traded assets, 365 for 24/7 crypto (sets the
 *   12-1 month momentum and 52-week windows)
 * @param horizonDays forward window (in bars) for the historical hit-rate study
 */
export function analyzeTechnicals(closes: number[], horizonDays = 20, yearBars = 252): TechnicalReport | null {
  const clean = closes.filter((c) => Number.isFinite(c) && c > 0);
  if (clean.length < 60) return null;
  const s = buildSeries(clean);
  const t = clean.length - 1;
  const signals = signalsAt(s, t, yearBars);
  const score = scoreOf(signals);
  const mid = smaAt(s, t, 20);
  const sd = stdAt(s, t, 20);
  const yr = rangeAt(clean, Math.max(0, t - yearBars + 1), t);
  const { highs, lows } = findPivots(clean, Math.max(0, t - 120), t, 3);
  const price = clean[t];
  const resistance = highs.filter((p) => p.v > price).sort((a, b) => a.v - b.v)[0]?.v ?? null;
  const support = lows.filter((p) => p.v < price).sort((a, b) => b.v - a.v)[0]?.v ?? null;
  return {
    lastClose: price,
    indicators: {
      sma20: mid,
      sma50: smaAt(s, t, 50),
      sma200: smaAt(s, t, 200),
      rsi14: rsiAt(clean, t),
      macd: t >= 35 ? s.macd[t] : null,
      macdSignal: t >= 35 ? s.macdSignal[t] : null,
      macdHist: t >= 35 ? s.macd[t] - s.macdSignal[t] : null,
      bollUpper: mid !== null && sd !== null ? mid + 2 * sd : null,
      bollLower: mid !== null && sd !== null ? mid - 2 * sd : null,
      pctB: mid !== null && sd !== null && sd > 0 ? (price - (mid - 2 * sd)) / (4 * sd) : null,
      high52w: yr?.max ?? null,
      low52w: yr?.min ?? null,
      momentum12_1: t >= yearBars ? clean[t - Math.round(yearBars / 12)] / clean[t - yearBars] - 1 : null,
      support,
      resistance,
    },
    signals,
    score,
    patterns: detectPatterns(clean),
    edge: historicalEdge(s, leanOf(score), horizonDays, yearBars),
  };
}
