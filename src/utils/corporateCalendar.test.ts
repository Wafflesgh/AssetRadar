/** corporateCalendar.test.ts — Tests for parsing Yahoo calendar and chart events into the IDX corporate calendar. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, eventsBetween, mergeEvents, parseCalendarEvents, parseChartEvents } from './corporateCalendar.ts';

test('parses upcoming earnings, ex-dividend and payment dates', () => {
  const json = {
    quoteSummary: {
      result: [
        {
          calendarEvents: {
            earnings: { earningsDate: [{ raw: 1792487700 }], isEarningsDateEstimate: true },
            exDividendDate: { raw: 1788134400 },
            dividendDate: { raw: 1789171200 },
          },
        },
      ],
    },
  };
  const ev = parseCalendarEvents('BBCA.JK', json);
  assert.deepEqual(
    ev.map((e) => [e.type, e.date, e.estimate]),
    [
      ['earnings', '2026-10-20', true],
      ['exDividend', '2026-08-31', undefined],
      ['dividendPayment', '2026-09-12', undefined],
    ]
  );
  assert.deepEqual(parseCalendarEvents('X', {}), []);
});

test('parses past dividends and splits, newest first, and merges amounts', () => {
  const json = {
    chart: {
      result: [
        {
          events: {
            dividends: { a: { amount: 50, date: 1732154400 }, b: { amount: 25, date: 1788141600 } },
            splits: { c: { date: 1600000000, numerator: 5, denominator: 1, splitRatio: '5:1' } },
          },
        },
      ],
    },
  };
  const hist = parseChartEvents('BBCA.JK', json);
  assert.equal(hist[0].type, 'dividend');
  assert.equal(hist[0].amount, 25);
  assert.equal(hist.at(-1)?.type, 'split');
  assert.equal(hist.at(-1)?.ratio, '5:1');
  const merged = mergeEvents([{ symbol: 'BBCA.JK', type: 'exDividend', date: hist[0].date }], hist);
  assert.equal(merged.find((e) => e.type === 'exDividend')?.amount, 25);
});

test('window selection and date maths', () => {
  const ev = [
    { symbol: 'B', type: 'earnings' as const, date: '2026-10-21' },
    { symbol: 'A', type: 'earnings' as const, date: '2026-10-21' },
    { symbol: 'C', type: 'earnings' as const, date: '2026-12-01' },
  ];
  assert.deepEqual(eventsBetween(ev, '2026-10-20', '2026-10-27').map((e) => e.symbol), ['A', 'B']);
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
});
