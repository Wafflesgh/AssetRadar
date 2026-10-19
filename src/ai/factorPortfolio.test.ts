/** factorPortfolio.test.ts — Tests for the value/momentum factor backtest and its statistics. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths,
  blend,
  buildFactorSeries,
  correlation,
  despike,
  equityCurve,
  performance,
  rankWeights,
  type FScoreTimeline,
  type MonthlySeries,
} from './factorPortfolio.ts';

test('rankWeights are $1 long / $1 short and order-preserving', () => {
  const w = rankWeights([3, 1, 2, 5]);
  assert.ok(Math.abs(w.filter((x) => x > 0).reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.ok(Math.abs(w.filter((x) => x < 0).reduce((a, b) => a + b, 0) + 1) < 1e-12);
  assert.ok(w[3] > w[0] && w[0] > w[2] && w[2] > w[1]);
  assert.deepEqual(rankWeights([1, 1]), [0, 0]);
});

test('addMonths crosses year boundaries', () => {
  assert.equal(addMonths('2024-11', 3), '2025-02');
  assert.equal(addMonths('2024-01', -1), '2023-12');
});

/** Assets with constant monthly drifts: momentum should earn, the benchmark is the average. */
function trending(n: number, months: number): MonthlySeries[] {
  return Array.from({ length: n }, (_, i) => {
    const drift = (i - n / 2) * 0.004;
    const closes = new Map<string, number>();
    let p = 100;
    for (let m = 0; m < months; m++) {
      closes.set(addMonths('2010-01', m), p);
      p *= 1 + drift;
    }
    return { symbol: `A${i}`, closes };
  });
}

test('momentum earns on persistent trends; value (long-run reversal) loses there', () => {
  const f = buildFactorSeries(trending(10, 120));
  assert.ok(f.months.length > 40);
  const mom = performance(f.momentumLS);
  const val = performance(f.valueLS);
  assert.ok(mom && mom.annualReturn > 0, `mom ${mom?.annualReturn}`);
  assert.ok(val && val.annualReturn < 0, `val ${val?.annualReturn}`);
  // In pure trends the value ranks are the reverse of the momentum ranks
  f.valueLS.forEach((v, i) => assert.ok(Math.abs((v ?? 0) + (f.momentumLS[i] ?? 0)) < 1e-9));
  const half = blend(f.valueLS, f.momentumLS, 0.5);
  assert.equal(half.length, f.months.length);
  assert.ok(f.breadth.every((b) => b === 10));
});

test('quality-filtered long-only only exists after the first published F-score', () => {
  const uni = trending(9, 100);
  const fs: FScoreTimeline = new Map([
    ['A8', [{ from: '2016-05', score: 9 }]],
    ['A7', [{ from: '2016-05', score: 3 }]],
  ]);
  const f = buildFactorSeries(uni, fs);
  const firstIdx = f.momentumLOQ.findIndex((x) => x !== null);
  assert.ok(firstIdx > 0);
  assert.ok(f.months[firstIdx] > '2016-05');
  assert.ok(f.momentumLOQ.slice(0, firstIdx).every((x) => x === null));
});

test('performance, correlation and equity curve basics', () => {
  const r = Array.from({ length: 24 }, (_, i) => (i % 2 === 0 ? 0.02 : -0.01));
  const p = performance(r);
  assert.ok(p);
  assert.equal(p.months, 24);
  assert.ok(p.annualReturn > 0 && p.volatility > 0 && (p.sharpe ?? 0) > 0);
  assert.ok(p.maxDrawdown <= 0);
  assert.equal(performance([0.01, null]), null);
  assert.ok(Math.abs((correlation(r, r) ?? 0) - 1) < 1e-12);
  assert.deepEqual(equityCurve([0.1, null, -0.5]).map((v) => +v.toFixed(2)), [1.1, 1.1, 0.55]);
});

test('despike drops isolated bad prints off by a factor of 10–100', () => {
  const pts = [100, 102, 10.1, 101, 103, 9800, 104].map((close, i) => ({ key: `2020-${String(i + 1).padStart(2, '0')}`, close }));
  assert.deepEqual(despike(pts).map((p) => p.close), [100, 102, 101, 103, 104]);
  // A genuine step change (two points in a row) is kept
  const step = [100, 100, 200, 210, 220].map((close, i) => ({ key: String(i), close }));
  assert.equal(despike(step).length, 5);
});
