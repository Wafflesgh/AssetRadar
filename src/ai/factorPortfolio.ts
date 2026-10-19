/**
 * factorPortfolio.ts — Value and momentum factor portfolios in the style of Asness, Moskowitz
 * & Pedersen, "Value and Momentum Everywhere" (2013), built from monthly closes:
 *
 *  - Momentum signal: return from 12 months to 1 month ago (skipping the latest month).
 *  - Value signal: log of the average price 4.5–5.5 years ago over today's price (AMP's value
 *    measure for non-equity assets; used for every universe here because historical book
 *    values are not available for free).
 *  - Long-short ("academic"): rank-weighted, $1 long / $1 short, rebalanced monthly.
 *  - Long-only: the top third of the universe by signal, equally weighted.
 *  - Optional quality filter (stocks): only stocks whose latest *published* Piotroski F-score
 *    (fiscal year end + 4 months) is at least 8 of 9 may be held long.
 *
 * Signals at the end of month t only use prices up to t; the return earned is month t+1's.
 * Fees, taxes, slippage and short-borrow costs are not included.
 */

export interface MonthlySeries {
  symbol: string;
  /** Month key "YYYY-MM" → month-end close. */
  closes: Map<string, number>;
}

/** Published F-scores per stock: usable from `from` (YYYY-MM) onward. */
export type FScoreTimeline = Map<string, Array<{ from: string; score: number }>>;

export interface FactorSeries {
  months: string[];
  /** Monthly returns (decimal); null where the portfolio could not be formed. */
  valueLS: Array<number | null>;
  momentumLS: Array<number | null>;
  valueLO: Array<number | null>;
  momentumLO: Array<number | null>;
  /** Long-only portfolios restricted to F-score ≥ 8 stocks (null before F-scores exist). */
  valueLOQ: Array<number | null>;
  momentumLOQ: Array<number | null>;
  benchmark: Array<number | null>;
  /** Assets in the cross-section each month. */
  breadth: number[];
}

export type QuantUniverse = 'usStock' | 'idStock' | 'index' | 'forex' | 'commodity' | 'everywhere';

export const QUANT_UNIVERSE_LABELS: Record<QuantUniverse, string> = {
  usStock: 'US stocks',
  idStock: 'Indonesian stocks',
  index: 'World stock indices',
  forex: 'Currencies vs Rupiah',
  commodity: 'Commodities',
  everywhere: 'Everywhere (indices + currencies + commodities)',
};

/** What /api/quant/factors returns. */
export interface QuantFactorsPayload extends FactorSeries {
  universe: QuantUniverse;
  label: string;
  members: string[];
  /** US 3-month T-bill, monthly (decimal), aligned to `months`. */
  rf: Array<number | null>;
  hasQuality: boolean;
  generatedAt: number;
}

export interface PerformanceStats {
  months: number;
  annualReturn: number; // CAGR
  volatility: number; // annualized
  sharpe: number | null;
  maxDrawdown: number;
}

export const MIN_CROSS_SECTION = 6;
const VALUE_FROM = 54; // months ago (4.5 years)
const VALUE_TO = 66; // months ago (5.5 years)

/**
 * Removes isolated bad prints from a monthly series (Yahoo's currency pairs contain months off
 * by a factor of 10 or 100): a point far above or below *both* neighbors is dropped.
 */
export function despike(points: Array<{ key: string; close: number }>, factor = 1.8): Array<{ key: string; close: number }> {
  const out: Array<{ key: string; close: number }> = [];
  for (let i = 0; i < points.length; i++) {
    const prev = out.length ? out[out.length - 1].close : undefined;
    const next = points[i + 1]?.close;
    const c = points[i].close;
    if (prev !== undefined && next !== undefined) {
      const up = c / prev > factor && c / next > factor;
      const down = prev / c > factor && next / c > factor;
      if (up || down) continue;
    }
    out.push(points[i]);
  }
  return out;
}

