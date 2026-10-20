/** validation.test.ts — Tests for Spearman IC, evidence statistics and the point-in-time market back-test (synthetic market). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceFrom, evidenceSentence, monthRange, spearman, validateMarket } from './validation.ts';
import type { StockInput } from './factors.ts';

test('Spearman rank correlation', () => {
  const x = Array.from({ length: 20 }, (_, i) => i);
  assert.equal(spearman(x, x.map((v) => v * v)), 1);
  assert.equal(spearman(x, x.map((v) => -v)), -1);
  assert.equal(spearman([1, 2, 3], [1, 2, 3]), null); // too few
});

test('evidence statistics: IC, quintile hit rate vs base rate, spread and the 60/40 split', () => {
  const samples = Array.from({ length: 10 }, (_, m) => {
    const scores = Array.from({ length: 50 }, (_, i) => i);
    const returns = scores.map((s) => (s - 25) / 100 + ((m * 7 + s * 13) % 5) / 40);
    return { month: `2024-${String(m + 1).padStart(2, '0')}`, scores, returns };
  });
  const e = evidenceFrom('medium', samples);
  assert.ok((e.meanIC ?? 0) > 0.5);
  assert.ok(e.significant);
  assert.ok((e.topHitRate ?? 0) > (e.baseRate ?? 100));
  assert.equal(e.monthsTopBeatBase, 100);
  assert.ok((e.spread ?? 0) > 0);
  assert.equal(e.validation.months, 6);
  assert.equal(e.holdout.months, 4);
  assert.match(evidenceSentence(e, 'IDX') ?? '', /On IDX since 2024, the top 20% by medium score beat the base rate in 100% of months/);
  assert.deepEqual(monthRange('2024-11', '2025-02'), ['2024-11', '2024-12', '2025-01', '2025-02']);
});

test('market back-test finds persistent momentum and reports cadence', () => {
  const months = monthRange('2015-01', '2022-12');
  // Each stock has its own steady drift: past winners keep winning (momentum works by construction)
  const stocks: StockInput[] = Array.from({ length: 40 }, (_, k) => {
    const drift = (k - 20) / 1000;
    let p = 100;
    return {
      symbol: `S${k}`,
      market: 'idx',
      monthly: months.map((month, i) => {
        p *= Math.exp(drift + 0.01 * Math.sin(i * 1.7 + k));
        return { month, close: p };
      }),
      annual: [],
      quarterly: [],
    };
  });
  const v = validateMarket(stocks, 'idx', '2022-06', 36);
  assert.ok(v);
  assert.ok((v.pillars.momentum.meanIC ?? 0) > 0.5, String(v.pillars.momentum.meanIC));
  assert.ok(v.horizons.medium.months > 0);
  assert.ok(['Daily', 'Weekly', 'Monthly'].includes(v.cadence.medium.cadence));
  assert.ok(v.scope.length >= 2);
  assert.ok(['paper', 'recent'].includes(v.dWindow.chosen));
  assert.equal(validateMarket([], 'idx', '2022-06'), null);
});
