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

test('stage 4 macro: 10-year z-score, staleness, Macro Pulse, spreads and BPS parsing', async () => {
  const { zScore10y, isStale, toIndicator, macroPulse, spreadSeries, monthlyPoints, parseBpsDynData, findBpsVar } = await import('./macro.ts');
  const pts = Array.from({ length: 24 }, (_, i) => ({ date: `${2015 + Math.floor(i / 2)}-0${(i % 2) * 6 + 1}-01`, value: i === 23 ? 10 : 5 + (i % 3) }));
  const z = zScore10y(pts);
  assert.ok(z !== null && z > 2);
  assert.equal(zScore10y(pts.slice(0, 3)), null);
  assert.equal(isStale({ frequency: 'monthly', points: [{ date: '2026-01-01', value: 1 }] }, '2026-10-20'), true);
  assert.equal(isStale({ frequency: 'monthly', points: [{ date: '2026-08-01', value: 1 }] }, '2026-10-20'), false);
  // Annual figures count from the end of their year
  assert.equal(isStale({ frequency: 'annual', points: [{ date: '2025-01-01', value: 1 }] }, '2026-10-20'), false);
  assert.equal(isStale({ frequency: 'annual', points: [{ date: '2023-01-01', value: 1 }] }, '2026-10-20'), true);
  const base = { id: 'x', label: 'x', unit: '%', frequency: 'monthly' as const, source: 's', sourceUrl: 'u', points: pts.map((p, i) => ({ ...p, date: `2026-${String((i % 9) + 1).padStart(2, '0')}-01` })) };
  const fresh = { ...base, points: pts.map((p, i) => ({ value: p.value, date: `${2016 + Math.floor(i / 3)}-${String((i % 3) * 3 + 1).padStart(2, '0')}-01` })) };
  fresh.points[fresh.points.length - 1].date = '2026-09-01';
  const infl = toIndicator(fresh, 'inflation', false, '2026-10-20');
  const reserves = toIndicator({ ...fresh, id: 'r' }, 'external', true, '2026-10-20');
  const pulse = Object.fromEntries(macroPulse([infl, reserves]).map((p) => [p.category, p]));
  assert.equal(pulse.inflation.light, 'red'); // inflation far above normal
  assert.equal(pulse.external.light, 'green'); // reserves far above normal
  assert.equal(pulse.fiscal.light, null);
  assert.deepEqual(spreadSeries([{ date: '2026-02-01', value: 5 }], [{ date: '2026-01-20', value: 4.5 }]), [{ date: '2026-02-01', value: 0.5 }]);
  assert.deepEqual(monthlyPoints(new Map([['2026-02', 2], ['2026-01', 1]])), [{ date: '2026-01-01', value: 1 }, { date: '2026-02-01', value: 2 }]);
  const bps = parseBpsDynData({
    'data-availability': 'available',
    var: [{ val: 1905 }],
    vervar: [{ val: 9999, label: 'Indonesia' }],
    turvar: [{ val: 0 }],
    tahun: [{ val: 125, label: '2025' }],
    turtahun: [{ val: 1, label: 'Januari' }, { val: 2, label: 'Februari' }, { val: 13, label: 'Tahunan' }],
    datacontent: { '99991905012501': 2.36, '99991905012502': '2,18', '99991905012513': 2.5 },
  });
  assert.deepEqual(bps, [{ date: '2025-01-01', value: 2.36 }, { date: '2025-02-01', value: 2.18 }]);
  assert.deepEqual(parseBpsDynData({ 'data-availability': 'list-not-available' }), []);
  assert.deepEqual(findBpsVar({ data: [{ page: 1 }, [{ var_id: 1, title: 'Inflasi Umum' }, { var_id: 7, title: 'Inflasi Inti (persen)' }]] }, /inti/i), { id: '7', title: 'Inflasi Inti (persen)' });
});
