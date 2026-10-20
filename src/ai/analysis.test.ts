/** analysis.test.ts — Tests for technical analysis, chart patterns, Piotroski F-score, news drivers and the evidence-weighted sentiment. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTechnicals, detectPatterns, findPivots } from './technical.ts';
import { analyzeFundamentals, parseYahooFundamentals, piotroski, type AnnualFigures } from './fundamentals.ts';
import { analyzeNewsDrivers, classifyDriver } from './newsDrivers.ts';
import { buildAnalysis, labelOf } from './analysis.ts';
import { renderParts } from '../i18n/textParts.ts';

/** Piecewise-linear path through (bar, price) knots. */
function path(knots: Array<[number, number]>): number[] {
  const out: number[] = [];
  for (let k = 0; k < knots.length - 1; k++) {
    const [i0, p0] = knots[k];
    const [i1, p1] = knots[k + 1];
    for (let i = i0; i < i1; i++) out.push(p0 + ((p1 - p0) * (i - i0)) / (i1 - i0));
  }
  out.push(knots[knots.length - 1][1]);
  return out;
}

test('a steady uptrend reads bullish on the scorecard', () => {
  const closes = Array.from({ length: 600 }, (_, i) => 100 * Math.pow(1.0015, i) * (1 + 0.01 * Math.sin(i / 3)));
  const r = analyzeTechnicals(closes);
  assert.ok(r);
  assert.ok(r.score > 0.25, `score ${r.score}`);
  assert.equal(r.signals.find((s) => s.id === 'ma200')?.bias, 1);
  assert.equal(r.signals.find((s) => s.id === 'mom')?.bias, 1);
  assert.ok(r.indicators.sma200 !== null && r.indicators.sma200 < r.lastClose);
  assert.ok(r.edge && r.edge.samples > 0 && r.edge.lean === 'bullish');
  assert.ok(r.edge.upRate >= 0 && r.edge.upRate <= 1);
});

test('too little history returns null; pivots find swing points', () => {
  assert.equal(analyzeTechnicals([1, 2, 3]), null);
  const closes = path([[0, 10], [10, 20], [20, 10], [30, 20]]);
  const { highs, lows } = findPivots(closes, 0, closes.length - 1, 3);
  assert.deepEqual(highs.map((h) => h.i), [10]);
  assert.deepEqual(lows.map((l) => l.i), [20]);
});

test('detects a confirmed double top and a forming double bottom', () => {
  const top = path([[0, 90], [60, 100], [100, 120], [115, 110], [130, 120.5], [150, 106]]);
  const pats = detectPatterns(top);
  const dt = pats.find((p) => p.id === 'double-top');
  assert.ok(dt, JSON.stringify(pats.map((p) => p.id)));
  assert.equal(dt.status, 'confirmed');
  assert.equal(dt.bias, -1);

  const bottom = path([[0, 130], [60, 120], [100, 100], [115, 110], [130, 99.6], [150, 106]]);
  const db = detectPatterns(bottom).find((p) => p.id === 'double-bottom');
  assert.ok(db);
  assert.equal(db.status, 'forming');
  assert.equal(db.bias, 1);
});

test('detects head and shoulders', () => {
  const hs = path([[0, 80], [40, 90], [70, 110], [85, 100], [100, 125], [115, 101], [130, 111], [150, 95]]);
  const p = detectPatterns(hs).find((x) => x.id === 'head-shoulders');
  assert.ok(p);
  assert.equal(p.status, 'confirmed');
});

const year = (fy: string, f: Partial<AnnualFigures>): AnnualFigures => ({ fiscalYearEnd: fy, ...f });

test('Piotroski F-score counts the nine signals and skips unreported ones', () => {
  const years = [
    year('2022-12-31', { totalAssets: 1000 }),
    year('2023-12-31', {
      netIncome: 50, totalAssets: 1100, operatingCashFlow: 60, longTermDebt: 300, currentAssets: 400,
      currentLiabilities: 300, sharesOutstanding: 100, grossProfit: 300, totalRevenue: 800,
    }),
    year('2024-12-31', {
      netIncome: 80, totalAssets: 1150, operatingCashFlow: 120, longTermDebt: 250, currentAssets: 450,
      currentLiabilities: 300, sharesOutstanding: 100, grossProfit: 400, totalRevenue: 950,
    }),
  ];
  const f = piotroski(years);
  assert.ok(f);
  assert.equal(f.max, 9);
  assert.equal(f.score, 9);
  // A bank without gross profit or current assets: those signals are unavailable, not failures
  const bank = years.map((y) => ({ ...y, grossProfit: undefined, currentAssets: undefined, currentLiabilities: undefined }));
  const fb = piotroski(bank);
  assert.ok(fb);
  assert.equal(fb.max, 7);
  const rep = analyzeFundamentals(years, 'USD', 1600);
  assert.ok(rep);
  assert.equal(rep.pe, 20);
  assert.ok(Math.abs((rep.grossProfitability ?? 0) - 400 / 1150) < 1e-9);
});

