/** oecd.test.ts — Tests for the OECD SDMX csv parser, period dates and URLs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OECD_SERIES, oecdPeriodToDate, oecdUrl, parseOecdCsv } from './oecd.ts';

test('periods become the first day of the period', () => {
  assert.equal(oecdPeriodToDate('2026-08'), '2026-08-01');
  assert.equal(oecdPeriodToDate('2026-Q3'), '2026-07-01');
  assert.equal(oecdPeriodToDate('2025'), '2025-01-01');
  assert.equal(oecdPeriodToDate('x'), null);
});

test('csv rows → sorted points, scaled by the unit multiplier, blanks skipped', () => {
  const csv = [
    'STRUCTURE,STRUCTURE_ID,ACTION,REF_AREA,MEASURE,TIME_PERIOD,OBS_VALUE,OBS_STATUS,UNIT_MULT,DECIMALS',
    'DATAFLOW,X,I,IDN,TB,2026-08,3.5,A,9,2',
    'DATAFLOW,X,I,IDN,TB,2026-06,2,A,9,2',
    'DATAFLOW,X,I,IDN,TB,2026-07,,A,9,2',
  ].join('\n');
  assert.deepEqual(parseOecdCsv(csv), [
    { date: '2026-06-01', value: 2e9 },
    { date: '2026-08-01', value: 3.5e9 },
  ]);
  assert.deepEqual(parseOecdCsv('only a header'), []);
});

test('data URLs carry the flow, key and csv format', () => {
  const u = oecdUrl(OECD_SERIES.cpiYoy, '2014-01');
  assert.ok(u.startsWith('https://sdmx.oecd.org/public/rest/data/OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL,/IDN.M.N.CPI.PA._T.N.GY?'));
  assert.ok(u.endsWith('&format=csvfile'));
});
