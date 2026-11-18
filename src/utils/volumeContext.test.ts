/** volumeContext.test.ts — Median baseline, missing sessions, lot units and wording bands. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { volumeContext } from './volumeContext.ts';
const now = Date.parse('2026-02-01T03:00:00Z');
const past = Array.from({ length: 20 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, volume: (i + 1) * 100 }));
const today = (volume: number) => ({ date: '2026-02-01', volume });
test('median excludes today and converts shares to lots', () => {
  const result = volumeContext([...past, today(2100)], now)!;
  assert.equal(result.median, 1050);
  assert.equal(result.ratio, 2);
  assert.equal(result.shares, 2100);
  assert.equal(result.lots, 21);
  assert.equal(result.band, 'busy');
  assert.equal(result.sessions, 20);
});
test('insufficient or unavailable volume hides the line, including zero baseline', () => {
  assert.equal(volumeContext([...past.slice(0, 9), today(100)], now), null);
  assert.equal(volumeContext(past, now), null);
  assert.equal(volumeContext([...past, today(NaN)], now), null);
  assert.equal(volumeContext([...past.map(b => ({ ...b, volume: 0 })), today(100)], now), null);
  assert.equal(volumeContext([...past.map((b, i) => ({ ...b, volume: i < 11 ? undefined : b.volume })), today(100)], now), null);
});
test('all wording bands include exact thresholds; reported zero is quiet', () => {
  const flat = past.map(b => ({ ...b, volume: 1000 }));
  assert.equal(volumeContext([...flat, today(1500)], now)!.band, 'busy');
  assert.equal(volumeContext([...flat, today(670)], now)!.band, 'quiet');
  assert.equal(volumeContext([...flat, today(1000)], now)!.band, 'usual');
  assert.equal(volumeContext([...flat, today(0)], now)!.ratio, 0);
  assert.equal(volumeContext([{ date: '2025-12-31', volume: 99999 }, ...flat, today(1000)], now)!.median, 1000);
});
