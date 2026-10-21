/**
 * liveProxies.test.ts — Tests for the live Binance mappings: every code is an app asset, contracts
 * are USDT perpetuals, the plausibility guard and the 24h change kept against the official close.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASSETS, getAssetBySymbol } from './assets.ts';
import { LIVE_INDICATIONS, LIVE_MAIN_FUTURES, indicationPlausible, withLivePrice } from './liveProxies.ts';

test('mappings point at app assets and USDT contracts', () => {
  const codes = new Set(ASSETS.map((a) => a.code));
  for (const [code, p] of Object.entries(LIVE_INDICATIONS)) {
    assert.ok(codes.has(code), `unknown asset code ${code}`);
    assert.match(p.contract, /^[A-Z0-9]+USDT$/);
  }
  for (const [sym, contract] of Object.entries(LIVE_MAIN_FUTURES)) {
    assert.ok(getAssetBySymbol(sym), `unknown symbol ${sym}`);
    assert.match(contract, /USDT$/);
  }
});

test('indications far from the official price are hidden (except ETFs)', () => {
  assert.equal(indicationPlausible('stock', 220.4, 216.5), true);
  assert.equal(indicationPlausible('commodity', 3.18, 2.86), false);
  assert.equal(indicationPlausible('etf', 772, 7712), true);
  assert.equal(indicationPlausible('stock', 100, null), true);
  assert.equal(indicationPlausible('stock', NaN, 100), false);
});

test('live price keeps the 24h change measured against the official close', () => {
  const r = withLivePrice(110, 10, 121);
  assert.equal(r.price, 121);
  assert.ok(Math.abs((r.changePct24h ?? 0) - 21) < 1e-9);
  assert.deepEqual(withLivePrice(110, undefined, 120), { price: 120, changePct24h: undefined });
});
