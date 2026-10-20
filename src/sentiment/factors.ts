/**
 * factors.ts — Raw, point-in-time factor values of one stock at a month end ("as of"): only
 * prices up to that month and financial statements already published by then (IDX annual
 * reports +4 months, quarterly +2 months; SEC filings by their first filing date, else +3/+2
 * months). Momentum 12-2, the Bettman extreme-decile window (months t−12…t−7), 1-month reversal,
 * SUE (Novy-Marx, 8 quarters), Piotroski F-score, the Abarbanell & Bushee operational signals,
 * gross profitability (banks: ROA), book-to-market and the hybrid-model inputs (BVPS, EPS,
 * P(t−5)). Missing inputs stay null — nothing is estimated.
 */
import { piotroski, type AnnualFigures } from '../ai/fundamentals.ts';
import type { AnalystData } from '../utils/analyst.ts';
import type { PeriodValues } from '../utils/statements.ts';

export type Market = 'idx' | 'us';

export interface MonthlyClose {
  month: string; // YYYY-MM
  close: number;
}

export interface StockInput {
  symbol: string;
  market: Market;
  monthly: MonthlyClose[];
  annual: PeriodValues[];
  quarterly: PeriodValues[];
  /** Today's consensus only (no history): used for the current score, never in back-tests. */
  analyst?: AnalystData | null;
  industry?: string | null;
  /** Banks and insurers: gross profit is meaningless, ROA replaces GPA. */
  isFinancial?: boolean;
  /** Shares outstanding when statements do not report them. */
  shares?: number;
  /** Typical daily value traded (liquidity screen for decile formation). */
  valueTraded?: number;
}

/** Publication lags in months (used when no filing date is known). */
export const PUBLICATION_LAG = {
  idx: { annual: 4, quarterly: 2 },
  us: { annual: 3, quarterly: 2 },
};

/** Adds calendar months, keeping month ends at month ends (31 Dec + 4 → 30 Apr). */
const addMonths = (yyyyMmDd: string, months: number): string => {
  const [y, m, d] = yyyyMmDd.slice(0, 10).split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
};

/** Last day of a YYYY-MM month. */
export const monthEnd = (month: string): string => {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
};

/** Date a period became public: its first filing, else period end + the market's lag. */
export function publishedOn(p: PeriodValues, market: Market): string {
  if (p.filed) return p.filed;
  return addMonths(p.end, p.months === 12 ? PUBLICATION_LAG[market].annual : PUBLICATION_LAG[market].quarterly);
}

/** Periods public by the as-of date, oldest first. */
export function availablePeriods(periods: PeriodValues[], asOf: string, market: Market): PeriodValues[] {
  return periods.filter((p) => publishedOn(p, market) <= asOf).sort((a, b) => a.end.localeCompare(b.end));
}

/** Closes up to and including the as-of month (index i of the as-of month = last). */
export function pricesUpTo(monthly: MonthlyClose[], asOfMonth: string): number[] {
  return monthly.filter((m) => m.month <= asOfMonth).map((m) => m.close);
}

const ret = (p: number[], from: number, to: number): number | null => {
  // p indexed from the end: p.at(-1) is the as-of month; returns P[to]/P[from] − 1 with negative offsets
  const a = p[p.length - 1 - from];
  const b = p[p.length - 1 - to];
  return a > 0 && b > 0 ? b / a - 1 : null;
};

/** Momentum 12-2: return over months t−12…t−2 (skips the latest month), Novy-Marx / AMP. */
export const momentum12_2 = (p: number[]): number | null => (p.length >= 14 ? ret(p, 13, 2) : null);
/** Bettman's D_Up/D_Down window: the 6 months starting one year back (t−12…t−7). */
export const bettmanWindow = (p: number[]): number | null => (p.length >= 14 ? ret(p, 13, 7) : null);
/** Variant tested in validation: the last 6 months (t−6…t−1). */
export const recent6m = (p: number[]): number | null => (p.length >= 7 ? ret(p, 6, 0) : null);
/** 1-month reversal r(1,0): last month's return (negative coefficient in Novy-Marx). */
export const reversal1m = (p: number[]): number | null => (p.length >= 2 ? ret(p, 1, 0) : null);
/** 200-day trend proxy on monthly data: price vs its 10-month average. */
export function trend10m(p: number[]): number | null {
  if (p.length < 10) return null;
  const avg = p.slice(-10).reduce((a, b) => a + b, 0) / 10;
  return avg > 0 ? p[p.length - 1] / avg - 1 : null;
}

const v = (p: PeriodValues | undefined, k: keyof PeriodValues['values']) => p?.values[k];
const div = (a: number | undefined, b: number | undefined) => (a !== undefined && b !== undefined && b !== 0 ? a / b : null);
const pctChange = (cur: number | undefined, prev: number | undefined) =>
  cur !== undefined && prev !== undefined && prev !== 0 ? (cur - prev) / Math.abs(prev) : null;

