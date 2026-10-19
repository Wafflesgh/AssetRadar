/**
 * priceStream.test.ts — Tests for the price-stream logic: refresh scheduling and priority,
 * rate-limit backoff and recovery, tick diffs, trade throttling and the client watchdog.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { PriceTick } from '../config/assets.ts';
import {
  applyTrade,
  Backoff,
  CLOSED_MARKET_MS,
  diffTicks,
  dueSymbols,
  isStreamStalled,
  isThrottleStatus,
  reconnectDelayMs,
  refreshIntervalMs,
  tradesToFlush,
} from './priceStream.ts';

const tick = (symbol: string, price: number, extra: Partial<PriceTick> = {}): PriceTick => ({
  symbol,
  group: 'usStock',
  price,
  currency: 'USD',
  source: 'Yahoo Finance',
  updatedAt: 1,
  status: 'delayed',
  ...extra,
});

test('refresh interval: priority 5 s, others 15 s, closed 5 min, slower with backoff', () => {
  assert.equal(refreshIntervalMs({ open: true, priority: true, streaming: true }), 5_000);
  assert.equal(refreshIntervalMs({ open: true, priority: false, streaming: true }), 15_000);
  assert.equal(refreshIntervalMs({ open: false, priority: true, streaming: true }), CLOSED_MARKET_MS);
  assert.equal(refreshIntervalMs({ open: true, priority: true, streaming: true, backoffFactor: 4 }), 20_000);
  assert.equal(refreshIntervalMs({ open: true, priority: true, streaming: false }), 15_000);
});

test('dueSymbols returns stale quotes, priority first', () => {
  const now = 100_000;
  const due = dueSymbols(
    [
      { symbol: 'A', open: true, priority: false, fetchedAt: now - 20_000 },
      { symbol: 'B', open: true, priority: true, fetchedAt: now - 6_000 },
      { symbol: 'C', open: true, priority: true, fetchedAt: now - 2_000 }, // fresh
      { symbol: 'D', open: false, priority: true, fetchedAt: now - 60_000 }, // closed: 5 min
      { symbol: 'E', open: true, priority: false }, // never fetched
    ],
    now,
    { streaming: true }
  );
  assert.deepEqual(due, ['B', 'E', 'A']);
});

test('backoff doubles on failures up to 8× and recovers after 3 successes per step', () => {
  const b = new Backoff();
  b.failure();
  b.failure();
  assert.equal(b.factor, 4);
  b.failure();
  b.failure();
  assert.equal(b.factor, 8);
  b.success();
  b.success();
  assert.equal(b.factor, 8);
  assert.equal(b.success(), true);
  assert.equal(b.factor, 4);
  for (let i = 0; i < 6; i++) b.success();
  assert.equal(b.factor, 1);
  assert.equal(b.success(), false);
  assert.ok(isThrottleStatus(429) && isThrottleStatus(503) && !isThrottleStatus(404));
});

test('diffTicks sends only changed quotes and never empty prices', () => {
  const prev = { A: tick('A', 10), B: tick('B', 20) };
  const next = {
    A: tick('A', 10, { updatedAt: 99 }), // only the timestamp moved
    B: tick('B', 21),
    C: tick('C', 5),
    D: tick('D', NaN, { status: 'error' }),
  };
  assert.deepEqual(Object.keys(diffTicks(prev, next)), ['B', 'C']);
});

test('trades are forwarded at most once per symbol per second', () => {
  const latest = new Map([
    ['AAPL', { price: 1, time: 5_000 }],
    ['MSFT', { price: 2, time: 5_000 }],
    ['NVDA', { price: 3, time: 4_000 }],
  ]);
  const sent = new Map([
    ['MSFT', 4_800], // sent 200 ms ago
    ['NVDA', 4_000], // already sent this trade
  ]);
  assert.deepEqual(tradesToFlush(latest, sent, 5_000), ['AAPL']);
  assert.deepEqual(tradesToFlush(latest, sent, 6_000), ['AAPL', 'MSFT']);
});

test('applyTrade keeps the change against the previous close', () => {
  const t = applyTrade(tick('AAPL', 110, { changePct24h: 10, high24h: 111, low24h: 100 }), { price: 115, time: 9 }, 'Finnhub');
  assert.ok(Math.abs((t.changePct24h ?? 0) - 15) < 1e-9);
  assert.equal(t.high24h, 115);
  assert.equal(t.status, 'live');
  assert.equal(t.updatedAt, 9);
});

test('client watchdog and reconnect backoff', () => {
  assert.equal(isStreamStalled(0, 30_000), false);
  assert.equal(isStreamStalled(0, 30_001), true);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(reconnectDelayMs), [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
});
