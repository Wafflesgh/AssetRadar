/** txCosts.test.ts — Currency isolation, grouping, fee ratios and unavailable inputs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { txCosts } from './txCosts.ts';
import type { PortfolioTx } from './portfolio.ts';

const tx = (extra: Partial<PortfolioTx> = {}): PortfolioTx => ({
  id: 'test', symbol: 'BBCA.JK', side: 'buy', date: '2026-01-02', quantity: 100, price: 1000, fee: 150, ...extra,
});

test('trade currencies stay separate, including gold entered in Rupiah', () => {
  const result = txCosts([tx(), tx({ symbol: 'AAPL', quantity: 2, price: 200, fee: 1 }),
    tx({ symbol: 'XAU/USD', quantity: 1, price: 1000, fee: 10 })]);
  assert.equal(result.excluded, 0);
  assert.equal(result.currencies.length, 2);
  assert.equal(result.currencies[0].currency, 'IDR');
  assert.equal(result.currencies[0].fees, 160);
  assert.equal(result.currencies[0].tradedValue, 101000);
  assert.equal(result.currencies[1].currency, 'USD');
  assert.equal(result.currencies[1].fees, 1);
});

test('fees divided by gross traded value; both transaction sides count', () => {
  const [result] = txCosts([tx(), tx({ side: 'sell', quantity: 50, price: 2000, fee: 350 })]).currencies;
  assert.equal(result.fees, 500);
  assert.equal(result.tradedValue, 200000);
  assert.equal(result.feePct, 0.25);
});

test('month, year and asset totals include all records and support year filtering', () => {
  const input = [tx(), tx({ date: '2026-02-03', fee: 250 }), tx({ date: '2025-01-03', fee: 50 })];
  const [result] = txCosts(input).currencies;
  assert.deepEqual(result.months.map(r => [r.key, r.fees]), [['2026-02', 250], ['2026-01', 150], ['2025-01', 50]]);
  assert.deepEqual(result.years.map(r => [r.key, r.fees]), [['2026', 400], ['2025', 50]]);
  assert.equal(result.assets[0].fees, 450);
  assert.equal(txCosts(input.filter(t => t.date.startsWith('2025-'))).currencies[0].fees, 50);
});

test('no transactions produces no totals; explicit zero remains a recorded zero', () => {
  assert.deepEqual(txCosts([]), { currencies: [], excluded: 0 });
  assert.equal(txCosts([tx({ fee: 0 })]).currencies[0].feePct, 0);
});

test('unknown assets and invalid or missing values are excluded, not reported as zero', () => {
  const result = txCosts([tx({ symbol: 'UNKNOWN' }), tx({ fee: NaN }), tx({ quantity: 0 }),
    tx({ date: '2026-02-30' }), tx({ price: Infinity }), tx({ fee: undefined })]);
  assert.deepEqual(result, { currencies: [], excluded: 6 });
});

test('top ten assets are ranked by recorded fees without truncating currency totals', async () => {
  const { ALL_ASSETS } = await import('../config/assets.ts');
  const stocks = ALL_ASSETS.filter(a => a.group === 'idStock').slice(0, 11);
  assert.equal(stocks.length, 11);
  const [result] = txCosts(stocks.map((a, i) => tx({ symbol: a.symbol, fee: i + 1 }))).currencies;
  assert.equal(result.assets.length, 10);
  assert.equal(result.assets[0].fees, 11);
  assert.equal(result.assets[9].fees, 2);
  assert.equal(result.fees, 66);
});
