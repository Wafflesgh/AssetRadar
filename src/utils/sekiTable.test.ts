/** sekiTable.test.ts — Tests for reading quarterly series out of Bank Indonesia SEKI tables. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sekiFindRow, sekiQuarterColumns, sekiSeries, type SekiCell } from './sekiTable.ts';

// Shaped like table V.7: shifted year labels, an annual column after each Q4, "N/A" cells
const rows: SekiCell[][] = [
  ['V.7. TRANSAKSI FINANSIAL : INVESTASI PORTOFOLIO'],
  ['(Juta USD)'],
  [],
  [],
  [null, null, 'KETERANGAN', 2024, null, null, null, null, 2025, null, null],
  [null, null, null, 'Q3', 'Q4', null, 'Q1*', 'Q2*', 'Q3*', 'Q4*', null, 'Q1**'],
  [1, null, 'Investasi Portofolio', 100, 200, 300, -50, 60, 70, 80, 160, 90],
  [2, null, 'A. Aset', 1, 1, 2, 1, 1, 1, 1, 4, 1],
  [3, null, 'a. Modal ekuitas', 5, 5, 10, 5, 5, 5, 5, 20, 5],
  [4, null, 'B. Kewajiban', 1, 1, 2, 1, 1, 1, 1, 4, 1],
  [5, null, '2. Sektor swasta', 1, 1, 2, 1, 1, 1, 1, 4, 1],
  [6, null, 'a. Modal ekuitas', 1500, -2500, -1000, 'N/A', 400, '-', 600, 1000, -3135],
];

test('quarter columns count years from the first year and skip annual columns', () => {
  const cols = sekiQuarterColumns(rows);
  assert.equal(cols.get(3), '2024-07-01');
  assert.equal(cols.get(4), '2024-10-01');
  assert.equal(cols.has(5), false);
  assert.equal(cols.get(6), '2025-01-01');
  assert.equal(cols.get(9), '2025-10-01');
  assert.equal(cols.get(11), '2026-01-01');
});

test('a row is found by its label path, below the earlier labels', () => {
  assert.equal(sekiFindRow(rows, ['a. Modal ekuitas']), 8);
  assert.equal(sekiFindRow(rows, ['B. Kewajiban', '2. Sektor swasta', 'a. Modal ekuitas']), 11);
  assert.equal(sekiFindRow(rows, ['C. Missing']), -1);
});

test('series values are scaled and skip text cells', () => {
  const pts = sekiSeries(rows, ['B. Kewajiban', '2. Sektor swasta', 'a. Modal ekuitas'], 0.001);
  assert.deepEqual(pts, [
    { date: '2024-07-01', value: 1.5 },
    { date: '2024-10-01', value: -2.5 },
    { date: '2025-04-01', value: 0.4 },
    { date: '2025-10-01', value: 0.6 },
    { date: '2026-01-01', value: -3.135 },
  ]);
  assert.deepEqual(sekiSeries(rows, ['Nothing']), []);
});
