/** movers.test.ts — Tests for the live price buffer and the movers ranking. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PriceHistoryBuffer, rankMovers, changeForWindow } from './movers.ts';
import type { PriceTick } from '../config/assets.ts';

test('PriceHistoryBuffer measures change over a window and prunes old samples', () => {
  const buf = new PriceHistoryBuffer(10 * 60_000, 1_000);
  const t0 = 1_000_000;
  buf.record('BTC/IDR', 100, t0);
  buf.record('BTC/IDR', 101, t0 + 60_000);
  buf.record('BTC/IDR', 102, t0 + 6 * 60_000);
  // 5-minute window at t0+6m: base is the sample at t0+1m (101) → +0.99%
  const ch = buf.changeOver('BTC/IDR', 5 * 60_000, t0 + 6 * 60_000);
  assert.ok(ch);
  assert.equal(ch.pct.toFixed(2), '0.99');
  assert.equal(ch.coveredMs, 5 * 60_000);
  // Window longer than the buffer → measured from the oldest sample
  assert.equal(buf.changeOver('BTC/IDR', 60 * 60_000, t0 + 6 * 60_000)?.pct, 2);
  // Pruning keeps only the last 10 minutes
  buf.record('BTC/IDR', 103, t0 + 12 * 60_000);
  assert.equal(buf.get('BTC/IDR')[0].price, 102);
  assert.equal(buf.changeOver('NONE', 60_000), undefined);
});

test('PriceHistoryBuffer skips duplicates, bad prices and out-of-order samples', () => {
  const buf = new PriceHistoryBuffer(60_000, 5_000);
  buf.record('X', 10, 1000);
  buf.record('X', 10, 2000); // same price within spacing
  buf.record('X', 0, 3000); // invalid
  buf.record('X', 11, 500); // older than last
  assert.equal(buf.get('X').length, 1);
  buf.record('X', 10, 7000);
  assert.equal(buf.get('X').length, 2);
});

test('rankMovers splits gainers and losers in order', () => {
  const items = [
    { k: 'a', v: 3 },
    { k: 'b', v: -5 },
    { k: 'c', v: 0.01 },
    { k: 'd', v: undefined },
    { k: 'e', v: 7 },
    { k: 'f', v: -1 },
  ];
  const { gainers, losers } = rankMovers(items, (i) => i.v, 2, 0.05);
  assert.deepEqual(gainers.map((g) => g.item.k), ['e', 'a']);
  assert.deepEqual(losers.map((l) => l.item.k), ['b', 'f']);
});

test('changeForWindow reads the right field per window', () => {
  const tick = {
    symbol: 'AAPL',
    group: 'usStock',
    price: 200,
    changePct24h: 1,
    changePct1h: 0.2,
    changePct7d: -3,
    currency: 'USD',
    source: 'test',
    updatedAt: 0,
    status: 'delayed',
  } as PriceTick;
  assert.equal(changeForWindow(tick, '24h'), 1);
  assert.equal(changeForWindow(tick, '1h'), 0.2);
  assert.equal(changeForWindow(tick, '7d'), -3);
  assert.equal(changeForWindow({ ...tick, status: 'error' }, '24h'), undefined);
  const buf = new PriceHistoryBuffer();
  buf.record('AAPL', 100, 0);
  buf.record('AAPL', 101, 60_000);
  assert.equal(changeForWindow(tick, 'now', buf, 60_000), 1);
});
