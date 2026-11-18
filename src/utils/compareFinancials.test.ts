/** compareFinancials.test.ts — Three-year extraction, bank exclusions and missing data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { compareFinancials, financialSector } from './compareFinancials.ts';
import type { PeriodValues } from './statements.ts';
const periods: PeriodValues[] = [2022, 2023, 2024, 2025].map((year, i) => ({
  end: `${year}-12-31`, months: 12, values: { revenue: 100 * (i + 1), netIncome: 10, equity: 50, totalLiabilities: 20 }, sources: {},
}));
test('last three fiscal years reuse statement ratios and leave missing cash flow null', () => {
  const result = compareFinancials(periods, 12, false);
  assert.deepEqual(result.periods.map(p => p.end), ['2023-12-31', '2024-12-31', '2025-12-31']);
  assert.equal(result.periods[0].values.revenueYoY, 100);
  assert.equal(result.periods[0].values.netMargin, 0.05);
  assert.equal(result.periods[0].values.operatingCashFlow, null);
  assert.equal(result.periods[0].values.der, 0.4);
});
test('financial companies hide inappropriate rows using IDX and GICS metadata', () => {
  assert.equal(financialSector('BBCA.JK'), true);
  assert.equal(financialSector('JPM'), true);
  const result = compareFinancials(periods, 12, true);
  assert.equal(result.metrics.includes('der'), false);
  assert.equal(result.metrics.includes('grossMargin'), false);
  assert.equal(result.periods[0].values.der, null);
  assert.deepEqual(compareFinancials([], 12, false).periods, []);
});
