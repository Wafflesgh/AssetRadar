/** marketHours.test.ts — Tests for regular-session open/closed checks per venue. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isExchangeOpen } from './marketHours.ts';

// Monday 19 Oct 2026 is a weekday; New York is UTC-4, London UTC+1, Tokyo UTC+9 in October.
test('isExchangeOpen follows each venue local session', () => {
  assert.equal(isExchangeOpen('NYSE', Date.UTC(2026, 9, 19, 14, 0)), true); // 10:00 NY
  assert.equal(isExchangeOpen('NYSE', Date.UTC(2026, 9, 19, 12, 0)), false); // 08:00 NY
  assert.equal(isExchangeOpen('TSE', Date.UTC(2026, 9, 19, 1, 0)), true); // 10:00 Tokyo
  assert.equal(isExchangeOpen('TSE', Date.UTC(2026, 9, 19, 2, 45)), false); // 11:45 lunch
  assert.equal(isExchangeOpen('LSE', Date.UTC(2026, 9, 19, 8, 0)), true); // 09:00 London
  assert.equal(isExchangeOpen('HKEX', Date.UTC(2026, 9, 19, 4, 30)), false); // 12:30 lunch
  assert.equal(isExchangeOpen('IDX', Date.UTC(2026, 9, 18, 4, 0)), false); // Sunday
  assert.equal(isExchangeOpen('CRYPTO', Date.UTC(2026, 9, 18, 4, 0)), true);
});

test('FX trades 24/5 from Sunday 17:00 to Friday 17:00 New York time', () => {
  assert.equal(isExchangeOpen('FX', Date.UTC(2026, 9, 17, 12, 0)), false); // Saturday
  assert.equal(isExchangeOpen('FX', Date.UTC(2026, 9, 18, 20, 0)), false); // Sun 16:00 NY
  assert.equal(isExchangeOpen('FX', Date.UTC(2026, 9, 18, 22, 0)), true); // Sun 18:00 NY
  assert.equal(isExchangeOpen('FX', Date.UTC(2026, 9, 21, 3, 0)), true); // Tuesday
  assert.equal(isExchangeOpen('FX', Date.UTC(2026, 9, 23, 22, 0)), false); // Fri 18:00 NY
});

test('isExchangeOpen handles Sunday-Thursday venues and futures', () => {
  // Sunday 18 Oct 2026 11:00 Riyadh (08:00 UTC): Tadawul trades on Sundays
  assert.equal(isExchangeOpen('TADAWUL', Date.UTC(2026, 9, 18, 8, 0)), true);
  // Friday 23 Oct 2026 11:00 Riyadh: closed
  assert.equal(isExchangeOpen('TADAWUL', Date.UTC(2026, 9, 23, 8, 0)), false);
  assert.equal(isExchangeOpen('KRX', Date.UTC(2026, 9, 19, 2, 0)), true); // 11:00 Seoul
  assert.equal(isExchangeOpen('FUTURES', Date.UTC(2026, 9, 21, 3, 0)), true); // Tuesday
  assert.equal(isExchangeOpen('FUTURES', Date.UTC(2026, 9, 17, 12, 0)), false); // Saturday
});

test('relative time in Indonesian', async () => {
  const { setTimeLang, formatRelativeTime: rel } = await import('./marketHours.ts');
  setTimeLang('id');
  try {
    assert.equal(rel(1_000_000, 1_000_000 + 120_000), 'diperbarui 2 menit lalu');
  } finally {
    setTimeLang('en');
  }
  assert.equal(rel(1_000_000, 1_000_000 + 120_000), 'updated 2 minutes ago');
});
