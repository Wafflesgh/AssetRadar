/**
 * compare.test.ts — Tests for the Compare page helpers: URL parameter parsing/building and the
 * normalized (start = 100) series with different trading calendars per exchange.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCompareParam, normalizeSeries, parseCompareParam, periodReturns, periodStart } from './compare.ts';

test('URL parameter: codes, symbols and ids in any case, deduplicated, max 4', () => {
  assert.deepEqual(parseCompareParam('BBCA,bbri,BMRI'), ['BBCA.JK', 'BBRI.JK', 'BMRI.JK']);
  assert.deepEqual(parseCompareParam('BTC/IDR,btc, NOPE ,AAPL'), ['BTC/IDR', 'AAPL']);
  assert.equal(parseCompareParam('BBCA,BBRI,BMRI,TLKM,ASII').length, 4);
  assert.deepEqual(parseCompareParam(''), []);
  assert.deepEqual(parseCompareParam(undefined), []);
  assert.equal(buildCompareParam(['BBCA.JK', 'XAU/USD']), 'BBCA,GOLD');
  assert.deepEqual(parseCompareParam(buildCompareParam(['BBCA.JK', 'XAU/USD'])), ['BBCA.JK', 'XAU/USD']);
});

test('period start dates', () => {
  assert.equal(periodStart('1M', '2026-10-20'), '2026-09-20');
  assert.equal(periodStart('1Y', '2026-10-20'), '2025-10-20');
  assert.equal(periodStart('5Y', '2026-10-20'), '2021-10-20');
  assert.equal(periodStart('10Y', '2026-10-20'), '2016-10-20');
  assert.ok(periodStart('MAX', '2026-10-20') < '1900-01-01');
});

test('normalization: start at 100, carry closes over another exchange holiday', () => {
  // IDX closed on the 2nd (holiday), NYSE closed on the 3rd
  const idx = [
    { date: '2026-01-01', close: 100 },
    { date: '2026-01-03', close: 110 },
    { date: '2026-01-04', close: 121 },
  ];
  const us = [
    { date: '2026-01-01', close: 50 },
    { date: '2026-01-02', close: 55 },
    { date: '2026-01-04', close: 60 },
  ];
  const pts = normalizeSeries([{ symbol: 'IDX', bars: idx }, { symbol: 'US', bars: us }], '2026-01-01');
  assert.deepEqual(pts.map((p) => p.date), ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
  const round = (v: Record<string, number>) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Math.round(x * 1e6) / 1e6]));
  assert.deepEqual(round(pts[1].values), { IDX: 100, US: 110 }, 'IDX carries 100 over its holiday');
  assert.deepEqual(round(pts[2].values), { IDX: 110, US: 110 }, 'US carries 55 over its holiday');
  assert.ok(Math.abs(pts[3].values.IDX - 121) < 1e-9 && Math.abs(pts[3].values.US - 120) < 1e-9);
  const r = periodReturns(pts);
  assert.ok(Math.abs(r.IDX - 21) < 1e-9 && Math.abs(r.US - 20) < 1e-9);
});

test('normalization: the base is the first date every asset has a price', () => {
  const young = [
    { date: '2026-01-03', close: 10 },
    { date: '2026-01-04', close: 20 },
  ];
  const old = [
    { date: '2026-01-01', close: 100 },
    { date: '2026-01-02', close: 100 },
    { date: '2026-01-03', close: 200 },
    { date: '2026-01-04', close: 300 },
  ];
  const pts = normalizeSeries([{ symbol: 'A', bars: young }, { symbol: 'B', bars: old }], '2026-01-01');
  assert.equal(pts[0].date, '2026-01-03');
  assert.deepEqual(pts[0].values, { A: 100, B: 100 });
  assert.deepEqual(pts[1].values, { A: 200, B: 150 });
});

test('normalization: a close just before the start seeds the base; missing series → empty', () => {
  const a = [
    { date: '2025-12-30', close: 100 },
    { date: '2026-01-05', close: 105 },
  ];
  const b = [
    { date: '2026-01-02', close: 10 },
    { date: '2026-01-05', close: 11 },
  ];
  const pts = normalizeSeries([{ symbol: 'A', bars: a }, { symbol: 'B', bars: b }], '2026-01-01');
  assert.equal(pts[0].date, '2026-01-02');
  assert.equal(pts[0].values.A, 100);
  assert.deepEqual(normalizeSeries([{ symbol: 'A', bars: a }, { symbol: 'B', bars: [] }], '2026-01-01'), []);
});
