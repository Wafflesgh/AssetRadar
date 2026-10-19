/** assets.test.ts — Tests that the asset list, TradingView symbols and timeframes match the spec. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSETS,
  TIMEFRAME_OPTIONS,
  DEFAULT_TIMEFRAME,
  getAssetBySymbol,
  isValidTimeframe,
} from './assets.ts';

test('ASSETS contains all 6 required instruments with exact TradingView symbols', () => {
  assert.equal(ASSETS.length, 6);

  const btc = getAssetBySymbol('BTC/IDR');
  assert.ok(btc);
  assert.equal(btc.tvSymbol, 'INDODAX:BTCIDR');
  assert.equal(btc.tvFallbackSymbol, 'BINANCE:BTCUSDT');

  const eth = getAssetBySymbol('ETH/IDR');
  assert.ok(eth);
  assert.equal(eth.tvSymbol, 'INDODAX:ETHIDR');
  assert.equal(eth.tvFallbackSymbol, 'BINANCE:ETHUSDT');

  const sol = getAssetBySymbol('SOL/IDR');
  assert.ok(sol);
  assert.equal(sol.tvSymbol, 'INDODAX:SOLIDR');
  assert.equal(sol.tvFallbackSymbol, 'BINANCE:SOLUSDT');

  const ihsg = getAssetBySymbol('^JKSE');
  assert.ok(ihsg);
  assert.equal(ihsg.tvSymbol, 'IDX:COMPOSITE');
  assert.equal(ihsg.usesBackupChartFallback, true);

  const xau = getAssetBySymbol('XAU/USD');
  assert.ok(xau);
  assert.equal(xau.tvSymbol, 'OANDA:XAUUSD');

  const usdidr = getAssetBySymbol('USD/IDR');
  assert.ok(usdidr);
  assert.equal(usdidr.tvSymbol, 'FX_IDC:USDIDR');
});

test('TIMEFRAME_OPTIONS matches all 8 intervals and default is 15m', () => {
  assert.equal(DEFAULT_TIMEFRAME, '15');
  assert.equal(TIMEFRAME_OPTIONS.length, 8);
  const intervals = TIMEFRAME_OPTIONS.map((t) => t.interval);
  assert.deepEqual(intervals, ['1', '5', '15', '30', '60', '240', 'D', 'W']);
  assert.equal(isValidTimeframe('15'), true);
  assert.equal(isValidTimeframe('D'), true);
  assert.equal(isValidTimeframe('invalid'), false);
});

test('JCI uses English naming with the legacy-free id', () => {
  const jci = getAssetBySymbol('jci');
  assert.ok(jci);
  assert.equal(jci.symbol, '^JKSE');
  assert.equal(jci.shortName, 'JCI');
  assert.deepEqual(
    TIMEFRAME_OPTIONS.map((t) => t.label),
    ['1m', '5m', '15m', '30m', '1H', '4H', '1D', '1W']
  );
});
