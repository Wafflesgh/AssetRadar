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
  assert.equal(buildHashRoute('detail', 'BTC/IDR'), '#/asset/btc');
  assert.equal(buildHashRoute('detail', '^JKSE'), '#/asset/jci');
});
