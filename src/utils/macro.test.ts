/** macro.test.ts — Tests for the FRED, Bank Indonesia and World Bank parsers and macro series helpers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { latest, mergeSeries, parseBiTable, parseFredCsv, parseWorldBank, periodChange, shiftToRelease } from './macro.ts';

test('parses FRED CSV and skips missing values', () => {
  const pts = parseFredCsv('observation_date,X\n2026-07-01,6.01\n2026-08-01,.\n2026-09-01,6.06\n');
  assert.deepEqual(pts, [
    { date: '2026-07-01', value: 6.01 },
    { date: '2026-09-01', value: 6.06 },
  ]);
});

test('parses Bank Indonesia BI-Rate and inflation tables (English and Indonesian)', () => {
  const rate = `<table><tbody><tr class="x"><td>1 </td><td>23 September 2026</td><td>5.75 %</td><td><a>View</a></td></tr>
    <tr><td>2</td><td>9 June 2026</td><td>5.50 %</td><td></td></tr></tbody></table>`;
  assert.deepEqual(parseBiTable(rate), [
    { date: '2026-06-09', value: 5.5 },
    { date: '2026-09-23', value: 5.75 },
  ]);
  const infl = `<tbody><tr><td class="text-center">Agustus 2026</td><td>3,19 %</td></tr><tr><td>July 2026</td><td>2.88 %</td></tr></tbody>`;
  assert.deepEqual(parseBiTable(infl), [
    { date: '2026-07-01', value: 2.88 },
    { date: '2026-08-01', value: 3.19 },
  ]);
  assert.deepEqual(parseBiTable('<html></html>'), []);
});

test('World Bank parsing, merging, m/m change and release shift', () => {
  const wb = parseWorldBank([{ page: 1 }, [{ date: '2025', value: 2.1 }, { date: '2024', value: null }, { date: '2023', value: 3.7 }]]);
  assert.deepEqual(wb.map((p) => p.date), ['2023-01-01', '2025-01-01']);
  const merged = mergeSeries([{ date: '2026-01-01', value: 1 }, { date: '2026-02-01', value: 2 }], [{ date: '2026-02-01', value: 3 }]);
  assert.deepEqual(merged.map((p) => p.value), [1, 3]);
  const mm = periodChange([{ date: '2026-01-01', value: 100 }, { date: '2026-02-01', value: 101 }]);
  assert.ok(Math.abs(mm[0].value - 1) < 1e-12);
  assert.equal(shiftToRelease([{ date: '2026-01-01', value: 5 }], 1, 5)[0].date, '2026-02-06');
  assert.deepEqual(latest([{ date: 'a', value: 5 }, { date: 'b', value: 5.25 }]), { date: 'b', value: 5.25, change: 0.25 });
  assert.equal(latest([]), null);
});
