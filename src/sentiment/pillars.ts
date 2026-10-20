/**
 * pillars.ts — The three 0–100 pillar scores of every stock in one market at one month end,
 * from cross-sectional percentiles (higher = more bullish). Sub-factors that are missing are
 * dropped and the remaining weights rescaled (and flagged).
 *  1. Fast-Track Trading & Momentum: momentum 12-2 (40%), Bettman extreme decile D_Up/D_Down on
 *     months t−12…t−7 (30%), earnings surprise — SUE, else the analyst-surprise proxy (30%).
 *  2. Financial Health & Turnaround: Piotroski F-score (60%), Abarbanell & Bushee operational audit
 *     (INV, AR, CAPX vs industry, GM, S&A, ETR; deciles per market, averaged) (40%).
 *  3. Core Quality & Valuation: gross profitability (banks: ROA) minus the industry median (50%),
 *     book-to-market minus the industry median (30%), discount to the re-estimated hybrid fair value (20%).
 * Deciles are formed on liquid stocks only (value traded ≥ the market's threshold); every stock is
 * then placed against those breakpoints.
 */
import { clamp100, decileBreakpoints, decileOf, industryAdjust, median, percentiles } from './crossSection.ts';
import { rawFactors, type Market, type RawFactors, type StockInput } from './factors.ts';
import { chooseVariant, discount, fairValue, type HybridModel, type HybridRow, type HybridVariant } from './hybridValue.ts';

export type PillarId = 'momentum' | 'health' | 'quality';

export interface SubFactor {
  id: string;
  /** Weight inside the pillar before rescaling. */
  weight: number;
  raw: number | null;
  /** 0–100 (higher = more bullish); null = not available. */
  score: number | null;
  note?: string;
}

export interface PillarScore {
  id: PillarId;
  score: number | null;
  subFactors: SubFactor[];
  /** True when a missing sub-factor's weight was spread over the others. */
  reweighted: boolean;
  /** Share of the pillar's weight that had data (0–1). */
  coverage: number;
}

export interface StockPillars {
  symbol: string;
  raw: RawFactors;
  pillars: Record<PillarId, PillarScore>;
  dUp: boolean;
  dDown: boolean;
  /** F-score 0–1: the paper's low scorers were ~5× more likely to delist. */
  distressWarning: boolean;
  fairValue: number | null;
  hybridDiscount: number | null;
}

export interface MarketPillars {
  market: Market;
  asOfMonth: string;
  n: number;
  /** Stocks with value traded at or above this formed the deciles (null = all). */
  liquidityThreshold: number | null;
  hybrid: HybridModel | null;
  hybridErrors: Record<HybridVariant, number | null>;
  /** Fewer than 30 stocks: percentiles are rough. */
  smallPeerGroup: boolean;
  stocks: Map<string, StockPillars>;
}

/** Minimum typical daily value traded for decile formation (local currency). */
export const LIQUIDITY_THRESHOLD: Record<Market, number> = { idx: 500_000_000, us: 10_000_000 };

/** Weighted mean of the available sub-factor scores. */
export function combine(id: PillarId, subFactors: SubFactor[]): PillarScore {
  const total = subFactors.reduce((s, f) => s + f.weight, 0);
  const have = subFactors.filter((f) => f.score !== null && Number.isFinite(f.score));
  const w = have.reduce((s, f) => s + f.weight, 0);
  const score = w > 0 ? clamp100(have.reduce((s, f) => s + (f.score as number) * f.weight, 0) / w) : null;
  return { id, score, subFactors, reweighted: w > 0 && w < total, coverage: total > 0 ? w / total : 0 };
}

const toNum = (x: number | null | undefined) => (x === null || x === undefined ? NaN : x);
const orNull = (x: number) => (Number.isFinite(x) ? x : null);

/** Decile 1–10 → 0–100. */
const decileScore = (d: number | null) => (d === null ? null : ((d - 1) / 9) * 100);

/**
 * Builds all pillar scores of a market at `asOfMonth`. `useAnalyst` adds today's consensus
 * (FEPS, surprise proxy) and must be false for historical (back-test) dates.
 */
