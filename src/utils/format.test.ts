import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRupiah,
  formatUsdPerOz,
  formatPoints,
  formatPercent,
  convertXauUsdToIdrPerGram,
} from './format.ts';

test('formatRupiah formats numbers using id-ID standard without spaces', () => {
  assert.equal(formatRupiah(1234567), 'Rp1.234.567');
  assert.equal(formatRupiah(15850, 2), 'Rp15.850,00');
  assert.equal(formatRupiah(NaN), '—');
});

test('formatPercent formats positive, negative, and zero percentages in id-ID', () => {
  assert.equal(formatPercent(1.25), '+1,25%');
  assert.equal(formatPercent(-3.4), '-3,40%');
  assert.equal(formatPercent(0), '0,00%');
  assert.equal(formatPercent(undefined), '—');
});

test('formatPoints and formatUsdPerOz format decimals with comma separator', () => {
  assert.equal(formatPoints(7321.456), '7.321,46');
  assert.equal(formatUsdPerOz(2750.5), 'US$2.750,50/oz');
});

test('convertXauUsdToIdrPerGram applies exact troy ounce conversion formula', () => {
  const xauUsd = 2700;
  const usdIdr = 15800;
  const expected = (2700 / 31.1034768) * 15800;
  assert.equal(Math.abs(convertXauUsdToIdrPerGram(xauUsd, usdIdr) - expected) < 0.001, true);
  assert.equal(convertXauUsdToIdrPerGram(0, 15800), 0);
});