/** Monthly returns beyond these bounds are treated as data errors and skipped. */
const MAX_MONTHLY_RETURN = 3;
const MIN_MONTHLY_RETURN = -0.9;

export function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

function signalsAt(s: MonthlySeries, month: string): { mom: number | null; value: number | null } {
  const c = (k: number) => s.closes.get(addMonths(month, -k));
  const now = c(0);
  if (!now || now <= 0) return { mom: null, value: null };
  const c1 = c(1);
  const c12 = c(12);
  const mom = c1 && c12 && c12 > 0 ? c1 / c12 - 1 : null;
  let sum = 0;
  let n = 0;
  for (let k = VALUE_FROM; k <= VALUE_TO; k++) {
    const v = c(k);
    if (v && v > 0) {
      sum += v;
      n += 1;
    }
  }
  const value = n >= 8 ? Math.log(sum / n / now) : null;
  return { mom, value };
}

/** Rank weights summing to +1 on the long side and −1 on the short side. */
export function rankWeights(signals: number[]): number[] {
  const n = signals.length;
  const order = signals.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(n);
  // Average ranks for ties
  for (let i = 0; i < n; ) {
    let j = i;
    while (j + 1 < n && order[j + 1].v === order[i].v) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[order[k].i] = r;
    i = j + 1;
  }
  const mean = (n + 1) / 2;
  const raw = ranks.map((r) => r - mean);
  const gross = raw.reduce((a, x) => a + Math.abs(x), 0);
  return gross > 0 ? raw.map((x) => (2 * x) / gross) : raw.map(() => 0);
}

function topThirdReturn(rows: Array<{ signal: number; ret: number }>): number | null {
  if (rows.length === 0) return null;
  const k = Math.max(1, Math.ceil(rows.length / 3));
  const top = [...rows].sort((a, b) => b.signal - a.signal).slice(0, k);
  return top.reduce((a, r) => a + r.ret, 0) / top.length;
}

function latestFScore(timeline: FScoreTimeline | undefined, symbol: string, month: string): number | null {
  const list = timeline?.get(symbol);
  if (!list) return null;
  let score: number | null = null;
  for (const e of list) if (e.from <= month) score = e.score;
  return score;
}

export function buildFactorSeries(universe: MonthlySeries[], fscores?: FScoreTimeline, minFScore = 8): FactorSeries {
  const allMonths = new Set<string>();
  for (const s of universe) for (const k of s.closes.keys()) allMonths.add(k);
  const months = [...allMonths].sort();
  const out: FactorSeries = {
    months: [],
    valueLS: [],
    momentumLS: [],
    valueLO: [],
    momentumLO: [],
    valueLOQ: [],
    momentumLOQ: [],
    benchmark: [],
    breadth: [],
  };
  const firstFScore = fscores
    ? [...fscores.values()].flat().reduce<string | null>((min, e) => (min === null || e.from < min ? e.from : min), null)
    : null;

  for (let i = 0; i < months.length - 1; i++) {
    const t = months[i];
    const next = months[i + 1];
    const rows: Array<{ symbol: string; mom: number | null; value: number | null; ret: number }> = [];
    for (const s of universe) {
      const a = s.closes.get(t);
      const b = s.closes.get(next);
      if (!a || !b || a <= 0) continue;
      const ret = b / a - 1;
      if (ret > MAX_MONTHLY_RETURN || ret < MIN_MONTHLY_RETURN) continue;
      const { mom, value } = signalsAt(s, t);
      rows.push({ symbol: s.symbol, mom, value, ret });
    }
    const momRows = rows.filter((r) => r.mom !== null) as Array<{ symbol: string; mom: number; value: number | null; ret: number }>;
    const valRows = rows.filter((r) => r.value !== null) as Array<{ symbol: string; mom: number | null; value: number; ret: number }>;
    // Both factors need a full cross-section so the comparison is like for like
    if (momRows.length < MIN_CROSS_SECTION || valRows.length < MIN_CROSS_SECTION) continue;

    const ls = (sig: number[], rets: number[]) => rankWeights(sig).reduce((a, w, k) => a + w * rets[k], 0);
    out.months.push(next);
    out.momentumLS.push(ls(momRows.map((r) => r.mom), momRows.map((r) => r.ret)));
    out.valueLS.push(ls(valRows.map((r) => r.value), valRows.map((r) => r.ret)));
    out.momentumLO.push(topThirdReturn(momRows.map((r) => ({ signal: r.mom, ret: r.ret }))));
    out.valueLO.push(topThirdReturn(valRows.map((r) => ({ signal: r.value, ret: r.ret }))));
    out.benchmark.push(rows.reduce((a, r) => a + r.ret, 0) / rows.length);
    out.breadth.push(rows.length);

    if (fscores && firstFScore && t >= firstFScore) {
      const ok = (sym: string) => (latestFScore(fscores, sym, t) ?? -1) >= minFScore;
      // Rank on the full universe, then hold only the qualifying names among the top third
      const pick = (list: Array<{ symbol: string; signal: number; ret: number }>) => {
        const k = Math.max(1, Math.ceil(list.length / 3));
        const top = [...list].sort((a, b) => b.signal - a.signal).slice(0, k).filter((r) => ok(r.symbol));
        return top.length ? top.reduce((a, r) => a + r.ret, 0) / top.length : 0; // no qualifier → cash (0%)
      };
      out.momentumLOQ.push(pick(momRows.map((r) => ({ symbol: r.symbol, signal: r.mom, ret: r.ret }))));
      out.valueLOQ.push(pick(valRows.map((r) => ({ symbol: r.symbol, signal: r.value, ret: r.ret }))));
    } else {
      out.momentumLOQ.push(null);
      out.valueLOQ.push(null);
    }
  }
  return out;
}

