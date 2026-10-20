/**
 * screener.test.ts — Tests for the IDX screener: range filters in display units, sector/board/
 * text filters, rows with missing numbers (counted, not silently dropped), sorting with missing
 * values last, presets, CSV, and ratios from statement rows (annual vs trailing 12 months).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyScreen, fundamentalsFromRows, PRESETS, rescaleForPrice, screenerCsv, sortRows, type ScreenerFundamentals, type ScreenerRow } from './screener.ts';
import type { StatementRow } from './statements.ts';

const fund = (over: Partial<ScreenerFundamentals>): ScreenerFundamentals => ({
  asOf: '2025-12-31',
  label: 'FY2025',
  basis: 'annual',
  currency: 'IDR',
  pe: null,
  pb: null,
  roe: null,
  netMargin: null,
  der: null,
  dividendYield: null,
  netIncomeYoY: null,
  fScore: null,
  fScoreMax: null,
  ...over,
});

const row = (code: string, over: Partial<ScreenerRow>): ScreenerRow => ({
  symbol: `${code}.JK`,
  code,
  name: `${code} Tbk`,
  sector: 'Financials',
  board: 'Main',
  price: 1000,
  chg1d: 0,
  chg1w: 0,
  valueTraded: 10e9,
  marketCap: 1e12,
  f: null,
  ...over,
});

const ROWS: ScreenerRow[] = [
  row('BBCA', { f: fund({ roe: 21, pe: 20, dividendYield: 3, fScore: 7, fScoreMax: 9 }), marketCap: 1000e12 }),
  row('BBRI', { f: fund({ roe: 19, pe: 9, dividendYield: 8, netIncomeYoY: 2, fScore: 6, fScoreMax: 9 }), marketCap: 600e12 }),
  row('ADRO', { sector: 'Energy', f: fund({ roe: 30, pe: 4, dividendYield: 15, netIncomeYoY: -40 }), marketCap: 80e12 }),
  row('GOTO', { sector: 'Technology', board: 'New Economy', f: fund({ roe: -5, pe: null }), marketCap: 90e12 }),
  row('XXXX', { board: 'Watchlist', f: undefined, price: null, marketCap: null }),
];

test('range filters and the missing-data count', () => {
  const r = applyScreen(ROWS, { id: 's', name: 's', filters: [{ field: 'roe', min: 15 }, { field: 'pe', max: 12 }] });
  assert.deepEqual(r.rows.map((x) => x.code), ['BBRI', 'ADRO']);
  // GOTO fails ROE (no need to count its missing P/E); XXXX has no data at all
  assert.equal(r.missingData, 1);
});

test('display units: value traded in Rp billion', () => {
  const rows = [row('A', { valueTraded: 4e9 }), row('B', { valueTraded: 6e9 })];
  assert.deepEqual(applyScreen(rows, { id: 's', name: 's', filters: [{ field: 'valueTraded', min: 5 }] }).rows.map((x) => x.code), ['B']);
});

test('sector, board and text filters', () => {
  assert.deepEqual(applyScreen(ROWS, { id: 's', name: 's', sectors: ['Energy', 'Technology'], filters: [] }).rows.map((x) => x.code), ['GOTO', 'ADRO']);
  assert.deepEqual(applyScreen(ROWS, { id: 's', name: 's', boards: ['New Economy'], filters: [] }).rows.map((x) => x.code), ['GOTO']);
  assert.deepEqual(applyScreen(ROWS, { id: 's', name: 's', query: 'bb', filters: [] }).rows.map((x) => x.code), ['BBCA', 'BBRI']);
});

test('sorting keeps missing values last in both directions', () => {
  assert.deepEqual(sortRows(ROWS, 'pe', 'asc').map((x) => x.code), ['ADRO', 'BBRI', 'BBCA', 'GOTO', 'XXXX']);
  assert.deepEqual(sortRows(ROWS, 'pe', 'desc').map((x) => x.code), ['BBCA', 'BBRI', 'ADRO', 'GOTO', 'XXXX']);
  assert.deepEqual(sortRows(ROWS, 'code', 'asc').map((x) => x.code), ['ADRO', 'BBCA', 'BBRI', 'GOTO', 'XXXX']);
});

test('presets', () => {
  const byName = (n: string) => PRESETS.find((p) => p.name === n)!;
  assert.deepEqual(applyScreen(ROWS, byName('High ROE, low P/E')).rows.map((x) => x.code), ['ADRO', 'BBRI']);
  assert.deepEqual(applyScreen(ROWS, byName('Dividend payers')).rows.map((x) => x.code), ['BBRI']);
  assert.deepEqual(applyScreen(ROWS, byName('Strong F-score')).rows.map((x) => x.code), ['BBCA']);
});

test('CSV marks missing numbers as Not reported', () => {
  const csv = screenerCsv([ROWS[3]]).split('\n');
  assert.equal(csv.length, 2);
  assert.ok(csv[1].startsWith('GOTO,GOTO Tbk,Technology,New Economy,1000,0,0,10,90,Not reported'));
});

const stmt = (over: Partial<StatementRow> & { ratios: StatementRow['ratios'] }): StatementRow => ({
  end: '2025-12-31',
  months: 12,
  values: {},
  sources: {},
  label: 'FY2025',
  ...over,
});

test('statement rows: TTM when the latest quarter is newer and complete, else the fiscal year', () => {
  const annual = [stmt({ ratios: { basis: 'annual', roe: 0.2, pe: 10, netMargin: 0.3, dividendYield: 0.05, netIncomeYoY: 12 } })];
  const q = [stmt({ end: '2026-06-30', months: 3, label: 'Q2 FY2026', ratios: { basis: 'ttm', roe: 0.22, pe: 9 } })];
  const ttm = fundamentalsFromRows(annual, q, 'IDR', { score: 7, max: 9 });
  assert.equal(ttm?.basis, 'ttm');
  assert.equal(ttm?.label, 'Q2 FY2026');
  assert.ok(Math.abs((ttm?.roe ?? 0) - 22) < 1e-9);
  assert.equal(ttm?.fScore, 7);
  const annualized = [stmt({ end: '2026-06-30', months: 3, ratios: { basis: 'annualized', roe: 0.5 } })];
  const fy = fundamentalsFromRows(annual, annualized, 'IDR', { score: 3, max: 4 });
  assert.equal(fy?.basis, 'annual');
  assert.equal(fy?.dividendYield, 5);
  assert.equal(fy?.fScore, null, 'an F-score from fewer than 5 signals is not used');
  assert.equal(fundamentalsFromRows([], [], 'IDR', null), null);
});

test('valuation ratios follow the current price', () => {
  const f = fund({ pe: 10, pb: 2, dividendYield: 5, roe: 20 });
  const r = rescaleForPrice(f, 1000, 1200);
  assert.ok(Math.abs((r.pe ?? 0) - 12) < 1e-9);
  assert.ok(Math.abs((r.pb ?? 0) - 2.4) < 1e-9);
  assert.ok(Math.abs((r.dividendYield ?? 0) - 5 / 1.2) < 1e-9);
  assert.equal(r.roe, 20);
  assert.equal(rescaleForPrice(f, null, 1200), f);
});
