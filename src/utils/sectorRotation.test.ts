/**
 * sectorRotation.test.ts — Tests for the IDX sector rotation logic: weighting, breadth, movers,
 * ranking, quadrants and the rule-based one-line reasons.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSectorRotation, lastChangePct, quadrant, rotationSummary, type SectorDrivers } from './sectorRotation.ts';
import type { ScreenerRow } from './screener.ts';

const row = (code: string, sector: string, chg1d: number | null, chg1w: number | null, marketCap: number | null = 1e12): ScreenerRow => ({
  symbol: `${code}.JK`,
  code,
  name: code,
  sector,
  board: 'Main',
  price: 1000,
  chg1d,
  chg1w,
  valueTraded: 1e9,
  marketCap,
});

const noDrivers: SectorDrivers = { live: { d1: {}, w1: {} }, monthly: {} };
const keys = (parts: Array<{ k: string }>) => parts.map((p) => p.k);

test('cap-weighted and equal-weight changes, breadth and movers', () => {
  const rows = [row('AAA', 'Energy', 1, 10, 3e12), row('BBB', 'Energy', -1, -2, 1e12), row('CCC', 'Energy', null, 4, 1e12)];
  const { sectors } = computeSectorRotation(rows, noDrivers, '2026-10-25');
  const e = sectors[0];
  assert.equal(e.slug, 'energy');
  assert.equal(e.stocks, 3);
  assert.equal(e.w1.capWeighted, 6.4); // (30 − 2 + 4) / 5
  assert.equal(e.w1.equalWeighted, 4);
  assert.equal(e.w1.breadth, 67);
  assert.deepEqual(e.w1.gainers.map((g) => g.code), ['AAA', 'CCC']);
  assert.deepEqual(e.w1.losers.map((g) => g.code), ['BBB']);
  assert.equal(e.d1.counted, 2);
  assert.equal(e.valueTraded, 3e9);
});

test('sectors are ranked by 1W, missing data last', () => {
  const rows = [row('A', 'Financials', 0, -3), row('B', 'Energy', 0, 5), row('C', 'Technology', null, null), row('D', 'Healthcare', 0, 1)];
  const { sectors } = computeSectorRotation(rows, noDrivers, '2026-10-25');
  assert.deepEqual(sectors.map((s) => s.slug), ['energy', 'healthcare', 'financials', 'technology']);
  const sum = rotationSummary(sectors, 'w1');
  assert.equal(sum.up, 2);
  assert.equal(sum.down, 1);
  assert.equal(sum.strongest?.slug, 'energy');
  assert.equal(sum.weakest?.slug, 'financials');
});

test('quadrants are relative to the market', () => {
  assert.equal(quadrant(2, 1), 'leading');
  assert.equal(quadrant(2, -1), 'weakening');
  assert.equal(quadrant(-2, 1), 'improving');
  assert.equal(quadrant(-2, -1), 'lagging');
  assert.equal(quadrant(null, 1), null);
});

test('reason: leader, broad breadth and the matching driver', () => {
  const rows = [row('ADRO', 'Energy', 1, 8, 5e12), row('PTBA', 'Energy', 1, 3), row('ITMG', 'Energy', 1, 2), row('XXX', 'Energy', 1, -1)];
  const drivers: SectorDrivers = { live: { d1: {}, w1: { oil: 4.1 } }, monthly: { coal: -5 } };
  const e = computeSectorRotation(rows, drivers, '2026-10-25').sectors[0];
  assert.deepEqual(keys(e.w1.reason), ['rotation.reason.led', 'rotation.reason.sep', 'rotation.reason.broadUp', 'rotation.reason.sep', 'rotation.reason.driverWeek']);
  assert.equal(e.w1.reason[0].p?.code, 'ADRO');
  assert.equal(e.w1.reason[4].p?.driver, '@rotation.driver.oil'); // coal fell, so it does not explain a rise
});

test('reason: narrow move with only one stock rising', () => {
  const rows = [row('BIG', 'Technology', 0, 9, 9e12), row('S1', 'Technology', 0, -1), row('S2', 'Technology', 0, -2)];
  const t = computeSectorRotation(rows, noDrivers, '2026-10-25').sectors[0];
  assert.deepEqual(keys(t.w1.reason), ['rotation.reason.onlyUp']);
  assert.equal(t.w1.reason[0].p?.code, 'BIG');
});

test('reason: a recent BI-Rate cut explains a property rally; an old one does not', () => {
  const rows = [row('P1', 'Properties & Real Estate', 0, 3), row('P2', 'Properties & Real Estate', 0, 2)];
  const fresh: SectorDrivers = { ...noDrivers, biRate: { level: 4.5, change: -0.25, date: '2026-10-15' } };
  const old: SectorDrivers = { ...noDrivers, biRate: { level: 4.5, change: -0.25, date: '2026-01-15' } };
  assert.ok(keys(computeSectorRotation(rows, fresh, '2026-10-25').sectors[0].w1.reason).includes('rotation.reason.biCut'));
  assert.ok(!keys(computeSectorRotation(rows, old, '2026-10-25').sectors[0].w1.reason).includes('rotation.reason.biCut'));
});

test('reason: flat and no data', () => {
  const rows = [row('F1', 'Healthcare', 0.01, 0.05), row('N1', 'Industrials', null, null)];
  const { sectors } = computeSectorRotation(rows, noDrivers, '2026-10-25');
  assert.deepEqual(keys(sectors.find((s) => s.slug === 'healthcare')!.w1.reason), ['rotation.reason.flat']);
  assert.deepEqual(keys(sectors.find((s) => s.slug === 'industrials')!.w1.reason), ['rotation.reason.noData']);
});

test('lastChangePct', () => {
  assert.equal(lastChangePct([{ value: 100 }, { value: 104 }]), 4);
  assert.equal(lastChangePct([{ value: 100 }]), null);
});
