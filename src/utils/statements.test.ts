/**
 * statements.test.ts — Tests for the financial-statement parsers and ratios: Yahoo time series,
 * SEC year-to-date → quarter differencing (incl. the derived fourth quarter), semesters that need
 * both quarters, TTM vs annualized ratios, missing quarters, fiscal-quarter dating and CSV.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSemesters,
  buildStatementRows,
  fillMissingPeriods,
  fillQuartersFromAnnual,
  fiscalQuarter,
  fiscalYearEndMonth,
  mergePeriods,
  parseSecFacts,
  parseYahooStatements,
  periodLabel,
  statementsCsv,
  type PeriodValues,
} from './statements.ts';

const q = (end: string, values: PeriodValues['values'], months: 3 | 6 | 12 = 3): PeriodValues => ({ end, months, values, sources: {} });

test('parseYahooStatements splits annual and quarterly rows', () => {
  const json = {
    timeseries: {
      result: [
        { meta: { type: ['annualTotalRevenue'] }, annualTotalRevenue: [{ asOfDate: '2025-12-31', currencyCode: 'IDR', reportedValue: { raw: 100 } }, null] },
        { meta: { type: ['quarterlyNetIncome'] }, quarterlyNetIncome: [{ asOfDate: '2026-06-30', currencyCode: 'IDR', reportedValue: { raw: 7 } }] },
        { meta: { type: ['quarterlyUnknownThing'] }, quarterlyUnknownThing: [{ asOfDate: '2026-06-30', reportedValue: { raw: 1 } }] },
      ],
    },
  };
  const out = parseYahooStatements(json);
  assert.equal(out.currency, 'IDR');
  assert.deepEqual(out.annual.map((p) => [p.end, p.values.revenue]), [['2025-12-31', 100]]);
  assert.deepEqual(out.quarterly.map((p) => [p.end, p.values.netIncome, p.sources.netIncome]), [['2026-06-30', 7, 'yahoo']]);
});

test('parseSecFacts turns year-to-date cash flows into quarters and derives Q4', () => {
  const fact = (start: string, end: string, val: number, filed = '2026-01-01') => ({ start, end, val, filed, form: '10-Q' });
  const json = {
    facts: {
      'us-gaap': {
        NetCashProvidedByUsedInOperatingActivities: {
          units: {
            USD: [
              fact('2025-01-01', '2025-03-31', 10),
              fact('2025-01-01', '2025-06-30', 25),
              fact('2025-01-01', '2025-09-30', 45),
              { ...fact('2025-01-01', '2025-12-31', 70), form: '10-K' },
            ],
          },
        },
        Revenues: {
          units: {
            USD: [
              fact('2025-01-01', '2025-03-31', 100),
              fact('2025-04-01', '2025-06-30', 110),
              fact('2025-07-01', '2025-09-30', 120),
              { ...fact('2025-01-01', '2025-12-31', 460), form: '10-K' },
              // An older filing of the same quarter is replaced by the latest one
              fact('2025-01-01', '2025-03-31', 90, '2025-05-01'),
            ],
          },
        },
        Assets: { units: { USD: [{ end: '2025-12-31', val: 1000, filed: '2026-02-01', form: '10-K' }] } },
      },
    },
  };
  const out = parseSecFacts(json);
  const byEnd = new Map(out.quarterly.map((p) => [p.end, p]));
  assert.equal(byEnd.get('2025-06-30')?.values.operatingCashFlow, 15);
  assert.equal(byEnd.get('2025-06-30')?.sources.operatingCashFlow, 'derived');
  assert.equal(byEnd.get('2025-12-31')?.values.operatingCashFlow, 25);
  assert.equal(byEnd.get('2025-03-31')?.values.revenue, 100);
  assert.equal(byEnd.get('2025-03-31')?.sources.revenue, 'sec');
  assert.equal(byEnd.get('2025-12-31')?.values.revenue, 130); // 460 − (100 + 110 + 120)
  assert.equal(out.annual[0].values.revenue, 460);
  assert.equal(out.annual[0].values.totalAssets, 1000); // balance sheet copied to the fiscal year
});

test('mergePeriods matches end dates a few days apart and only fills gaps', () => {
  const merged = mergePeriods([q('2025-09-27', { revenue: 10 })], [q('2025-09-30', { revenue: 11, netIncome: 2 }), q('2025-12-31', { revenue: 12 })]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].values.revenue, 10);
  assert.equal(merged[0].values.netIncome, 2);
});

test('fiscal quarters follow the fiscal year end, also for 52/53-week dates', () => {
  assert.equal(fiscalYearEndMonth([q('2024-09-28', {}, 12), q('2025-09-27', {}, 12)]), 9);
  assert.equal(fiscalQuarter('2025-12-27', 9), 1);
  assert.equal(fiscalQuarter('2023-07-01', 9), 3); // ends a day into July: still the June quarter
  assert.equal(fiscalQuarter('2025-09-27', 9), 4);
  assert.equal(periodLabel({ end: '2025-12-27', months: 3 }, 9), 'Q1 FY2026');
  assert.equal(periodLabel({ end: '2026-06-30', months: 3 }, 12), 'Q2 2026');
  assert.equal(periodLabel({ end: '2026-06-30', months: 6 }, 12), 'H1 2026');
});

test('semesters need both quarters: flows are summed, balance items taken at the end', () => {
  const quarters = [
    q('2025-03-31', { revenue: 10, totalAssets: 100 }),
    q('2025-06-30', { revenue: 12, totalAssets: 110 }),
    // Q3 missing → no H2 2025
    q('2025-12-31', { revenue: 15, totalAssets: 130 }),
    q('2026-03-31', { revenue: 11, totalAssets: 120 }),
    q('2026-06-30', { revenue: 13, totalAssets: 125 }),
  ];
  const sem = buildSemesters(quarters, 12);
  assert.deepEqual(sem.map((p) => [periodLabel(p, 12), p.values.revenue, p.values.totalAssets]), [
    ['H1 2025', 22, 110],
    ['H1 2026', 24, 125],
  ]);
});

test('fillMissingPeriods inserts a skipped quarter', () => {
  const filled = fillMissingPeriods([q('2025-06-30', { revenue: 1 }), q('2025-12-31', { revenue: 2 })]);
  assert.deepEqual(filled.map((p) => [p.end, Boolean(p.missing)]), [
    ['2025-06-30', false],
    ['2025-09-30', true],
    ['2025-12-31', false],
  ]);
});

test('quarterly ratios use TTM when four quarters exist, otherwise annualize', () => {
  const rows = buildStatementRows(
    fillMissingPeriods([
      q('2025-03-31', { revenue: 100, netIncome: 10 }),
      q('2025-06-30', { revenue: 100, netIncome: 10 }),
      q('2025-09-30', { revenue: 100, netIncome: 10 }),
      q('2025-12-31', { revenue: 100, netIncome: 20, equity: 200, totalAssets: 1000, shares: 10 }),
      q('2026-06-30', { revenue: 120, netIncome: 15, equity: 200, totalAssets: 1000, shares: 10 }),
    ]),
    12,
    { sameCurrency: true, livePrice: 50, priceAt: (end) => (end === '2025-12-31' ? 40 : undefined) }
  );
  const q4 = rows.find((r) => r.end === '2025-12-31');
  assert.equal(q4?.ratios.basis, 'ttm');
  assert.equal(q4?.ratios.roe, 50 / 200);
  assert.equal(q4?.ratios.pe, 40 / (50 / 10)); // EPS from TTM net income ÷ shares
  assert.equal(q4?.priceKind, 'period-end');
  assert.equal(q4?.ratios.revenueQoQ, 0);
  const missing = rows.find((r) => r.end === '2026-03-31');
  assert.equal(missing?.missing, true);
  const last = rows.at(-1);
  assert.equal(last?.ratios.basis, 'annualized'); // Q1 2026 missing → no TTM
  assert.equal(last?.ratios.roe, (15 * 4) / 200);
  assert.ok(Math.abs((last?.ratios.revenueYoY ?? 0) - 20) < 1e-9);
  assert.equal(last?.ratios.revenueQoQ, undefined); // previous quarter not reported
  assert.equal(last?.priceKind, 'live');
});

test('valuation ratios are skipped when currencies differ; CSV lists items and ratios', () => {
  const rows = buildStatementRows([q('2025-12-31', { revenue: 100, netIncome: 10, eps: 1, equity: 50, shares: 10 }, 12)], 12, { sameCurrency: false, livePrice: 20 });
  assert.equal(rows[0].ratios.pe, undefined);
  assert.equal(rows[0].ratios.netMargin, 0.1);
  const csv = statementsCsv(rows, 'USD');
  assert.match(csv, /^Item,FY2025 \(2025-12-31\)/);
  assert.match(csv, /Revenue \(USD\),100/);
  assert.match(csv, /Net margin,0\.1/);
});

test('a quarter the source skipped is derived from the annual report (flows only)', () => {
  const quarters = [
    q('2025-03-31', { revenue: 10, totalAssets: 100 }),
    q('2025-06-30', { revenue: 12, totalAssets: 110 }),
    q('2025-12-31', { revenue: 15, totalAssets: 130 }),
  ];
  const filled = fillQuartersFromAnnual(quarters, [q('2025-12-31', { revenue: 50 }, 12)], 12);
  const q3 = filled.find((p) => p.end === '2025-09-30');
  assert.equal(q3?.values.revenue, 13);
  assert.equal(q3?.sources.revenue, 'derived');
  assert.equal(q3?.values.totalAssets, undefined);
  // With two quarters missing nothing is derived
  assert.equal(fillQuartersFromAnnual(quarters.slice(1), [q('2025-12-31', { revenue: 50 }, 12)], 12).length, 2);
  // The semester that needed the skipped quarter can now be built
  assert.deepEqual(buildSemesters(filled, 12).map((p) => [periodLabel(p, 12), p.values.revenue]), [['H1 2025', 22], ['H2 2025', 28]]);
});
