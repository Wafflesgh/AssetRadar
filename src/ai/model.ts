/**
 * model.ts — Small, transparent machine-learning core for the AI outlook: L2-regularized
 * logistic regression (gradient descent on standardized features) and a walk-forward
 * backtest. The backtest retrains on past data only (labels that were already known) and
 * predicts the next block, so every reported hit rate is out-of-sample. It also compares the
 * model with two classic rules (trend-following, mean-reversion) and picks one per asset on a
 * validation window, reporting its performance on a separate holdout window.
 */

export interface LogisticModel {
  weights: number[]; // per standardized feature
  bias: number;
  mean: number[];
  std: number[];
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

export function trainLogistic(
  X: number[][],
  y: number[],
  opts: { iterations?: number; learningRate?: number; l2?: number } = {}
): LogisticModel {
  const { iterations = 400, learningRate = 0.2, l2 = 0.05 } = opts;
  const n = X.length;
  const d = X[0]?.length ?? 0;
  const mean = Array<number>(d).fill(0);
  const std = Array<number>(d).fill(0);
  for (const row of X) row.forEach((v, j) => (mean[j] += v / n));
  for (const row of X) row.forEach((v, j) => (std[j] += (v - mean[j]) ** 2 / n));
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j]) || 1;
  const Z = X.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));

  const weights = Array<number>(d).fill(0);
  // Start the bias at the base rate so an uninformative model predicts the base rate
  const base = Math.min(0.99, Math.max(0.01, y.reduce((a, b) => a + b, 0) / Math.max(1, n)));
  let bias = Math.log(base / (1 - base));
  for (let it = 0; it < iterations; it++) {
    const grad = Array<number>(d).fill(0);
    let gradB = 0;
    for (let i = 0; i < n; i++) {
      const p = sigmoid(Z[i].reduce((s, v, j) => s + v * weights[j], bias));
      const err = p - y[i];
      for (let j = 0; j < d; j++) grad[j] += (err * Z[i][j]) / n;
      gradB += err / n;
    }
    for (let j = 0; j < d; j++) weights[j] -= learningRate * (grad[j] + l2 * weights[j]);
    bias -= learningRate * gradB;
  }
  return { weights, bias, mean, std };
}

export function predictProba(model: LogisticModel, x: number[]): number {
  return sigmoid(x.reduce((s, v, j) => s + ((v - model.mean[j]) / model.std[j]) * model.weights[j], model.bias));
}

/** Per-feature contribution to the log-odds (positive = pushes the probability up). */
export function contributions(model: LogisticModel, x: number[]): number[] {
  return x.map((v, j) => ((v - model.mean[j]) / model.std[j]) * model.weights[j]);
}

export interface Sample {
  t: number; // index in the asset's daily series
  x: number[];
  y: number; // 1 if the forward return over the horizon was positive
  fwdReturn: number;
}

export interface BacktestResult {
  /** Out-of-sample predictions made (each one ≈ one trading day). */
  predictions: number;
  /** Share of all out-of-sample predictions whose direction was right. */
  accuracy: number;
  /** Share of out-of-sample periods that actually went up (what "always bullish" would score). */
  baseRate: number;
  /** When the model said "favorable" (p ≥ threshold): how often the price really rose. */
  signalHitRate: number | null;
  signalCount: number;
  /** Average forward return after "favorable" signals vs after every day (same period). */
  avgReturnSignal: number | null;
  avgReturnAll: number;
  /** Brier score of the probabilities (lower is better; 0.25 = coin flip). */
  brier: number;
  threshold: number;
}

export interface Prediction {
  t: number;
  p: number;
  y: number;
  r: number;
}

/**
 * Walk-forward out-of-sample predictions of the logistic model: first train on `minTrain`
 * samples, then every `step` samples retrain on everything whose label was already known
 * before the block (t + horizon < block start) and predict the block.
 */
export function walkForwardPredictions(
  samples: Sample[],
  horizon: number,
  opts: { minTrain?: number; step?: number } = {}
): Prediction[] {
  const { minTrain = 250, step = 21 } = opts;
  const preds: Prediction[] = [];
  if (samples.length < minTrain + step) return preds;
  for (let start = minTrain; start < samples.length; start += step) {
    const blockStartT = samples[start].t;
    const train = samples.filter((s) => s.t + horizon < blockStartT);
    if (train.length < minTrain / 2) continue;
    const model = trainLogistic(
      train.map((s) => s.x),
      train.map((s) => s.y),
      { iterations: 250 }
    );
    for (const s of samples.slice(start, start + step)) {
      preds.push({ t: s.t, p: predictProba(model, s.x), y: s.y, r: s.fwdReturn });
    }
  }
  return preds;
}

