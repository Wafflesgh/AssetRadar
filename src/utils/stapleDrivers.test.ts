/** stapleDrivers.test.ts — Tests for the staple price drivers (ENSO, seasons, holidays, macro moves). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { activeChain, changeOver, ensoPhase, nextDemandEvent, parseOni, readDriver, readDrivers, schoolState, seasonOf, STAPLE_FACTORS, type DriverInputs } from './stapleDrivers.ts';
import { STAPLE_CATEGORIES } from './staples.ts';
import { en } from '../i18n/en.ts';
import { id } from '../i18n/id.ts';

const monthly = (values: number[]) => values.map((value, i) => ({ date: `2026-${String(i + 1).padStart(2, '0')}-01`, value }));

test('ONI table parsing and El Niño / La Niña thresholds', () => {
  const rows = parseOni('SEAS  YR   TOTAL   ANOM\n  JJA 2026  29.09   1.80\n  JAS 2026  29.12   2.16\nbad line');
  assert.deepEqual(rows.at(-1), { season: 'JAS', year: 2026, anomaly: 2.16 });
  assert.equal(rows.length, 2);
  assert.equal(ensoPhase(0.5), 'elNino');
  assert.equal(ensoPhase(-0.7), 'laNina');
  assert.equal(ensoPhase(0.2), 'neutral');
});

test('seasons and holiday demand peaks', () => {
  assert.equal(seasonOf(1), 'rainy');
  assert.equal(seasonOf(4), 'toDry');
  assert.equal(seasonOf(8), 'dry');
  assert.equal(seasonOf(10), 'toRainy');
  assert.deepEqual(nextDemandEvent('2026-12-01'), { id: 'christmas', date: '2026-12-25', inDays: 24 });
  assert.equal(nextDemandEvent('2026-10-23'), null);
  assert.equal(nextDemandEvent('2027-03-11')?.id, 'eidFitr');
});

test('macro moves: a weaker rupiah and dearer inputs push prices up', () => {
  const inp: DriverInputs = {
    today: '2026-10-23',
    series: { usdIdr: monthly([16000, 16200, 16400, 16800]), palmOil: monthly([1200, 1180, 1150, 1000]), brent: monthly([100, 100, 101, 100]) },
    enso: { season: 'JAS', year: 2026, anomaly: 2.16 },
  };
  assert.equal(changeOver(inp.series.usdIdr)?.pct.toFixed(1), '5.0');
  assert.equal(readDriver('beef', 'usdIdr', inp).effect, 'raises');
  assert.equal(readDriver('oil', 'palmOil', inp).effect, 'eases');
  assert.equal(readDriver('chili', 'brent', inp).effect, 'neutral');
  assert.equal(readDriver('garlic', 'cny', inp).effect, 'unknown');
  const enso = readDriver('rice', 'enso', inp);
  assert.equal(enso.effect, 'raises');
  assert.equal(enso.state, 'elNinoStrong');
  // October: rice second crop, chili into the rainy season, sugar still milling
  assert.equal(readDriver('rice', 'season', inp).state, 'riceSecond');
  assert.equal(readDriver('chili', 'season', inp).effect, 'raises');
  assert.equal(readDriver('sugar', 'season', inp).effect, 'eases');
  // La Niña hurts wet-sensitive crops only
  const wet = { ...inp, enso: { season: 'DJF', year: 2027, anomaly: -1 } };
  assert.equal(readDriver('shallot', 'enso', wet).effect, 'raises');
  assert.equal(readDriver('rice', 'enso', wet).effect, 'neutral');
  assert.equal(readDrivers('beef', inp).length, STAPLE_FACTORS.beef.length);
});

test('school holidays pause MBG demand; the restart brings it back', () => {
  assert.deepEqual(schoolState('2026-12-25'), { state: 'holiday', days: 10 });
  assert.deepEqual(schoolState('2026-12-10'), { state: 'soon', days: 11 });
  assert.deepEqual(schoolState('2027-01-06'), { state: 'restart', days: 3 });
  assert.equal(schoolState('2026-10-23').state, 'term');
  const inp: DriverInputs = { today: '2026-12-25', series: {}, enso: null };
  assert.equal(readDriver('eggs', 'mbg', inp).effect, 'eases');
  assert.equal(readDriver('eggs', 'mbg', { ...inp, today: '2027-01-06' }).effect, 'raises');
  // Term time: the main demand driver for eggs and chicken, background for rice
  assert.equal(readDriver('eggs', 'mbg', { ...inp, today: '2026-10-23' }).effect, 'raises');
  assert.equal(readDriver('rice', 'mbg', { ...inp, today: '2026-10-23' }).effect, 'neutral');
});

test('KDMP news push prices up; no news is neutral; unread news is unknown', () => {
  const inp: DriverInputs = { today: '2026-10-23', series: {}, enso: null, policyNews: { mbg: 2, kdmp: 3 } };
  assert.deepEqual(readDriver('eggs', 'kdmp', inp), { factor: 'kdmp', effect: 'raises', state: 'active', params: { n: 3 } });
  assert.equal(readDriver('eggs', 'kdmp', { ...inp, policyNews: { mbg: 0, kdmp: 0 } }).effect, 'neutral');
  assert.equal(readDriver('eggs', 'kdmp', { ...inp, policyNews: null }).effect, 'unknown');
  // World oil is not a driver for eggs or chili (transport fuel is priced by the government)
  assert.ok(!STAPLE_FACTORS.eggs.includes('brent'));
  assert.ok(!STAPLE_FACTORS.chili.includes('brent'));
  assert.ok(STAPLE_FACTORS.oil.includes('brent'));
});

test('the chain that applies follows the 1-month change', () => {
  assert.equal(activeChain(3), 'up');
  assert.equal(activeChain(-2.5), 'down');
  assert.equal(activeChain(0.4), null);
  assert.equal(activeChain(null), null);
});

test('every category and factor state has its texts in both languages', () => {
  const states: Record<string, string[]> = {
    usdIdr: ['up', 'down', 'flat', 'unknown'],
    cny: ['up', 'down', 'flat', 'unknown'],
    riceThai: ['up', 'down', 'flat', 'unknown'],
    palmOil: ['up', 'down', 'flat', 'unknown'],
    brent: ['up', 'down', 'flat', 'unknown'],
    enso: ['elNino', 'elNinoStrong', 'laNina', 'laNinaStrong', 'neutral', 'unknown'],
    season: ['rainy', 'toDry', 'dry', 'toRainy', 'riceHarvest', 'riceLean', 'riceSecond', 'sugarMilling', 'sugarOff'],
    holiday: ['christmas', 'ramadan', 'eidFitr', 'eidAdha', 'none'],
    mbg: ['holiday', 'soon', 'restart', 'term'],
    kdmp: ['active', 'quiet', 'unknown'],
  };
  for (const [f, list] of Object.entries(states)) {
    for (const s of list) {
      const k = `kitchen.f.${f}.${s}` as keyof typeof en;
      assert.ok(en[k] && id[k], `missing ${k}`);
    }
  }
  for (const c of STAPLE_CATEGORIES) {
    for (const field of ['what', 'link', 'up', 'down', 'policy']) {
      const k = `kitchen.why.${c}.${field}` as keyof typeof en;
      assert.ok(en[k] && id[k], `missing ${k}`);
      assert.equal(en[k].split('\n').length, id[k]!.split('\n').length, k);
    }
  }
});
