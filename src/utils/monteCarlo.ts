/**
 * monteCarlo.ts — Monte Carlo simulation of one asset's price path: thousands of possible futures
 * built by re-drawing the asset's own past daily moves in short blocks (block bootstrap), so
 * fat tails and streaks stay as they really happened and no bell curve is assumed. The asset's
 * own past trend is taken out first (a past rise says little about the next year and would read
 * as a promised gain), so the result shows how wide the outcomes can be, not where the price is
 * heading: the percentile bands day by day, the chance of touching ±10% on the way and the
 * typical worst drop. The future is assumed to be as restless as the sampled years, with no news.
 * Seeded, so the same history always gives the same result. Null when the history is too short.
 */

export const MC_PATHS = 2000;
/** Daily moves sampled: the last five years of trading days. */
export const MC_LOOKBACK = 1260;
/** Moves are drawn in runs of this many days, which keeps short streaks and volatility bursts. */
export const MC_BLOCK = 5;
/** The "touched on the way" level: 10% below / above today's price. */
export const MC_TOUCH = 0.1;
export const MC_MIN_RETURNS = 250;

/** Small seeded random generator (mulberry32), values in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number from a text (FNV-1a), used as the seed for one asset and day. */
export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface MonteCarloResult {
  horizon: number;
  paths: number;
  /** Daily moves the paths were drawn from. */
  sample: number;
  /** % change from today per day (index 0 = today = 0), per percentile of the paths. */
  bands: Record<'p5' | 'p25' | 'p50' | 'p75' | 'p95', number[]>;
  /** Share of paths (0–1) that were at least 10% below / above today's price at some point. */
  touchDown: number;
  touchUp: number;
  /** Median of each path's worst peak-to-trough fall, in % (zero or negative). */
  medianDrawdown: number;
}

const at = (sorted: Float64Array, q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

/** `closes` oldest first; `horizon` in trading days. */
export function monteCarlo(closes: number[], horizon: number, seed: number, paths = MC_PATHS): MonteCarloResult | null {
  const recent = closes.filter((c) => c > 0).slice(-(MC_LOOKBACK + 1));
  const moves: number[] = [];
  for (let i = 1; i < recent.length; i++) moves.push(Math.log(recent[i] / recent[i - 1]));
  if (moves.length < MC_MIN_RETURNS || horizon < 1) return null;
  // Remove the past trend: only the size and pattern of the moves is reused
  const mean = moves.reduce((a, b) => a + b, 0) / moves.length;
  for (let i = 0; i < moves.length; i++) moves[i] -= mean;

  const random = seededRandom(seed);
  // One row per day, one column per path: the log change from today
  const days = Array.from({ length: horizon + 1 }, () => new Float64Array(paths));
  const drawdowns = new Float64Array(paths);
  let touchDown = 0;
  let touchUp = 0;
  const down = Math.log(1 - MC_TOUCH);
  const rise = Math.log(1 + MC_TOUCH);
  for (let p = 0; p < paths; p++) {
    let sum = 0;
    let peak = 0;
    let low = 0;
    let high = 0;
    let worst = 0;
    let from = 0;
    for (let d = 1; d <= horizon; d++) {
      // A new block starts at a random day of the history
      if ((d - 1) % MC_BLOCK === 0) from = Math.floor(random() * (moves.length - MC_BLOCK + 1));
      sum += moves[from + ((d - 1) % MC_BLOCK)];
      days[d][p] = sum;
      if (sum > peak) peak = sum;
      if (sum < low) low = sum;
      if (sum > high) high = sum;
      if (sum - peak < worst) worst = sum - peak;
    }
    if (low <= down) touchDown++;
    if (high >= rise) touchUp++;
    drawdowns[p] = worst;
  }

  const pct = (logChange: number) => (Math.exp(logChange) - 1) * 100;
  const bands: MonteCarloResult['bands'] = { p5: [], p25: [], p50: [], p75: [], p95: [] };
  for (const row of days) {
    row.sort();
    bands.p5.push(pct(at(row, 0.05)));
    bands.p25.push(pct(at(row, 0.25)));
    bands.p50.push(pct(at(row, 0.5)));
    bands.p75.push(pct(at(row, 0.75)));
    bands.p95.push(pct(at(row, 0.95)));
  }
  drawdowns.sort();
  return { horizon, paths, sample: moves.length, bands, touchDown: touchDown / paths, touchUp: touchUp / paths, medianDrawdown: pct(at(drawdowns, 0.5)) };
}
