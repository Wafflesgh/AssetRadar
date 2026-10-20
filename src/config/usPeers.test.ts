/**
 * usPeers.test.ts — Tests for the S&P 500 peer group: the list is complete, every GICS sector is
 * present, the app's own US stocks are not duplicated, and peers can never be found as app assets.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASSETS, getAssetBySymbol } from './assets.ts';
import { SP500_GICS, usPeerAssets } from './usPeers.ts';

test('S&P 500 list covers ~500 stocks and the 11 GICS sectors', () => {
  assert.ok(SP500_GICS.size >= 480);
  assert.equal(new Set([...SP500_GICS.values()].map((g) => g.sector)).size, 11);
  assert.equal(SP500_GICS.get('BRK-B')?.sector, 'Financials');
});

test('peers exclude the app US stocks and never resolve as app assets', () => {
  const core = ASSETS.filter((a) => a.group === 'usStock');
  const peers = usPeerAssets(core);
  const coreTickers = new Set(core.map((a) => a.yahooSymbol));
  assert.ok(peers.every((p) => !coreTickers.has(p.yahooSymbol)));
  assert.ok(peers.length >= 450);
  assert.ok(peers.every((p) => p.symbol.startsWith('peer:') && getAssetBySymbol(p.symbol) === undefined));
  assert.ok(peers.every((p) => p.group === 'usStock' && p.industry && p.sector));
});