const grossProfitOf = (p: PeriodValues | undefined): number | undefined => {
  const gp = v(p, 'grossProfit');
  if (gp !== undefined) return gp;
  const r = v(p, 'revenue');
  const c = v(p, 'costOfRevenue');
  return r !== undefined && c !== undefined ? r - c : undefined;
};

/** Statement periods → the shape fundamentals.ts expects (total debt stands in for long-term debt). */
export function toAnnualFigures(periods: PeriodValues[]): AnnualFigures[] {
  return periods.map((p) => ({
    fiscalYearEnd: p.end,
    netIncome: v(p, 'netIncome'),
    totalAssets: v(p, 'totalAssets'),
    operatingCashFlow: v(p, 'operatingCashFlow'),
    longTermDebt: v(p, 'totalDebt'),
    currentAssets: v(p, 'currentAssets'),
    currentLiabilities: v(p, 'currentLiabilities'),
    sharesOutstanding: v(p, 'shares'),
    grossProfit: grossProfitOf(p),
    totalRevenue: v(p, 'revenue'),
    stockholdersEquity: v(p, 'equity'),
  }));
}

/** Quarterly EPS (diluted, else net income ÷ shares). */
function quarterEps(q: PeriodValues, fallbackShares?: number): number | undefined {
  const eps = v(q, 'eps');
  if (eps !== undefined) return eps;
  const ni = v(q, 'netIncome');
  const sh = v(q, 'shares') ?? fallbackShares;
  return ni !== undefined && sh ? ni / sh : undefined;
}

/**
 * SUE (Novy-Marx): (EPS_q − EPS_{q−4}) ÷ standard deviation of that seasonal change over the
 * last 8 quarters. Needs 12 consecutive quarters; null otherwise.
 */
export function sue(quarters: PeriodValues[], fallbackShares?: number): number | null {
  const eps = quarters.map((q) => quarterEps(q, fallbackShares));
  if (eps.length < 12) return null;
  const diffs: number[] = [];
  for (let i = eps.length - 8; i < eps.length; i++) {
    const a = eps[i];
    const b = eps[i - 4];
    if (a === undefined || b === undefined) return null;
    diffs.push(a - b);
  }
  const mean = diffs.reduce((s, x) => s + x, 0) / diffs.length;
  const sd = Math.sqrt(diffs.reduce((s, x) => s + (x - mean) ** 2, 0) / (diffs.length - 1));
  return sd > 0 ? diffs[diffs.length - 1] / sd : null;
}

/** Abarbanell & Bushee (1997) operational signals, signed so that higher = more bullish. */
export interface OperationalSignals {
  inv: number | null; // −(%Δinventory − %Δsales)
  ar: number | null; // −(%Δreceivables − %Δsales)
  capexGrowth: number | null; // firm %Δcapex (compared with the industry at market level)
  gm: number | null; // %Δgross margin − %Δsales
  sga: number | null; // −(%ΔSG&A − %Δsales)
  etr: number | null; // −[(mean ETR of up to 3 prior years − ETR_t) × ΔEPS]
  /** Annual earnings fell (the paper's signals work best after bad earnings news). */
  priorBadEarnings: boolean | null;
}

export function operationalSignals(years: PeriodValues[]): OperationalSignals {
  const cur = years[years.length - 1];
  const prev = years[years.length - 2];
  const empty: OperationalSignals = { inv: null, ar: null, capexGrowth: null, gm: null, sga: null, etr: null, priorBadEarnings: null };
  if (!cur || !prev) return empty;
  const sales = pctChange(v(cur, 'revenue'), v(prev, 'revenue'));
  const minus = (a: number | null, b: number | null) => (a !== null && b !== null ? a - b : null);
  const neg = (x: number | null) => (x === null ? null : -x);
  const gmCur = div(grossProfitOf(cur), v(cur, 'revenue'));
  const gmPrev = div(grossProfitOf(prev), v(prev, 'revenue'));
  const etrOf = (p: PeriodValues | undefined) => {
    const r = div(v(p, 'taxProvision'), v(p, 'pretaxIncome'));
    return r !== null && r >= 0 && r <= 1 ? r : null;
  };
  const etrNow = etrOf(cur);
  const priorEtr = years.slice(-4, -1).map(etrOf).filter((x): x is number => x !== null);
  const epsCur = v(cur, 'eps') ?? div(v(cur, 'netIncome'), v(cur, 'shares')) ?? undefined;
  const epsPrev = v(prev, 'eps') ?? div(v(prev, 'netIncome'), v(prev, 'shares')) ?? undefined;
  const dEps = epsCur !== undefined && epsPrev !== undefined ? epsCur - epsPrev : null;
  const capCur = v(cur, 'capex');
  const capPrev = v(prev, 'capex');
  return {
    inv: neg(minus(pctChange(v(cur, 'inventory'), v(prev, 'inventory')), sales)),
    ar: neg(minus(pctChange(v(cur, 'receivables'), v(prev, 'receivables')), sales)),
    capexGrowth: capCur !== undefined && capPrev !== undefined ? pctChange(Math.abs(capCur), Math.abs(capPrev)) : null,
    gm: minus(gmCur !== null && gmPrev !== null && gmPrev !== 0 ? (gmCur - gmPrev) / Math.abs(gmPrev) : null, sales),
    sga: neg(minus(pctChange(v(cur, 'sga'), v(prev, 'sga')), sales)),
    etr: etrNow !== null && priorEtr.length && dEps !== null ? -((priorEtr.reduce((a, b) => a + b, 0) / priorEtr.length - etrNow) * dEps) : null,
    priorBadEarnings: v(cur, 'netIncome') !== undefined && v(prev, 'netIncome') !== undefined ? (v(cur, 'netIncome') as number) < (v(prev, 'netIncome') as number) : null,
  };
}