export function marketPillars(stocks: StockInput[], market: Market, asOfMonth: string, useAnalyst: boolean): MarketPillars {
  const raws = stocks.map((s) => rawFactors(s, asOfMonth, useAnalyst));
  const n = raws.length;
  const threshold = LIQUIDITY_THRESHOLD[market];
  const liquid = stocks.map((s) => s.valueTraded === undefined || s.valueTraded >= threshold);
  const usedThreshold = stocks.some((s) => s.valueTraded !== undefined) ? threshold : null;

  // ---- Pillar 1 inputs
  const mom = raws.map((r) => toNum(r.momentum12_2));
  const momPct = percentiles(mom);
  const bw = raws.map((r) => toNum(r.bettmanWindow));
  const bwBreaks = decileBreakpoints(bw.filter((_, i) => liquid[i]));
  const bwDecile = bw.map((x) => decileOf(x, bwBreaks));
  const suePct = percentiles(raws.map((r) => toNum(r.sue)));

  // ---- Pillar 2 inputs: operational deciles (CAPX against the industry median growth)
  const industries = stocks.map((s) => s.industry ?? null);
  const capex = industryAdjust(raws.map((r) => toNum(r.operational.capexGrowth)), industries);
  const opKeys = ['inv', 'ar', 'gm', 'sga', 'etr'] as const;
  const opValues: Record<string, number[]> = Object.fromEntries(opKeys.map((k) => [k, raws.map((r) => toNum(r.operational[k]))]));
  opValues.capx = capex.adjusted;
  const opDeciles: Record<string, Array<number | null>> = {};
  for (const [k, vals] of Object.entries(opValues)) {
    const br = decileBreakpoints(vals.filter((_, i) => liquid[i]));
    opDeciles[k] = vals.map((x) => decileOf(x, br));
  }

  // ---- Pillar 3 inputs (banks compared with banks through their industry)
  const prof = industryAdjust(raws.map((r) => toNum(r.profitability)), industries);
  const profPct = percentiles(prof.adjusted);
  const bm = industryAdjust(raws.map((r) => toNum(r.bookToMarket)), industries);
  const bmPct = percentiles(bm.adjusted);

  // Hybrid fair value (re-estimated on this market and date)
  const dUp = bwDecile.map((d) => d === 10);
  const dDown = bwDecile.map((d) => d === 1);
  const hybridRows: HybridRow[] = raws.map((r, i) => ({
    symbol: r.symbol,
    price: toNum(r.price),
    bvps: r.bvps,
    eps: r.eps,
    feps: r.feps,
    priceT5: r.priceT5,
    dUp: dUp[i] ? 1 : 0,
    dDown: dDown[i] ? 1 : 0,
  }));
  const { model: hybrid, errors: hybridErrors } = chooseVariant(hybridRows);
  const disc = hybridRows.map((row) => (hybrid ? toNum(discount(hybrid, row)) : NaN));
  const discPct = percentiles(disc);

  const out = new Map<string, StockPillars>();
  raws.forEach((r, i) => {
    const decs = Object.values(opDeciles).map((d) => d[i]).filter((d): d is number => d !== null);
    const opScore = decs.length >= 2 ? decileScore(decs.reduce((a, b) => a + b, 0) / decs.length) : null;
    const fScore = r.fScore !== null && r.fScoreMax !== null && r.fScoreMax >= 5 ? (r.fScore / r.fScoreMax) * 100 : null;
    const pillars: Record<PillarId, PillarScore> = {
      momentum: combine('momentum', [
        { id: 'momentum12_2', weight: 40, raw: r.momentum12_2, score: orNull(momPct[i]) },
        {
          id: 'extremeDecile',
          weight: 30,
          raw: r.bettmanWindow,
          score: bwDecile[i] === null ? null : dUp[i] ? 100 : dDown[i] ? 0 : 50,
          note: bwDecile[i] === null ? undefined : `decile ${bwDecile[i]}`,
        },
        {
          id: r.sueSource === 'analyst-surprise' ? 'analystSurprise' : 'sue',
          weight: 30,
          raw: r.sue,
          score: orNull(suePct[i]),
          note: r.sueSource === 'analyst-surprise' ? 'analyst surprise (proxy for SUE)' : undefined,
        },
      ]),
      health: combine('health', [
        { id: 'fScore', weight: 60, raw: r.fScore, score: fScore, note: r.fScoreMax !== null ? `${r.fScore}/${r.fScoreMax}` : undefined },
        {
          id: 'operational',
          weight: 40,
          raw: decs.length ? decs.reduce((a, b) => a + b, 0) / decs.length : null,
          score: opScore,
          note: r.operational.priorBadEarnings ? 'prior bad earnings news' : undefined,
        },
      ]),
      quality: combine('quality', [
        {
          id: r.profitabilityKind === 'roa' ? 'roaIndustryAdj' : 'gpaIndustryAdj',
          weight: 50,
          raw: orNull(prof.adjusted[i]),
          score: orNull(profPct[i]),
          note: prof.usedMarket[i] && Number.isFinite(prof.adjusted[i]) ? 'market median (small industry)' : undefined,
        },
        { id: 'bookToMarketIndustryAdj', weight: 30, raw: orNull(bm.adjusted[i]), score: orNull(bmPct[i]) },
        { id: 'hybridDiscount', weight: 20, raw: orNull(disc[i]), score: orNull(discPct[i]) },
      ]),
    };
    out.set(r.symbol, {
      symbol: r.symbol,
      raw: r,
      pillars,
      dUp: dUp[i],
      dDown: dDown[i],
      distressWarning: r.fScore !== null && r.fScoreMax !== null && r.fScoreMax >= 8 && r.fScore <= 1,
      fairValue: hybrid ? fairValue(hybrid, hybridRows[i]) : null,
      hybridDiscount: orNull(disc[i]),
    });
  });
  return {
    market,
    asOfMonth,
    n,
    liquidityThreshold: usedThreshold,
    hybrid,
    hybridErrors,
    smallPeerGroup: n < 30,
    stocks: out,
  };
}

/** Median of a pillar across the market (for "vs market" context). */
export function pillarMedian(m: MarketPillars, id: PillarId): number | null {
  const v = [...m.stocks.values()].map((s) => toNum(s.pillars[id].score));
  const med = median(v);
  return Number.isFinite(med) ? med : null;
}
