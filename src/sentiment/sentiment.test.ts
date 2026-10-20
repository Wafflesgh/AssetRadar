/** sentiment.test.ts — Tests for the cross-section helpers, point-in-time factors, hybrid model, pillars, news per horizon, horizon scores and cadence (synthetic data only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ampScores, averageRanks, decileBreakpoints, decileOf, industryAdjust, percentiles } from './crossSection.ts';
import { availablePeriods, momentum12_2, bettmanWindow, operationalSignals, publishedOn, rawFactors, sue, type StockInput } from './factors.ts';
import { chooseVariant, fitHybrid, ols, type HybridRow } from './hybridValue.ts';
import { combine, marketPillars } from './pillars.ts';
import { newsByHorizon } from './newsHorizon.ts';
import { derivativesScore, label5, scoreHorizon, shortTechnical, trendScore, tsMomentumScore } from './horizons.ts';
import { cadenceFromHalfLife, icHalfLife, nextCatalyst } from './cadence.ts';
import type { PeriodValues } from '../utils/statements.ts';

const months = (n: number, start = 2016) =>
  Array.from({ length: n }, (_, i) => `${start + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);

test('ranks, percentiles, AMP scores, deciles and industry adjustment', () => {
  assert.deepEqual(averageRanks([10, 20, 20, NaN, 5]), [1, 2.5, 2.5, NaN, 0]);
  assert.deepEqual(percentiles([1, 2, 3]), [0, 50, 100]);
  assert.deepEqual(percentiles([7]), [50]);
  const amp = ampScores([1, 2, 3, 4, 5]);
  assert.equal(amp[0], 0);
  assert.equal(amp[4], 100);
  const br = decileBreakpoints(Array.from({ length: 100 }, (_, i) => i));
  assert.equal(br.length, 9);
  assert.equal(decileOf(-5, br), 1);
  assert.equal(decileOf(99, br), 10);
  assert.deepEqual(decileBreakpoints([1, 2, 3]), []);
  const adj = industryAdjust([1, 2, 3, 10, 11, 12, 5], ['a', 'a', 'a', 'b', 'b', 'b', 'c']);
  assert.deepEqual(adj.adjusted.slice(0, 6), [-1, 0, 1, -1, 0, 1]);
  assert.equal(adj.usedMarket[6], true); // lone industry → market median (5)
  assert.equal(adj.adjusted[6], 0);
});

test('momentum windows: 12-2 skips the last month; Bettman uses months t−12…t−7', () => {
  const p = Array.from({ length: 14 }, (_, i) => 100 + i); // P(t−13)=100 … P(t)=113
  assert.ok(Math.abs((momentum12_2(p) ?? 0) - (111 / 100 - 1)) < 1e-12);
  assert.ok(Math.abs((bettmanWindow(p) ?? 0) - (106 / 100 - 1)) < 1e-12);
  assert.equal(momentum12_2(p.slice(1)), null);
});

const period = (end: string, months: 3 | 12, values: PeriodValues['values'], filed?: string): PeriodValues => ({ end, months, values, sources: {}, filed });

test('point in time: statements count only after publication (IDX lag or SEC filing date)', () => {
  const fy = period('2024-12-31', 12, { netIncome: 1 });
  assert.equal(publishedOn(fy, 'idx'), '2025-04-30');
  assert.equal(publishedOn(period('2024-09-30', 3, {}), 'idx'), '2024-11-30');
  assert.equal(publishedOn(period('2024-12-31', 12, {}, '2025-02-20'), 'us'), '2025-02-20');
  assert.equal(availablePeriods([fy], '2025-04-29', 'idx').length, 0);
  assert.equal(availablePeriods([fy], '2025-04-30', 'idx').length, 1);
});

function stock(symbol: string, k: number, opts: Partial<StockInput> = {}): StockInput {
  const ms = months(72);
  const monthly = ms.map((m, i) => ({ month: m, close: 100 * Math.pow(1 + 0.002 * k, i) * (1 + 0.03 * Math.sin(i + k)) }));
  const annual = [2019, 2020, 2021, 2022].map((y, j) =>
    period(`${y}-12-31`, 12, {
      revenue: 1000 * (1 + 0.05 * j) * (1 + k / 50),
      grossProfit: 400 * (1 + 0.04 * j) * (1 + k / 60),
      netIncome: 100 * (1 + 0.1 * j) * (1 + k / 40) - (k % 7 === 0 ? 150 : 0),
      totalAssets: 2000 * (1 + 0.03 * j),
      operatingCashFlow: 120 * (1 + 0.05 * j),
      totalDebt: 500 * (1 - 0.02 * j),
      currentAssets: 800,
      currentLiabilities: 400 * (1 - 0.01 * j),
      shares: 100,
      equity: 900 * (1 + 0.05 * j) * (1 + k / 30),
      eps: (100 * (1 + 0.1 * j) * (1 + k / 40)) / 100,
      inventory: 200 * (1 + 0.06 * j),
      receivables: 150 * (1 + 0.04 * j),
      capex: -80 * (1 + 0.02 * j * k),
      sga: 120 * (1 + 0.03 * j),
      pretaxIncome: 130 * (1 + 0.1 * j),
      taxProvision: 30,
    })
  );
  return { symbol, market: 'idx', monthly, annual, quarterly: [], industry: k % 2 ? 'Banks' : 'Retail', ...opts };
}

test('raw factors ignore later prices and later reports (no look-ahead)', () => {
  const s = stock('AAA', 3);
  const asOf = '2020-06';
  const a = rawFactors(s, asOf, false);
  const future: StockInput = {
    ...s,
    monthly: s.monthly.map((m) => (m.month > asOf ? { ...m, close: m.close * 5 } : m)),
    annual: [...s.annual.map((p) => (publishedOn(p, 'idx') > '2020-06-30' ? { ...p, values: { ...p.values, netIncome: -999 } } : p))],
  };
  assert.deepEqual(rawFactors(future, asOf, false), a);
  assert.equal(a.fiscalYear, '2019-12-31'); // FY2020 is not public in June 2020
  assert.equal(a.feps, null); // analyst consensus never enters back-tests
});

test('SUE needs 12 quarters and uses the seasonal change over 8 quarters', () => {
  const q = Array.from({ length: 12 }, (_, i) => period(`20${15 + Math.floor(i / 4)}-0${(i % 4) * 3 + 3}-30`.replace('-012', '-12'), 3, { eps: 1 + 0.1 * i + (i === 11 ? 0.5 : 0) }));
  const value = sue(q);
  assert.ok(value !== null && value > 1);
  assert.equal(sue(q.slice(1)), null);
});

test('operational signals are signed so that higher is better', () => {
  const prev = period('2021-12-31', 12, { revenue: 100, inventory: 10, receivables: 10, sga: 10, grossProfit: 40 });
  const bad = period('2022-12-31', 12, { revenue: 100, inventory: 20, receivables: 15, sga: 15, grossProfit: 30 });
  const o = operationalSignals([prev, bad]);
  assert.ok((o.inv ?? 0) < 0 && (o.ar ?? 0) < 0 && (o.sga ?? 0) < 0 && (o.gm ?? 0) < 0);
  assert.equal(operationalSignals([bad]).inv, null);
});

test('OLS recovers known coefficients; hybrid model drops FEPS without coverage; variant choice', () => {
  const X: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < 50; i++) {
    const x1 = i % 7;
    const x2 = (i * 3) % 11;
    X.push([1, x1, x2]);
    y.push(2 + 3 * x1 - 0.5 * x2);
  }
  const fit = ols(X, y);
  assert.ok(fit && Math.abs(fit.b[1] - 3) < 1e-9 && Math.abs(fit.r2 - 1) < 1e-9);
  assert.equal(ols([[1, 1]], [1]), null);
  const rows: HybridRow[] = Array.from({ length: 60 }, (_, i) => {
    const bvps = 10 + (i % 13);
    const eps = 1 + (i % 5) / 2;
    const p5 = 20 + (i % 17);
    return { symbol: `S${i}`, price: 1 + 0.1 * bvps + 2 * eps + 0.8 * p5 + (i % 3) * 0.01, bvps, eps, feps: i < 10 ? eps * 1.1 : null, priceT5: p5, dUp: i % 10 === 0 ? 1 : 0, dDown: i % 10 === 1 ? 1 : 0 };
  });
  const m = fitHybrid(rows, 'levels');
  assert.equal(m?.model, 4);
  assert.ok(m && m.r2 > 0.99);
  const chosen = chooseVariant(rows);
  assert.ok(chosen.model);
  assert.ok(chosen.errors.levels !== null);
  assert.equal(fitHybrid(rows.slice(0, 20)), null);
});

test('pillars: a market of 40 stocks, reweighting and the distress warning', () => {
  const stocks = Array.from({ length: 40 }, (_, k) => stock(`S${k}`, k, { valueTraded: k === 0 ? 1 : 1e9 }));
  const m = marketPillars(stocks, 'idx', '2023-06', false);
  assert.equal(m.n, 40);
  assert.equal(m.smallPeerGroup, false);
  const s = m.stocks.get('S5');
  assert.ok(s);
  for (const id of ['momentum', 'health', 'quality'] as const) {
    const p = s.pillars[id];
    assert.ok(p.score === null || (p.score >= 0 && p.score <= 100), id);
  }
  // No SUE (no quarters) → the momentum pillar is reweighted
  assert.equal(s.pillars.momentum.reweighted, true);
  assert.ok(s.pillars.momentum.coverage < 1);
  const c = combine('health', [
    { id: 'a', weight: 60, raw: 1, score: 80 },
    { id: 'b', weight: 40, raw: null, score: null },
  ]);
  assert.equal(c.score, 80);
  assert.equal(c.reweighted, true);
});

test('news per horizon: decay, eligibility and caps', () => {
  const now = Date.parse('2026-10-20T00:00:00Z');
  const day = 86_400_000;
  const news = [
    { title: 'Bank Indonesia cuts interest rate to support growth', link: 'https://reuters.com/x', source: 'Reuters', publishedAtMs: now - 1 * day },
    { title: 'BBCA shares jump 3%', link: 'https://x.com/y', source: 'Blog', publishedAtMs: now - 0.1 * day },
    { title: 'Bank Central Asia net profit rises 12% beating estimates', link: 'https://kontan.co.id/z', source: 'Kontan', publishedAtMs: now - 60 * day },
  ];
  const r = newsByHorizon(news, 'idStock', 'BBCA.JK', now);
  for (const h of ['short', 'medium', 'long'] as const) {
    assert.ok(Math.abs(r[h].points) <= r[h].cap);
    assert.ok(r[h].headlines.every((x) => h !== 'long' || x.category !== 'price'));
  }
  assert.ok(r.long.headlines.length <= 2);
  assert.equal(newsByHorizon([], 'crypto', 'BTC/IDR', now).short.points, 0);
});

test('horizon scores: weights, applicability, no-statement redistribution and labels', () => {
  assert.equal(label5(10), 'Strong Bearish');
  assert.equal(label5(59.9), 'Neutral');
  assert.equal(label5(80), 'Strong Bullish');
  const crypto = scoreHorizon('long', { group: 'crypto', tsMomentum: 70, trend: 60, technicalShort: 40 });
  const ids = crypto.components.map((c) => c.id).sort();
  assert.ok(ids.includes('tsMomentum') && ids.includes('trend') && !ids.includes('quality'));
  assert.ok(crypto.score !== null && Math.abs(crypto.score - (50 + crypto.components.reduce((s, c) => s + c.contribution, 0))) < 1e-9);
  const macro = crypto.components.find((c) => c.id === 'macro');
  assert.equal(macro?.applicable, false);
  assert.equal(macro?.weight, 0);
  const none = scoreHorizon('short', { group: 'index' });
  assert.equal(none.score, null);
  assert.equal(none.confidence, 'Low');
  const p = (score: number) => ({ id: 'momentum' as const, score, subFactors: [], reweighted: false, coverage: 1 });
  const stockH = scoreHorizon('medium', {
    group: 'idStock',
    pillars: { momentum: p(80), health: { ...p(70), id: 'health' }, quality: { ...p(65), id: 'quality' } },
    technicalShort: 75,
    macro: 60,
    macroLinked: true,
    validation: { medium: { ic: 0.05, significant: true } },
  });
  assert.equal(stockH.label, 'Bullish');
  assert.ok(stockH.reweighted); // news missing
  assert.equal(stockH.cadence, 'Weekly');
});

test('technical, time-series momentum, trend and derivatives scores stay in 0–100', () => {
  const up = Array.from({ length: 300 }, (_, i) => 100 * Math.pow(1.002, i) * (1 + 0.01 * Math.sin(i)));
  const st = shortTechnical(up);
  assert.ok(st && st.score > 0 && st.score < 100);
  assert.equal(shortTechnical(up.slice(0, 30)), null);
  assert.ok((tsMomentumScore(up) ?? 0) > 50);
  assert.ok((trendScore(up) ?? 0) > 50);
  assert.ok((derivativesScore({ fundingRate: 0.001 }) ?? 50) < 50); // 10 bp per 8 h: crowded longs
  assert.ok((derivativesScore({ fundingRate: -0.0005 }) ?? 50) > 50);
  assert.equal(derivativesScore({}), null);
});

test('cadence from the IC half-life and the next catalyst', () => {
  assert.equal(icHalfLife([{ lag: 1, ic: 0.08 }, { lag: 5, ic: 0.06 }, { lag: 10, ic: 0.02 }]), 7.5);
  assert.equal(icHalfLife([{ lag: 1, ic: -0.1 }, { lag: 5, ic: 0 }]), null);
  assert.equal(cadenceFromHalfLife(3, 'Weekly').cadence, 'Daily');
  assert.equal(cadenceFromHalfLife(12, 'Daily').cadence, 'Weekly');
  assert.equal(cadenceFromHalfLife(null, 'Monthly').cadence, 'Monthly');
  const c = nextCatalyst(
    [
      { type: 'fomc', date: '2026-10-28' },
      { type: 'earnings', date: '2026-10-25' },
      { type: 'exDividend', date: '2026-10-01' },
    ],
    'short',
    '2026-10-20'
  );
  assert.equal(c?.type, 'earnings');
  assert.equal(c?.daysUntil, 5);
});
