/** weeklyDigest.test.ts — Watchlist changes, missing prices and WIB event boundaries. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { weeklyDigest } from './weeklyDigest.ts';
import { buildBrief, type BriefInput } from './morningBrief.ts';
const now = Date.parse('2026-11-15T17:30:00Z');
test('missing snapshots are null; changes sort by absolute magnitude and events span seven WIB dates', () => {
  const result = weeklyDigest({ now, watchlist: ['A', 'B', 'C'], snapToday: { A: { p: 110 }, B: { p: 80 } }, snapWeekAgo: { A: { p: 100 }, B: { p: 100 } },
    events: ['2026-11-15', '2026-11-16', '2026-11-22', '2026-11-23'].map(date => ({ symbol: 'A', kind: 'earnings', date })) });
  assert.deepEqual(result.moves.map(x => x.symbol), ['B', 'A', 'C']);
  assert.equal(result.moves[2].chg, null);
  assert.deepEqual(result.missing, ['C']);
  assert.deepEqual(result.events.map(x => x.date), ['2026-11-16', '2026-11-22']);
});
test('weekly section is present on Monday, absent Tuesday, and stays outside delivery/Gemini sections', () => {
  const weekly = weeklyDigest({ now, watchlist: ['A'], snapToday: {}, snapWeekAgo: {}, events: [] });
  const input: BriefInput = { date: '2026-11-16', generatedAt: now, wallStreet: [], asia: [], ihsg: null, movers: [], rates: [], gold: null, events: [], priority: [], codeOf: s => s, macro: [], news: [], forward: null, weekly };
  assert.deepEqual(buildBrief(input).weekly, weekly);
  assert.equal(buildBrief({ ...input, date: '2026-11-17' }).weekly, undefined);
  assert.deepEqual(buildBrief(input).sections, buildBrief({ ...input, weekly: undefined }).sections);
});
