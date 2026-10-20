/**
 * recommendationTrace.test.ts — Tests for the saved calls: recording sentiment per horizon,
 * scoring after the horizon with real closes, hit rates vs the base rate per method, one asset's
 * history (sentiment + advisor) and collapsing repeated days.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DailyClose, ForwardLog } from './forwardTest.ts';
import {
  assetTrace,
  callHit,
  collapseTrace,
  emptySentimentLog,
  evaluateSentimentCalls,
  methodSummaries,
  parseSentimentLog,
  pendingCallSymbols,
  recordSentimentCalls,
} from './recommendationTrace.ts';

const days = (start: string, n: number, f: (i: number) => number): DailyClose[] =>
  Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse(start) + i * 86_400_000).toISOString().slice(0, 10), close: f(i) }));

test('recording: one call per symbol, horizon and day; bad prices skipped', () => {
  let log = emptySentimentLog();
  const rows = [
    { symbol: 'BBCA.JK', crypto: false, price: 9000, horizons: { short: { label: 'Bullish' as const, score: 66.4 }, medium: { label: 'Neutral' as const, score: 50 }, long: null } },
    { symbol: 'BTC/IDR', crypto: true, price: 1e9, horizons: { short: { label: 'Bearish' as const, score: 30 } } },
    { symbol: 'X', crypto: false, price: null, horizons: { short: { label: 'Bullish' as const, score: 70 } } },
  ];
  log = recordSentimentCalls(log, '2026-10-20', rows);
  assert.equal(log.calls.length, 3);
  assert.equal(log.calls[0].score, 66);
  assert.equal(log.calls.find((c) => c.symbol === 'BTC/IDR')?.bars, 7);
  assert.equal(recordSentimentCalls(log, '2026-10-20', rows), log); // same day again → unchanged
  assert.ok(parseSentimentLog(JSON.parse(JSON.stringify(log))));
  assert.equal(parseSentimentLog({ version: 2 }), null);
});

test('scoring after the horizon; pending until then', () => {
  let log = recordSentimentCalls(emptySentimentLog(), '2026-01-05', [
    { symbol: 'A', crypto: false, price: 100, horizons: { short: { label: 'Bullish', score: 70 }, medium: { label: 'Bearish', score: 30 } } },
  ]);
  assert.deepEqual(pendingCallSymbols(log, '2026-01-10'), []); // 10 bars ≈ 14 calendar days not passed
  assert.deepEqual(pendingCallSymbols(log, '2026-01-20'), ['A']);
  const history = new Map([['A', days('2026-01-05', 30, (i) => 100 + i)]]);
  log = evaluateSentimentCalls(log, history);
  const short = log.calls.find((c) => c.horizon === 'short')!;
  assert.equal(short.outcome?.dueDate, '2026-01-15');
  assert.ok(Math.abs((short.outcome?.ret ?? 0) - 0.1) < 1e-9);
  assert.equal(log.calls.find((c) => c.horizon === 'medium')!.outcome, undefined); // 63 bars not there yet
  assert.equal(callHit('Bullish', true), true);
  assert.equal(callHit('Strong Bearish', true), false);
  assert.equal(callHit('Neutral', true), null);
});

test('method summary: hit rate and edge over always guessing the common direction', () => {
  const mk = (label: string, up: boolean, i: number) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, symbol: 'S' + i, horizon: 'short' as const, label: label as 'Bullish', score: 60, price: 1, bars: 10, outcome: { dueDate: '2026-02-01', ret: up ? 0.02 : -0.02, up } });
  const calls = [mk('Bullish', true, 0), mk('Bullish', true, 1), mk('Bullish', false, 2), mk('Bearish', false, 3), mk('Neutral', true, 4)];
  const short = methodSummaries(calls, [])[0];
  assert.equal(short.evaluated, 5);
  assert.equal(short.hitRate, 0.75); // 3 of 4 directional calls right
  assert.equal(short.edge, 0.25); // baseline: 2 up of 4 directional → 50%
  assert.equal(short.rows.find((r) => r.call === 'Neutral')?.hitRate, null);
  assert.equal(short.baseUpRate, 0.6);
});

test('asset trace: sentiment and advisor rows, change since the call, collapsed runs', () => {
  const sentiment = recordSentimentCalls(emptySentimentLog(), '2026-10-19', [{ symbol: 'A', crypto: false, price: 100, horizons: { medium: { label: 'Bullish', score: 70 } } }]).calls;
  const more = recordSentimentCalls({ version: 1, calls: sentiment }, '2026-10-20', [{ symbol: 'A', crypto: false, price: 102, horizons: { medium: { label: 'Bullish', score: 72 } } }]).calls;
  const forward: ForwardLog[] = [
    {
      version: 1,
      startedAt: '2026-10-20',
      snapshots: [
        { date: '2026-10-20', horizonDays: 20, profile: 'moderate', symbol: 'A', verdict: 'favorable', chance: 0.61, price: 102 },
        { date: '2026-10-20', horizonDays: 20, profile: 'aggressive', symbol: 'A', verdict: 'watch', chance: 0.61, price: 102 },
      ],
    },
  ];
  const rows = assetTrace('A', more, forward, 110);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].date, '2026-10-20');
  const adv = rows.find((r) => r.method === 'advisor')!;
  assert.equal(adv.call, 'favorable');
  assert.ok(Math.abs((adv.sinceNow ?? 0) - (110 / 102 - 1)) < 1e-9);
  const collapsed = collapseTrace(rows);
  const med = collapsed.find((r) => r.horizon === 'medium')!;
  assert.equal(med.days, 2);
  assert.equal(med.firstDate, '2026-10-19');
  assert.equal(med.price, 100); // the first call's price
});
