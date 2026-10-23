/** idxTrace.test.ts — Tests for the IDX-wide recommendation trace (recording window and totals). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { addToIdxStats, emptyIdxStats, idxStatsSummaries, idxTraceDay, parseIdxStats } from './idxTrace.ts';
import type { SentimentCall } from './recommendationTrace.ts';

const wib = (s: string) => Date.parse(`${s}+07:00`);

test('calls are recorded after the close until the next open', () => {
  // Wednesday 21 Oct 2026
  assert.equal(idxTraceDay(wib('2026-10-21T16:20:00')), '2026-10-21');
  assert.equal(idxTraceDay(wib('2026-10-21T12:00:00')), null);
  assert.equal(idxTraceDay(wib('2026-10-22T06:00:00')), '2026-10-21');
  // Friday evening, the weekend and Monday early morning all belong to Friday
  assert.equal(idxTraceDay(wib('2026-10-23T18:00:00')), '2026-10-23');
  assert.equal(idxTraceDay(wib('2026-10-25T10:00:00')), '2026-10-23');
  assert.equal(idxTraceDay(wib('2026-10-26T07:00:00')), '2026-10-23');
  assert.equal(idxTraceDay(wib('2026-10-26T09:00:00')), null);
});

const call = (label: SentimentCall['label'], horizon: SentimentCall['horizon'], ret?: number): SentimentCall => ({
  date: '2026-10-21',
  symbol: 'BULL.JK',
  horizon,
  label,
  score: 60,
  price: 256,
  bars: 63,
  outcome: ret === undefined ? undefined : { dueDate: '2027-01-21', ret, up: ret > 0 },
});

test('totals give the hit rate per horizon against the base rate', () => {
  let s = emptyIdxStats();
  const saved = [call('Bullish', 'medium'), call('Bearish', 'medium'), call('Neutral', 'medium'), call('Bullish', 'short')];
  s = addToIdxStats(s, saved, [call('Bullish', 'medium', 0.18), call('Bullish', 'medium', -0.05), call('Bearish', 'medium', -0.1), call('Neutral', 'medium', 0.02)]);
  assert.equal(s.saved.medium, 3);
  assert.equal(s.saved.short, 1);
  assert.equal(s.firstDate, '2026-10-21');
  const medium = idxStatsSummaries(s).find((m) => m.horizon === 'medium')!;
  assert.equal(medium.evaluated, 4);
  // Bullish up, Bullish down, Bearish down → 2 of 3 directional calls right
  assert.equal(medium.hitRate!.toFixed(3), (2 / 3).toFixed(3));
  assert.equal(medium.rows.find((r) => r.call === 'Bullish')!.samples, 2);
  assert.equal(medium.rows.find((r) => r.call === 'Neutral')!.hitRate, null);
  // Baseline: 1 of 3 directional calls rose → always "down" scores 2/3 → no edge
  assert.equal(medium.edge!.toFixed(3), '0.000');
  // Stored and read back
  assert.deepEqual(parseIdxStats(JSON.parse(JSON.stringify(s))), s);
  assert.deepEqual(parseIdxStats(null), emptyIdxStats());
});
