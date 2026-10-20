/**
 * backtest.test.ts — Tests for the backtester: signals at the close are executed at the next
 * open (no look-ahead), costs and IDX lot rounding, stop-loss fills (gap at the open), take-profit,
 * statistics, buy & hold and the in-sample / out-of-sample split.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { affordable, backtestWarnings, computeStats, conditionAt, runBacktest, splitTest, validateStrategy, type OhlcBar, type Strategy } from './backtest.ts';

const day = (i: number) => new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
const bar = (i: number, close: number, over: Partial<OhlcBar> = {}): OhlcBar => ({ date: day(i), open: close, high: close, low: close, close, ...over });

const base: Strategy = {
  id: 's',
  name: 's',
  entry: [{ type: 'priceVsMa', period: 2, dir: 'above' }],
  exit: [{ type: 'priceVsMa', period: 2, dir: 'below' }],
  buyCostPct: 0,
  sellCostPct: 0,
  lotSize: 1,
  capital: 1000,
};

test('a signal at the close is filled at the next open, never at the same close', () => {
  // Close jumps on day 2 (signal), day 3 opens at 110 → that is the entry price
  const bars = [bar(0, 100), bar(1, 100), bar(2, 105), bar(3, 120, { open: 110 }), bar(4, 120)];
  const r = runBacktest(bars, base);
  assert.equal(r.trades.length, 1);
  assert.equal(r.trades[0].entryDate, day(3));
  assert.equal(r.trades[0].entryPrice, 110);
  assert.equal(r.trades[0].reason, 'open');
  // Changing a future bar must not change earlier decisions
  const changed = runBacktest([...bars.slice(0, 4), bar(4, 50)], base);
  assert.equal(changed.trades[0].entryDate, day(3));
});

test('no order is placed on the last bar', () => {
  const r = runBacktest([bar(0, 100), bar(1, 100), bar(2, 105)], base);
  assert.equal(r.trades.length, 0);
});

test('costs and IDX lots', () => {
  assert.equal(affordable(1_000_000, 1000, 0.15, 100), 900, '1,000 shares would cost 1,001,500');
  assert.equal(affordable(1000, 3, 0, 0), 1000 / 3, 'fractional when lot size is 0');
  const s: Strategy = { ...base, buyCostPct: 0.15, sellCostPct: 0.25, lotSize: 100, capital: 1_000_000 };
  const bars = [bar(0, 1000), bar(1, 1000), bar(2, 1010), bar(3, 1100, { open: 1000 }), bar(4, 1000), bar(5, 1000)];
  const r = runBacktest(bars, s);
  const t = r.trades[0];
  assert.equal(t.quantity, 900);
  assert.equal(t.exitDate, day(5), 'exit signal on day 4 → sold at the day-5 open');
  const cost = 900 * 1000 * 1.0015;
  const proceeds = 900 * 1000 * (1 - 0.0025);
  assert.ok(Math.abs((t.ret as number) - (proceeds / cost - 1)) < 1e-12);
  assert.ok(Math.abs(r.equity[r.equity.length - 1].equity - (1_000_000 - cost + proceeds)) < 1e-6);
});

test('stop-loss: filled at the stop, or at the open when the price gaps below it', () => {
  const s: Strategy = { ...base, exit: [], stopLossPct: 10 };
  const bars = [bar(0, 100), bar(1, 100), bar(2, 105), bar(3, 100, { open: 100 }), bar(4, 95, { low: 85 }), bar(5, 95)];
  const r = runBacktest(bars, s);
  assert.equal(r.trades[0].reason, 'stop-loss');
  assert.equal(r.trades[0].exitPrice, 90);
  const gap = runBacktest([...bars.slice(0, 4), bar(4, 80, { open: 80, low: 78 }), bar(5, 80)], s);
  assert.equal(gap.trades[0].exitPrice, 80);
});

test('take-profit', () => {
  const s: Strategy = { ...base, exit: [], takeProfitPct: 20 };
  const r = runBacktest([bar(0, 100), bar(1, 100), bar(2, 105), bar(3, 100, { open: 100 }), bar(4, 110, { high: 125 }), bar(5, 110)], s);
  assert.equal(r.trades[0].reason, 'take-profit');
  assert.equal(r.trades[0].exitPrice, 120);
  assert.ok(Math.abs((r.trades[0].ret as number) - 0.2) < 1e-12);
});

test('conditions: MA cross is an event, breakout uses earlier days only', () => {
  const closes = [10, 10, 10, 9, 12, 13];
  const cross = { type: 'maCross' as const, fast: 1, slow: 3, dir: 'above' as const };
  assert.equal(conditionAt(cross, closes, 4), true);
  assert.equal(conditionAt(cross, closes, 5), false, 'already above: no new cross');
  assert.equal(conditionAt({ type: 'breakout', days: 3, dir: 'high' }, closes, 4), true);
  assert.equal(conditionAt({ type: 'breakout', days: 3, dir: 'high' }, [10, 10, 10, 10], 3), false);
});

test('statistics', () => {
  const s = computeStats([100, 120, 90, 135], [day(0), day(1), day(2), day(3)], [
    { entryDate: day(0), entryPrice: 1, exitDate: day(1), exitPrice: 1, quantity: 1, ret: 0.2, reason: 'signal' },
    { entryDate: day(1), entryPrice: 1, exitDate: day(2), exitPrice: 1, quantity: 1, ret: -0.1, reason: 'signal' },
    { entryDate: day(2), entryPrice: 1, exitDate: null, exitPrice: null, quantity: 1, ret: null, reason: 'open' },
  ], 2);
  assert.ok(Math.abs(s.totalReturn - 0.35) < 1e-12);
  assert.ok(Math.abs(s.maxDrawdown - (90 / 120 - 1)) < 1e-12);
  assert.equal(s.trades, 2);
  assert.equal(s.winRate, 0.5);
  assert.ok(Math.abs((s.avgTrade as number) - 0.05) < 1e-12);
  assert.equal(s.exposure, 0.5);
  assert.equal(s.cagr, null, 'under a year');
});

test('buy & hold, split test and warnings', () => {
  const bars = Array.from({ length: 200 }, (_, i) => bar(i, 100 + Math.sin(i / 5) * 10 + i * 0.1));
  const r = runBacktest(bars, base);
  assert.ok(Math.abs(r.equity[0].buyHold - 1000 * (bars[0].close / bars[0].open)) < 1e-9);
  const split = splitTest(bars, base, 0);
  assert.ok(split);
  assert.equal(split?.splitDate, bars[100].date);
  assert.equal(split?.inSample.equity.length, 100);
  assert.equal(split?.outOfSample.equity[0].date, bars[100].date);
  assert.ok(backtestWarnings(r, split).length >= 1);
  assert.equal(splitTest(bars.slice(0, 50), base, 0), null);
});

test('validation', () => {
  assert.deepEqual(validateStrategy({ ...base, entry: [] }), ['Add at least one entry rule.']);
  assert.ok(validateStrategy({ ...base, entry: [{ type: 'maCross', fast: 50, slow: 20, dir: 'above' }] }).length === 1);
  assert.deepEqual(validateStrategy({ ...base, exit: [], stopLossPct: 5 }), []);
});
