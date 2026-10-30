/** fundArena.test.ts — Tests for the AI Fund Arena (rebalancing, costs, dollar conversion, picks, board). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FUND_COST,
  FUND_START_USD,
  fundBoard,
  maxDrawdownOf,
  parseFundArena,
  probabilityPicks,
  sentimentPicks,
  stepFundArena,
} from './fundArena.ts';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('first day buys the picks equally after costs; cash when nothing is picked', () => {
  const s = stepFundArena(null, {
    date: '2026-10-30',
    usdIdr: 16000,
    quotes: { A: { price: 10, idr: false }, B: { price: 1000, idr: true }, jci: { price: 7000, idr: true } },
    picks: { sentShort: ['A', 'B'], advisor: [] },
    benchmark: 'jci',
  });
  const m = s.managers.sentShort;
  near(m.cash, 0);
  near(m.positions[0].value, (FUND_START_USD * (1 - FUND_COST)) / 2);
  assert.equal(m.trades.length, 2);
  near(s.managers.advisor.cash, FUND_START_USD);
  assert.equal(s.managers.advisor.positions.length, 0);
  near(s.benchmark.position!.value, FUND_START_USD);
});

test('marks to market in dollars and only trades the difference', () => {
  let s = stepFundArena(null, {
    date: '2026-10-30',
    usdIdr: 16000,
    quotes: { A: { price: 10, idr: false }, B: { price: 1000, idr: true } },
    picks: { sentShort: ['A', 'B'] },
    benchmark: 'jci',
  });
  const half = (FUND_START_USD * (1 - FUND_COST)) / 2;
  // A +10% in dollars; B +10% in Rupiah but the Rupiah fell 10% → flat in dollars
  s = stepFundArena(s, {
    date: '2026-10-31',
    usdIdr: 17600,
    quotes: { A: { price: 11, idr: false }, B: { price: 1100, idr: true } },
    picks: { sentShort: ['A'] },
    benchmark: 'jci',
  });
  const m = s.managers.sentShort;
  const before = half * 1.1 + half;
  // Sold B (value `half`), A grows to the whole portfolio: turnover = half + half
  near(m.positions[0].value, before - 2 * half * FUND_COST);
  assert.deepEqual(m.history.map(([d]) => d), ['2026-10-30', '2026-10-31']);
  assert.equal(m.positions[0].since, '2026-10-30');
  assert.deepEqual(
    m.trades.slice(-2).map((t) => `${t.side} ${t.symbol}`),
    ['sell B', 'buy A']
  );
});

test('picks follow conviction and the board ranks by value', () => {
  assert.deepEqual(
    sentimentPicks([
      { symbol: 'X', label: 'Neutral', score: 90 },
      { symbol: 'Y', label: 'Bullish', score: 62 },
      { symbol: 'Z', label: 'Strong Bullish', score: 80 },
    ]),
    ['Z', 'Y']
  );
  assert.deepEqual(probabilityPicks([{ symbol: 'A', p: 0.54 }, { symbol: 'B', p: 0.7 }, { symbol: 'C', p: null }, { symbol: 'D', p: 0.6 }]), ['B', 'D']);
  near(maxDrawdownOf([100, 120, 90, 130]), 90 / 120 - 1);

  let s = stepFundArena(null, { date: '2026-10-30', usdIdr: 16000, quotes: { A: { price: 10, idr: false } }, picks: { trend: ['A'] }, benchmark: 'jci' });
  const board = fundBoard(s, { quotes: { A: { price: 20, idr: false } }, usdIdr: 16000 });
  assert.equal(board[0].id, 'trend');
  near(board[0].ret, (1 - FUND_COST) * 2 - 1);
  // Stored and read back
  s = parseFundArena(JSON.parse(JSON.stringify(s)))!;
  assert.equal(s.startDate, '2026-10-30');
  assert.equal(parseFundArena({ version: 2 }), null);
});
