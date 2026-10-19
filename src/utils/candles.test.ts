import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateCandles, toWibChartData, WIB_OFFSET_SEC } from './candles.ts';

test('aggregateCandles merges hourly candles into 4-hour buckets', () => {
  const h = 3600;
  const base = 4 * h * 1000;
  const candles = [0, 1, 2, 3, 4].map((i) => ({
    time: base + i * h,
    open: 10 + i,
    high: 20 + i,
    low: 5 - i,
    close: 11 + i,
    volume: 100,
  }));
  const out = aggregateCandles(candles, 4 * h);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { time: base, open: 10, high: 23, low: 2, close: 14, volume: 400 });
  assert.equal(out[1].open, 14);
});

test('toWibChartData shifts time to WIB and drops all-zero volume', () => {
  const candles = [
    { time: 1000, open: 1, high: 3, low: 0.5, close: 2, volume: 10 },
    { time: 2000, open: 2, high: 2, low: 1, close: 1 },
  ];
  const out = toWibChartData(candles);
  assert.equal(out.candles[0].time, 1000 + WIB_OFFSET_SEC);
  assert.deepEqual(out.volumes, [
    { time: 1000 + WIB_OFFSET_SEC, value: 10, up: true },
    { time: 2000 + WIB_OFFSET_SEC, value: 0, up: false },
  ]);
  const noVol = toWibChartData([{ time: 1, open: 1, high: 1, low: 1, close: 1, volume: 0 }]);
  assert.deepEqual(noVol.volumes, []);
});
