/** stapleInsights.test.ts — seasonal pattern, Eid run-up, unusual moves, basket cost, province months, news match. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, denseMerge, type StaplePoint } from './staples.ts';
import { basketCost, detectAnomaly, eidEffect, matchesStapleNews, monthlyAverages, provinceMonthly, seasonalPattern } from './stapleInsights.ts';

/** Daily series from `from`, price given by a function of the day index and date. */
const daily = (from: string, days: number, price: (i: number, d: string) => number): StaplePoint[] =>
  Array.from({ length: days }, (_, i) => [addDays(from, i), price(i, addDays(from, i))] as StaplePoint);

test('monthlyAverages averages each month', () => {
  assert.deepEqual(monthlyAverages([['2026-01-01', 10], ['2026-01-31', 20], ['2026-02-01', 30]]), [['2026-01', 15], ['2026-02', 30]]);
});

test('seasonalPattern finds the month that always rises and needs enough years', () => {
  // Price is 120 every December, 100 otherwise: December rises 20%, January falls
  const pts = daily('2020-01-01', 365 * 5, (_, d) => (d.slice(5, 7) === '12' ? 120 : 100));
  const s = seasonalPattern(pts)!;
  assert.equal(s.length, 12);
  assert.ok(Math.abs(s[11].avg - 20) < 0.01);
  assert.equal(s[11].up, s[11].n);
  assert.ok(s[0].avg < -16 && s[0].up === 0);
  assert.equal(seasonalPattern(daily('2025-01-01', 400, () => 100)), null);
});

test('eidEffect measures the run-up before Eid', () => {
  // 10% dearer in the 10 days up to each Eid
  const eids = ['2022-05-02', '2023-04-22', '2024-04-10', '2025-03-31'];
  const pts = daily('2022-01-01', 365 * 4, (_, d) => (eids.some((e) => d <= e && d >= addDays(e, -10)) ? 110 : 100));
  const e = eidEffect(pts)!;
  assert.equal(e.n, 4);
  assert.equal(e.up, 4);
  assert.ok(Math.abs(e.avg - 10) < 0.01);
  assert.equal(eidEffect(pts.slice(-200)), null);
});

test('detectAnomaly flags a move outside the usual range, not a usual one', () => {
  const today = '2026-11-15';
  const calm = daily(addDays(today, -300), 301, (i) => 10_000 + (i % 7) * 20);
  assert.equal(detectAnomaly(calm, today), null);
  const jumped = calm.map(([d, v]): StaplePoint => (d >= addDays(today, -3) ? [d, v * 1.3] : [d, v]));
  const a = detectAnomaly(jumped, today)!;
  assert.equal(a.kind, 'move');
  assert.ok(a.change > 25 && a.score > 4);
  // A volatile series (chili) moving 10% is business as usual
  const wild = daily(addDays(today, -300), 301, (i) => 50_000 * (1 + 0.2 * Math.sin(i / 5)));
  assert.equal(detectAnomaly(wild, today), null);
  // Stale series are not judged
  assert.equal(detectAnomaly(jumped, addDays(today, 10)), null);
});

test('detectAnomaly calls a one-day spike that went back a glitch', () => {
  const today = '2026-11-15';
  const pts = daily(addDays(today, -200), 201, (i) => (i === 196 ? 100_000 : 10_000));
  const a = detectAnomaly(pts, today)!;
  assert.equal(a.kind, 'glitch');
  assert.equal(a.date, addDays(today, -4));
});

test('basketCost prices a shopping list and compares only items with both prices', () => {
  const rice = daily('2025-01-01', 500, (i) => (i >= 480 ? 11_000 : 10_000));
  const eggs = daily('2026-04-01', 45, () => 30_000);
  const c = basketCost({ a: 10, b: 2, c: 1, d: 0 }, { a: rice, b: eggs })!;
  assert.equal(c.now, 10 * 11_000 + 2 * 30_000);
  assert.deepEqual(c.missing, ['c']);
  // 1 month: rice +10% on Rp100,000, eggs flat on Rp60,000
  assert.ok(Math.abs(c.m1! - (10_000 / 160_000) * 100) < 0.01);
  // 1 year: only rice has a price a year ago
  assert.ok(Math.abs(c.y1! - 10) < 0.01);
  assert.equal(basketCost({}, { a: rice }), null);
});

test('provinceMonthly lines every province up on the same months', () => {
  const p = provinceMonthly('com_3', {
    provinces: { Aceh: denseMerge(undefined, [['2026-01-10', 100], ['2026-03-10', 300]]), Bali: denseMerge(undefined, [['2026-02-10', 200]]) },
    cities: {},
  });
  assert.deepEqual(p.months, ['2026-01', '2026-02', '2026-03']);
  assert.deepEqual(p.provinces.Aceh, [100, null, 300]);
  assert.deepEqual(p.provinces.Bali, [null, 200, null]);
  assert.deepEqual(provinceMonthly('x', null), { id: 'x', months: [], provinces: {} });
});

test('matchesStapleNews needs the staple and the place', () => {
  assert.ok(matchesStapleNews('Harga Cabe Rawit di Padang Tembus Rp100 Ribu', 'cabai rawit', ['Sumatera Barat', 'Kota Padang']));
  assert.ok(matchesStapleNews('Harga beras naik di Sumatera Barat', 'beras', ['Sumatera Barat']));
  assert.ok(!matchesStapleNews('Harga beras naik di Jawa Timur', 'beras', ['Sumatera Barat', 'Kota Padang']));
  assert.ok(!matchesStapleNews('Banjir di Padang', 'beras', ['Kota Padang']));
});
