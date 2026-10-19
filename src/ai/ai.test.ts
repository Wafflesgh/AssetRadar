/** ai.test.ts — Tests for AI indicators, Fed event logic, logistic model, walk-forward and ranking. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { alignByDate, drawdown, featuresAt, maxDrawdown, pctChange, rsi, sma } from './indicators.ts';
import { eventStudy, fedStanceSeries, nextMeeting, resolveMeetings } from './events.ts';
import { predictProba, selectStrategy, trainLogistic, walkForward, type Sample } from './model.ts';
import { compareIdMacro, rankOutlooks, reliabilityOf, type AssetOutlook } from './outlook.ts';

const day = (i: number) => new Date(Date.UTC(2021, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);

test('basic indicators', () => {
  const c = [10, 11, 12, 11, 13];
  assert.ok(Math.abs((pctChange(c, 4, 4) ?? 0) - 0.3) < 1e-12);
  assert.equal(pctChange(c, 2, 5), null);
  assert.equal(sma(c, 4, 2), 12);
  assert.equal(rsi([1, 2, 3, 4, 5], 4, 4), 100);
  assert.equal(drawdown([10, 20, 15], 2, 3), -0.25);
  assert.equal(maxDrawdown([10, 20, 10, 25]), -0.5);
});

test('alignByDate forward-fills macro values without look-ahead', () => {
  const out = alignByDate(['2021-01-01', '2021-01-03', '2021-01-05'], [
    { date: '2021-01-02', close: 1 },
    { date: '2021-01-05', close: 2 },
  ]);
  assert.deepEqual(out, [null, 1, 2]);
});

test('featuresAt needs a one-year warm-up and returns 13 features', () => {
  const closes = Array.from({ length: 300 }, (_, i) => 100 + i);
  const macro = {
    tbill: closes.map(() => 4),
    yield10y: closes.map(() => 4),
    dollar: closes.map(() => 100),
    fedStance: closes.map(() => 0),
  };
  assert.equal(featuresAt(closes, 200, macro), null);
  assert.equal(featuresAt(closes, 299, macro)?.length, 13);
  // Indonesian macro inputs add two features
  const idMacro = { ...macro, idRate: closes.map(() => 6), idInflation: closes.map((_, i) => 2 + i / 1000) };
  assert.equal(featuresAt(closes, 299, idMacro)?.length, 15);
});

test('resolveMeetings keeps recorded outcomes and infers later ones from T-bill moves', () => {
  // T-bill drops 0.3 points around 2026-01-28 → inferred cut
  const tbill = Array.from({ length: 2200 }, (_, i) => ({ date: day(i), close: day(i) < '2026-01-28' ? 4 : 3.7 }));
  const meetings = resolveMeetings(tbill, '2026-10-19');
  assert.equal(meetings.find((m) => m.date === '2022-03-16')?.decision, 'hike');
  const jan = meetings.find((m) => m.date === '2026-01-28');
  assert.deepEqual(jan, { date: '2026-01-28', decision: 'cut', inferred: true });
  assert.equal(meetings.find((m) => m.date === '2026-12-09')?.decision, null);
  assert.equal(nextMeeting('2026-10-19'), '2026-10-28');
});

test('fedStanceSeries reflects recent cuts and hikes', () => {
  const meetings = [
    { date: '2022-03-16', decision: 'hike' as const, inferred: false },
    { date: '2024-09-18', decision: 'cut' as const, inferred: false },
  ];
  assert.deepEqual(fedStanceSeries(['2022-04-01', '2023-06-01', '2024-10-01'], meetings), [-1, 0, 1]);
});

test('eventStudy averages returns after each decision type', () => {
  const bars = Array.from({ length: 60 }, (_, i) => ({ date: day(i), close: 100 + i }));
  const [cut] = eventStudy(bars, [{ date: day(10), decision: 'cut', inferred: false }]);
  assert.equal(cut.count, 1);
  // base = close before the decision (109), +20 trading days = 130
  assert.ok(Math.abs((cut.avg20 ?? 0) - (130 / 109 - 1)) < 1e-9);
  assert.equal(cut.positive20, 1);
});

test('trainLogistic learns a separable pattern', () => {
  const X = Array.from({ length: 200 }, (_, i) => [i % 2 === 0 ? 1 : -1, Math.sin(i)]);
  const y = X.map((x) => (x[0] > 0 ? 1 : 0));
  const model = trainLogistic(X, y);
  assert.ok(predictProba(model, [1, 0]) > 0.8);
  assert.ok(predictProba(model, [-1, 0]) < 0.2);
});

test('walkForward reports out-of-sample stats and edge on a predictable series', () => {
  const samples: Sample[] = Array.from({ length: 700 }, (_, t) => {
    const signal = Math.sin(t / 7);
    return { t, x: [signal], y: signal > 0 ? 1 : 0, fwdReturn: signal > 0 ? 0.02 : -0.02 };
  });
  const bt = walkForward(samples, 5, { minTrain: 200, step: 50 });
  assert.ok(bt);
  assert.ok(bt.accuracy > 0.9);
  assert.ok(bt.signalHitRate !== null && bt.signalHitRate > bt.baseRate);
  assert.ok(reliabilityOf(bt) > 0.5);
});

const outlook = (code: string, group: string, p: number, vol: number, edge: number): AssetOutlook => ({
  symbol: code,
  code,
  name: code,
  group,
  horizonDays: 20,
  asOf: '2026-10-16',
  bars: 1250,
  probabilityUp: p,
  signal: p >= 0.55 ? 'bullish' : p <= 0.45 ? 'bearish' : 'none',
  backtest: {
    predictions: 800,
    accuracy: 0.6,
    baseRate: 0.55,
    signalHitRate: 0.55 + edge,
    signalCount: 200,
    avgReturnSignal: 0.02,
    avgReturnAll: 0.01,
    brier: 0.23,
    threshold: 0.55,
  },
  drivers: [],
  strategy: 'model',
  strategyLabel: 'Logistic model',
  candidates: [],
  stats: { return1y: 0.1, return3y: 0.3, volatility: vol, maxDrawdown: -0.3 },
  fedReactions: [],
});

test('rankOutlooks applies the risk profile and the model reliability', () => {
  const list = [
    outlook('SPX', 'index', 0.7, 0.16, 0.1),
    outlook('BTC', 'crypto', 0.75, 0.6, 0.1),
    outlook('JCI', 'stock', 0.7, 0.15, 0),
    outlook('FTSE', 'index', 0.4, 0.12, 0.1),
  ];
  const conservative = rankOutlooks(list, 'conservative');
  const verdicts = Object.fromEntries(conservative.map((o) => [o.code, o.verdict]));
  assert.deepEqual(verdicts, { SPX: 'favorable', BTC: 'not-suitable', JCI: 'no-signal', FTSE: 'unfavorable' });
  assert.equal(conservative[0].code, 'SPX');
  assert.equal(rankOutlooks(list, 'aggressive').find((o) => o.code === 'BTC')?.verdict, 'favorable');
});

test('selectStrategy picks on validation and reports holdout only', () => {
  // A trending series: the trend rule fits by construction
  const samples: Sample[] = Array.from({ length: 600 }, (_, t) => {
    const up = Math.floor(t / 100) % 2 === 0;
    const x = Array(13).fill(0);
    x[6] = up ? 0.05 : -0.05; // trend200
    x[3] = up ? 0.1 : -0.1; // mom120
    return { t, x, y: up ? 1 : 0, fwdReturn: up ? 0.02 : -0.02 };
  });
  const preds = samples.slice(200).map((s) => ({ t: s.t, p: 0.5, y: s.y, r: s.fwdReturn }));
  const sel = selectStrategy(samples, preds);
  assert.equal(sel?.strategy, 'trend');
  assert.ok((sel?.holdout?.predictions ?? 0) < preds.length);
  assert.equal(sel?.holdout?.signalHitRate, 1);
});

test('rankOutlooks: a proven scorecard lean can decide, and checks explain the verdict', () => {
  const sc = (lean: 'bullish' | 'bearish', upRate: number) => ({
    composite: 0.2,
    score: 60,
    label: 'Bullish' as const,
    summary: '',
    scorecard: { lean, upRate, baseUpRate: 0.55, samples: 400, horizonDays: 20 },
  });
  const noEdge = (code: string) => outlook(code, 'index', 0.5, 0.15, 0); // backtest without edge
  const list = [
    { ...noEdge('DAX'), evidence: sc('bullish', 0.65) },
    { ...noEdge('HSI'), evidence: sc('bearish', 0.45) },
    { ...noEdge('N225'), evidence: sc('bullish', 0.56) }, // lean without a 3-point edge
    { ...outlook('SPX', 'index', 0.7, 0.16, 0.1), evidence: { ...sc('bullish', 0.6), composite: -0.4, label: 'Bearish' as const } },
  ];
  const v = Object.fromEntries(rankOutlooks(list, 'moderate').map((o) => [o.code, o]));
  assert.equal(v.DAX.verdict, 'favorable');
  assert.ok(Math.abs((v.DAX.adjustedProbability ?? 0) - (0.65 + 0.2 * 0.03)) < 1e-9);
  assert.equal(v.HSI.verdict, 'unfavorable');
  assert.equal(v.N225.verdict, 'no-signal');
  // A proven bullish setup contradicted by a bearish evidence score goes to the watch list
  assert.equal(v.SPX.verdict, 'watch');
  assert.equal(v.DAX.checks.length, 4);
  assert.equal(v.DAX.checks.find((c) => c.label.startsWith('Backtested'))?.pass, false);
  assert.equal(v.DAX.checks.find((c) => c.label.startsWith('Scorecard'))?.pass, true);
});

test('compareIdMacro keeps the Indonesian features only when validation improved', () => {
  const bt = (accuracy: number, brier: number) => ({
    predictions: 100,
    accuracy,
    baseRate: 0.5,
    signalHitRate: null,
    signalCount: 0,
    avgReturnSignal: null,
    avgReturnAll: 0,
    brier,
    threshold: 0.55,
  });
  const base = outlook('JCI', 'index', 0.5, 0.15, 0);
  const withId = { ...base, modelValidation: bt(0.55, 0.24), modelHoldout: bt(0.52, 0.25) };
  const without = { ...base, modelValidation: bt(0.5, 0.26), modelHoldout: bt(0.53, 0.245) };
  const t = compareIdMacro(withId, without);
  assert.equal(t?.used, true);
  assert.equal(t?.holdoutAccuracyWith, 0.52);
  assert.equal(compareIdMacro({ ...withId, modelValidation: bt(0.5, 0.3) }, without)?.used, false);
  assert.equal(compareIdMacro(base, without), null);
});