test('parses the Yahoo fundamentals-timeseries format', () => {
  const json = {
    timeseries: {
      result: [
        {
          meta: { type: ['annualNetIncome'] },
          annualNetIncome: [
            { asOfDate: '2024-12-31', currencyCode: 'IDR', reportedValue: { raw: 5 } },
            { asOfDate: '2023-12-31', currencyCode: 'IDR', reportedValue: { raw: 4 } },
            null,
          ],
        },
        { meta: { type: ['annualTotalAssets'] }, annualTotalAssets: [{ asOfDate: '2024-12-31', reportedValue: { raw: 50 } }] },
      ],
    },
  };
  const { years, currency } = parseYahooFundamentals(json);
  assert.equal(currency, 'IDR');
  assert.deepEqual(years.map((y) => y.fiscalYearEnd), ['2023-12-31', '2024-12-31']);
  assert.equal(years[1].totalAssets, 50);
  assert.equal(years[0].netIncome, 4);
});

test('news drivers separate events from price reports and respect asset direction', () => {
  const cut = { title: 'Fed signals rate cut as inflation cools', source: 'Reuters' };
  assert.equal(classifyDriver(cut, 'crypto', 'BTC/IDR').category, 'monetary');
  assert.equal(classifyDriver(cut, 'crypto', 'BTC/IDR').direction, 1);
  assert.equal(classifyDriver(cut, 'forex', 'USD/IDR').direction, -1);
  assert.equal(classifyDriver({ title: 'Apple beats earnings estimates', source: 'CNBC' }, 'usStock', 'AAPL').direction, 1);
  assert.equal(classifyDriver({ title: 'SEC approves spot Solana ETF', source: 'CoinDesk' }, 'crypto', 'SOL/IDR').direction, 1);
  assert.equal(classifyDriver({ title: 'Missile attack hits oil port', source: 'BBC' }, 'commodity', 'XAU/USD').direction, 1);
  const price = classifyDriver({ title: 'Bitcoin jumps 5% to new high', source: 'Some Blog' }, 'crypto', 'BTC/IDR');
  assert.equal(price.category, 'price');
  assert.ok(price.baseWeight < 0.5);

  const now = Date.UTC(2026, 9, 19, 12);
  const rep = analyzeNewsDrivers(
    [
      { ...cut, link: 'a', publishedAtMs: now - 3_600_000 },
      { title: 'Bitcoin jumps 5% to new high', source: 'Blog', link: 'b', publishedAtMs: now },
      { title: 'Bitcoin jumps 5% to new high', source: 'Blog', link: 'c', publishedAtMs: now },
    ],
    'crypto',
    'BTC/IDR',
    now
  );
  assert.equal(rep.drivers.length, 2); // duplicate headline removed
  assert.equal(rep.drivers[0].category, 'monetary');
  assert.equal(rep.priceReportCount, 1);
  assert.ok(rep.netTone > 0);
  assert.ok(rep.confidence > 0 && rep.confidence < 1);
});

test('buildAnalysis combines evidence with weights that sum to 1 and explains the label', () => {
  const closes = Array.from({ length: 900 }, (_, i) => 100 * Math.pow(1.0012, i) * (1 + 0.01 * Math.sin(i / 4)));
  const technical = analyzeTechnicals(closes);
  const news = analyzeNewsDrivers([], 'index', '^GSPC');
  const a = buildAnalysis({ symbol: '^GSPC', group: 'index', closes, technical, fundamentals: null, news });
  const wsum = a.components.reduce((s, c) => s + c.weight, 0);
  assert.ok(Math.abs(wsum - 1) < 1e-9);
  assert.ok(a.components.some((c) => c.id === 'value'));
  assert.ok(!a.components.some((c) => c.id === 'quality'));
  assert.equal(a.score, Math.round(50 + 50 * a.composite));
  assert.equal(a.label, labelOf(a.composite));
  assert.ok(a.summary.length > 20);
  assert.equal(labelOf(0.2), 'Bullish');
  assert.equal(labelOf(-0.2), 'Bearish');
  assert.equal(labelOf(0.05), 'Neutral');
});

test('analysis texts carry translation keys that render in English and Indonesian', () => {
  const closes = Array.from({ length: 900 }, (_, i) => 100 * Math.pow(1.0012, i) * (1 + 0.01 * Math.sin(i / 4)));
  const technical = analyzeTechnicals(closes);
  assert.ok(technical);
  // English keys reproduce the English readings exactly; Indonesian differs
  for (const s of technical.signals) {
    assert.equal(renderParts('en', s.readingParts, '__missing__'), s.reading, s.id);
    assert.notEqual(renderParts('id', s.readingParts, '__missing__'), '__missing__', s.id);
  }
  const news = analyzeNewsDrivers([], 'index', '^GSPC');
  const a = buildAnalysis({ symbol: '^GSPC', group: 'index', closes, technical, fundamentals: null, news });
  const idSummary = renderParts('id', a.summaryParts, '__missing__');
  assert.notEqual(idSummary, '__missing__');
  assert.ok(!/@an\.|@ta\./.test(idSummary), idSummary);
  for (const c of a.components) assert.notEqual(renderParts('id', c.explanationParts, '__missing__'), '__missing__', c.id);
  // Unknown keys fall back to the English text
  assert.equal(renderParts('id', [{ k: 'no.such.key' }], 'English'), 'English');
});
