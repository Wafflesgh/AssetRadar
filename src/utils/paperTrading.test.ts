/** paperTrading.test.ts — Tests for Paper Trading: quotes, fees, lots, cash checks, Rupiah value and parsing. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getAssetBySymbol, type PriceTick } from '../config/assets.ts';
import {
  cashOf,
  checkPaperOrder,
  heldQuantity,
  makePaperOrder,
  maxAffordable,
  newPaperAccount,
  parsePaperItems,
  quotePaperOrder,
  summarizePaper,
  type PaperOrder,
} from './paperTrading.ts';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`);
const tick = (symbol: string, price: number, extra: Partial<PriceTick> = {}): PriceTick =>
  ({ symbol, group: 'idStock', price, currency: 'IDR', source: 'test', updatedAt: 0, status: 'live', ...extra }) as PriceTick;

const bbca = getAssetBySymbol('BBCA.JK')!;
const aapl = getAssetBySymbol('AAPL')!;
const jci = getAssetBySymbol('^JKSE')!;

test('IDX buys are whole lots with the buy fee; sells pay the higher sell fee', () => {
  const ticks = { 'BBCA.JK': tick('BBCA.JK', 10_000) };
  const buy = quotePaperOrder(bbca, 'buy', 2, ticks['BBCA.JK'], ticks);
  assert.ok('quote' in buy);
  assert.equal(buy.quote.quantity, 200);
  near(buy.quote.fee, 2_000_000 * 0.0015);
  near(buy.quote.cashIdr, -(2_000_000 + 3_000));
  const sell = quotePaperOrder(bbca, 'sell', 1, ticks['BBCA.JK'], ticks);
  assert.ok('quote' in sell);
  near(sell.quote.cashIdr, 1_000_000 - 2_500);
  assert.deepEqual(quotePaperOrder(bbca, 'buy', 1.5, ticks['BBCA.JK'], ticks), { error: 'wholeLots' });
  assert.deepEqual(quotePaperOrder(jci, 'buy', 1, undefined, ticks), { error: 'notTradable' });
  // Saved offline prices are not traded on
  assert.deepEqual(quotePaperOrder(bbca, 'buy', 1, tick('BBCA.JK', 10_000, { fromSnapshot: true }), ticks), { error: 'noPrice' });
});

test('US stocks need the USD/IDR rate and are converted at the fill', () => {
  const ticks = { AAPL: tick('AAPL', 200, { currency: 'USD', group: 'usStock' }), 'USD/IDR': tick('USD/IDR', 16_000, { group: 'forex' }) };
  const q = quotePaperOrder(aapl, 'buy', 10, ticks.AAPL, ticks);
  assert.ok('quote' in q);
  assert.equal(q.quote.fx, 16_000);
  near(q.quote.cashIdr, -(2000 * 1.001) * 16_000);
  assert.deepEqual(quotePaperOrder(aapl, 'buy', 10, ticks.AAPL, { AAPL: ticks.AAPL }), { error: 'noRate' });
  assert.equal(maxAffordable(aapl, q.quote, 16_016_000), 5);
});

test('cash and holdings checks, then the account value and comparison with the index', () => {
  const account = newPaperAccount(1_000, 7_000);
  const ticks: Record<string, PriceTick> = { 'BBCA.JK': tick('BBCA.JK', 10_000), '^JKSE': tick('^JKSE', 7_700, { group: 'index' }) };
  const q = quotePaperOrder(bbca, 'buy', 10, ticks['BBCA.JK'], ticks);
  assert.ok('quote' in q);
  assert.equal(checkPaperOrder('buy', q.quote, 1_000_000, 0), 'notEnoughCash');
  assert.equal(checkPaperOrder('buy', q.quote, account.startCash, 0), null);
  const orders: PaperOrder[] = [makePaperOrder(bbca, 'buy', q.quote, 2_000, 'o1')];
  near(cashOf(account, orders), 100_000_000 - 10_015_000);
  assert.equal(heldQuantity(orders, 'BBCA.JK'), 1_000);
  const s1 = quotePaperOrder(bbca, 'sell', 11, ticks['BBCA.JK'], ticks);
  assert.ok('quote' in s1);
  assert.equal(checkPaperOrder('sell', s1.quote, 0, 1_000), 'notEnoughHolding');

  // Price up 10%: value = cash + 1,000 shares × 11,000
  const later = { ...ticks, 'BBCA.JK': tick('BBCA.JK', 11_000) };
  const sum = summarizePaper(account, orders, later, getAssetBySymbol);
  near(sum.totalIdr, 100_000_000 - 10_015_000 + 11_000_000);
  near(sum.ret, sum.totalIdr / 100_000_000 - 1);
  near(sum.jciRet!, 0.1);
  assert.equal(sum.holdings[0].priced, true);
  // Without a live price the holding is valued at cost
  const noPrice = summarizePaper(account, orders, { '^JKSE': ticks['^JKSE'] }, getAssetBySymbol);
  assert.equal(noPrice.unpriced, 1);
  near(noPrice.totalIdr, 100_000_000);
});

test('stored items: account and valid orders kept, orders from before a reset dropped', () => {
  const account = newPaperAccount(5_000, null);
  const good = { id: 'a', kind: 'order', at: 6_000, symbol: 'BBCA.JK', side: 'buy', quantity: 100, price: 10, currency: 'IDR', fx: 1, fee: 0 };
  const parsed = parsePaperItems([account, good, { ...good, id: 'old', at: 4_000 }, { ...good, id: 'bad', quantity: -1 }, null]);
  assert.equal(parsed.account?.startCash, 100_000_000);
  assert.deepEqual(parsed.orders.map((o) => o.id), ['a']);
  assert.equal(parsePaperItems('x').account, null);
});

test('realized profit counts the exchange-rate move between buy and sell', () => {
  const account = newPaperAccount(0, null);
  const order = (id: string, side: 'buy' | 'sell', at: number, price: number, fx: number): PaperOrder =>
    ({ id, kind: 'order', at, symbol: 'AAPL', side, quantity: 10, price, currency: 'USD', fx, fee: 0 });
  const orders = [order('b', 'buy', 1, 100, 15_000), order('s', 'sell', 2, 110, 16_000)];
  // 10 × $110 × 16,000 − 10 × $100 × 15,000
  near(summarizePaper(account, orders, {}, getAssetBySymbol).realizedIdr, 2_600_000);
});
