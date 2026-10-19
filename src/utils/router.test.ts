import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHashRoute, buildHashRoute } from './router.ts';

test('parseHashRoute parses all main routes and asset detail routes', () => {
  assert.deepEqual(parseHashRoute(''), { tab: 'radar' });
  assert.deepEqual(parseHashRoute('#/radar'), { tab: 'radar' });
  assert.deepEqual(parseHashRoute('#/watchlist'), { tab: 'watchlist' });
  assert.deepEqual(parseHashRoute('#/risiko'), { tab: 'risiko' });
  assert.deepEqual(parseHashRoute('#/pengaturan'), { tab: 'pengaturan' });

  assert.deepEqual(parseHashRoute('#/aset/btc'), {
    tab: 'detail',
    assetSymbol: 'BTC/IDR',
  });
  assert.deepEqual(parseHashRoute('#/aset/ihsg'), {
    tab: 'detail',
    assetSymbol: '^JKSE',
  });
  assert.deepEqual(parseHashRoute('#/aset/xau'), {
    tab: 'detail',
    assetSymbol: 'XAU/USD',
  });
});

test('buildHashRoute builds canonical hash strings', () => {
  assert.equal(buildHashRoute('radar'), '#/radar');
  assert.equal(buildHashRoute('watchlist'), '#/watchlist');
  assert.equal(buildHashRoute('risiko'), '#/risiko');
  assert.equal(buildHashRoute('pengaturan'), '#/pengaturan');
  assert.equal(buildHashRoute('detail', 'BTC/IDR'), '#/aset/btc');
  assert.equal(buildHashRoute('detail', '^JKSE'), '#/aset/ihsg');
});
