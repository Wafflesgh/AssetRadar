/**
 * arena.ts — The AI Advisor's model arena (owner's request, 21 Oct 2026): several independent
 * models predict "higher after N trading days?" for every asset on exactly the same days, each
 * trained only on data known at the time (walk-forward), and are scored side by side out of
 * sample: Brier score (probability quality), its skill against the no-skill base-rate model,
 * direction accuracy and the hit rate of their "up" signals against the base rate. A live log then
 * records every model's prediction each trading day and scores it when it falls due, so the
 * leaderboard can also be judged on the future. Pure functions; server and browser share them.
 */
import { evaluatePredictions, predictProba, ruleProbability, trainLogistic, type BacktestResult, type LogisticModel, type Prediction, type Sample } from './model.ts';

export const ARENA_MODELS = ['logistic', 'naiveBayes', 'trend', 'momentum', 'meanReversion', 'ensemble', 'baseRate'] as const;
export type ArenaModelId = (typeof ARENA_MODELS)[number];

/** Probability at or above this = "up" signal; at or below 1 − this = "down". */
export const ARENA_SIGNAL = 0.55;
/** Fewer up-signals than this: the signal hit rate is not judged. */
export const ARENA_MIN_SIGNALS = 20;

// ---- The models ---------------------------------------------------------------------------

/** Gaussian naive Bayes: per-class mean and variance of every feature (a different family from the logistic model). */
export interface NaiveBayesModel {
  prior: number;
  mean: [number[], number[]];
  variance: [number[], number[]];
}

export function trainNaiveBayes(X: number[][], y: number[]): NaiveBayesModel {
  const d = X[0]?.length ?? 0;
  const stats = [0, 1].map((cls) => {
    const rows = X.filter((_, i) => y[i] === cls);
    const n = Math.max(1, rows.length);
    const mean = Array.from({ length: d }, (_, j) => rows.reduce((s, r) => s + r[j], 0) / n);
    const variance = Array.from({ length: d }, (_, j) => rows.reduce((s, r) => s + (r[j] - mean[j]) ** 2, 0) / n + 1e-6);
    return { mean, variance, n: rows.length };
  });
  const total = stats[0].n + stats[1].n;
  return {
    prior: total ? stats[1].n / total : 0.5,
    mean: [stats[0].mean, stats[1].mean],
    variance: [stats[0].variance, stats[1].variance],
  };
}

export function predictNaiveBayes(m: NaiveBayesModel, x: number[]): number {
  const logLik = (cls: 0 | 1) =>
    x.reduce((s, v, j) => s - 0.5 * Math.log(2 * Math.PI * m.variance[cls][j]) - (v - m.mean[cls][j]) ** 2 / (2 * m.variance[cls][j]), 0);
  const prior = Math.min(0.99, Math.max(0.01, m.prior));
  const z = logLik(1) + Math.log(prior) - (logLik(0) + Math.log(1 - prior));
  // Naive Bayes is famously over-confident: keep it inside 2–98%
  return Math.min(0.98, Math.max(0.02, 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))))));
}

