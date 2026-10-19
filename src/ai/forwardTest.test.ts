/** forwardTest.test.ts — Tests for saving daily verdict snapshots and scoring them against real closes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyLog, evaluateSnapshots, parseForwardLog, pendingSymbols, recordSnapshots, trackRecord, type DailyClose } from './forwardTest.ts';

test('records once per day, horizon and profile; skips missing prices', () => {
  let log = emptyLog();
  log = recordSnapshots(log, '2026-10-01', 20, 'moderate', [
    { symbol: 'A', verdict: 'favorable', chance: 0.6, price: 100 },
    { symbol: 'B', verdict: 'unfavorable', chance: 0.4, price: undefined },
  ]);
  assert.equal(log.snapshots.length, 1);
  assert.equal(log.startedAt, '2026-10-01');
  const again = recordSnapshots(log, '2026-10-01', 20, 'moderate', [{ symbol: 'A', verdict: 'watch', chance: null, price: 101 }]);
  assert.equal(again, log);
  const other = recordSnapshots(log, '2026-10-01', 60, 'moderate', [{ symbol: 'A', verdict: 'watch', chance: null, price: 101 }]);
  assert.equal(other.snapshots.length, 2);
});

test('scores snapshots after the horizon using trading-day closes', () => {
  const bars: DailyClose[] = Array.from({ length: 30 }, (_, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, '0')}`,
    close: 100 + i,
  }));
  let log = recordSnapshots(emptyLog(), '2026-09-05', 20, 'p', [{ symbol: 'A', verdict: 'favorable', chance: 0.6, price: 999 }]);
  log = recordSnapshots(log, '2026-09-20', 20, 'p', [{ symbol: 'A', verdict: 'favorable', chance: 0.6, price: 999 }]);
  const scored = evaluateSnapshots(log, new Map([['A', bars]]));
  const [first, second] = scored.snapshots;
  // 2026-09-05 close 104 → 20 bars later 124
  assert.equal(first.outcome?.dueDate, '2026-09-25');
  assert.ok(Math.abs((first.outcome?.ret ?? 0) - (124 / 104 - 1)) < 1e-12);
  assert.equal(second.outcome, undefined); // not due yet
  assert.deepEqual(pendingSymbols(scored, '2026-10-30'), ['A']);
  assert.deepEqual(pendingSymbols(scored, '2026-09-30'), []); // 2026-09-20 + 28 days not reached
  // Unchanged when nothing new is due
  assert.equal(evaluateSnapshots(scored, new Map()), scored);
});

test('track record compares verdict hit rates with the base rate', () => {
  const log = {
    version: 1 as const,
    startedAt: '2026-01-01',
    snapshots: [
      ...Array.from({ length: 10 }, (_, i) => ({ date: '2026-01-01', horizonDays: 20, profile: 'p', symbol: `F${i}`, verdict: 'favorable' as const, chance: 0.6, price: 1, outcome: { dueDate: 'x', ret: i < 7 ? 0.02 : -0.01, up: i < 7 } })),
      ...Array.from({ length: 10 }, (_, i) => ({ date: '2026-01-01', horizonDays: 20, profile: 'p', symbol: `N${i}`, verdict: 'no-signal' as const, chance: null, price: 1, outcome: { dueDate: 'x', ret: i < 3 ? 0.01 : -0.01, up: i < 3 } })),
      { date: '2026-01-02', horizonDays: 20, profile: 'p', symbol: 'Z', verdict: 'watch' as const, chance: null, price: 1 },
    ],
  };
  const r = trackRecord(log, 20, 'p');
  assert.equal(r.saved, 21);
  assert.equal(r.evaluated, 20);
  assert.equal(r.baseUpRate, 0.5);
  const fav = r.rows.find((x) => x.verdict === 'favorable');
  assert.equal(fav?.samples, 10);
  assert.equal(fav?.upRate, 0.7);
  assert.equal(r.rows.find((x) => x.verdict === 'watch')?.samples, 0);
  assert.equal(trackRecord(log, 60, 'p').evaluated, 0);
});

test('parseForwardLog accepts valid exports only', () => {
  assert.equal(parseForwardLog({ version: 2, snapshots: [] }), null);
  const ok = parseForwardLog({ version: 1, snapshots: [{ date: '2026-01-01', horizonDays: 20, profile: 'p', symbol: 'A', verdict: 'watch', chance: null, price: 1 }, { bad: true }] });
  assert.equal(ok?.snapshots.length, 1);
  assert.equal(ok?.startedAt, '2026-01-01');
});
