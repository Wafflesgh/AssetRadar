/** bpsInflation.test.ts — Tests for the BPS core / administered / volatile inflation table reader. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBpsInflationTable, yoyFromMonthly } from './bpsInflation.ts';

const row = (...c: string[]) => `<tr>${c.map((x) => `<td class="x">${x}</td>`).join('')}</tr>`;
const table = [
  '&lt;style&gt;td { color:#000 }&lt;/style&gt;',
  '&lt;table&gt;',
  row('Tahun/Bulan', '', 'Umum', 'Inti', 'Harga-Diatur Pemerintah', 'Bergejolak').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  row('2026', '', '2,17', '2,07', '2,52', '2,18').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  row('', 'September', '0,30', '0,10', '~ 0', '1,46').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  row('', 'Agustus', '0,21', '0.21', '-0,33', '0,88').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  row('2025', '', '2,92', '2,38', '1,93', '6,21').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  row('', 'Desember', '0,44', '0,17', '', '2,1').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  '&lt;/table&gt;',
].join('');

test('reads month rows under their year, with BPS number quirks', () => {
  const t = parseBpsInflationTable(table);
  assert.deepEqual(t.core, [
    { date: '2025-12-01', value: 0.17 },
    { date: '2026-08-01', value: 0.21 },
    { date: '2026-09-01', value: 0.1 },
  ]);
  assert.deepEqual(t.administered, [
    { date: '2026-08-01', value: -0.33 },
    { date: '2026-09-01', value: 0 },
  ]);
  assert.equal(t.volatile.length, 3);
  assert.equal(t.headline[2].value, 0.3);
});

test('year-on-year compounds 12 consecutive months and skips gaps', () => {
  const mom = Array.from({ length: 13 }, (_, i) => ({ date: `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`, value: 0.5 }));
  const yoy = yoyFromMonthly(mom);
  assert.equal(yoy.length, 2);
  assert.equal(yoy[0].date, '2025-12-01');
  assert.equal(yoy[0].value, 6.17);
  assert.deepEqual(yoyFromMonthly([...mom.slice(0, 5), ...mom.slice(6)]).length, 0);
});
