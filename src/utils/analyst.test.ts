/** analyst.test.ts — Tests for the Yahoo analyst-consensus parser (fixture only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { averageSurprise, parseAnalystData } from './analyst.ts';

const FIXTURE = {
  quoteSummary: {
    result: [
      {
        earningsTrend: {
          trend: [
            { period: '0q', endDate: '2026-12-31', earningsEstimate: { avg: { raw: 120 }, numberOfAnalysts: { raw: 10 } } },
            { period: '0y', endDate: '2026-12-31', earningsEstimate: { avg: { raw: 470 }, low: { raw: 440 }, high: { raw: 500 }, numberOfAnalysts: { raw: 22 }, yearAgoEps: { raw: 440 } } },
            { period: '+1y', endDate: '2027-12-31', earningsEstimate: { avg: { raw: 510 }, numberOfAnalysts: { raw: 21 } } },
          ],
        },
        earningsHistory: {
          history: [
            { epsActual: { raw: 118 }, epsEstimate: { raw: 110 }, quarter: { raw: 1751241600, fmt: '2025-06-30' } },
            { epsActual: { raw: 100 }, epsEstimate: { raw: 105 }, quarter: { fmt: '2025-03-31' } },
            { epsActual: { raw: 1 }, epsEstimate: { raw: 0 }, quarter: { fmt: '2025-09-30' } },
            { epsActual: {}, epsEstimate: { raw: 1 }, quarter: { fmt: '2025-12-31' } },
          ],
        },
        assetProfile: { sector: 'Financial Services', industry: 'Banks—Regional', fullTimeEmployees: 24000 },
        defaultKeyStatistics: { bookValue: { raw: 2100 } },
      },
    ],
  },
};

test('parses FEPS, the current-year estimate, surprises and the profile', () => {
  const a = parseAnalystData(FIXTURE);
  assert.equal(a.nextYear?.avg, 510);
  assert.equal(a.nextYear?.endDate, '2027-12-31');
  assert.equal(a.coverage, 21);
  assert.equal(a.currentYear?.low, 440);
  assert.deepEqual(a.surprises.map((s) => s.quarter), ['2025-03-31', '2025-06-30', '2025-09-30']);
  assert.ok(Math.abs((a.surprises[1].surprisePct ?? 0) - (8 / 110) * 100) < 1e-9);
  assert.equal(a.surprises[2].surprisePct, null); // zero estimate: no percentage
  assert.equal(a.industry, 'Banks—Regional');
  assert.equal(a.bookValuePerShare, 2100);
  const avg = averageSurprise(a.surprises);
  assert.ok(avg !== null && Math.abs(avg - ((8 / 110) * 100 + (-5 / 105) * 100) / 2) < 1e-9);
});

test('missing modules and no coverage give nulls, not numbers', () => {
  const a = parseAnalystData({ quoteSummary: { result: [{}] } });
  assert.equal(a.nextYear, null);
  assert.equal(a.coverage, 0);
  assert.deepEqual(a.surprises, []);
  assert.equal(averageSurprise([]), null);
  assert.equal(parseAnalystData(null).sector, null);
});
