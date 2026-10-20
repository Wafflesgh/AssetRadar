/**
 * alerts.test.ts — Tests for alert evaluation: price crossing, one-time vs repeating with the
 * minimum gap, daily move re-arming, calendar events tomorrow (WIB), news and geopolitical
 * alerts, quiet hours and the notification throttle.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  afterFire,
  calendarEventsTomorrow,
  evaluateAlert,
  inQuietHours,
  parseAlertSettings,
  throttle,
  validateAlert,
  type AlertState,
  type UserAlert,
} from './alerts.ts';
import type { CalendarEvent } from './corporateCalendar.ts';
import type { MarketNewsItem } from '../config/assets.ts';

const T0 = Date.UTC(2026, 9, 20, 3, 0); // 10:00 WIB, Tue 20 Oct 2026
const MIN = 60_000;
const base = (over: Partial<UserAlert>): UserAlert => ({
  id: 'a1',
  kind: 'priceAbove',
  symbol: 'BTC/IDR',
  value: 100,
  repeat: false,
  cooldownMin: 60,
  active: true,
  createdAt: T0 - 1000,
  ...over,
});

function run(alert: UserAlert, prices: number[], startState: AlertState = {}, stepMs = MIN) {
  let state = startState;
  const fired: number[] = [];
  prices.forEach((price, i) => {
    const r = evaluateAlert(alert, state, { now: T0 + i * stepMs, price });
    state = r.state;
    if (r.fire) fired.push(i);
  });
  return { fired, state };
}

test('price above fires only when the price crosses the level', () => {
  assert.deepEqual(run(base({}), [90, 95, 101, 105]).fired, [2]);
  // Already above when first seen: waits for a new cross
  assert.deepEqual(run(base({}), [120, 110, 105]).fired, []);
  assert.deepEqual(run(base({ kind: 'priceBelow', value: 50 }), [60, 55, 50, 40]).fired, [2]);
});

test('repeating alerts respect the minimum gap of one hour', () => {
  const alert = base({ repeat: true, cooldownMin: 10 }); // below the minimum → 60 min
  // Crosses up at 2, down, up again 2 minutes later (blocked), and after an hour (allowed)
  const prices = [90, 95, 101, 90, 102, ...Array(60).fill(90), 103];
  assert.deepEqual(run(alert, prices).fired, [2, 65]);
});

test('one-time alerts switch off after firing', () => {
  assert.equal(afterFire(base({ repeat: false })).active, false);
  assert.equal(afterFire(base({ repeat: true })).active, true);
  assert.deepEqual(evaluateAlert(base({ active: false }), { lastPrice: 90 }, { now: T0, price: 120 }).fire, null);
});

test('daily move fires once until the move falls back under the threshold', () => {
  const alert = base({ kind: 'dailyMove', value: 5, repeat: true });
  let state: AlertState = {};
  const fires: boolean[] = [];
  for (const [i, chg] of [2, 6, 7, 3, -8].entries()) {
    const r = evaluateAlert(alert, state, { now: T0 + i * 2 * 3600_000, changePct24h: chg });
    state = r.state;
    fires.push(Boolean(r.fire));
  }
  assert.deepEqual(fires, [false, true, false, false, true]);
});

test('calendar: ex-dividend and earnings tomorrow in WIB, each event once', () => {
  const events: CalendarEvent[] = [
    { symbol: 'BBCA.JK', type: 'exDividend', date: '2026-10-21', amount: 50 },
    { symbol: 'BBCA.JK', type: 'earnings', date: '2026-10-21' },
    { symbol: 'TLKM.JK', type: 'exDividend', date: '2026-10-21' },
    { symbol: 'BBCA.JK', type: 'dividendPayment', date: '2026-10-21' },
    { symbol: 'BBCA.JK', type: 'exDividend', date: '2026-10-22' },
  ];
  assert.equal(calendarEventsTomorrow(events, new Set(['BBCA.JK']), T0).length, 2);
  // 23:30 WIB on the 20th is still the 20th → tomorrow = 21st; 00:30 WIB on the 21st → 22nd
  assert.equal(calendarEventsTomorrow(events, null, Date.UTC(2026, 9, 20, 16, 30)).length, 3);
  assert.equal(calendarEventsTomorrow(events, null, Date.UTC(2026, 9, 20, 17, 30)).length, 1);
  const alert = base({ kind: 'calendar', symbol: 'BBCA.JK' });
  const first = evaluateAlert(alert, {}, { now: T0, events });
  assert.equal(first.fire?.title, 'BBCA.JK: ex-dividend & earnings report tomorrow');
  assert.equal(evaluateAlert(alert, first.state, { now: T0 + MIN, events }).fire, null, 'not repeated');
});

const news = (over: Partial<MarketNewsItem>): MarketNewsItem => ({
  id: 'n1',
  title: 'BCA posts record profit',
  link: 'https://example.com',
  source: 'Example',
  publishedAt: '',
  publishedAtMs: T0 - 5 * MIN,
  firstSeenAt: T0 - 4 * MIN,
  assetTags: ['BBCA'],
  sentiment: 'Neutral',
  ...over,
});

test('news alerts fire for new tagged headlines after the alert was created', () => {
  const alert = base({ kind: 'news', symbol: 'BBCA.JK', createdAt: T0 - 10 * MIN, repeat: true });
  const r = evaluateAlert(alert, {}, { now: T0, news: [news({}), news({ id: 'n2', assetTags: ['BBRI'] })], code: 'BBCA', name: 'BCA' });
  assert.ok(r.fire?.body.startsWith('BCA posts record profit'));
  assert.equal(evaluateAlert(alert, r.state, { now: T0 + MIN, news: [news({})], code: 'BBCA' }).fire, null, 'same headline once');
  const old = base({ kind: 'news', symbol: 'BBCA.JK', createdAt: T0 });
  assert.equal(evaluateAlert(old, {}, { now: T0, news: [news({})], code: 'BBCA' }).fire, null, 'headline older than the alert');
});

test('geo alerts fire once per high alert', () => {
  const alert = base({ kind: 'geo', symbol: undefined, repeat: true, createdAt: T0 - 60 * MIN });
  const item = news({ id: 'g1', geoAlert: 'high', title: 'War breaks out', assetTags: [] });
  const r = evaluateAlert(alert, {}, { now: T0, news: [item, news({ id: 'g2', geoAlert: 'elevated' })] });
  assert.ok(r.fire);
  assert.equal(evaluateAlert(alert, r.state, { now: T0 + 2 * 3600_000, news: [item] }).fire, null);
});

test('quiet hours (WIB), including a window past midnight', () => {
  const at = (h: number, m = 0) => Date.UTC(2026, 9, 20, h - 7 < 0 ? h + 17 : h - 7, m);
  const q = { enabled: true, start: '22:00', end: '06:00' };
  assert.ok(inQuietHours(at(23), q));
  assert.ok(inQuietHours(at(5, 59), q));
  assert.ok(!inQuietHours(at(6), q));
  assert.ok(!inQuietHours(at(12), q));
  assert.ok(!inQuietHours(at(23), { ...q, enabled: false }));
  assert.ok(inQuietHours(at(13), { enabled: true, start: '12:00', end: '14:00' }));
});

test('throttle allows at most 5 notifications per minute', () => {
  let sent: number[] = [];
  const allowed: boolean[] = [];
  for (let i = 0; i < 7; i++) {
    const r = throttle(sent, T0 + i * 1000);
    sent = r.sentAt;
    allowed.push(r.allowed);
  }
  assert.deepEqual(allowed, [true, true, true, true, true, false, false]);
  assert.ok(throttle(sent, T0 + 61_000).allowed);
});

test('validation and settings parsing', () => {
  assert.deepEqual(validateAlert({ kind: 'priceAbove', symbol: 'BTC/IDR', value: 0 }), ['Enter a price above 0.']);
  assert.deepEqual(validateAlert({ kind: 'geo' }), []);
  assert.deepEqual(parseAlertSettings({ quiet: { enabled: true, start: '9:00' } }).quiet, { enabled: true, start: '22:00', end: '06:00' });
});

test('notification and validation texts follow the chosen language', () => {
  let state: AlertState = {};
  state = evaluateAlert(base({}), state, { now: T0, price: 90, name: 'BTC', lang: 'id' }).state;
  const r = evaluateAlert(base({}), state, { now: T0 + MIN, price: 101, name: 'BTC', lang: 'id' });
  assert.equal(r.fire?.title, 'BTC naik melewati 100');
  assert.match(r.fire?.body ?? '', /^Sekarang /);
  assert.deepEqual(validateAlert({ kind: 'priceAbove', symbol: 'BTC/IDR', value: 0 }, 'id'), ['Isi harga di atas 0.']);
});
