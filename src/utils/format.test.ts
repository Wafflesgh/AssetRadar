/** format.test.ts — Tests for price/percentage formatting and the gold conversion formula. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRupiah,
  formatUsdPerOz,
  formatPoints,
  formatPercent,
  formatNumber,
  convertXauUsdToIdrPerGram,
} from './format.ts';

test('formatRupiah formats numbers with English separators and no space', () => {
  assert.equal(formatRupiah(1234567), 'Rp1,234,567');
  assert.equal(formatRupiah(15850, 2), 'Rp15,850.00');
  assert.equal(formatRupiah(-500), '-Rp500');
  assert.equal(formatRupiah(NaN), '—');
});

test('formatPercent formats positive, negative, and zero percentages', () => {
  assert.equal(formatPercent(1.25), '+1.25%');
  assert.equal(formatPercent(-3.4), '-3.40%');
  assert.equal(formatPercent(0), '0.00%');
  assert.equal(formatPercent(undefined), '—');
});

test('formatPoints, formatNumber and formatUsdPerOz use a decimal point', () => {
  assert.equal(formatPoints(7321.456), '7,321.46');
  assert.equal(formatUsdPerOz(2750.5), 'US$2,750.50/oz');
  assert.equal(formatNumber(1480501000), '1,480,501,000');
  assert.equal(formatNumber(0.5, 2), '0.50');
});

test('convertXauUsdToIdrPerGram applies exact troy ounce conversion formula', () => {
  const xauUsd = 2700;
  const usdIdr = 15800;
  const expected = (2700 / 31.1034768) * 15800;
  assert.equal(Math.abs(convertXauUsdToIdrPerGram(xauUsd, usdIdr) - expected) < 0.001, true);
  assert.equal(convertXauUsdToIdrPerGram(0, 15800), 0);
});
