/** portfolio.test.ts — Tests for average-cost positions, P/L, Rupiah conversion, validation and import/export. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getAssetBySymbol, type PriceTick } from '../config/assets.ts';
import {
  assetClassOf,
  buildPositions,
  exportPortfolio,
  idrPerUnit,
  parsePortfolioImport,
  tradeUnitOf,
  validateTx,
  valuePosition,
  type PortfolioTx,
} from './portfolio.ts';

const tx = (id: string, side: 'buy' | 'sell', date: string, quantity: number, price: number, fee = 0, symbol = 'BBCA.JK'): PortfolioTx => ({
  id,
  symbol,
  side,
  date,
  quantity,
  price,
  fee,
});

const tick = (symbol: string, price: number, extra: Partial<PriceTick> = {}): PriceTick =>
  ({ symbol, group: 'idStock', price, currency: 'IDR', source: 'test', updatedAt: 0, status: 'delayed', ...extra }) as PriceTick;

test('average cost with fees, partial sell and realized profit', () => {
  const p = buildPositions([
    tx('1', 'buy', '2026-01-02', 1000, 9000, 15_000),
    tx('2', 'buy', '2026-02-02', 1000, 8000, 15_000),
    tx('3', 'sell', '2026-03-02', 500, 10_000, 10_000),
  ]).get('BBCA.JK');
  assert.ok(p);
  // cost 17,030,000 for 2000 shares → avg 8,515
  assert.equal(p.quantity, 1500);
  assert.ok(Math.abs(p.avgCost - 8515) < 1e-9);
  // realized = 500 × 10,000 − 10,000 − 500 × 8,515 = 732,500
  assert.ok(Math.abs(p.realized - 732_500) < 1e-6);
  assert.ok(Math.abs(p.costBasis - 1500 * 8515) < 1e-6);
});

test('closing a position keeps realized P/L and resets cost', () => {
  const p = buildPositions([tx('1', 'buy', '2026-01-02', 100, 100), tx('2', 'sell', '2026-01-03', 100, 120)]).get('BBCA.JK');
  assert.ok(p);
  assert.equal(p.quantity, 0);
  assert.equal(p.costBasis, 0);
  assert.equal(p.realized, 2000);
});

test('valuation converts USD holdings to Rupiah and gold uses Rupiah per gram', () => {
  const ticks: Record<string, PriceTick> = {
    'USD/IDR': tick('USD/IDR', 16_000, { group: 'forex' }),
    NVDA: tick('NVDA', 200, { group: 'usStock', currency: 'USD' }),
    'XAU/USD': tick('XAU/USD', 4000, { group: 'commodity', currency: 'USD', priceIdrPerGram: 2_000_000 }),
  };
  const nvda = getAssetBySymbol('NVDA');
  assert.ok(nvda);
  const pos = buildPositions([tx('1', 'buy', '2026-01-02', 10, 150, 0, 'NVDA')]).get('NVDA');
  assert.ok(pos);
  const v = valuePosition(pos, tradeUnitOf(nvda), ticks.NVDA, ticks);
  assert.equal(v.marketValue, 2000);
  assert.equal(v.marketValueIdr, 32_000_000);
  assert.equal(v.unrealizedIdr, 8_000_000);
  assert.ok(Math.abs((v.unrealizedPct ?? 0) - 33.333) < 0.01);

  const gold = getAssetBySymbol('XAU/USD');
  assert.ok(gold);
  const gu = tradeUnitOf(gold);
  assert.equal(gu.inputLabel, 'grams');
  assert.equal(gu.currency, 'IDR');
  const gpos = buildPositions([tx('g', 'buy', '2026-01-02', 5, 1_800_000, 0, 'XAU/USD')]).get('XAU/USD');
  assert.ok(gpos);
  assert.equal(valuePosition(gpos, gu, ticks['XAU/USD'], ticks).marketValueIdr, 10_000_000);

  // IDX stocks are entered in lots of 100 shares
  const bbca = getAssetBySymbol('BBCA.JK');
  assert.ok(bbca);
  assert.equal(tradeUnitOf(bbca).perInput, 100);
  assert.equal(idrPerUnit('KRW', ticks), undefined);
  assert.equal(assetClassOf(bbca), 'stocks');
  assert.equal(assetClassOf(gold), 'gold');
});

test('validation rejects bad numbers, future dates and overselling', () => {
  const existing = [tx('1', 'buy', '2026-01-10', 100, 100)];
  const ok = { symbol: 'BBCA.JK', side: 'sell' as const, date: '2026-01-11', quantity: 100, price: 110, fee: 0 };
  assert.deepEqual(validateTx(ok, existing, '2026-10-20'), []);
  assert.ok(validateTx({ ...ok, quantity: 0 }, existing, '2026-10-20').length > 0);
  assert.ok(validateTx({ ...ok, price: -1 }, existing, '2026-10-20').length > 0);
  assert.ok(validateTx({ ...ok, date: '2026-12-01' }, existing, '2026-10-20').some((e) => e.includes('future')));
  assert.ok(validateTx({ ...ok, quantity: 150 }, existing, '2026-10-20').some((e) => e.includes('sell more')));
  // Selling before the buy date is overselling too
  assert.ok(validateTx({ ...ok, date: '2026-01-05' }, existing, '2026-10-20').some((e) => e.includes('sell more')));
  // Editing the buy down below an existing sell is rejected
  const withSell = [...existing, tx('2', 'sell', '2026-01-11', 100, 110)];
  assert.ok(validateTx({ symbol: 'BBCA.JK', side: 'buy', date: '2026-01-10', quantity: 50, price: 100, fee: 0 }, withSell, '2026-10-20', '1').length > 0);
});

test('export and import round-trip; bad files give readable errors', () => {
  const txs = [tx('1', 'buy', '2026-01-10', 100, 100)];
  const text = exportPortfolio(txs, new Date('2026-10-20T00:00:00Z'));
  assert.deepEqual(parsePortfolioImport(text, () => true), txs);
  assert.throws(() => parsePortfolioImport('nope', () => true), /not valid JSON/);
  assert.throws(() => parsePortfolioImport('{"transactions":[{"id":1}]}', () => true), /invalid transaction/);
  assert.throws(() => parsePortfolioImport(text, () => false), /Unknown asset/);
});
