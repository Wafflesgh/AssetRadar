/**
 * goldBar.test.ts — Tests for physical gold: bar size conversion, input checks, and which price
 * values the portfolio's gold (recent buyback, else spot, else none).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buybackVsSpot, goldValuation, latestEntry, perBar, perGram, validateGoldEntry, type GoldPriceEntry } from './goldBar.ts';

const entry = (id: string, date: string, buybackPerGram: number): GoldPriceEntry => ({ id, date, source: 'antam', buybackPerGram });

test('size conversion', () => {
  assert.equal(perGram(2_500_000, 0.5), 5_000_000);
  assert.equal(perBar(2_000_000, 25), 50_000_000);
  assert.ok(Number.isNaN(perGram(1, 0)));
});

test('input checks', () => {
  assert.deepEqual(validateGoldEntry({ date: '2026-10-20', buybackPerGram: 2_100_000 }, '2026-10-20'), []);
  assert.deepEqual(validateGoldEntry({ date: '2026-10-21', buybackPerGram: 2_100_000 }, '2026-10-20'), ['The date cannot be in the future.']);
  assert.deepEqual(validateGoldEntry({ date: '2026-10-20', buybackPerGram: 2_100 }, '2026-10-20'), ['The buyback price per gram looks wrong — check the number of digits.']);
  assert.equal(validateGoldEntry({ buybackPerGram: 0 }, '2026-10-20').length, 2);
});

test('portfolio valuation picks a recent buyback, else spot, else none', () => {
  const list = [entry('a', '2026-09-01', 1_900_000), entry('b', '2026-10-15', 2_050_000)];
  assert.equal(latestEntry(list)?.id, 'b');
  assert.deepEqual(goldValuation(list, 2_200_000, '2026-10-20'), { perGram: 2_050_000, basis: 'buyback', entry: list[1], ageDays: 5 });
  const old = goldValuation(list, 2_200_000, '2026-12-01');
  assert.equal(old.basis, 'spot');
  assert.equal(old.perGram, 2_200_000);
  assert.equal(goldValuation([], undefined, '2026-10-20').basis, 'none');
  assert.equal(goldValuation([entry('c', '2026-10-25', 2_000_000)], 2_200_000, '2026-10-20').basis, 'spot', 'future-dated entry ignored');
});

test('buyback vs spot', () => {
  assert.ok(Math.abs((buybackVsSpot(1_980_000, 2_200_000) ?? 0) + 0.1) < 1e-12);
  assert.equal(buybackVsSpot(1_980_000, undefined), null);
});
