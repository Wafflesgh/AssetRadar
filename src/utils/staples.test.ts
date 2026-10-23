/** staples.test.ts — Tests for the PIHPS staple price parser, history merge and summaries. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, basketChange, mergeStaplePoints, parsePihpsGrid, parsePihpsPrice, pihpsDate, STAPLES, stapleSummary, type StapleItem, type StaplePoint } from './staples.ts';

test('prices and dates in the PIHPS format', () => {
  assert.equal(parsePihpsPrice('16,400'), 16400);
  assert.equal(parsePihpsPrice('103.200'), 103200);
  assert.equal(parsePihpsPrice('-'), null);
  assert.equal(parsePihpsPrice(''), null);
  assert.equal(parsePihpsPrice('0'), null);
  assert.equal(pihpsDate('22/10/2026'), '2026-10-22');
  assert.equal(pihpsDate('name'), null);
});

test('the grid gives the national series and first/last price per province', () => {
  const json = {
    data: [
      { no: 'I', name: 'Semua Provinsi', level: 0, '16/10/2026': '16,400', '15/10/2026': '16,350', '19/10/2026': '-' },
      { no: 'II', name: 'Aceh', level: 1, '15/10/2026': '15,600', '16/10/2026': '15,550' },
      { no: 'III', name: 'Papua ', level: 1, '15/10/2026': '' },
      { no: 'IV', name: 'Bali', level: 1, '16/10/2026': '14,000' },
    ],
  };
  const { national, provinces } = parsePihpsGrid(json);
  assert.deepEqual(national, [
    ['2026-10-15', 16350],
    ['2026-10-16', 16400],
  ]);
  assert.deepEqual(provinces, [
    { name: 'Aceh', price: 15550, earlier: 15600 },
    { name: 'Bali', price: 14000, earlier: null },
  ]);
  assert.deepEqual(parsePihpsGrid({ data: [{}] }), { national: [], provinces: [] });
  assert.deepEqual(parsePihpsGrid(null), { national: [], provinces: [] });
});

test('merging keeps one value per date, newest wins, within the kept days', () => {
  const merged = mergeStaplePoints(
    [
      ['2025-01-01', 1],
      ['2026-10-01', 2],
    ],
    [
      ['2026-10-01', 3],
      ['2026-10-02', 4],
    ],
    365
  );
  assert.deepEqual(merged, [
    ['2026-10-01', 3],
    ['2026-10-02', 4],
  ]);
});

function daily(from: string, values: number[]): StaplePoint[] {
  return values.map((v, i) => [addDays(from, i), v]);
}

test('summary: changes over a week and a month, cheapest and dearest provinces', () => {
  const pts = daily('2026-09-01', Array.from({ length: 40 }, (_, i) => 100 + i));
  const s = stapleSummary({
    points: pts,
    provinces: [
      { name: 'A', price: 10, earlier: null },
      { name: 'B', price: 30, earlier: null },
      { name: 'C', price: 20, earlier: null },
    ],
  }, 2);
  assert.deepEqual(s.latest, ['2026-10-10', 139]);
  assert.equal(s.change.w1!.toFixed(2), ((139 / 132 - 1) * 100).toFixed(2));
  assert.equal(s.change.m1!.toFixed(2), ((139 / 109 - 1) * 100).toFixed(2));
  assert.equal(s.change.y1, null);
  assert.deepEqual(s.cheapest.map((p) => p.name), ['A', 'C']);
  assert.deepEqual(s.dearest.map((p) => p.name), ['B', 'C']);
  assert.equal(s.high, 139);
  assert.equal(s.low, 100);
  assert.equal(stapleSummary({ points: [], provinces: [] }).latest, null);
});

test('the basket averages the main item of each category', () => {
  const mk = (id: string, end: number): StapleItem => ({ id, points: daily('2026-09-01', [...Array(39).fill(100), end]), provinces: [], updatedAt: 0, backfilled: true });
  const items = [mk('com_3', 110), mk('com_7', 90), mk('com_1', 500)];
  assert.equal(basketChange(items, 'w1'), 0);
  assert.equal(basketChange([], 'm1'), null);
  assert.equal(STAPLES.filter((s) => s.main).length, 10);
});
