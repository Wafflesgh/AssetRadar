/** monteCarlo.test.ts — the simulation is repeatable, follows the history it is given and refuses short histories. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { monteCarlo, seededRandom, seedOf } from './monteCarlo.ts';

const series = (n: number, move: (i: number) => number) => {
  const out = [100];
  for (let i = 1; i < n; i++) out.push(out[i - 1] * (1 + move(i)));
  return out;
};

test('the same seed gives the same result, another seed a different one', () => {
  const random = seededRandom(7);
  const closes = series(800, () => (random() - 0.5) * 0.04);
  const a = monteCarlo(closes, 21, seedOf('BBCA|2026-11-13'))!;
  const b = monteCarlo(closes, 21, seedOf('BBCA|2026-11-13'))!;
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.bands.p50, monteCarlo(closes, 21, seedOf('BBRI|2026-11-13'))!.bands.p50);
});

test('the past trend is removed: a history that only ever rises 0.1% a day gives a flat, certain path', () => {
  const r = monteCarlo(series(600, () => 0.001), 20, 1)!;
  for (const band of Object.values(r.bands)) assert.ok(Math.abs(band[20]) < 1e-6);
  assert.equal(r.bands.p50[0], 0);
  assert.equal(r.touchDown, 0);
  assert.equal(r.touchUp, 0);
  assert.ok(Math.abs(r.medianDrawdown) < 1e-6);
});

test('a strong past rise does not tilt the fan upward', () => {
  const random = seededRandom(11);
  // About +0.2% a day on top of noise: more than a doubling per year
  const r = monteCarlo(series(1000, () => 0.002 + (random() - 0.5) * 0.04), 252, 9)!;
  assert.ok(Math.abs(r.bands.p50[252]) < 5);
});

test('a history without direction spreads around zero, wider with a longer horizon', () => {
  const random = seededRandom(3);
  const closes = series(1000, () => (random() - 0.5) * 0.06);
  const short = monteCarlo(closes, 21, 5)!;
  const long = monteCarlo(closes, 252, 5)!;
  assert.ok(short.bands.p5[21] < 0 && short.bands.p95[21] > 0);
  assert.ok(long.bands.p95[252] - long.bands.p5[252] > short.bands.p95[21] - short.bands.p5[21]);
  assert.ok(long.touchDown > short.touchDown && long.medianDrawdown < short.medianDrawdown);
  // Bands never cross
  for (let d = 0; d <= 252; d++) assert.ok(long.bands.p5[d] <= long.bands.p25[d] && long.bands.p25[d] <= long.bands.p50[d] && long.bands.p50[d] <= long.bands.p75[d] && long.bands.p75[d] <= long.bands.p95[d]);
});

test('too little history gives no simulation', () => {
  assert.equal(monteCarlo(series(200, () => 0.001), 21, 1), null);
  assert.equal(monteCarlo([], 21, 1), null);
});
