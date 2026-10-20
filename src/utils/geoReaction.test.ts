/**
 * geoReaction.test.ts — Tests for the market reaction since a news item: base bar before the
 * publish time, change to the latest bar, 15/60-minute marks, closed markets and missing data.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { OhlcCandle } from '../config/assets.ts';
import { reactionInterval, reactionSince } from './geoReaction.ts';

const T0 = Date.UTC(2026, 9, 20, 3, 0) / 1000; // 10:00 WIB
const bars = (closes: number[], start = T0, stepMin = 1): OhlcCandle[] =>
  closes.map((c, i) => ({ time: start + i * stepMin * 60, open: c, high: c, low: c, close: c }));

test('change from the bar before the news to the latest bar, with 15/60-minute marks', () => {
  // 100 bars of 1 minute; news at minute 10:30 (inside bar 10 → base is bar 9 = 100)
  const closes = Array.from({ length: 100 }, (_, i) => (i < 10 ? 100 : i < 25 ? 101 : 102));
  const since = (T0 + 10 * 60 + 30) * 1000;
  const r = reactionSince('XAU/USD', bars(closes), since, 1);
  assert.equal(r.status, 'ok');
  assert.equal(r.baseAt, (T0 + 9 * 60) * 1000);
  assert.ok(Math.abs((r.changePct ?? 0) - 2) < 1e-9);
  assert.ok(Math.abs((r.after15Pct ?? 0) - 1) < 1e-9); // bar 24 closes at 101
  assert.ok(Math.abs((r.after60Pct ?? 0) - 2) < 1e-9);
  assert.equal(r.minutes, 90); // last bar ends at minute 100
});

test('60-minute mark stays empty until an hour has traded', () => {
  const since = (T0 + 5 * 60) * 1000;
  const r = reactionSince('BTC/IDR', bars(Array.from({ length: 30 }, (_, i) => 100 + i)), since, 1);
  assert.equal(r.status, 'ok');
  assert.ok(r.after15Pct !== null);
  assert.equal(r.after60Pct, null);
});

test('market closed since the news → no move shown', () => {
  const r = reactionSince('^JKSE', bars([100, 101, 102]), (T0 + 3 * 3600) * 1000, 1);
  assert.equal(r.status, 'noTradeSince');
  assert.equal(r.changePct, null);
});

test('news older than the data, or no data at all', () => {
  assert.equal(reactionSince('X', bars([100, 101]), (T0 - 3600) * 1000, 1).status, 'noBase');
  assert.equal(reactionSince('X', [], Date.now(), 1).status, 'noData');
});

test('bar size: 1 minute for recent news, 5 minutes up to five days, none beyond', () => {
  const now = Date.UTC(2026, 9, 20, 12);
  assert.equal(reactionInterval(now - 3600_000, now), '1');
  assert.equal(reactionInterval(now - 2 * 86_400_000, now), '5');
  assert.equal(reactionInterval(now - 6 * 86_400_000, now), null);
});
