/**
 * dailyAnalyst.test.ts — Tests for the stored daily analysis: movers, sentiment label changes
 * since the previous snapshot, strongest / weakest scores, data-quality statuses, the Gemini
 * prompt (facts only, disclaimer), agent-note cleaning and stored dates.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analystPrompt, cleanNote, datesFromKeys, extremes, parseReport, parseSnapshot, qualityChecks, sentimentChanges, topMovers, type DailySnapshot } from './dailyAnalyst.ts';

const snap = (date: string, assets: DailySnapshot['assets']): DailySnapshot => ({ version: 1, date, takenAt: 0, assets });

test('movers and extremes', () => {
  const s = snap('2026-10-20', {
    A: { p: 1, c24: 3, s: { short: ['Bullish', 70], medium: ['Neutral', 50] } },
    B: { p: 1, c24: -2, s: { short: ['Bearish', 30] } },
    C: { p: 1, c24: null },
  });
  const m = topMovers(s);
  assert.deepEqual(m.up.map((x) => x.symbol), ['A']);
  assert.deepEqual(m.down.map((x) => x.symbol), ['B']);
  const e = extremes(s);
  assert.equal(e.strongest.short[0].symbol, 'A');
  assert.equal(e.weakest.short[0].symbol, 'B');
  assert.equal(e.strongest.long.length, 0);
  assert.ok(parseSnapshot(JSON.parse(JSON.stringify(s))));
  assert.equal(parseSnapshot({ version: 1 }), null);
});

test('sentiment changes since the previous day, biggest first', () => {
  const prev = snap('2026-10-19', { A: { p: 1, c24: 0, s: { short: ['Neutral', 52], medium: ['Bullish', 64] } }, B: { p: 1, c24: 0, s: { short: ['Bullish', 61] } } });
  const cur = snap('2026-10-20', { A: { p: 1, c24: 0, s: { short: ['Bullish', 61], medium: ['Bullish', 66] } }, B: { p: 1, c24: 0, s: { short: ['Strong Bearish', 15] } } });
  const ch = sentimentChanges(prev, cur);
  assert.equal(ch.length, 2);
  assert.deepEqual([ch[0].symbol, ch[0].from, ch[0].to, ch[0].delta], ['B', 'Bullish', 'Strong Bearish', -46]);
  assert.deepEqual(sentimentChanges(null, cur), []);
});

test('quality checks: statuses from counts and dates', () => {
  const q = qualityChecks({
    assetsTotal: 100,
    pricesMissing: ['X'],
    pricesStale: [],
    sentimentTried: 50,
    sentimentFailed: Array.from({ length: 20 }, (_, i) => `S${i}`),
    sourcesProblem: ['binanceApi'],
    advisorAssets: 55,
    advisorExpected: 55,
    forwardLastRun: '2026-10-10',
    today: '2026-10-20',
    database: false,
    gemini: { configured: true, lastError: 'quota' },
  });
  const by = Object.fromEntries(q.map((c) => [c.id, c.status]));
  assert.deepEqual(by, { prices: 'warn', stale: 'ok', sentiment: 'fail', sources: 'warn', advisor: 'ok', forward: 'warn', database: 'warn', gemini: 'warn' });
  assert.equal(q.find((c) => c.id === 'sentiment')?.params.list, 'S0, S1, S2, S3, S4, S5, S6, S7 +12');
});

test('prompt carries only the facts and the disclaimer; notes are plain text', () => {
  const facts = { date: '2026-10-20' } as never;
  const p = analystPrompt(facts, [], { A: 'Asset A' }, 'id');
  assert.match(p, /Indonesian/);
  assert.match(p, /bukan nasihat investasi/);
  assert.match(p, /"Asset A"/);
  assert.deepEqual(cleanNote('Argon', '<b>Data</b> looks fine'), { at: cleanNote('Argon', 'x y z')!.at, author: 'Argon', text: 'Data looks fine' });
  assert.equal(cleanNote('Argon', '  '), null);
  assert.equal(cleanNote('<script>', 'checked the data')?.author, 'agent');
  assert.equal(cleanNote('a', 'x'.repeat(5000))?.text.length, 4000);
  assert.deepEqual(datesFromKeys(['analysis:2026-10-19', 'analysis:2026-10-20', 'analysis:bad'], 'analysis:'), ['2026-10-20', '2026-10-19']);
  assert.equal(parseReport({ version: 1, date: 'x', facts: {} })?.notes.length, 0);
});
