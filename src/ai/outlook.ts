/**
 * outlook.ts — Builds the AI outlook for one asset from ~5 years of daily closes: features,
 * a walk-forward backtest (out-of-sample hit rate vs base rate), a fair comparison of the model
 * with trend-following and mean-reversion rules (picked on validation, judged on holdout), a
 * final model trained on all
 * known data, today's probability of a positive return over the horizon, the main drivers,
 * risk stats and the Fed event study. Also holds the pure personalization step (risk profile
 * → ranking and "favorable / watch / unfavorable / no proven edge") shared by the server and
 * the browser. A verdict needs a *proven* edge from one of two tests — the walk-forward
 * backtested strategy (holdout) or the fixed technical scorecard on the asset's own history —
 * and is then checked against the evidence-weighted analysis (technicals, factors,
 * fundamentals, news drivers). Every check is listed in `checks` so the UI can show why.
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
import { translate, type AppLang, type TranslationKey } from '../i18n/core.ts';
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
  /** The logistic model's out-of-sample predictions split like the strategy test (first 60% / last 40%). */
  modelValidation?: BacktestResult | null;
  modelHoldout?: BacktestResult | null;
  /**
   * Indonesian assets: the walk-forward test with and without the BI-Rate proxy and inflation
   * features. They are kept only if they improved the validation Brier score; the holdout
   * numbers (never used for that choice) show whether they really helped.
   */
  idMacroTest?: IdMacroTest | null;
  /** Evidence-weighted analysis summary (see analysis.ts), if it could be computed. */
  evidence?: OutlookEvidence | null;
  note?: string;
}

export interface IdMacroTest {
  used: boolean;
  validationBrierWith: number;
  validationBrierWithout: number;
  holdoutAccuracyWith: number;
  holdoutAccuracyWithout: number;
  holdoutBrierWith: number;
  holdoutBrierWithout: number;
  holdoutPredictions: number;
}

/** Compares a model with and without Indonesian macro features (see AssetOutlook.idMacroTest). */
export function compareIdMacro(withId: AssetOutlook, without: AssetOutlook): IdMacroTest | null {
  const vw = withId.modelValidation;
  const vo = without.modelValidation;
  const hw = withId.modelHoldout;
  const ho = without.modelHoldout;
  if (!vw || !vo || !hw || !ho) return null;
  return {
    used: vw.brier < vo.brier,
    validationBrierWith: vw.brier,
    validationBrierWithout: vo.brier,
    holdoutAccuracyWith: hw.accuracy,
    holdoutAccuracyWithout: ho.accuracy,
    holdoutBrierWith: hw.brier,
    holdoutBrierWithout: ho.brier,
    holdoutPredictions: hw.predictions,
  };
}

