/**
 * pinkSheet.test.ts — Tests for the World Bank Pink Sheet reader: the download link on the page,
 * worksheet XML → rows (shared and inline strings, numbers, entities), the "Monthly Prices"
 * layout → monthly series (missing months skipped), and the zip container with stored and
 * deflated entries.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { findPinkSheetLink, monthlyCommodities, parsePinkSheet } from './pinkSheet.ts';
import { parseSharedStrings, parseSheetRows, sheetPaths } from './xlsxSheet.ts';
import { readXlsxSheet } from '../../server/xlsx.ts';

const SHARED = '<sst><si><t>Crude oil, Brent</t></si><si><t>Palm oil</t></si><si><t>Nickel</t></si><si><r><t>Rubber, </t></r><r><t>TSR20 **</t></r></si><si><t>1960M01</t></si><si><t>…</t></si></sst>';
const SHEET =
  '<worksheet><sheetData>' +
  '<row r="4"><c r="A4" t="inlineStr"><is><t>Updated on October 02, 2026</t></is></c></row>' +
  '<row r="5"><c r="B5" t="s"><v>0</v></c><c r="C5" t="s"><v>1</v></c><c r="D5" t="s"><v>2</v></c><c r="E5" t="s"><v>3</v></c></row>' +
  '<row r="7"><c r="A7" t="s"><v>4</v></c><c r="B7"><v>1.6</v></c><c r="C7" t="s"><v>5</v></c><c r="D7"><v>2400.5</v></c><c r="E7"><v>0.3</v></c></row>' +
  '<row r="8"><c r="A8" t="str"><v>2026M09</v></c><c r="B8"><v>116.8</v></c><c r="C8"><v>1020</v></c><c r="D8"><v>15100</v></c><c r="E8"/></row>' +
  '</sheetData></worksheet>';

test('download link is found on the World Bank page', () => {
  const html = '<a href="https://thedocs.worldbank.org/en/doc/abc-0050012026/related/CMO-Historical-Data-Monthly.xlsx">Monthly prices</a>';
  assert.equal(findPinkSheetLink(html), 'https://thedocs.worldbank.org/en/doc/abc-0050012026/related/CMO-Historical-Data-Monthly.xlsx');
  assert.equal(findPinkSheetLink('<p>nothing</p>'), null);
});

test('worksheet XML becomes rows with strings and numbers', () => {
  const shared = parseSharedStrings(SHARED);
  assert.equal(shared[3], 'Rubber, TSR20 **'); // rich-text runs joined
  const rows = parseSheetRows(SHEET, shared);
  assert.equal(rows.get(4)?.get('A'), 'Updated on October 02, 2026');
  assert.equal(rows.get(7)?.get('D'), 2400.5);
  assert.equal(rows.get(8)?.get('A'), '2026M09');
  assert.equal(rows.get(8)?.has('E'), false); // empty cell
});

test('Monthly Prices layout → monthly series, missing months skipped', () => {
  const p = parsePinkSheet(parseSheetRows(SHEET, parseSharedStrings(SHARED)));
  assert.equal(p.updated, 'October 02, 2026');
  assert.deepEqual(p.series.get('palmOil'), [{ date: '2026-09-01', value: 1020 }]); // "…" in 1960 skipped
  assert.deepEqual(p.series.get('nickel'), [{ date: '1960-01-01', value: 2400.5 }, { date: '2026-09-01', value: 15100 }]);
  assert.deepEqual(p.series.get('rubber'), [{ date: '1960-01-01', value: 0.3 }]);
  assert.equal(p.series.has('tin'), false); // column not in this sheet
});

/** Minimal zip writer for the test (stored or deflated entries). */
function zip(files: Record<string, string>, deflate: boolean): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text);
    const data = deflate ? deflateRawSync(raw) : raw;
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(n.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(deflate ? 8 : 0, 10);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(n.length, 28);
    dir.writeUInt32LE(offset, 42);
    locals.push(local, n, data);
    central.push(dir, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

test('xlsx container: sheet found by name in stored and deflated zips', () => {
  const files = {
    'xl/workbook.xml': '<workbook><sheets><sheet name="Notes" sheetId="1" r:id="rId1"/><sheet name="Monthly Prices" sheetId="2" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
    'xl/sharedStrings.xml': SHARED,
    'xl/worksheets/sheet1.xml': '<worksheet/>',
    'xl/worksheets/sheet2.xml': SHEET,
  };
  assert.equal(sheetPaths(files['xl/workbook.xml'], files['xl/_rels/workbook.xml.rels']).get('Monthly Prices'), 'xl/worksheets/sheet2.xml');
  for (const deflate of [false, true]) {
    const rows = readXlsxSheet(zip(files, deflate), 'Monthly Prices');
    assert.equal(rows?.get(8)?.get('D'), 15100);
  }
  assert.equal(readXlsxSheet(zip(files, true), 'Missing'), null);
});

test('monthly commodities: latest month with month and year changes', () => {
  const months = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.UTC(2025, 7 + i, 1));
    return { date: d.toISOString().slice(0, 10), value: 100 + i * 10 };
  });
  const rows = monthlyCommodities({ series: new Map([['nickel', months], ['tin', []]]) }, ['nickel', 'tin', 'unknown']);
  assert.equal(rows.length, 1);
  const n = rows[0];
  assert.equal(n.month, '2026-09-01');
  assert.equal(n.value, 230);
  assert.ok(Math.abs((n.changeMoM ?? 0) - (230 / 220 - 1) * 100) < 1e-9);
  assert.ok(Math.abs((n.changeYoY ?? 0) - (230 / 110 - 1) * 100) < 1e-9);
  assert.equal(n.history.length, 14);
});
