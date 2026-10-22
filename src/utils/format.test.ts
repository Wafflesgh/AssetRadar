/** format.test.ts — Tests for price/percentage formatting and the gold conversion formula. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRupiah,
  formatUsdPerOz,
  formatPoints,
  formatPercent,
  formatNumber,
  formatPrice,
  formatUsdCompact,
  convertXauUsdToIdrPerGram,
  formatIdrCompact,
} from './format.ts';

test('formatRupiah formats numbers with English separators and no space', () => {
  assert.equal(formatRupiah(1234567), 'Rp1,234,567');
  assert.equal(formatRupiah(15850, 2), 'Rp15,850.00');
  assert.equal(formatRupiah(-5000), '-Rp5,000');
  assert.equal(formatRupiah(114.031), 'Rp114.03');
  assert.equal(formatRupiah(114.031, 0), 'Rp114');
  assert.equal(formatRupiah(NaN), '—');
  assert.equal(formatRupiah(0.16342), 'Rp0.1634');
  assert.equal(formatRupiah(0.0012345), 'Rp0.001235');
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

test('formatPrice handles every quote currency and unit', () => {
  assert.equal(formatPrice(2750.5, 'USD', '/oz'), 'US$2,750.50/oz');
  assert.equal(formatPrice(0.1234567, 'USD'), 'US$0.1235');
  assert.equal(formatPrice(305.55, 'USX', '/lb'), '305.55¢/lb');
  assert.equal(formatPrice(1480501000, 'IDR'), 'Rp1,480,501,000');
  assert.equal(formatPrice(7321.456, 'PTS'), '7,321.46');
  assert.equal(formatPrice(85300, 'KRW'), 'KRW 85,300');
  assert.equal(formatPrice(27.4, 'SAR'), 'SAR 27.40');
  assert.equal(formatUsdCompact(29.24e12), '$29.24T');
  assert.equal(formatUsdCompact(845.3e9), '$845.3B');
});

test('formatIdrCompact uses T/B/M', () => {
  assert.equal(formatIdrCompact(588.2e12), 'Rp588.2T');
  assert.equal(formatIdrCompact(3.454e12), 'Rp3.45T');
  assert.equal(formatIdrCompact(845.3e9), 'Rp845.3B');
  assert.equal(formatIdrCompact(null), '—');
});

test('Indonesian number locale: dot thousands, comma decimals; back to en-US', async () => {
  const { setNumberLocale } = await import('./format.ts');
  setNumberLocale('id-ID');
  try {
    assert.equal(formatRupiah(1234567), 'Rp1.234.567');
    assert.equal(formatPercent(1.25), '+1,25%');
    assert.equal(formatPercent(0), '0,00%');
    assert.equal(formatIdrCompact(845.3e9), 'Rp845,3M');
    assert.equal(formatIdrCompact(12.1e6), 'Rp12,1Jt');
    assert.equal(formatPrice(2750.5, 'USD', '/oz'), 'US$2.750,50/oz');
  } finally {
    setNumberLocale('en-US');
  }
  assert.equal(formatRupiah(1234567), 'Rp1,234,567');
});

test('crypto prices show in USD (Binance USDT when known) or in Rupiah', async () => {
  const { formatAssetPrice, formatTickPrice, setCryptoQuote, setUsdIdrRate, tickDisplayValue } = await import('./format.ts');
  const btc = { currency: 'IDR', group: 'crypto' };
  const bbca = { currency: 'IDR', group: 'idStock' };
  setUsdIdrRate(16000);
  setCryptoQuote('USD');
  try {
    // Exact Binance price when the tick has one, else Rupiah ÷ USD/IDR
    assert.equal(formatTickPrice({ price: 1_600_000_000, priceUsdt: 100_123.45 }, btc), 'US$100,123.45');
    assert.equal(formatTickPrice({ price: 1_600_000_000 }, btc), 'US$100,000.00');
    assert.equal(tickDisplayValue({ price: 0.32 }, btc), 0.00002);
    assert.equal(formatAssetPrice(0.32, btc), 'US$0.00002000');
    // Alert thresholds stay in Rupiah; stocks are never converted
    assert.equal(formatAssetPrice(1_600_000_000, btc, { native: true }), 'Rp1,600,000,000');
    assert.equal(formatTickPrice({ price: 9000 }, bbca), 'Rp9,000');
    setCryptoQuote('IDR');
    assert.equal(formatTickPrice({ price: 1_600_000_000, priceUsdt: 100_123.45 }, btc), 'Rp1,600,000,000');
  } finally {
    setCryptoQuote('USD');
  }
});
