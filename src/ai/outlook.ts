/**
 * outlook.ts — Builds the AI outlook for one asset from ~5 years of daily closes: features,
 * a walk-forward backtest (out-of-sample hit rate vs base rate), a fair comparison of the model
 * with trend-following and mean-reversion rules (picked on validation, judged on holdout), a
 * final model trained on all
 * known data, today's probability of a positive return over the horizon, the main drivers,
 * risk stats and the Fed event study. Also holds the pure personalization step (risk profile
 * → ranking and "favorable / watch / unfavorable") shared by the server and the browser.
 * This is a statistical screen, not a guarantee or personal financial advice.
 */
import {
  type DailyBar,
  FEATURE_LABELS,
  FEATURE_NAMES,
  type MacroInputs,
  annualizedVol,
  featuresAt,
  maxDrawdown,
  pctChange,
} from './indicators.ts';
import type { EventReaction } from './events.ts';
import {
  STRATEGY_LABELS,
  type BacktestResult,
  type Sample,
  type StrategyId,
  type StrategySelection,
  contributions,
  evaluatePredictions,
  predictProba,
  ruleProbability,
  selectStrategy,
  trainLogistic,
  walkForwardPredictions,
} from './model.ts';

export interface Driver {
  feature: string;
  label: string;
  /** Contribution to the log-odds; positive pushes toward "up". */
  impact: number;
}

export interface AssetOutlook {
  symbol: string;
  code: string;
  name: string;
  group: string;
  horizonDays: number;
  asOf: string; // date of the latest bar used
  bars: number; // history length used
  /** Model probability that the price is higher after `horizonDays` trading days. */
  probabilityUp: number | null;
  /** Direction of the chosen strategy right now: rules may have no active setup ("none"). */
  signal: 'bullish' | 'bearish' | 'none' | null;
  /** Holdout (out-of-sample, after strategy selection) performance of the chosen strategy. */
  backtest: BacktestResult | null;
  /** Which hypothesis was chosen for this asset and how the candidates did on validation. */
  strategy: StrategyId | null;
  strategyLabel: string | null;
  candidates: StrategySelection['candidates'];
  drivers: Driver[];
  stats: {
    return1y: number | null;
    return3y: number | null;
    volatility: number | null; // annualized, last 3 months
    maxDrawdown: number;
  };
  fedReactions: EventReaction[];
  /** Current news mood 0–100 (from the live sentiment), if available. */
  newsScore?: number | null;
  note?: string;
}

/** Annualization: crypto trades every day, other markets ~252 days a year. */
export function periodsPerYear(group: string): number {
  return group === 'crypto' ? 365 : 252;
}

export function buildAssetOutlook(input: {
  symbol: string;
  code: string;
  name: string;
  group: string;
  bars: DailyBar[];
  macro: MacroInputs;
  horizonDays: number;
  fedReactions: EventReaction[];
}): AssetOutlook {
  const { bars, macro, horizonDays } = input;
  const closes = bars.map((b) => b.close);
  const ppy = periodsPerYear(input.group);
  const last = closes.length - 1;
  const base: AssetOutlook = {
    symbol: input.symbol,
    code: input.code,
    name: input.name,
    group: input.group,
    horizonDays,
    asOf: bars[last]?.date ?? '',
    bars: bars.length,
    probabilityUp: null,
    signal: null,
    backtest: null,
    strategy: null,
    strategyLabel: null,
    candidates: [],
    drivers: [],
    stats: {
      return1y: last >= 0 ? pctChange(closes, last, Math.min(last, ppy)) : null,
      return3y: last >= 3 * ppy ? pctChange(closes, last, 3 * ppy) : null,
      volatility: annualizedVol(closes, last, 63, ppy),
      maxDrawdown: maxDrawdown(closes),
    },
    fedReactions: input.fedReactions,
  };

  // Labeled samples: features at t, label = forward return over the horizon
  const samples: Sample[] = [];
  for (let t = 0; t + horizonDays <= last; t++) {
    const x = featuresAt(closes, t, macro);
    if (!x) continue;
    const fwd = closes[t + horizonDays] / closes[t] - 1;
    samples.push({ t, x, y: fwd > 0 ? 1 : 0, fwdReturn: fwd });
  }
  const current = featuresAt(closes, last, macro);
  if (samples.length < 300 || !current) {
    return { ...base, note: 'Not enough history for the model yet.' };
  }

  const modelPreds = walkForwardPredictions(samples, horizonDays, { minTrain: 250, step: 42 });
  const selection = selectStrategy(samples, modelPreds);
  const strategy: StrategyId = selection?.strategy ?? 'model';
  const backtest = selection?.holdout ?? evaluatePredictions(modelPreds);
  const model = trainLogistic(
    samples.map((s) => s.x),
    samples.map((s) => s.y),
    { iterations: 300 }
  );
  const probabilityUp = strategy === 'model' ? predictProba(model, current) : ruleProbability(strategy, current);
  const drivers = contributions(model, current)
    .map((impact, j) => ({ feature: FEATURE_NAMES[j], label: FEATURE_LABELS[FEATURE_NAMES[j]], impact }))
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    .slice(0, 4);

  return {
    ...base,
    probabilityUp,
    signal: signalOf(strategy, probabilityUp),
    backtest,
    drivers,
    strategy,
    strategyLabel: STRATEGY_LABELS[strategy],
    candidates: selection?.candidates ?? [],
  };
}

