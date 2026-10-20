/** router.test.ts — Tests for hash route parsing/building, including legacy Indonesian hashes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHashRoute, buildHashRoute } from './router.ts';

test('parseHashRoute parses all main routes and asset detail routes', () => {
  assert.deepEqual(parseHashRoute(''), { tab: 'radar' });
  assert.deepEqual(parseHashRoute('#/radar'), { tab: 'radar' });
  assert.deepEqual(parseHashRoute('#/watchlist'), { tab: 'watchlist' });
  assert.deepEqual(parseHashRoute('#/risk'), { tab: 'risk' });
  assert.deepEqual(parseHashRoute('#/settings'), { tab: 'settings' });
  assert.deepEqual(parseHashRoute('#/terminal'), { tab: 'terminal' });
  assert.deepEqual(parseHashRoute('#/advisor'), { tab: 'advisor' });

  assert.deepEqual(parseHashRoute('#/asset/btc'), { tab: 'detail', assetSymbol: 'BTC/IDR' });
  assert.deepEqual(parseHashRoute('#/asset/jci'), { tab: 'detail', assetSymbol: '^JKSE' });
  assert.deepEqual(parseHashRoute('#/asset/xau'), { tab: 'detail', assetSymbol: 'XAU/USD' });
});

test('parseHashRoute still accepts legacy Indonesian hashes', () => {
  assert.deepEqual(parseHashRoute('#/risiko'), { tab: 'risk' });
  assert.deepEqual(parseHashRoute('#/pengaturan'), { tab: 'settings' });
  assert.deepEqual(parseHashRoute('#/aset/btc'), { tab: 'detail', assetSymbol: 'BTC/IDR' });
  assert.deepEqual(parseHashRoute('#/aset/ihsg'), { tab: 'detail', assetSymbol: '^JKSE' });
});

test('buildHashRoute builds canonical hash strings', () => {
  assert.equal(buildHashRoute('radar'), '#/radar');
  assert.equal(buildHashRoute('watchlist'), '#/watchlist');
  assert.equal(buildHashRoute('risk'), '#/risk');
  assert.equal(buildHashRoute('settings'), '#/settings');
  assert.equal(buildHashRoute('terminal'), '#/terminal');
  assert.equal(buildHashRoute('advisor'), '#/advisor');
  assert.equal(buildHashRoute('detail', 'BTC/IDR'), '#/asset/btc');
  assert.equal(buildHashRoute('detail', '^JKSE'), '#/asset/jci');
});

test('quant simulator route', () => {
  assert.deepEqual(parseHashRoute('#/quant'), { tab: 'quant' });
  assert.deepEqual(parseHashRoute('#/lab'), { tab: 'quant' });
  assert.equal(buildHashRoute('quant'), '#/quant');
});

test('IDX page and universe stock detail routes', () => {
  assert.deepEqual(parseHashRoute('#/idx'), { tab: 'idx' });
  assert.equal(buildHashRoute('idx'), '#/idx');
  assert.equal(buildHashRoute('detail', 'BUMI.JK'), '#/asset/idx-bumi');
  assert.deepEqual(parseHashRoute('#/asset/idx-bumi'), { tab: 'detail', assetSymbol: 'BUMI.JK' });
  // A plain IDX code also works
  assert.deepEqual(parseHashRoute('#/asset/bumi'), { tab: 'detail', assetSymbol: 'BUMI.JK' });
});

test('portfolio route', () => {
  assert.deepEqual(parseHashRoute('#/portfolio'), { tab: 'portfolio' });
  assert.deepEqual(parseHashRoute('#/portofolio'), { tab: 'portfolio' });
  assert.equal(buildHashRoute('portfolio'), '#/portfolio');
});

test('calendar route', () => {
  assert.deepEqual(parseHashRoute('#/calendar'), { tab: 'calendar' });
  assert.equal(buildHashRoute('calendar'), '#/calendar');
});

test('macro route', () => {
  assert.deepEqual(parseHashRoute('#/macro'), { tab: 'macro' });
  assert.equal(buildHashRoute('macro'), '#/macro');
});

test('alerts route', () => {
  assert.deepEqual(parseHashRoute('#/alerts'), { tab: 'alerts' });
  assert.equal(buildHashRoute('alerts'), '#/alerts');
});

test('screener and compare routes', () => {
  assert.deepEqual(parseHashRoute('#/screener'), { tab: 'screener' });
  assert.deepEqual(parseHashRoute('#/compare?s=BBCA,bbri,BMRI'), { tab: 'compare', compare: ['BBCA.JK', 'BBRI.JK', 'BMRI.JK'] });
  assert.deepEqual(parseHashRoute('#/compare'), { tab: 'compare', compare: [] });
  assert.equal(buildHashRoute('compare', undefined, ['BBCA.JK', 'BTC/IDR']), '#/compare?s=BBCA,BTC');
  assert.equal(buildHashRoute('screener'), '#/screener');
});

test('brief route', () => {
  assert.deepEqual(parseHashRoute('#/brief'), { tab: 'brief' });
  assert.equal(buildHashRoute('brief'), '#/brief');
});
