/** concentration.test.ts — Concentration math, classification and missing valuation handling. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASSETS } from '../config/assets.ts';
import { concentration, DIMENSIONS, type ConcentrationPosition } from './concentration.ts';

const base = ASSETS.find((a) => a.code === 'BBCA')!;
function position(symbol: string, value: number | undefined = 100): ConcentrationPosition {
  return { asset: { ...base, symbol, code: symbol }, v: { symbol, quantity: 1, costBasis: 100, avgCost: 100, realized: 0, buys: 1, sells: 0, currency: 'IDR', marketValueIdr: value } };
}

test('one, two and ten equal holdings produce expected asset concentration', () => {
  for (const [n, hhi, level] of [[1, 1, 'concentrated'], [2, 0.5, 'concentrated'], [10, 0.1, 'diversified']] as const) {
    const result = concentration(Array.from({ length: n }, (_, i) => position(`asset${i}`)));
    assert.ok(Math.abs(result.asset.hhi! - hhi) < 1e-12);
    assert.ok(Math.abs(result.asset.effectiveN! - n) < 1e-12);
    assert.equal(result.asset.level, level);
    assert.ok(Math.abs(result.asset.items.reduce((s, i) => s + i.weight, 0) - 1) < 1e-12);
  }
  assert.equal(concentration(Array.from({ length: 4 }, (_, i) => position(`a${i}`))).asset.level, 'moderate');
});

test('missing prices are excluded; closed holdings and empty portfolios have no concentration', () => {
  const missing = position('missing'); missing.v.marketValueIdr = undefined;
  const closed = position('closed'); closed.v.quantity = 0;
  const result = concentration([position('BBCA'), missing, closed]);
  assert.equal(result.unpriced, 1);
  assert.equal(result.asset.hhi, 1);
  for (const dim of DIMENSIONS) {
    assert.equal(concentration([])[dim].hhi, null);
    assert.deepEqual(concentration([missing])[dim].items, []);
  }
});

test('sectors use IDX-IC and GICS sectors, unknown sectors remain unclassified', () => {
  assert.equal(concentration([position('BBCA')]).sector.top?.key, 'Financials');
  assert.equal(concentration([position('UNKNOWN')]).sector.top?.key, 'unclassified');
  const apple = position('AAPL'); apple.asset = ASSETS.find((a) => a.code === 'AAPL')!;
  assert.equal(concentration([apple]).sector.top?.key, 'Information Technology');
  assert.equal(concentration([apple]).country.top?.key, 'US');
  assert.equal(concentration([apple]).currency.top?.key, 'USD');
  const crypto = position('BTC'); crypto.asset = ASSETS.find((a) => a.code === 'BTC')!;
  assert.equal(concentration([crypto]).country.top?.key, 'global');
});

test('buckets aggregate duplicate assets and sort by value', () => {
  const result = concentration([position('BBCA', 100), position('BBCA', 200), position('BBRI', 100)]);
  assert.equal(result.asset.items.length, 2);
  assert.equal(result.asset.top?.weight, 0.75);
  assert.equal(result.sector.top?.weight, 1);
});
