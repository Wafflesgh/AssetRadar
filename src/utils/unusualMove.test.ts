/** unusualMove.test.ts — Known daily returns, minimum history, and unfinished-bar exclusion. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dailySigma, completedSigma } from './unusualMove.ts';
test('known alternating returns have sample sigma; short histories remain unavailable', () => {
  const closes = [100];
  for (let i = 0; i < 30; i++) closes.push(closes.at(-1)! * (i % 2 ? 0.99 : 1.01));
  assert.ok(Math.abs(dailySigma(closes)! - Math.sqrt(30 / 29)) < 1e-10);
  assert.equal(dailySigma(closes.slice(0, 29)), null);
  assert.equal(dailySigma(Array(30).fill(100)), 0);
  assert.equal(dailySigma([...closes.slice(0, 30), NaN]), null);
  const bars = closes.map((close, i) => ({ date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10), close }));
  const now = Date.UTC(2026, 1, 1);
  assert.equal(completedSigma([...bars, { date: '2026-02-01', close: 99999 }], now).sigma, dailySigma(closes));
});
