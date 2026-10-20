/**
 * horizons.ts — Short / Medium / Long investment sentiment (0–100) from weighted components:
 * short-term technicals, the three pillars, news per horizon, Indonesian macro (IHSG, IDX stocks,
 * Rupiah pairs only) and crypto derivatives positioning (Binance crypto only). Default weights
 * follow the plan's table; components that do not apply or have no data are dropped and their
 * weight is spread over the rest (reported). Assets without financial statements (crypto, indices,
 * currencies, commodities, world stocks) replace the two fundamental pillars with time-series
 * momentum (12-2 and 200-day) and trend. Every component reports its contribution in points, so
 * 50 + Σ contributions = the score. A summary of evidence, never a buy/sell signal.
 */
import { analyzeTechnicals } from '../ai/technical.ts';
import type { AssetGroup } from '../config/assets.ts';
import type { PillarScore } from './pillars.ts';
import type { Horizon, HorizonNews } from './newsHorizon.ts';

export type SentimentLabel5 = 'Strong Bearish' | 'Bearish' | 'Neutral' | 'Bullish' | 'Strong Bullish';
export type ComponentId = 'technical' | 'momentum' | 'news' | 'health' | 'quality' | 'macro' | 'derivatives' | 'tsMomentum' | 'trend';
export type Confidence = 'Low' | 'Medium' | 'High';
export type Cadence = 'Every 4 hours' | 'Daily' | 'Weekly' | 'Monthly';

/** Default weights (%) per horizon. tsMomentum / trend only stand in for the fundamental pillars. */
export const HORIZON_WEIGHTS: Record<Horizon, Partial<Record<ComponentId, number>>> = {
  short: { technical: 45, momentum: 20, news: 25, macro: 5, derivatives: 5 },
  medium: { technical: 15, momentum: 35, news: 15, health: 20, quality: 10, macro: 5 },
  long: { momentum: 10, news: 5, health: 25, quality: 45, macro: 15 },
};

export const REFERENCES: Record<ComponentId, string> = {
  technical: 'Brock, Lakonishok & LeBaron (1992); Jegadeesh (1990) short-term reversal; Novy-Marx r(1,0)',
  momentum: 'Asness, Moskowitz & Pedersen (2013); Bettman, Sault & Schultz (2009) extreme deciles; Novy-Marx SUE',
  news: 'Tetlock (2007); event classification with source and recency weights',
  health: 'Piotroski (2000); Abarbanell & Bushee (1997)',
  quality: 'Novy-Marx (2013) gross profitability; Asness, Moskowitz & Pedersen (2013) value; Bettman et al. (2009) hybrid model',
  macro: 'Bank Indonesia, BPS, FRED data (rates, inflation, Rupiah)',
  derivatives: 'Binance futures funding, open interest and long/short ratio (contrarian positioning)',
  tsMomentum: 'Moskowitz, Ooi & Pedersen (2012) time-series momentum',
  trend: 'Brock, Lakonishok & LeBaron (1992) moving-average rule',
};

export function label5(score: number): SentimentLabel5 {
  if (score < 20) return 'Strong Bearish';
  if (score < 40) return 'Bearish';
  if (score < 60) return 'Neutral';
  if (score < 80) return 'Bullish';
  return 'Strong Bullish';
}

const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
const sma = (c: number[], n: number) => (c.length >= n ? c.slice(-n).reduce((a, b) => a + b, 0) / n : null);

/**
 * Short-term technical score (0–100) from closed daily bars: the 9-rule scorecard (50%), distance
 * to the 20/50-day averages (15%), a 20-day breakout (15%), relative volume in the direction of
 * the day (5%) and the 1-month reversal as a negative factor (15%). Null under 60 bars.
 */
export function shortTechnical(closes: number[], volumes?: number[]): { score: number; parts: Record<string, number> } | null {
  if (closes.length < 60) return null;
  const parts: Record<string, number> = {};
  const report = analyzeTechnicals(closes);
  if (report) parts.scorecard = 50 + 50 * report.score;
  const price = closes[closes.length - 1];
  const m20 = sma(closes, 20);
  const m50 = sma(closes, 50);
  if (m20 && m50) parts.maDistance = clamp(50 + 50 * Math.tanh(((price / m20 - 1) + (price / m50 - 1)) / 0.1));
  const prior = closes.slice(-21, -1);
  if (prior.length === 20) parts.breakout20 = price > Math.max(...prior) ? 85 : price < Math.min(...prior) ? 15 : 50;
  if (volumes && volumes.length >= 21) {
    const avg = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const rel = avg > 0 ? volumes[volumes.length - 1] / avg : 1;
    const dir = Math.sign(price - closes[closes.length - 2]);
    parts.relativeVolume = clamp(50 + dir * 25 * Math.tanh(rel - 1));
  }
  if (closes.length >= 22) parts.reversal1m = clamp(50 - 50 * Math.tanh((price / closes[closes.length - 22] - 1) / 0.15));
  const W: Record<string, number> = { scorecard: 50, maDistance: 15, breakout20: 15, relativeVolume: 5, reversal1m: 15 };
  let w = 0;
  let s = 0;
  for (const [k, v] of Object.entries(parts)) {
    w += W[k];
    s += W[k] * v;
  }
  return w > 0 ? { score: s / w, parts } : null;
}