export interface RawFactors {
  symbol: string;
  asOf: string; // YYYY-MM-DD
  price: number | null;
  priceMonths: number;
  momentum12_2: number | null;
  bettmanWindow: number | null;
  recent6m: number | null;
  reversal1m: number | null;
  trend10m: number | null;
  /** SUE from statements, or the analyst-surprise proxy (current scores only). */
  sue: number | null;
  sueSource: 'sue' | 'analyst-surprise' | null;
  fScore: number | null;
  fScoreMax: number | null;
  operational: OperationalSignals;
  /** Gross profit ÷ total assets (banks: ROA, see profitabilityKind). */
  profitability: number | null;
  profitabilityKind: 'gpa' | 'roa' | null;
  bookToMarket: number | null;
  bvps: number | null;
  eps: number | null;
  /** Next-year consensus EPS (current only; null in back-tests). */
  feps: number | null;
  priceT5: number | null;
  /** Fiscal year end of the latest public annual report. */
  fiscalYear: string | null;
  statementsDate: string | null;
}

/** All raw factors of one stock at a month end, point-in-time. `useAnalyst` only for today. */
export function rawFactors(s: StockInput, asOfMonth: string, useAnalyst: boolean): RawFactors {
  const asOf = monthEnd(asOfMonth);
  const p = pricesUpTo(s.monthly, asOfMonth);
  const price = p.length ? p[p.length - 1] : null;
  const annual = availablePeriods(s.annual, asOf, s.market).filter((x) => x.months === 12);
  const quarters = availablePeriods(s.quarterly, asOf, s.market).filter((x) => x.months === 3);
  const cur = annual[annual.length - 1];
  const shares = v(cur, 'shares') ?? s.shares;
  const f = piotroski(toAnnualFigures(annual.slice(-3)));
  let sueValue = sue(quarters, s.shares);
  let sueSource: RawFactors['sueSource'] = sueValue === null ? null : 'sue';
  if (sueValue === null && useAnalyst && s.analyst?.surprises.length) {
    const vals = s.analyst.surprises.map((x) => x.surprisePct).filter((x): x is number => x !== null);
    if (vals.length >= 2) {
      sueValue = vals.map((x) => Math.max(-100, Math.min(100, x))).reduce((a, b) => a + b, 0) / vals.length;
      sueSource = 'analyst-surprise';
    }
  }
  const assets = v(cur, 'totalAssets');
  const gp = grossProfitOf(cur);
  const financial = Boolean(s.isFinancial) || gp === undefined;
  const profitability = financial ? div(v(cur, 'netIncome'), assets) : div(gp, assets);
  const equity = v(cur, 'equity');
  const mcap = price !== null && shares ? price * shares : null;
  const eps = v(cur, 'eps') ?? div(v(cur, 'netIncome'), shares) ?? null;
  return {
    symbol: s.symbol,
    asOf,
    price,
    priceMonths: p.length,
    momentum12_2: momentum12_2(p),
    bettmanWindow: bettmanWindow(p),
    recent6m: recent6m(p),
    reversal1m: reversal1m(p),
    trend10m: trend10m(p),
    sue: sueValue,
    sueSource,
    fScore: f ? f.score : null,
    fScoreMax: f ? f.max : null,
    operational: operationalSignals(annual),
    profitability,
    profitabilityKind: profitability === null ? null : financial ? 'roa' : 'gpa',
    bookToMarket: equity !== undefined && mcap ? equity / mcap : null,
    bvps: div(equity, shares),
    eps,
    feps: useAnalyst && s.analyst?.nextYear && s.analyst.coverage > 0 ? s.analyst.nextYear.avg : null,
    priceT5: p.length >= 6 ? p[p.length - 6] : null,
    fiscalYear: cur?.end ?? null,
    statementsDate: cur ? publishedOn(cur, s.market) : null,
  };
}