// ---------------------------------------------------------------------------------------
// Personalization (pure; runs in the browser so changing the profile is instant)
// ---------------------------------------------------------------------------------------

export type RiskProfile = 'conservative' | 'moderate' | 'aggressive';

export const RISK_PROFILES: Record<
  RiskProfile,
  { label: string; maxVolatility: number; allowCrypto: boolean; description: string }
> = {
  conservative: {
    label: 'Conservative',
    maxVolatility: 0.18,
    allowCrypto: false,
    description: 'Capital preservation first: only lower-volatility instruments, no crypto.',
  },
  moderate: {
    label: 'Moderate',
    maxVolatility: 0.35,
    allowCrypto: true,
    description: 'Balanced growth: accepts stock-index swings, limits very volatile assets.',
  },
  aggressive: {
    label: 'Aggressive',
    maxVolatility: 1.5,
    allowCrypto: true,
    description: 'Growth first: accepts large swings, including crypto.',
  },
};

export type Verdict = 'favorable' | 'watch' | 'unfavorable' | 'not-suitable' | 'no-signal';

export interface RankedOutlook extends AssetOutlook {
  /** Probability shrunk toward 50% by how much the model beat the base rate out-of-sample. */
  adjustedProbability: number | null;
  /** 0–1: how much the backtest supports trusting this model (0 = no proven edge). */
  reliability: number;
  /** Small, transparent tilt from the live news mood and geopolitical alerts (in probability). */
  newsTilt: number;
  verdict: Verdict;
  reasons: string[];
}

/** Model edge out-of-sample: favorable-signal hit rate above the base rate, scaled 0–1. */
export function reliabilityOf(bt: BacktestResult | null): number {
  if (!bt || bt.signalHitRate === null || bt.signalCount < 30) return 0;
  const edge = bt.signalHitRate - bt.baseRate;
  const returnEdge = (bt.avgReturnSignal ?? 0) - bt.avgReturnAll;
  if (edge <= 0 || returnEdge <= 0) return 0;
  return Math.min(1, edge / 0.1);
}

export function rankOutlooks(
  outlooks: AssetOutlook[],
  profile: RiskProfile,
  opts: { geoAlertActive?: boolean } = {}
): RankedOutlook[] {
  const rules = RISK_PROFILES[profile];
  const ranked = outlooks.map((o): RankedOutlook => {
    const reliability = reliabilityOf(o.backtest);
    const reasons: string[] = [];
    // News mood shifts the probability by at most ±3 points; it is not backtested
    let newsTilt = typeof o.newsScore === 'number' ? ((o.newsScore - 50) / 50) * 0.03 : 0;
    const vol = o.stats.volatility ?? 0;
    if (opts.geoAlertActive && vol > 0.25 && o.group !== 'gold') {
      newsTilt -= 0.02;
      reasons.push('Geopolitical alert active: extra caution on volatile assets.');
    }
    const adjustedProbability =
      o.probabilityUp === null ? null : 0.5 + (o.probabilityUp - 0.5) * reliability + newsTilt;

    let verdict: Verdict;
    if (o.probabilityUp === null || adjustedProbability === null) {
      verdict = 'no-signal';
      reasons.push(o.note ?? 'No model output.');
    } else if ((o.group === 'crypto' && !rules.allowCrypto) || vol > rules.maxVolatility) {
      verdict = 'not-suitable';
      reasons.push(
        `Volatility ${(vol * 100).toFixed(0)}%/yr is above the ${rules.label} limit of ${(rules.maxVolatility * 100).toFixed(0)}%.`
      );
    } else if (reliability === 0) {
      verdict = 'no-signal';
      reasons.push('No strategy showed a reliable out-of-sample edge for this asset.');
    } else if (o.signal === 'bearish') {
      verdict = 'unfavorable';
      reasons.push(`Active bearish setup (${o.strategyLabel ?? 'model'}).`);
    } else if (o.signal === 'bullish' && adjustedProbability >= 0.55) {
      verdict = 'favorable';
      reasons.push(`Active bullish setup (${o.strategyLabel ?? 'model'}).`);
    } else {
      verdict = 'watch';
      reasons.push(
        o.signal === 'none'
          ? `Proven strategy, but no active setup right now (${o.strategyLabel ?? 'model'}).`
          : 'Bullish setup weakened by the news mood or alerts.'
      );
    }
    return { ...o, adjustedProbability, reliability, newsTilt, verdict, reasons };
  });
  const order: Record<Verdict, number> = { favorable: 0, watch: 1, unfavorable: 2, 'no-signal': 3, 'not-suitable': 4 };
  return ranked.sort(
    (a, b) =>
      order[a.verdict] - order[b.verdict] ||
      (b.adjustedProbability ?? 0) - (a.adjustedProbability ?? 0)
  );
}

/** Signal direction: the logistic model is directional; the mean-reversion rule only fires when oversold. */
export function signalOf(strategy: StrategyId, p: number): 'bullish' | 'bearish' | 'none' {
  if (strategy === 'meanReversion') return p >= 0.55 ? 'bullish' : 'none';
  if (strategy === 'trend') return p >= 0.55 ? 'bullish' : 'bearish';
  return p >= 0.55 ? 'bullish' : p <= 0.45 ? 'bearish' : 'none';
}
