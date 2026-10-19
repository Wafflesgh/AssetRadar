import test from 'node:test';
import assert from 'node:assert/strict';
import { pearson, correlateSeries, correlationMatrixFromSeries } from './correlation.ts';

test('pearson: perfect positive, negative, and degenerate cases', () => {
  assert.equal(pearson([1, 2, 3, 4], [2, 4, 6, 8]), 1);
  assert.equal(pearson([1, 2, 3, 4], [8, 6, 4, 2]), -1);
  assert.equal(pearson([1, 1, 1, 1], [1, 2, 3, 4]), null);
  assert.equal(pearson([1, 2], [1, 2]), null);
});

test('correlateSeries aligns on shared dates only', () => {
  const crypto = [
    { date: '2026-10-01', close: 100 },
    { date: '2026-10-02', close: 110 },
    { date: '2026-10-03', close: 105 }, // weekend, tidak ada di saham
    { date: '2026-10-04', close: 99 },
    { date: '2026-10-05', close: 120 },
    { date: '2026-10-06', close: 132 },
  ];
  const stock = [
    { date: '2026-10-01', close: 50 },
    { date: '2026-10-02', close: 55 },
    { date: '2026-10-05', close: 60 },
    { date: '2026-10-06', close: 66 },
  ];
  const r = correlateSeries(crypto, stock, 30);
  assert.ok(r !== null && r > 0.9, `expected strong positive, got ${r}`);
});

test('correlationMatrixFromSeries is symmetric with unit diagonal', () => {
  const a = [1, 2, 4, 3, 5, 7].map((c, i) => ({ date: `2026-10-0${i + 1}`, close: c }));
  const b = [2, 3, 5, 4, 7, 8].map((c, i) => ({ date: `2026-10-0${i + 1}`, close: c }));
  const m = correlationMatrixFromSeries([a, b, []], 30);
  assert.equal(m[0][0], 1);
  assert.equal(m[0][1], m[1][0]);
  assert.equal(m[2][2], null);
  assert.equal(m[0][2], null);
});
