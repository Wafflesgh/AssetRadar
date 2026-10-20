/**
 * validation.ts — Evidence for the sentiment scores, rebuilt point-in-time: at every past month
 * end the pillars and horizon scores are recomputed from data public at that date (no analyst
 * consensus, no look-ahead), then compared with the returns that followed. Per horizon: the
 * information coefficient (Spearman rank correlation of score vs forward return, averaged over
 * months, with a t-statistic), the top-quintile hit rate vs the base rate, the top − bottom quintile
 * spread (also per year), samples and period. The first 60% of months is the validation period, the
 * last 40% the holdout. IC measured at increasing lags gives the score's half-life → review cadence.
 */
import { averageRanks } from './crossSection.ts';
import { cadenceFromHalfLife, icHalfLife } from './cadence.ts';
import { defaultCadence, scoreHorizon, type Cadence } from './horizons.ts';
import type { Horizon } from './newsHorizon.ts';
import { marketPillars } from './pillars.ts';
import { pricesUpTo, type Market, type StockInput } from './factors.ts';

/** Forward return window (months) per horizon on monthly data. */
export const FORWARD_MONTHS: Record<Horizon, number> = { short: 1, medium: 3, long: 12 };

export function spearman(x: number[], y: number[]): number | null {
  const pairs = x.map((v, i) => [v, y[i]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (pairs.length < 10) return null;
  const rx = averageRanks(pairs.map((p) => p[0]));
  const ry = averageRanks(pairs.map((p) => p[1]));
  const n = pairs.length;
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (rx[i] - mx) * (ry[i] - my);
    sxx += (rx[i] - mx) ** 2;
    syy += (ry[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

export interface MonthSample {
  month: string;
  /** Per stock: score and the forward return that followed. */
  scores: number[];
  returns: number[];
}

export interface HorizonEvidence {
  horizon: Horizon;
  months: number;
  stockMonths: number;
  from: string | null;
  to: string | null;
  meanIC: number | null;
  icTStat: number | null;
  significant: boolean;
  /** Share of top-quintile stocks with a positive forward return vs the same share for all stocks (%). */
  topHitRate: number | null;
  baseRate: number | null;
  /** Share of months in which the top quintile beat the base rate (%). */
  monthsTopBeatBase: number | null;
  /** Mean (top − bottom quintile) forward return per month, and per calendar year. */
  spread: number | null;
  spreadByYear: Array<{ year: string; spread: number; months: number }>;
  validation: { meanIC: number | null; months: number };
  holdout: { meanIC: number | null; months: number };
}

const mean = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : null);

/** Evidence statistics from month samples (already point-in-time). */
export function evidenceFrom(h: Horizon, samples: MonthSample[]): HorizonEvidence {
  const ics: number[] = [];
  let topPos = 0;
  let topN = 0;
  let allPos = 0;
  let allN = 0;
  let beat = 0;
  const spreads: Array<{ month: string; spread: number }> = [];
  const icByMonth: Array<number | null> = [];
  for (const s of samples) {
    const ic = spearman(s.scores, s.returns);
    icByMonth.push(ic);
    if (ic !== null) ics.push(ic);
    const pairs = s.scores.map((v, i) => [v, s.returns[i]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b)).sort((a, b) => b[0] - a[0]);
    if (pairs.length < 10) continue;
    const q = Math.max(1, Math.floor(pairs.length / 5));
    const top = pairs.slice(0, q).map((p) => p[1]);
    const bottom = pairs.slice(-q).map((p) => p[1]);
    const topRate = top.filter((r) => r > 0).length / top.length;
    const baseRate = pairs.filter((p) => p[1] > 0).length / pairs.length;
    topPos += top.filter((r) => r > 0).length;
    topN += top.length;
    allPos += pairs.filter((p) => p[1] > 0).length;
    allN += pairs.length;
    if (topRate > baseRate) beat++;
    spreads.push({ month: s.month, spread: (mean(top) as number) - (mean(bottom) as number) });
  }
  const m = mean(ics);
  const sd = ics.length > 1 && m !== null ? Math.sqrt(ics.reduce((a, b) => a + (b - m) ** 2, 0) / (ics.length - 1)) : null;
  // Overlapping forward windows overstate independence: shrink the t-stat by √(window)
  const overlap = Math.sqrt(FORWARD_MONTHS[h]);
  const t = m !== null && sd && sd > 0 ? ((m / sd) * Math.sqrt(ics.length)) / overlap : null;
  const split = Math.floor(samples.length * 0.6);
  const valIC = icByMonth.slice(0, split).filter((x): x is number => x !== null);
  const holdIC = icByMonth.slice(split).filter((x): x is number => x !== null);
  const years = new Map<string, number[]>();
  for (const sp of spreads) years.set(sp.month.slice(0, 4), [...(years.get(sp.month.slice(0, 4)) ?? []), sp.spread]);
  return {
    horizon: h,
    months: samples.length,
    stockMonths: samples.reduce((a, s) => a + s.scores.filter(Number.isFinite).length, 0),
    from: samples[0]?.month ?? null,
    to: samples[samples.length - 1]?.month ?? null,
    meanIC: m,
    icTStat: t,
    significant: t !== null && Math.abs(t) >= 2,
    topHitRate: topN ? (topPos / topN) * 100 : null,
    baseRate: allN ? (allPos / allN) * 100 : null,
    monthsTopBeatBase: spreads.length ? (beat / spreads.length) * 100 : null,
    spread: mean(spreads.map((s) => s.spread)),
    spreadByYear: [...years.entries()].map(([year, v]) => ({ year, spread: mean(v) as number, months: v.length })),
    validation: { meanIC: mean(valIC), months: valIC.length },
    holdout: { meanIC: mean(holdIC), months: holdIC.length },
  };
}

/** Forward return from the month after `month` over `months` months (null when not yet known). */
function forwardReturn(s: StockInput, month: string, months: number): number {
  const p = s.monthly;
  const i = p.findIndex((x) => x.month === month);
  if (i < 0 || i + months >= p.length) return NaN;
  return p[i + months].close / p[i].close - 1;
}

/** Month labels between two YYYY-MM (inclusive). */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export interface MarketValidation {
  market: Market;
  generatedAt: number;
  /** What the back-test could and could not include. */
  scope: string[];
  horizons: Record<Horizon, HorizonEvidence>;
  pillars: Record<'momentum' | 'health' | 'quality', HorizonEvidence>;
  /** IC of the Medium score at increasing lags (months) and the resulting cadence per horizon. */
  decay: Array<{ lag: number; ic: number }>;
  halfLifeDays: number | null;
  cadence: Record<Horizon, { cadence: Cadence; reason: string | null }>;
  /** Bettman window as in the paper (t−12…t−7) vs the last 6 months: kept only if validation improved. */
  dWindow: { paper: number | null; recent: number | null; chosen: 'paper' | 'recent'; holdout: number | null };
  /** Years of statement history behind the fundamental pillars. */
  fundamentalYears: number | null;
}

/**
 * Point-in-time back-test of a market's cross-section. `lastMonth` = the newest month with known
 * forward returns; months with fewer than 20 scored stocks are skipped.
 */
export function validateMarket(stocks: StockInput[], market: Market, lastMonth: string, maxMonths = 60): MarketValidation | null {
  const firstMonths = stocks.map((s) => s.monthly[0]?.month).filter(Boolean).sort();
  if (!firstMonths.length) return null;
  // Momentum needs 14 months of prices before the first scored month
  const start = monthRange(firstMonths[Math.floor(firstMonths.length / 2)], lastMonth)[14];
  if (!start) return null;
  const months = monthRange(start, lastMonth).slice(-maxMonths);
  const H: Horizon[] = ['short', 'medium', 'long'];
  const samples: Record<Horizon, MonthSample[]> = { short: [], medium: [], long: [] };
  const pillarSamples: Record<'momentum' | 'health' | 'quality', MonthSample[]> = { momentum: [], health: [], quality: [] };
  const lagSamples = new Map<number, MonthSample[]>();
  const dPaper: MonthSample[] = [];
  const dRecent: MonthSample[] = [];
  let fundamentalYears: number | null = null;
  for (const month of months) {
    const active = stocks.filter((s) => pricesUpTo(s.monthly, month).length >= 14);
    if (active.length < 20) continue;
    const mp = marketPillars(active, market, month, false);
    const rows = active.map((s) => {
      const sp = mp.stocks.get(s.symbol);
      return { s, sp };
    });
    for (const h of H) {
      const scores: number[] = [];
      const rets: number[] = [];
      for (const { s, sp } of rows) {
        const r = scoreHorizon(h, { group: market === 'idx' ? 'idStock' : 'usStock', pillars: sp?.pillars ?? null });
        scores.push(r.score ?? NaN);
        rets.push(forwardReturn(s, month, FORWARD_MONTHS[h]));
      }
      if (rets.some(Number.isFinite)) samples[h].push({ month, scores, returns: rets });
    }
    for (const id of ['momentum', 'health', 'quality'] as const) {
      const scores = rows.map(({ sp }) => sp?.pillars[id].score ?? NaN);
      const rets = rows.map(({ s }) => forwardReturn(s, month, id === 'momentum' ? 3 : 12));
      if (rets.some(Number.isFinite)) pillarSamples[id].push({ month, scores, returns: rets });
    }
    for (const lag of [1, 2, 3, 6, 12]) {
      // Medium score at this month vs the 1-month return `lag` months later (information decay)
      const scores = rows.map(({ sp }) => scoreHorizon('medium', { group: 'idStock', pillars: sp?.pillars ?? null }).score ?? NaN);
      const rets = rows.map(({ s }) => {
        const i = s.monthly.findIndex((x) => x.month === month);
        const a = s.monthly[i + lag - 1];
        const b = s.monthly[i + lag];
        return i >= 0 && a && b ? b.close / a.close - 1 : NaN;
      });
      if (rets.some(Number.isFinite)) lagSamples.set(lag, [...(lagSamples.get(lag) ?? []), { month, scores, returns: rets }]);
    }
    // D_Up/D_Down window variants (raw window return as the score)
    dPaper.push({ month, scores: rows.map(({ sp }) => sp?.raw.bettmanWindow ?? NaN), returns: rows.map(({ s }) => forwardReturn(s, month, 3)) });
    dRecent.push({ month, scores: rows.map(({ sp }) => sp?.raw.recent6m ?? NaN), returns: rows.map(({ s }) => forwardReturn(s, month, 3)) });
    const years = rows.map(({ s }) => s.annual.length).filter((n) => n > 0);
    if (years.length) fundamentalYears = Math.max(fundamentalYears ?? 0, ...years);
  }
  if (!samples.medium.length) return null;
  const horizons = Object.fromEntries(H.map((h) => [h, evidenceFrom(h, samples[h])])) as Record<Horizon, HorizonEvidence>;
  const pillars = {
    momentum: evidenceFrom('medium', pillarSamples.momentum),
    health: evidenceFrom('long', pillarSamples.health),
    quality: evidenceFrom('long', pillarSamples.quality),
  };
  const decay = [...lagSamples.entries()]
    .map(([lag, s]) => ({ lag, ic: evidenceFrom('short', s).meanIC }))
    .filter((x): x is { lag: number; ic: number } => x.ic !== null)
    .sort((a, b) => a.lag - b.lag);
  const halfLifeMonths = icHalfLife(decay);
  const halfLifeDays = halfLifeMonths === null ? null : halfLifeMonths * 21;
  const cadence = Object.fromEntries(
    H.map((h) => [h, h === 'short' ? { cadence: defaultCadence(h, 'idStock'), reason: 'daily data is not part of the monthly back-test' } : cadenceFromHalfLife(halfLifeDays, defaultCadence(h, 'idStock'))])
  ) as MarketValidation['cadence'];
  const ep = evidenceFrom('medium', dPaper);
  const er = evidenceFrom('medium', dRecent);
  const chosen = er.validation.meanIC !== null && ep.validation.meanIC !== null && er.validation.meanIC > ep.validation.meanIC ? 'recent' : 'paper';
  return {
    market,
    generatedAt: Date.now(),
    scope: [
      'Pillars rebuilt point-in-time each month (statements after their publication lag, no analyst consensus).',
      'News and daily technicals have no stored history, so they are not part of this back-test.',
      `Forward returns: Short ${FORWARD_MONTHS.short} month, Medium ${FORWARD_MONTHS.medium} months, Long ${FORWARD_MONTHS.long} months (monthly closes).`,
    ],
    horizons,
    pillars,
    decay,
    halfLifeDays,
    cadence,
    dWindow: { paper: ep.validation.meanIC, recent: er.validation.meanIC, chosen, holdout: (chosen === 'recent' ? er : ep).holdout.meanIC },
    fundamentalYears,
  };
}

/** One plain sentence for the Evidence panel (English source; the UI translates the template). */
export function evidenceSentence(e: HorizonEvidence, marketName: string): string | null {
  if (e.monthsTopBeatBase === null || !e.from) return null;
  return `On ${marketName} since ${e.from.slice(0, 4)}, the top 20% by ${e.horizon} score beat the base rate in ${Math.round(e.monthsTopBeatBase)}% of months.`;
}


/**
 * Back-test for a panel of daily series without statements (the Binance top 100): every `step`
 * days the Short score (technicals + time-series momentum + trend, closed candles up to that day)
 * and the Medium score are compared with the next 7 / 30 days' return across the panel.
 */
export function validatePanel(
  series: Array<{ symbol: string; closes: number[] }>,
  scoreAt: (closes: number[], h: Horizon) => number | null,
  step = 7
): Record<'short' | 'medium', HorizonEvidence> | null {
  const len = Math.min(...series.map((s) => s.closes.length));
  if (!series.length || !Number.isFinite(len) || len < 260) return null;
  const forward: Record<'short' | 'medium', number> = { short: 7, medium: 30 };
  const out = {} as Record<'short' | 'medium', HorizonEvidence>;
  for (const h of ['short', 'medium'] as const) {
    const samples: MonthSample[] = [];
    for (let t = 250; t + forward[h] < len; t += step) {
      const scores: number[] = [];
      const returns: number[] = [];
      for (const s of series) {
        // Align on the most recent `len` bars of each series
        const c = s.closes.slice(s.closes.length - len);
        scores.push(scoreAt(c.slice(0, t + 1), h) ?? NaN);
        returns.push(c[t + forward[h]] / c[t] - 1);
      }
      samples.push({ month: `day ${t}`, scores, returns });
    }
    out[h] = evidenceFrom(h, samples);
  }
  return out;
}
