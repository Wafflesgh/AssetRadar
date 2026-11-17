/** freshness.test.ts — Cadence boundaries, market sessions, weekends and sanitized failures. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessFreshness, type FreshnessInput } from './freshness.ts';

const hour = 3600_000;
const now = Date.parse('2026-11-17T10:00:00+07:00');
const tick: FreshnessInput = { id: 'tick', lastOk: now, expectedMs: 2 * hour };

test('fresh and empty reports are ok; cadence thresholds are strict', () => {
  assert.equal(assessFreshness([], now).overall, 'ok');
  for (const [age, status] of [[0, 'ok'], [3 * hour, 'ok'], [3 * hour + 1, 'late'], [6 * hour, 'late'], [6 * hour + 1, 'stale'], [72 * hour, 'stale']] as const) {
    const report = assessFreshness([{ ...tick, lastOk: now - age }], now);
    assert.equal(report.overall, status);
    assert.equal(report.items[0].ageMs, age);
  }
});

test('US prices are closed at 03:00 WIB in summer, but open then in winter', () => {
  const input: FreshnessInput = { ...tick, id: 'prices.usStock', market: 'NYSE', lastOk: null };
  assert.equal(assessFreshness([input], Date.parse('2026-07-15T03:00:00+07:00')).items[0].status, 'closed');
  assert.equal(assessFreshness([input], Date.parse('2026-11-17T03:00:00+07:00')).items[0].status, 'stale');
  assert.equal(assessFreshness([input], Date.parse('2026-07-15T03:00:00+07:00')).overall, 'ok');
});

test('Friday weekday job is ok Monday morning but becomes stale if it stays stuck', () => {
  const job: FreshnessInput = { id: 'forward', lastOk: Date.parse('2026-11-13T16:15:00+07:00'), expectedMs: 26 * hour, weekdaysOnly: true };
  assert.equal(assessFreshness([job], Date.parse('2026-11-16T09:00:00+07:00')).overall, 'ok');
  assert.equal(assessFreshness([job], Date.parse('2026-11-20T09:00:00+07:00')).overall, 'stale');
  assert.equal(assessFreshness([{ ...job, weekdaysOnly: false }], Date.parse('2026-11-16T09:00:00+07:00')).overall, 'late');
});

test('failed steps are at least late; missing data is stale and errors are not exposed', () => {
  for (const problem of ['failed: upstream unavailable', 'no time left', { error: 'private detail' }, { analyst: { error: 'private detail' } }]) {
    const report = assessFreshness([{ ...tick, problem }], now);
    assert.equal(report.overall, 'late');
    assert.ok(!JSON.stringify(report).includes('private detail'));
  }
  assert.equal(assessFreshness([{ ...tick, lastOk: null }], now).overall, 'stale');
  assert.equal(assessFreshness([{ ...tick, lastOk: NaN }], now).overall, 'stale');
  assert.equal(assessFreshness([{ ...tick, lastOk: now - 72 * hour, problem: 'failed' }], now).overall, 'stale');
});

test('empty price/news caches on a cold instance do not make overall stale', () => {
  const report = assessFreshness([tick, { id: 'news', lastOk: null, expectedMs: 15 * 60_000, viewerDriven: true }], now);
  assert.equal(report.items[1].status, 'stale');
  assert.equal(report.overall, 'ok');
});