/** Time-series momentum 12-1 (daily bars) scaled by volatility: 50 + 50·tanh(return ÷ vol). */
export function tsMomentumScore(closes: number[], yearBars = 252): number | null {
  if (closes.length < yearBars + 1) return null;
  const month = Math.round(yearBars / 12);
  const r = closes[closes.length - 1 - month] / closes[closes.length - 1 - yearBars] - 1;
  const rets: number[] = [];
  for (let i = closes.length - yearBars; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const vol = Math.sqrt((rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1)) * yearBars);
  return vol > 0 && Number.isFinite(r) ? clamp(50 + 50 * Math.tanh(r / vol)) : null;
}

/** Trend: price vs its 200-day average, 50 + 50·tanh(gap ÷ 10%). */
export function trendScore(closes: number[]): number | null {
  const m = sma(closes, 200);
  return m ? clamp(50 + 50 * Math.tanh((closes[closes.length - 1] / m - 1) / 0.1)) : null;
}

/**
 * Contrarian positioning from Binance perpetuals: high positive funding or a crowded long/short
 * ratio leans bearish, negative funding leans bullish. 1 bp per 8 h is treated as neutral.
 */
export function derivativesScore(d: { fundingRate?: number | null; longShortRatio?: number | null; openInterestChange24h?: number | null }): number | null {
  const parts: number[] = [];
  if (d.fundingRate !== undefined && d.fundingRate !== null && Number.isFinite(d.fundingRate)) {
    const bp = d.fundingRate * 10_000;
    parts.push(clamp(50 - 40 * Math.tanh((bp - 1) / 5)));
  }
  if (d.longShortRatio !== undefined && d.longShortRatio !== null && Number.isFinite(d.longShortRatio) && d.longShortRatio > 0) {
    parts.push(clamp(50 - 40 * Math.tanh(Math.log(d.longShortRatio) / Math.log(2))));
  }
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
}

export interface ComponentInput {
  id: ComponentId;
  /** 0–100, null = no data. */
  score: number | null;
  /** Why it is missing or how it was measured. */
  note?: string;
  /** Date of the newest data behind it (YYYY-MM-DD or ISO). */
  dataDate?: string | null;
  source?: string;
}

export interface ComponentResult extends ComponentInput {
  baseWeight: number;
  /** Weight after dropping unavailable components (0–1). */
  weight: number;
  /** Points added to 50: weight × (score − 50). */
  contribution: number;
  applicable: boolean;
  reference: string;
}

export interface HorizonScore {
  horizon: Horizon;
  score: number | null;
  label: SentimentLabel5 | null;
  confidence: Confidence;
  confidenceReasons: string[];
  components: ComponentResult[];
  /** Share of the default weight that had data (0–1). */
  coverage: number;
  reweighted: boolean;
  cadence: Cadence;
  news: HorizonNews | null;
}

export interface AssetSentimentInput {
  group: AssetGroup;
  /** Stocks with cross-section pillars. */
  pillars?: Record<'momentum' | 'health' | 'quality', PillarScore> | null;
  technicalShort?: number | null;
  tsMomentum?: number | null;
  trend?: number | null;
  news?: Record<Horizon, HorizonNews> | null;
  macro?: number | null;
  derivatives?: number | null;
  /** Binance-traded crypto (derivatives apply). */
  binance?: boolean;
  /** IHSG, IDX stocks and Rupiah pairs (macro applies). */
  macroLinked?: boolean;
  /** Validation result per horizon: information coefficient and whether it was significant. */
  validation?: Partial<Record<Horizon, { ic: number; significant: boolean } | null>>;
  dates?: Partial<Record<ComponentId, string | null>>;
}

const FUNDAMENTAL_GROUPS: AssetGroup[] = ['idStock', 'usStock'];

/** Default review frequency of a horizon. */
export function defaultCadence(h: Horizon, group: AssetGroup): Cadence {
  if (h === 'short') return group === 'crypto' ? 'Every 4 hours' : 'Daily';
  return h === 'medium' ? 'Weekly' : 'Monthly';
}

