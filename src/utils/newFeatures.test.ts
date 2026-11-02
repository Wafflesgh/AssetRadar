/** newFeatures.test.ts — Tests for the dividend summary, the saving-plan simulator, the treemap layout and the stock story facts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dividendYieldPct, summarizeDividends, topYields, upcomingDividends, type DividendRow } from './dividendYield.ts';
import { simulateDca, valueOn, xirr } from './dca.ts';
import { heatColor, nestedTreemap, squarify } from './treemap.ts';
import { priceFacts, ratioYears, sentimentFacts } from './stockStory.ts';
import type { CalendarEvent } from './corporateCalendar.ts';
import type { TraceRow } from '../ai/recommendationTrace.ts';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const ev = (date: string, type: CalendarEvent['type'], amount?: number): CalendarEvent => ({ symbol: 'X.JK', date, type, ...(amount ? { amount } : {}) });

test('dividends: trailing 12 months, years paid, next ex-date and yield', () => {
  const events = [ev('2021-05-01', 'dividend', 50), ev('2022-05-01', 'dividend', 60), ev('2024-05-01', 'dividend', 70), ev('2025-04-20', 'dividend', 80), ev('2025-11-01', 'dividend', 20), ev('2026-05-10', 'exDividend'), ev('2026-05-20', 'dividendPayment')];
  const s = summarizeDividends('X.JK', events, '2026-02-01')!;
  assert.equal(s.ttm, 100);
  assert.equal(s.paymentsTtm, 2);
  // 2021–2025: paid in 2021, 2022, 2024, 2025
  assert.equal(s.yearsPaid, 4);
  assert.deepEqual(s.last, { date: '2025-11-01', amount: 20 });
  assert.deepEqual(s.next, { date: '2026-05-10', type: 'exDividend' });
  assert.deepEqual(s.byYear[0], { year: 2025, total: 100, count: 2 });
  assert.equal(summarizeDividends('Y.JK', [ev('2025-01-01', 'earnings')], '2026-02-01'), null);
  near(dividendYieldPct(100, 2000)!, 5);
  assert.equal(dividendYieldPct(100, null), null);

  const row = (symbol: string, yieldPct: number | null, yearsPaid: number, next: string | null): DividendRow => ({
    ...s,
    symbol,
    yieldPct,
    yearsPaid,
    price: 1,
    next: next ? { date: next, type: 'exDividend' } : null,
  });
  const rows = [row('A', 9, 1, '2026-02-10'), row('B', 6, 5, '2026-05-01'), row('C', 7, 3, null), row('D', null, 5, '2026-02-05')];
  assert.deepEqual(topYields(rows).map((r) => r.symbol), ['C', 'B']);
  assert.deepEqual(upcomingDividends(rows, '2026-02-01', 30).map((r) => r.symbol), ['D', 'A']);
});

test('saving plan: monthly buys on the first trading day, value and lump sum', () => {
  // Price doubles from 100 to 200 over 12 months; one bar on the 2nd of each month
  const bars = Array.from({ length: 13 }, (_, i) => {
    const d = new Date(Date.UTC(2025, i, 2));
    return { date: d.toISOString().slice(0, 10), close: 100 + (100 * i) / 12 };
  });
  const r = simulateDca({ bars, monthly: 1_000_000, years: 1 })!;
  assert.equal(r.buys, 13);
  assert.equal(r.invested, 13_000_000);
  near(r.value, r.units * 200);
  assert.ok(r.ret > 0 && r.lumpSum.ret > r.ret, 'a steady rise favours investing everything at the start');
  near(r.lumpSum.value, 13_000_000 * 2);
  assert.ok(r.annualized! > 0);
  assert.equal(r.maxDrawdown, 0);
  // A dollar asset bought at a rate series; no rate yet → no buy that month
  const fx = [{ date: '2025-03-01', close: 16_000 }];
  const usd = simulateDca({ bars, monthly: 1_000_000, years: 1, fx, feeRate: 0.01 })!;
  assert.equal(usd.buys, 11);
  assert.equal(usd.startDate, '2025-03-02');
  assert.equal(valueOn(fx, '2025-02-01'), null);
  assert.equal(simulateDca({ bars: [], monthly: 1, years: 1 }), null);
  // 10% over exactly one year
  near(xirr([{ date: '2024-01-01', amount: -100 }, { date: '2024-12-31', amount: 110 }])!, 0.1, 1e-3);
});

test('treemap: tiles fill the area in proportion and stay inside', () => {
  const items = [6, 6, 4, 3, 2, 2, 1].map((v, i) => ({ id: `i${i}`, value: v }));
  const rects = squarify(items, 600, 400);
  assert.equal(rects.length, 7);
  const area = rects.reduce((s, r) => s + r.w * r.h, 0);
  near(area, 240_000, 1e-3);
  for (const r of rects) {
    assert.ok(r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= 600 + 1e-6 && r.y + r.h <= 400 + 1e-6);
    const v = items.find((i) => i.id === r.id)!.value;
    near((r.w * r.h) / 240_000, v / 24, 1e-6);
  }
  assert.deepEqual(squarify([{ id: 'z', value: 0 }], 10, 10), []);
  const nested = nestedTreemap([{ id: 'g1', items: items.slice(0, 3) }, { id: 'g2', items: items.slice(3) }], 600, 400, 20);
  assert.equal(nested.length, 2);
  assert.ok(nested[0].items.every((r) => r.y >= nested[0].group.y + 20 - 1e-9));
  assert.equal(heatColor(0), 'var(--bg-surface-subtle)');
  assert.match(heatColor(5), /color-up\) 90%/);
  assert.match(heatColor(-1), /color-down\)/);
});

test('story: price facts, sentiment changes and annual ratios', () => {
  const bars: Array<{ date: string; close: number }> = [];
  for (let y = 2020; y <= 2026; y++) for (const m of ['01', '06', '12']) bars.push({ date: `${y}-${m}-15`, close: 100 + (y - 2020) * 10 + (m === '06' ? -30 : 0) });
  bars.push({ date: '2026-12-20', close: 180 });
  const p = priceFacts(bars)!;
  assert.equal(p.last, 180);
  // A year before 2026-12-20: the 2025-12-15 close (150)
  near(p.change1y!, 180 / 150 - 1);
  assert.equal(p.high52, 180);
  assert.equal(p.fromHigh, 0);
  assert.ok(p.maxDrawdown && p.maxDrawdown.pct < 0);
  assert.ok(p.yearly.length >= 5);
  assert.ok(p.weekly.length <= bars.length);

  const call = (date: string, horizon: string, c: string, hit: boolean | null = null): TraceRow => ({
    date,
    method: 'sentiment',
    horizon,
    call: c,
    score: 60,
    chance: null,
    price: 1,
    sinceNow: null,
    dueBars: 5,
    outcome: hit === null ? null : { dueDate: date, ret: 0.01, up: true, hit },
  });
  const s = sentimentFacts([call('2026-01-01', 'short', 'Neutral', true), call('2026-01-02', 'short', 'Bullish', false), call('2026-01-03', 'short', 'Bullish'), call('2026-01-03', 'long', 'Bearish')]);
  assert.equal(s.latest.short?.label, 'Bullish');
  assert.deepEqual(s.lastChange.short, { date: '2026-01-02', from: 'Neutral', to: 'Bullish' });
  assert.deepEqual(s.accuracy.short, { scored: 2, hits: 1 });
  assert.equal(s.lastChange.long, undefined);
  assert.equal(s.timeline.long.length, 1);

  const ratios = ratioYears([
    { end: '2024-12-31', months: 12, ratios: { roe: 0.2 } },
    { end: '2025-06-30', months: 6, ratios: { roe: 0.1 } },
    { end: '2025-12-31', months: 12, ratios: { roe: 0.22 } },
  ]);
  assert.deepEqual(ratios.map((r) => r.year), ['2025', '2024']);
});