export interface OutlookEvidence {
  /** −1 … +1 composite and its 0–100 / label form. */
  composite: number;
  score: number;
  label: 'Bullish' | 'Neutral' | 'Bearish';
  summary: string;
  /** Technical scorecard lean today and how that lean did on this asset's history. */
  scorecard: { lean: 'bullish' | 'bearish' | 'neutral'; upRate: number; baseUpRate: number; samples: number; horizonDays: number } | null;
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
    modelValidation: evaluatePredictions(modelPreds.slice(0, Math.floor(modelPreds.length * 0.6))),
    modelHoldout: evaluatePredictions(modelPreds.slice(Math.floor(modelPreds.length * 0.6))),
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

export interface VerdictCheck {
  label: string;
  /** true = passed, false = failed, null = not applicable. */
  pass: boolean | null;
  detail: string;
}

export interface RankedOutlook extends AssetOutlook {
  /** Chance of a gain: model probability shrunk by its holdout edge, or the scorecard's historical rate. */
  adjustedProbability: number | null;
  /** 0–1: how much the backtest supports trusting this model (0 = no proven edge). */
  reliability: number;
  /** Edge of today's scorecard lean on the asset's history (in hit-rate points, ≥ 0.03 = proven). */
  scorecardEdge: number;
  /** Small, transparent tilt from the evidence score and geopolitical alerts (in probability). */
  evidenceTilt: number;
  verdict: Verdict;
  reasons: string[];
  /** The tests behind the verdict, in order. */
  checks: VerdictCheck[];
}

/** A historical lean edge of 3 hit-rate points over at least 60 days counts as proven. */
export const SCORECARD_MIN_EDGE = 0.03;
export const SCORECARD_MIN_SAMPLES = 60;

/** How much better than the base rate today's scorecard lean has done (in its own direction). */
export function scorecardEdgeOf(sc: OutlookEvidence['scorecard'] | undefined | null): number {
  if (!sc || sc.samples < SCORECARD_MIN_SAMPLES || sc.lean === 'neutral') return 0;
  return sc.lean === 'bullish' ? sc.upRate - sc.baseUpRate : sc.baseUpRate - sc.upRate;
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
  opts: { geoAlertActive?: boolean; lang?: AppLang } = {}
): RankedOutlook[] {
  const rules = RISK_PROFILES[profile];
  const lang = opts.lang ?? 'en';
  const tr = (key: TranslationKey, params?: Record<string, string | number>) => translate(lang, key, params);
  const profileLabel = tr(`risk.profile.${profile}` as TranslationKey);
  const p100 = (x: number) => `${Math.round(x * 100)}%`;
  const ranked = outlooks.map((o): RankedOutlook => {
    const reliability = reliabilityOf(o.backtest);
    const sc = o.evidence?.scorecard ?? null;
    const scorecardEdge = scorecardEdgeOf(sc);
    const ev = o.evidence;
    const reasons: string[] = [];
    const checks: VerdictCheck[] = [];
    const strategyName = o.strategy ? tr(`strategy.${o.strategy}` as TranslationKey) : tr('strategy.short');
    const vol = o.stats.volatility ?? 0;

    // Evidence shifts the chance by at most ±3 points; it is not backtested, so it stays small
    let evidenceTilt = ev ? ev.composite * 0.03 : 0;
    if (opts.geoAlertActive && vol > 0.25 && o.symbol !== 'XAU/USD') {
      evidenceTilt -= 0.02;
      reasons.push(tr('ol.geoReason'));
    }

    // 1. Risk profile
    const suitable = !((o.group === 'crypto' && !rules.allowCrypto) || vol > rules.maxVolatility);
    checks.push({
      label: tr('ol.check.profile'),
      pass: suitable,
      detail:
        o.group === 'crypto' && !rules.allowCrypto
          ? tr('ol.check.profile.noCrypto', { profile: profileLabel })
          : tr('ol.check.profile.vol', { vol: p100(vol), profile: profileLabel, max: p100(rules.maxVolatility) }),
    });

    // 2. Backtested strategy (walk-forward, judged on the holdout only)
    const bt = o.backtest;
    const modelProven = reliability > 0;
    checks.push({
      label: tr('ol.check.backtest'),
      pass: bt ? modelProven : null,
      detail:
        bt && bt.signalHitRate !== null
          ? tr('ol.check.backtest.detail', { strategy: strategyName, hit: p100(bt.signalHitRate), base: p100(bt.baseRate), n: bt.signalCount }) +
            (bt.signalCount < 30 ? ` ${tr('ol.check.backtest.few')}` : '')
          : tr('ol.check.backtest.none'),
    });

    // 3. Technical scorecard lean on the asset's own history
    const scProven = scorecardEdge >= SCORECARD_MIN_EDGE;
    checks.push({
      label: tr('ol.check.scorecard'),
      pass: sc && sc.lean !== 'neutral' ? scProven : null,
      detail: sc
        ? sc.lean === 'neutral'
          ? tr('ol.check.scorecard.neutral')
          : tr('ol.check.scorecard.detail', {
              lean: tr(`ol.lean.${sc.lean}` as TranslationKey),
              up: p100(sc.upRate),
              n: sc.samples,
              base: p100(sc.baseUpRate),
            })
        : tr('ol.check.scorecard.none'),
    });

    // Directional votes from the proven tests only
    const modelVote = modelProven ? (o.signal === 'bullish' ? 1 : o.signal === 'bearish' ? -1 : 0) : 0;
    const scVote = scProven && sc ? (sc.lean === 'bullish' ? 1 : -1) : 0;

    // 4. Evidence-weighted analysis must not contradict a bullish call
    checks.push({
      label: tr('ol.check.evidence'),
      pass: ev ? ev.composite > -0.15 : null,
      detail: ev
        ? tr('ol.check.evidence.detail', { score: ev.score, label: tr(`sentiment.${ev.label}` as TranslationKey) })
        : tr('ol.check.evidence.none'),
    });

    const modelChance = o.probabilityUp === null ? null : 0.5 + (o.probabilityUp - 0.5) * reliability;
    const scChance = sc ? sc.upRate : null;
    const baseChance = modelProven && modelVote !== 0 ? modelChance : scProven ? scChance : modelChance;
    const adjustedProbability = baseChance === null ? null : Math.max(0, Math.min(1, baseChance + evidenceTilt));

    let verdict: Verdict;
    if (o.probabilityUp === null && !sc) {
      verdict = 'no-signal';
      reasons.push(o.note ? tr('ol.reason.noHistory') : tr('ol.reason.noData'));
    } else if (!suitable) {
      verdict = 'not-suitable';
      reasons.push(checks[0].detail + '.');
    } else if (!modelProven && !scProven) {
      verdict = 'no-signal';
      reasons.push(tr('ol.reason.noEdge'));
    } else if ((modelVote < 0 || scVote < 0) && modelVote <= 0 && scVote <= 0) {
      verdict = 'unfavorable';
      reasons.push(
        modelVote < 0
          ? tr('ol.reason.bearStrategy', { strategy: strategyName })
          : tr('ol.reason.bearScorecard')
      );
    } else if ((modelVote > 0 || scVote > 0) && modelVote >= 0 && scVote >= 0 && (!ev || ev.composite > -0.15) && (adjustedProbability ?? 0) >= 0.55) {
      verdict = 'favorable';
      reasons.push(
        modelVote > 0
          ? tr('ol.reason.bullStrategy', { strategy: strategyName })
          : tr('ol.reason.bullScorecard')
      );
    } else {
      verdict = 'watch';
      if (modelVote > 0 && scVote < 0) reasons.push(tr('ol.reason.disagreeBull'));
      else if (modelVote < 0 && scVote > 0) reasons.push(tr('ol.reason.disagreeBear'));
      else if (ev && ev.composite <= -0.15) reasons.push(tr('ol.reason.evidenceBear'));
      else if (modelVote === 0 && scVote === 0) reasons.push(tr('ol.reason.noSetup', { strategy: strategyName }));
      else reasons.push(tr('ol.reason.lowChance'));
    }
    return { ...o, adjustedProbability, reliability, scorecardEdge, evidenceTilt, verdict, reasons, checks };
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