/** Time-series momentum (6-month return sign; Moskowitz, Ooi & Pedersen 2012). Feature order: indicators.ts. */
export function momentumProbability(x: number[]): number {
  return x[3] > 0 ? 0.6 : 0.45;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/**
 * Walk-forward predictions of a trainable model on the same blocks as walkForwardPredictions
 * (retrained every `step` samples on labels already known before the block).
 */
export function walkForwardWith<M>(
  samples: Sample[],
  horizon: number,
  fit: (train: Sample[]) => M,
  predict: (model: M, x: number[]) => number,
  opts: { minTrain?: number; step?: number } = {}
): Prediction[] {
  const { minTrain = 250, step = 21 } = opts;
  const preds: Prediction[] = [];
  if (samples.length < minTrain + step) return preds;
  for (let start = minTrain; start < samples.length; start += step) {
    const blockStartT = samples[start].t;
    const train = samples.filter((s) => s.t + horizon < blockStartT);
    if (train.length < minTrain / 2) continue;
    const model = fit(train);
    for (const s of samples.slice(start, start + step)) preds.push({ t: s.t, p: predict(model, s.x), y: s.y, r: s.fwdReturn });
  }
  return preds;
}

// ---- One asset ------------------------------------------------------------------------------

export interface ArenaScore {
  id: ArenaModelId;
  /** Probability now (trained on all known data). */
  pNow: number;
  signalNow: 'up' | 'down' | 'none';
  /** Out-of-sample result (every walk-forward prediction; no selection was made on it). */
  oos: Pick<BacktestResult, 'predictions' | 'accuracy' | 'baseRate' | 'signalHitRate' | 'signalCount' | 'avgReturnSignal' | 'avgReturnAll' | 'brier'> | null;
  /** 1 − Brier ÷ Brier of the base-rate model (above 0 = better than knowing only the base rate). */
  brierSkill: number | null;
  /** Up-signal hit rate − base rate (null with too few signals). */
  edge: number | null;
}

export interface ArenaAsset {
  models: ArenaScore[];
  /** Lowest out-of-sample Brier score. */
  best: ArenaModelId | null;
  /** Probability-weighted agreement: how many models say up / down now. */
  votes: { up: number; down: number; none: number };
}

export const signalOfP = (p: number): ArenaScore['signalNow'] => (p >= ARENA_SIGNAL ? 'up' : p <= 1 - ARENA_SIGNAL ? 'down' : 'none');

/**
 * Runs every model on one asset's samples. `logisticPreds` / `logistic` are the outlook's own
 * walk-forward predictions and final model, so the logistic entry matches the rest of the page.
 */
export function runArena(input: {
  samples: Sample[];
  horizon: number;
  current: number[];
  logisticPreds: Prediction[];
  logistic: LogisticModel;
  step?: number;
}): ArenaAsset | null {
  const { samples, horizon, current, logisticPreds, logistic } = input;
  if (logisticPreds.length < 100) return null;
  const step = input.step ?? 42;
  const byT = new Map(samples.map((s) => [s.t, s]));
  const ts = new Set(logisticPreds.map((q) => q.t));
  // Every model is scored on exactly the logistic model's prediction days
  const same = (preds: Prediction[]) => preds.filter((q) => ts.has(q.t));
  const nb = same(walkForwardWith(samples, horizon, (tr) => trainNaiveBayes(tr.map((s) => s.x), tr.map((s) => s.y)), predictNaiveBayes, { minTrain: 250, step }));
  const base = same(walkForwardWith(samples, horizon, (tr) => mean(tr.map((s) => s.y)), (m) => m, { minTrain: 250, step }));
  const rule = (f: (x: number[]) => number) => logisticPreds.map((q) => ({ ...q, p: f(byT.get(q.t)!.x) }));
  const series: Record<ArenaModelId, Prediction[]> = {
    logistic: logisticPreds,
    naiveBayes: nb,
    trend: rule((x) => ruleProbability('trend', x)),
    momentum: rule(momentumProbability),
    meanReversion: rule((x) => ruleProbability('meanReversion', x)),
    ensemble: [],
    baseRate: base,
  };
  const nbByT = new Map(nb.map((q) => [q.t, q.p]));
  series.ensemble = logisticPreds
    .filter((q) => nbByT.has(q.t))
    .map((q) => {
      const x = byT.get(q.t)!.x;
      return { ...q, p: mean([q.p, nbByT.get(q.t) as number, ruleProbability('trend', x), momentumProbability(x)]) };
    });

  const nbNow = trainNaiveBayes(samples.map((s) => s.x), samples.map((s) => s.y));
  const pLog = predictProba(logistic, current);
  const pNb = predictNaiveBayes(nbNow, current);
  const now: Record<ArenaModelId, number> = {
    logistic: pLog,
    naiveBayes: pNb,
    trend: ruleProbability('trend', current),
    momentum: momentumProbability(current),
    meanReversion: ruleProbability('meanReversion', current),
    ensemble: mean([pLog, pNb, ruleProbability('trend', current), momentumProbability(current)]),
    baseRate: mean(samples.map((s) => s.y)),
  };

  const baseBrier = evaluatePredictions(series.baseRate, ARENA_SIGNAL)?.brier ?? null;
  const models: ArenaScore[] = ARENA_MODELS.map((id) => {
    const r = evaluatePredictions(series[id], ARENA_SIGNAL);
    const oos = r
      ? {
          predictions: r.predictions,
          accuracy: r.accuracy,
          baseRate: r.baseRate,
          signalHitRate: r.signalHitRate,
          signalCount: r.signalCount,
          avgReturnSignal: r.avgReturnSignal,
          avgReturnAll: r.avgReturnAll,
          brier: r.brier,
        }
      : null;
    return {
      id,
      pNow: now[id],
      signalNow: signalOfP(now[id]),
      oos,
      brierSkill: oos && baseBrier && baseBrier > 0 ? 1 - oos.brier / baseBrier : null,
      edge: oos && oos.signalHitRate !== null && oos.signalCount >= ARENA_MIN_SIGNALS ? oos.signalHitRate - oos.baseRate : null,
    };
  });
  const scored = models.filter((m) => m.oos);
  const best = scored.length ? scored.reduce((a, b) => ((b.oos as { brier: number }).brier < (a.oos as { brier: number }).brier ? b : a)).id : null;
  const votes = { up: 0, down: 0, none: 0 };
  for (const m of models) if (m.id !== 'baseRate') votes[m.signalNow] += 1;
  return { models, best, votes };
}

// ---- Leaderboard across assets ----------------------------------------------------------------

export interface ArenaBoardRow {
  id: ArenaModelId;
  assets: number;
  /** Mean Brier skill across assets (the ranking). */
  brierSkill: number | null;
  /** Mean out-of-sample Brier score. */
  brier: number | null;
  accuracy: number | null;
  /** Pooled up-signal hit rate and the base rate on the same days. */
  hitRate: number | null;
  baseRate: number | null;
  signals: number;
  /** Assets where this model had the lowest Brier score. */
  wins: number;
  /** Assets where it beat the base-rate model. */
  beatsBase: number;
}

export function arenaLeaderboard(assets: Array<{ arena?: ArenaAsset | null }>): ArenaBoardRow[] {
  const rows = ARENA_MODELS.map((id) => {
    const list = assets.map((a) => a.arena?.models.find((m) => m.id === id)).filter((m): m is ArenaScore => Boolean(m?.oos));
    let hits = 0;
    let signals = 0;
    let baseHits = 0;
    let baseN = 0;
    for (const m of list) {
      const o = m.oos!;
      if (o.signalHitRate !== null) {
        hits += o.signalHitRate * o.signalCount;
        signals += o.signalCount;
      }
      baseHits += o.baseRate * o.predictions;
      baseN += o.predictions;
    }
    const skills = list.map((m) => m.brierSkill).filter((v): v is number => v !== null && Number.isFinite(v));
    return {
      id,
      assets: list.length,
      brierSkill: skills.length ? mean(skills) : null,
      brier: list.length ? mean(list.map((m) => m.oos!.brier)) : null,
      accuracy: list.length ? mean(list.map((m) => m.oos!.accuracy)) : null,
      hitRate: signals ? hits / signals : null,
      baseRate: baseN ? baseHits / baseN : null,
      signals,
      wins: assets.filter((a) => a.arena?.best === id).length,
      beatsBase: list.filter((m) => (m.brierSkill ?? 0) > 0).length,
    };
  });
  return rows.sort((a, b) => (b.brierSkill ?? -Infinity) - (a.brierSkill ?? -Infinity));
}

// ---- Live arena: every model's daily prediction, scored when due -------------------------------

export interface ArenaEntry {
  date: string;
  horizonDays: number;
  symbol: string;
  p: Partial<Record<ArenaModelId, number>>;
  outcome?: { dueDate: string; ret: number; up: boolean };
}

export interface ArenaLog {
  version: 1;
  entries: ArenaEntry[];
}

export const emptyArenaLog = (): ArenaLog => ({ version: 1, entries: [] });

/** Adds today's predictions (one entry per date, horizon and symbol; a repeat run changes nothing). */
export function recordArenaDay(log: ArenaLog, date: string, horizonDays: number, rows: Array<{ symbol: string; arena?: ArenaAsset | null }>): ArenaLog {
  const have = new Set(log.entries.map((e) => `${e.date}|${e.horizonDays}|${e.symbol}`));
  const add: ArenaEntry[] = [];
  for (const r of rows) {
    if (!r.arena || have.has(`${date}|${horizonDays}|${r.symbol}`)) continue;
    add.push({ date, horizonDays, symbol: r.symbol, p: Object.fromEntries(r.arena.models.map((m) => [m.id, Math.round(m.pNow * 1e4) / 1e4])) });
  }
  return add.length ? { ...log, entries: [...log.entries, ...add] } : log;
}

/** Scores entries whose horizon has passed (trading bars after the prediction date). */
export function evaluateArenaLog(log: ArenaLog, history: Map<string, Array<{ date: string; close: number }>>): ArenaLog {
  let changed = false;
  const entries = log.entries.map((e) => {
    if (e.outcome) return e;
    const bars = history.get(e.symbol);
    if (!bars?.length) return e;
    let i = -1;
    for (let k = 0; k < bars.length && bars[k].date <= e.date; k++) i = k;
    const due = i >= 0 ? bars[i + e.horizonDays] : undefined;
    if (!due || bars[i].close <= 0) return e;
    changed = true;
    const ret = due.close / bars[i].close - 1;
    return { ...e, outcome: { dueDate: due.date, ret, up: ret > 0 } };
  });
  return changed ? { ...log, entries } : log;
}

/** Symbols with predictions still waiting for their result. */
export function pendingArenaSymbols(log: ArenaLog): string[] {
  return [...new Set(log.entries.filter((e) => !e.outcome).map((e) => e.symbol))];
}

export interface ArenaLiveRow {
  id: ArenaModelId;
  evaluated: number;
  brier: number | null;
  accuracy: number | null;
  hitRate: number | null;
  signals: number;
}

export interface ArenaLiveBoard {
  horizonDays: number;
  firstDate: string | null;
  saved: number;
  evaluated: number;
  baseUpRate: number | null;
  rows: ArenaLiveRow[];
}

export function arenaLiveBoard(log: ArenaLog, horizonDays: number): ArenaLiveBoard {
  const list = log.entries.filter((e) => e.horizonDays === horizonDays);
  const done = list.filter((e) => e.outcome);
  const rows = ARENA_MODELS.map((id) => {
    const scored = done.filter((e) => typeof e.p[id] === 'number');
    const ups = scored.filter((e) => (e.p[id] as number) >= ARENA_SIGNAL);
    return {
      id,
      evaluated: scored.length,
      brier: scored.length ? mean(scored.map((e) => ((e.p[id] as number) - (e.outcome!.up ? 1 : 0)) ** 2)) : null,
      accuracy: scored.length ? scored.filter((e) => ((e.p[id] as number) >= 0.5) === e.outcome!.up).length / scored.length : null,
      hitRate: ups.length ? ups.filter((e) => e.outcome!.up).length / ups.length : null,
      signals: ups.length,
    };
  }).sort((a, b) => (a.brier ?? Infinity) - (b.brier ?? Infinity));
  return {
    horizonDays,
    firstDate: list.length ? list.map((e) => e.date).sort()[0] : null,
    saved: list.length,
    evaluated: done.length,
    baseUpRate: done.length ? done.filter((e) => e.outcome!.up).length / done.length : null,
    rows,
  };
}

export function parseArenaLog(raw: unknown): ArenaLog | null {
  const r = raw as Partial<ArenaLog> | null;
  if (!r || r.version !== 1 || !Array.isArray(r.entries)) return null;
  const entries = r.entries.filter(
    (e): e is ArenaEntry => Boolean(e) && typeof e.date === 'string' && typeof e.symbol === 'string' && typeof e.horizonDays === 'number' && Boolean(e.p) && typeof e.p === 'object'
  );
  return { version: 1, entries };
}