/** Walk-forward backtest of the logistic model (all out-of-sample predictions). */
export function walkForward(
  samples: Sample[],
  horizon: number,
  opts: { minTrain?: number; step?: number; threshold?: number } = {}
): BacktestResult | null {
  return evaluatePredictions(walkForwardPredictions(samples, horizon, opts), opts.threshold);
}

/** Scores a set of out-of-sample predictions. */
export function evaluatePredictions(preds: Prediction[], threshold = 0.55): BacktestResult | null {
  if (preds.length === 0) return null;
  const n = preds.length;
  const signals = preds.filter((q) => q.p >= threshold);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    predictions: n,
    accuracy: preds.filter((q) => (q.p >= 0.5 ? 1 : 0) === q.y).length / n,
    baseRate: mean(preds.map((q) => q.y)),
    signalHitRate: signals.length ? mean(signals.map((q) => q.y)) : null,
    signalCount: signals.length,
    avgReturnSignal: signals.length ? mean(signals.map((q) => q.r)) : null,
    avgReturnAll: mean(preds.map((q) => q.r)),
    brier: mean(preds.map((q) => (q.p - q.y) ** 2)),
    threshold,
  };
}

// ---------------------------------------------------------------------------------------
// Strategy selection: compare competing hypotheses fairly on the same out-of-sample period.
// The best one is picked on the first part (validation) and judged only on the last part
// (holdout), so the reported hit rate is not inflated by the selection itself.
// ---------------------------------------------------------------------------------------

export type StrategyId = 'model' | 'trend' | 'meanReversion';

export const STRATEGY_LABELS: Record<StrategyId, string> = {
  model: 'Logistic model (all features)',
  trend: 'Trend-following rule (above 200-day average and positive 6-month momentum)',
  meanReversion: 'Mean-reversion rule (oversold: RSI below 35)',
};

/** Rule-based probabilities from the feature vector (see indicators.ts FEATURE_NAMES order). */
export function ruleProbability(strategy: Exclude<StrategyId, 'model'>, x: number[]): number {
  const trend200 = x[6];
  const mom120 = x[3];
  const rsiCentered = x[7]; // (RSI - 50) / 50
  if (strategy === 'trend') return trend200 > 0 && mom120 > 0 ? 0.65 : 0.4;
  return rsiCentered < -0.3 ? 0.65 : 0.45;
}

export interface StrategySelection {
  strategy: StrategyId;
  /** Holdout performance of the chosen strategy (never used for choosing it). */
  holdout: BacktestResult | null;
  /** Validation edge (signal hit rate − base rate) of every candidate. */
  candidates: Array<{ strategy: StrategyId; validationEdge: number | null; signals: number }>;
}

export function selectStrategy(
  samples: Sample[],
  modelPreds: Prediction[],
  opts: { validationShare?: number; threshold?: number; minSignals?: number } = {}
): StrategySelection | null {
  const { validationShare = 0.6, threshold = 0.55, minSignals = 20 } = opts;
  if (modelPreds.length < 100) return null;
  const byT = new Map(samples.map((s) => [s.t, s]));
  const series: Record<StrategyId, Prediction[]> = {
    model: modelPreds,
    trend: modelPreds.map((q) => ({ ...q, p: ruleProbability('trend', byT.get(q.t)!.x) })),
    meanReversion: modelPreds.map((q) => ({ ...q, p: ruleProbability('meanReversion', byT.get(q.t)!.x) })),
  };
  const cut = Math.floor(modelPreds.length * validationShare);
  const candidates = (Object.keys(series) as StrategyId[]).map((strategy) => {
    const v = evaluatePredictions(series[strategy].slice(0, cut), threshold);
    const ok = v && v.signalHitRate !== null && v.signalCount >= minSignals;
    return {
      strategy,
      validationEdge: ok ? (v.signalHitRate as number) - v.baseRate : null,
      signals: v?.signalCount ?? 0,
    };
  });
  const best = candidates
    .filter((c) => c.validationEdge !== null)
    .sort((a, b) => (b.validationEdge as number) - (a.validationEdge as number))[0];
  const strategy = best?.strategy ?? 'model';
  return { strategy, holdout: evaluatePredictions(series[strategy].slice(cut), threshold), candidates };
}