/** Monthly-rebalanced blend: w × value + (1 − w) × momentum. */
export function blend(value: Array<number | null>, momentum: Array<number | null>, wValue: number): Array<number | null> {
  return value.map((v, i) => {
    const m = momentum[i];
    return v === null || m === null ? null : wValue * v + (1 - wValue) * m;
  });
}

export function performance(returns: Array<number | null>, rfMonthly: Array<number | null> | null = null): PerformanceStats | null {
  const rs: number[] = [];
  const ex: number[] = [];
  returns.forEach((r, i) => {
    if (r === null || !Number.isFinite(r)) return;
    rs.push(r);
    ex.push(r - (rfMonthly?.[i] ?? 0));
  });
  if (rs.length < 12) return null;
  let growth = 1;
  let peak = 1;
  let mdd = 0;
  for (const r of rs) {
    growth *= 1 + r;
    peak = Math.max(peak, growth);
    mdd = Math.min(mdd, growth / peak - 1);
  }
  const mean = ex.reduce((a, b) => a + b, 0) / ex.length;
  const meanRaw = rs.reduce((a, b) => a + b, 0) / rs.length;
  const sd = Math.sqrt(rs.reduce((a, b) => a + (b - meanRaw) ** 2, 0) / (rs.length - 1));
  const vol = sd * Math.sqrt(12);
  return {
    months: rs.length,
    annualReturn: Math.pow(growth, 12 / rs.length) - 1,
    volatility: vol,
    sharpe: vol > 0 ? (mean * 12) / vol : null,
    maxDrawdown: mdd,
  };
}

/** Pearson correlation over months where both series exist. */
export function correlation(a: Array<number | null>, b: Array<number | null>): number | null {
  const xs: number[] = [];
  const ys: number[] = [];
  a.forEach((x, i) => {
    const y = b[i];
    if (x !== null && y !== null && y !== undefined) {
      xs.push(x);
      ys.push(y);
    }
  });
  if (xs.length < 12) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

/** Growth of 1 unit (null months keep the previous value). */
export function equityCurve(returns: Array<number | null>): number[] {
  let v = 1;
  return returns.map((r) => {
    if (r !== null && Number.isFinite(r)) v *= 1 + r;
    return v;
  });
}
