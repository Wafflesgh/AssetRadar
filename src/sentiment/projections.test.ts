/** projections.test.ts — Tests for ranges and their calibration, ATR, levels, pattern targets and annual volatility (synthetic data). */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { OhlcCandle } from '../config/assets.ts';
import {
  annualVol,
  atr,
  classicPivots,
  ewmaVol,
  likelyRange,
  measuredMove,
  patternTargets,
  supportResistance,
  upsideDownside,
  volumeNodes,
} from './projections.ts';

/** Deterministic pseudo-random walk (no Math.random, so tests are stable). */
function walk(n: number, seed = 7, vol = 0.015): number[] {
  let x = seed;
  const rnd = () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
  const out = [100];
  for (let i = 1; i < n; i++) {
    // Sum of uniforms ≈ normal
    const z = (rnd() + rnd() + rnd() + rnd() - 2) * Math.sqrt(3);
    out.push(out[i - 1] * Math.exp(vol * z));
  }
  return out;
}

const candlesOf = (closes: number[]): OhlcCandle[] =>
  closes.map((c, i) => ({ time: 1_600_000_000 + i * 86_400, open: i ? closes[i - 1] : c, high: c * 1.01, low: c * 0.99, close: c, volume: 1000 + (i % 50) * 10 }));

test('likely ranges are ordered, scaled by EWMA volatility, and roughly calibrated on a random walk', () => {
  const closes = walk(1500);
  const r = likelyRange(closes, 5);
  assert.ok(r);
  const price = closes[closes.length - 1];
  assert.ok(r.low90 < r.low68 && r.low68 < price && price < r.high68 && r.high68 < r.high90);
  assert.ok(r.calibration.samples > 100);
  // A stationary random walk should land near the nominal coverage
  assert.ok(Math.abs((r.calibration.hit68 ?? 0) - 68) < 10, String(r.calibration.hit68));
  assert.ok(Math.abs((r.calibration.hit90 ?? 0) - 90) < 8, String(r.calibration.hit90));
  assert.equal(likelyRange(closes.slice(0, 300), 5), null); // under 2 years of daily data
  assert.ok((ewmaVol(closes) ?? 0) > 0);
});

test('calibration uses only past data (a crash after the as-of date cannot change past ranges)', () => {
  const closes = walk(1300);
  const a = likelyRange(closes.slice(0, 1200), 5);
  const crashed = [...closes.slice(0, 1200), ...closes.slice(1200).map((c) => c * 0.3)];
  const b = likelyRange(crashed.slice(0, 1200), 5);
  assert.deepEqual(a, b);
});

test('ATR, classic pivots and volume nodes', () => {
  const c: OhlcCandle[] = Array.from({ length: 30 }, (_, i) => ({ time: i, open: 10, high: 11, low: 9, close: 10 }));
  assert.equal(atr(c), 2);
  assert.equal(atr(c.slice(0, 10)), null);
  const p = classicPivots(110, 90, 100);
  assert.equal(p.P, 100);
  assert.equal(p.R1, 110);
  assert.equal(p.S1, 90);
  assert.equal(p.R2, 120);
  const nodes = volumeNodes(candlesOf(walk(300)));
  assert.ok(nodes.length >= 1 && nodes.length <= 3);
});

test('support/resistance levels merge, sit on the right side of the price, and Fibonacci is optional', () => {
  const candles = candlesOf(walk(600, 11));
  const price = candles[candles.length - 1].close;
  const { levels, atr: a } = supportResistance(candles);
  assert.ok(a && levels.length > 3);
  for (const l of levels) assert.equal(l.kind, l.price >= price ? 'resistance' : 'support');
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i].price - levels[i - 1].price > 0.5 * (a as number) - 1e-9);
  assert.ok(!levels.some((l) => l.sources.includes('fibonacci')));
  assert.ok(supportResistance(candles, { fibonacci: true }).levels.some((l) => l.sources.includes('fibonacci')));
  const ud = upsideDownside(levels, price);
  assert.ok(ud.upsidePct === null || ud.upsidePct > 0);
  assert.ok(ud.downsidePct === null || ud.downsidePct < 0);
});

test('measured moves and pattern hit rates need enough past cases', () => {
  const closes = [...Array.from({ length: 100 }, (_, i) => 100 + i * 0.1), ...walk(200, 3).map((x) => x + 10)];
  const top = { id: 'double-top', name: 'Double top', bias: -1 as const, status: 'confirmed' as const, keyLevel: 100, description: '' };
  const mm = measuredMove(top, closes);
  assert.ok(mm !== null && mm < 100);
  assert.equal(measuredMove({ ...top, id: 'golden-cross' }, closes), null);
  for (const t of patternTargets(walk(700, 5))) {
    assert.ok(t.hitRate === null || t.pastCases >= 20);
  }
});

test('annual volatility of a random walk', () => {
  assert.ok((annualVol(walk(800)) ?? 0) > 0.1);
});