export function scoreHorizon(h: Horizon, input: AssetSentimentInput): HorizonScore {
  const fundamental = FUNDAMENTAL_GROUPS.includes(input.group) && Boolean(input.pillars);
  const base: Partial<Record<ComponentId, number>> = { ...HORIZON_WEIGHTS[h] };
  if (!fundamental) {
    // No statements: the momentum pillar becomes time-series momentum; health + quality go to
    // time-series momentum and trend in equal parts
    const freed = (base.health ?? 0) + (base.quality ?? 0);
    base.tsMomentum = (base.momentum ?? 0) + freed / 2;
    base.trend = freed / 2;
    delete base.momentum;
    delete base.health;
    delete base.quality;
  }
  const newsH = input.news?.[h] ?? null;
  const scores: Record<ComponentId, ComponentInput> = {
    technical: { id: 'technical', score: input.technicalShort ?? null },
    momentum: { id: 'momentum', score: input.pillars?.momentum.score ?? null },
    news: {
      id: 'news',
      // No headline is "no data", not a neutral reading
      score: newsH && newsH.count > 0 ? 50 + (50 * newsH.points) / newsH.cap : null,
      note: newsH && newsH.count > 0 ? `${newsH.count} headline(s)` : 'No recent headlines',
    },
    health: { id: 'health', score: input.pillars?.health.score ?? null },
    quality: { id: 'quality', score: input.pillars?.quality.score ?? null },
    macro: { id: 'macro', score: input.macro ?? null },
    derivatives: { id: 'derivatives', score: input.derivatives ?? null },
    tsMomentum: { id: 'tsMomentum', score: input.tsMomentum ?? null },
    trend: { id: 'trend', score: input.trend ?? null },
  };
  const applicable = (id: ComponentId) =>
    id === 'macro' ? Boolean(input.macroLinked) : id === 'derivatives' ? Boolean(input.binance) : true;

  const entries = (Object.entries(base) as Array<[ComponentId, number]>).filter(([, w]) => w > 0);
  const totalApplicable = entries.filter(([id]) => applicable(id)).reduce((s, [, w]) => s + w, 0);
  const have = entries.filter(([id]) => applicable(id) && scores[id].score !== null && Number.isFinite(scores[id].score as number));
  const wHave = have.reduce((s, [, w]) => s + w, 0);
  const components: ComponentResult[] = entries.map(([id, w]) => {
    const c = scores[id];
    const ok = applicable(id) && c.score !== null && Number.isFinite(c.score);
    const weight = ok && wHave > 0 ? w / wHave : 0;
    return {
      ...c,
      note: !applicable(id)
        ? id === 'macro'
          ? 'Not applicable — not linked to Indonesian macro'
          : 'Not applicable — not a Binance-traded coin'
        : c.score === null
          ? c.note ?? 'Not reported'
          : c.note,
      dataDate: input.dates?.[id] ?? c.dataDate ?? null,
      baseWeight: w / 100,
      weight,
      contribution: ok ? weight * ((c.score as number) - 50) : 0,
      applicable: applicable(id),
      reference: REFERENCES[id],
    };
  });
  const score = wHave > 0 ? clamp(50 + components.reduce((s, c) => s + c.contribution, 0)) : null;
  const coverage = totalApplicable > 0 ? wHave / totalApplicable : 0;

  // Confidence: data coverage, agreement between components, and the validation result
  const reasons: string[] = [];
  let agreement = 0;
  if (score !== null) {
    const side = Math.sign(score - 50);
    const agreeW = components.filter((c) => c.weight > 0 && Math.sign((c.score as number) - 50) === side).reduce((s, c) => s + c.weight, 0);
    agreement = side === 0 ? 0.5 : agreeW;
  }
  const val = input.validation?.[h] ?? null;
  reasons.push(`coverage ${Math.round(coverage * 100)}%`, `agreement ${Math.round(agreement * 100)}%`);
  reasons.push(val ? `validation IC ${val.ic.toFixed(2)}${val.significant ? ' (significant)' : ' (not significant)'}` : 'not validated yet');
  let confidence: Confidence = 'Low';
  if (score !== null && coverage >= 0.5 && agreement >= 0.5) confidence = 'Medium';
  if (confidence === 'Medium' && coverage >= 0.8 && agreement >= 0.7 && val?.significant && val.ic > 0) confidence = 'High';

  return {
    horizon: h,
    score,
    label: score === null ? null : label5(score),
    confidence,
    confidenceReasons: reasons,
    components: components.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
    coverage,
    reweighted: wHave > 0 && wHave < totalApplicable,
    cadence: defaultCadence(h, input.group),
    news: newsH,
  };
}
