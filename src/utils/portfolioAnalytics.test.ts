/**
 * portfolioAnalytics.test.ts — Tests for the portfolio analytics: TWR with deposits and
 * withdrawals (flows do not count as performance), dividends counted on their date, dividend
 * suggestions only for shares held before the ex-date, drawdown, volatility, correlation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  annualizedVolatility,
  closeOn,
  dailyValues,
  holdingCorrelations,
  maxDrawdown,
  rebaseBenchmark,
  sharesBefore,
  suggestDividends,
  type DividendRecord,
} from './portfolioAnalytics.ts';
import type { PortfolioTx } from './portfolio.ts';

const tx = (id: string, date: string, side: 'buy' | 'sell', quantity: number, price: number, symbol = 'A', fee = 0): PortfolioTx => ({ id, symbol, side, date, quantity, price, fee });
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

function run(txs: PortfolioTx[], closes: Record<string, number>, dividends: DividendRecord[] = []) {
  return dailyValues(txs, dividends, Object.keys(closes), (_s, d) => closes[d], () => 1, () => 'IDR');
}

test('TWR: a deposit in the middle does not change the return', () => {
  // Buy 10 @100 → 110 (+10 %), buy 10 more @110 → both fall to 99 (−10 %)
  const pts = run([tx('1', '2026-01-01', 'buy', 10, 100), tx('2', '2026-01-02', 'buy', 10, 110)], {
    '2026-01-01': 100,
    '2026-01-02': 110,
    '2026-01-03': 99,
  });
  near(pts[0].twr, 100);
  near(pts[1].twr, 110);
  near(pts[2].twr, 99); // 1.1 × 0.9
  near(pts[1].flow, 1100);
  near(pts[2].value, 1980);
});

test('TWR: selling (a withdrawal) is not a loss', () => {
  const pts = run([tx('1', '2026-01-01', 'buy', 10, 100), tx('2', '2026-01-02', 'sell', 5, 120)], {
    '2026-01-01': 100,
    '2026-01-02': 120,
    '2026-01-03': 120,
  });
  near(pts[1].twr, 120);
  near(pts[2].twr, 120);
  near(pts[2].value, 600);
});

test('TWR: buying above the close and fees show up as a first-day loss', () => {
  const pts = run([tx('1', '2026-01-01', 'buy', 10, 100, 'A', 10)], { '2026-01-01': 99 });
  near(pts[0].twr, (990 / 1010) * 100);
});

test('TWR: dividends count as return on their payment date', () => {
  const div: DividendRecord = { id: 'd', symbol: 'A', exDate: '2026-01-02', payDate: '2026-01-03', perShare: 5, shares: 10, amount: 50, currency: 'IDR', source: 'manual' };
  const pts = run([tx('1', '2026-01-01', 'buy', 10, 100)], { '2026-01-01': 100, '2026-01-02': 95, '2026-01-03': 95 }, [div]);
  near(pts[1].twr, 95);
  near(pts[2].twr, 100); // (950 + 50) / 950 × 95
  near(pts[2].dividends, 50);
});

test('missing closes use the last trade price and mark the day as estimated', () => {
  const pts = run([tx('1', '2026-01-01', 'buy', 10, 100)], { '2026-01-02': NaN });
  assert.equal(pts[0].estimated, true);
  near(pts[0].value, 1000);
});

test('shares before the ex-date and dividend suggestions', () => {
  const txs = [tx('1', '2026-01-01', 'buy', 100, 1000, 'BBCA.JK'), tx('2', '2026-03-10', 'buy', 100, 1000, 'BBCA.JK'), tx('3', '2026-05-01', 'sell', 200, 1000, 'BBCA.JK')];
  assert.equal(sharesBefore(txs, 'BBCA.JK', '2026-03-10'), 100, 'bought on the ex-date: not entitled');
  assert.equal(sharesBefore(txs, 'BBCA.JK', '2026-03-11'), 200);
  const events = [
    { symbol: 'BBCA.JK', type: 'dividend' as const, date: '2026-03-10', amount: 50 },
    { symbol: 'BBCA.JK', type: 'dividend' as const, date: '2026-06-01', amount: 40 }, // nothing held
    { symbol: 'BBCA.JK', type: 'dividend' as const, date: '2025-12-01', amount: 30 }, // before the first buy
    { symbol: 'BBCA.JK', type: 'dividend' as const, date: '2026-12-01', amount: 30 }, // future
  ];
  const s = suggestDividends(events, txs, [], new Set(), '2026-10-20');
  assert.deepEqual(s.map((x) => [x.exDate, x.shares, x.amount]), [['2026-03-10', 100, 5000]]);
  const rec: DividendRecord = { id: 'r', symbol: 'BBCA.JK', exDate: '2026-03-10', perShare: 50, shares: 100, amount: 4500, currency: 'IDR', source: 'suggested' };
  assert.deepEqual(suggestDividends(events, txs, [rec], new Set(), '2026-10-20'), [], 'already recorded');
  assert.deepEqual(suggestDividends(events, txs, [], new Set(['BBCA.JK|2026-03-10']), '2026-10-20'), [], 'dismissed');
});

test('max drawdown with peak and trough dates', () => {
  const dd = maxDrawdown([
    { date: 'd1', v: 100 },
    { date: 'd2', v: 120 },
    { date: 'd3', v: 90 },
    { date: 'd4', v: 130 },
    { date: 'd5', v: 117 },
  ]);
  assert.deepEqual(dd, { drawdown: 90 / 120 - 1, peak: 'd2', trough: 'd3' });
  assert.equal(maxDrawdown([]), null);
});

test('volatility, benchmark rebasing, correlation and closeOn', () => {
  assert.equal(annualizedVolatility([0.01, -0.01]), null, 'too few returns');
  const alt = Array.from({ length: 20 }, (_, i) => (i % 2 ? 0.01 : -0.01));
  near(annualizedVolatility(alt) ?? 0, Math.sqrt((20 / 19) * 0.0001 * 252), 1e-12);
  assert.deepEqual(rebaseBenchmark([{ date: '2026-01-02', close: 50 }, { date: '2026-01-04', close: 55 }], ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']), [null, 100, 100, 110.00000000000001]);
  const up = Array.from({ length: 30 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, close: 100 + i + (i % 3) }));
  const same = up.map((b) => ({ ...b, close: b.close * 2 }));
  const c = holdingCorrelations([{ symbol: 'A', bars: up }, { symbol: 'B', bars: same }]);
  near(c[0].r ?? 0, 1, 1e-9);
  assert.equal(c[0].days, 29);
  assert.equal(closeOn(up, '2025-12-31'), undefined);
  assert.equal(closeOn(up, '2026-01-05'), up[4].close);
});
