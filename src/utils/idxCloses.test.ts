/** idxCloses.test.ts — Rolling alignment, missing observations and monthly returns. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendDay, appendSeries, change1m, type IdxCloses } from './idxCloses.ts';

const dates = Array.from({ length: 40 }, (_, i) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10));
function build(n: number): IdxCloses {
  let table: IdxCloses = { dates: [], closes: {} };
  for (let i = 0; i < n; i++) table = appendDay(table, dates[i], 'AAA', 100 + i);
  return table;
}
test('22 observed trading dates give a 21-session return; ten dates do not', () => {
  assert.ok(Math.abs(change1m(build(22), 'AAA')! - 21) < 1e-10);
  assert.equal(change1m(build(10), 'AAA'), null);
});
test('missing reference or latest observation stays null', () => {
  let table = appendDay(build(22), dates[21], 'BBB', 200);
  assert.equal(change1m(table, 'BBB'), null);
  table = appendDay(table, dates[22], 'BBB', 201);
  assert.equal(change1m(table, 'AAA'), null);
});
test('table caps at 30 and all symbols stay aligned; same day replaces without adding a date', () => {
  let table = appendDay(build(40), dates[39], 'BBB', 20);
  assert.equal(table.dates.length, 30);
  assert.equal(table.dates[0], dates[10]);
  assert.equal(table.closes.AAA[0], 110);
  assert.equal(table.closes.BBB.length, 30);
  assert.equal(table.closes.BBB[0], null);
  table = appendDay(table, dates[39], 'BBB', 22);
  assert.equal(table.dates.length, 30);
  assert.equal(table.closes.BBB[29], 22);
});
test('out-of-order dates align existing data and invalid prices are ignored', () => {
  const initial = appendDay({ dates: [], closes: {} }, dates[1], 'AAA', 101);
  const table = appendDay(initial, dates[0], 'BBB', 100);
  assert.deepEqual(table.closes.AAA, [null, 101]);
  assert.deepEqual(table.closes.BBB, [100, null]);
  assert.equal(appendDay(table, dates[2], 'AAA', NaN), table);
});

test('950 symbols with 22 historical closes merge in under 500 ms', () => {
  let table: IdxCloses = { dates: [], closes: {} };
  const points = dates.slice(0, 22).map((date, i) => ({ date, close: 100 + i }));
  const start = performance.now();
  for (let i = 0; i < 950; i++) table = appendSeries(table, `IDX${i}`, points);
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 500, `Historical merge took ${elapsed.toFixed(1)} ms`);
  assert.equal(Object.keys(table.closes).length, 950);
  assert.equal(table.dates.length, 22);
  assert.ok(Math.abs(change1m(table, 'IDX949')! - 21) < 1e-10);
});

test('series merge reuses unrelated rows unless dates change, preserving missing snapshots', () => {
  const original = build(22);
  const merged = appendSeries(original, 'CORE', [{ date: dates[21], close: 200 }, { date: dates[0], close: 100 }]);
  assert.equal(merged.closes.AAA, original.closes.AAA);
  assert.equal(merged.closes.CORE[1], null);
  assert.equal(change1m(merged, 'CORE'), 100);
  assert.equal(original.closes.CORE, undefined);
  const extended = appendSeries(merged, 'CORE', [{ date: dates[22], close: 201 }]);
  assert.notEqual(extended.closes.AAA, merged.closes.AAA);
  assert.equal(extended.closes.AAA[22], null);
});
