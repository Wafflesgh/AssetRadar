/**
 * fundamentals.ts — Financial-statement analysis for stocks from annual reports:
 * the Piotroski (2000) F-score (nine pass/fail signals on profitability, leverage/liquidity
 * and operating efficiency), Novy-Marx (2013) gross profitability (gross profit ÷ total
 * assets), and simple valuation ratios (P/E, P/B, earnings yield) from the live market cap.
 * Signals whose inputs a company does not report (banks have no gross profit or current
 * ratio) are marked unavailable instead of being counted as failures.
 */

/** One fiscal year of reported figures (in the reporting currency). */
export interface AnnualFigures {
  fiscalYearEnd: string; // YYYY-MM-DD
  netIncome?: number;
  totalAssets?: number;
  operatingCashFlow?: number;
  longTermDebt?: number;
  currentAssets?: number;
  currentLiabilities?: number;
  sharesOutstanding?: number;
  grossProfit?: number;
  totalRevenue?: number;
  stockholdersEquity?: number;
}

export interface FScoreSignal {
  id: string;
  label: string;
  group: 'Profitability' | 'Leverage & liquidity' | 'Operating efficiency';
  /** true = pass (1 point), false = fail, null = not reported. */
  pass: boolean | null;
  detail: string;
}

export interface FundamentalReport {
  fiscalYearEnd: string;
  currency: string;
  fScore: number;
  /** Signals that could be evaluated (out of 9). */
  fScoreMax: number;
  signals: FScoreSignal[];
  grossProfitability: number | null;
  roa: number | null;
  pe: number | null;
  pb: number | null;
  earningsYield: number | null;
}

const ratio = (a?: number, b?: number) => (a !== undefined && b !== undefined && b !== 0 ? a / b : undefined);
const fmtPct = (x: number) => `${(x * 100).toFixed(1)}%`;

/**
 * Piotroski F-score for the latest year vs the year before. `years` must be sorted oldest
 * first and contain at least two years (three gives beginning-of-year assets for both).
 */
export function piotroski(years: AnnualFigures[]): { score: number; max: number; signals: FScoreSignal[] } | null {
  if (years.length < 2) return null;
  const cur = years[years.length - 1];
  const prev = years[years.length - 2];
  const prev2 = years.length >= 3 ? years[years.length - 3] : undefined;
  // Piotroski scales by beginning-of-year assets; fall back to the year's own assets
  const assetsBeginCur = prev.totalAssets ?? cur.totalAssets;
  const assetsBeginPrev = prev2?.totalAssets ?? prev.totalAssets;

  const roa = ratio(cur.netIncome, assetsBeginCur);
  const roaPrev = ratio(prev.netIncome, assetsBeginPrev);
  const cfo = ratio(cur.operatingCashFlow, assetsBeginCur);
  const lev = ratio(cur.longTermDebt ?? 0, cur.totalAssets);
  const levPrev = ratio(prev.longTermDebt ?? 0, prev.totalAssets);
  const cr = ratio(cur.currentAssets, cur.currentLiabilities);
  const crPrev = ratio(prev.currentAssets, prev.currentLiabilities);
  const gm = ratio(cur.grossProfit, cur.totalRevenue);
  const gmPrev = ratio(prev.grossProfit, prev.totalRevenue);
  const at = ratio(cur.totalRevenue, assetsBeginCur);
  const atPrev = ratio(prev.totalRevenue, assetsBeginPrev);

  const sig = (
    id: string,
    label: string,
    group: FScoreSignal['group'],
    pass: boolean | null,
    detail: string
  ): FScoreSignal => ({ id, label, group, pass, detail });

  const signals: FScoreSignal[] = [
    sig('roa', 'Positive return on assets', 'Profitability', roa === undefined ? null : roa > 0, roa === undefined ? 'Not reported' : `ROA ${fmtPct(roa)}`),
    sig('cfo', 'Positive operating cash flow', 'Profitability', cfo === undefined ? null : cfo > 0, cfo === undefined ? 'Not reported' : `CFO/assets ${fmtPct(cfo)}`),
    sig(
      'droa',
      'Return on assets improved',
      'Profitability',
      roa === undefined || roaPrev === undefined ? null : roa > roaPrev,
      roa === undefined || roaPrev === undefined ? 'Not reported' : `${fmtPct(roaPrev)} → ${fmtPct(roa)}`
    ),
    sig(
      'accrual',
      'Cash flow exceeds net income (earnings quality)',
      'Profitability',
      cfo === undefined || roa === undefined ? null : cfo > roa,
      cfo === undefined || roa === undefined ? 'Not reported' : `CFO/assets ${fmtPct(cfo)} vs ROA ${fmtPct(roa)}`
    ),
    sig(
      'lev',
      'Long-term debt ratio fell',
      'Leverage & liquidity',
      lev === undefined || levPrev === undefined ? null : lev <= levPrev,
      lev === undefined || levPrev === undefined ? 'Not reported' : `${fmtPct(levPrev)} → ${fmtPct(lev)} of assets`
    ),
    sig(
      'liq',
      'Current ratio improved',
      'Leverage & liquidity',
      cr === undefined || crPrev === undefined ? null : cr > crPrev,
      cr === undefined || crPrev === undefined ? 'Not reported (common for banks)' : `${crPrev.toFixed(2)} → ${cr.toFixed(2)}`
    ),
    sig(
      'eq',
      'No new shares issued',
      'Leverage & liquidity',
      cur.sharesOutstanding === undefined || prev.sharesOutstanding === undefined ? null : cur.sharesOutstanding <= prev.sharesOutstanding * 1.001,
      cur.sharesOutstanding === undefined || prev.sharesOutstanding === undefined
        ? 'Not reported'
        : `${(cur.sharesOutstanding / prev.sharesOutstanding - 1 >= 0 ? '+' : '')}${fmtPct(cur.sharesOutstanding / prev.sharesOutstanding - 1)} shares`
    ),
    sig(
      'gm',
      'Gross margin improved',
      'Operating efficiency',
      gm === undefined || gmPrev === undefined ? null : gm > gmPrev,
      gm === undefined || gmPrev === undefined ? 'Not reported (common for banks)' : `${fmtPct(gmPrev)} → ${fmtPct(gm)}`
    ),
    sig(
      'turn',
      'Asset turnover improved',
      'Operating efficiency',
      at === undefined || atPrev === undefined ? null : at > atPrev,
      at === undefined || atPrev === undefined ? 'Not reported' : `${atPrev.toFixed(2)} → ${at.toFixed(2)}`
    ),
  ];
  const evaluated = signals.filter((s) => s.pass !== null);
  return { score: evaluated.filter((s) => s.pass).length, max: evaluated.length, signals };
}

/** Full report; `marketCap` must be in the reporting currency for P/E and P/B. */
export function analyzeFundamentals(years: AnnualFigures[], currency: string, marketCap?: number): FundamentalReport | null {
  const sorted = [...years].sort((a, b) => a.fiscalYearEnd.localeCompare(b.fiscalYearEnd));
  const f = piotroski(sorted);
  if (!f || f.max < 5) return null;
  const cur = sorted[sorted.length - 1];
  const prevAssets = sorted[sorted.length - 2]?.totalAssets ?? cur.totalAssets;
  const ni = cur.netIncome;
  return {
    fiscalYearEnd: cur.fiscalYearEnd,
    currency,
    fScore: f.score,
    fScoreMax: f.max,
    signals: f.signals,
    grossProfitability: ratio(cur.grossProfit, cur.totalAssets) ?? null,
    roa: ratio(ni, prevAssets) ?? null,
    pe: marketCap && ni && ni > 0 ? marketCap / ni : null,
    pb: marketCap && cur.stockholdersEquity && cur.stockholdersEquity > 0 ? marketCap / cur.stockholdersEquity : null,
    earningsYield: marketCap && ni !== undefined ? ni / marketCap : null,
  };
}

/** Field name → Yahoo fundamentals-timeseries type (annual). */
export const YAHOO_FUNDAMENTAL_TYPES: Record<keyof Omit<AnnualFigures, 'fiscalYearEnd'>, string> = {
  netIncome: 'annualNetIncome',
  totalAssets: 'annualTotalAssets',
  operatingCashFlow: 'annualOperatingCashFlow',
  longTermDebt: 'annualLongTermDebt',
  currentAssets: 'annualCurrentAssets',
  currentLiabilities: 'annualCurrentLiabilities',
  sharesOutstanding: 'annualOrdinarySharesNumber',
  grossProfit: 'annualGrossProfit',
  totalRevenue: 'annualTotalRevenue',
  stockholdersEquity: 'annualStockholdersEquity',
};

/** Parses a Yahoo fundamentals-timeseries response into fiscal years (oldest first). */
export function parseYahooFundamentals(json: unknown): { years: AnnualFigures[]; currency: string } {
  const results = (json as { timeseries?: { result?: Array<Record<string, unknown>> } })?.timeseries?.result ?? [];
  const byDate = new Map<string, AnnualFigures>();
  let currency = '';
  const typeToField = new Map(Object.entries(YAHOO_FUNDAMENTAL_TYPES).map(([field, type]) => [type, field]));
  for (const r of results) {
    const type = ((r.meta as { type?: string[] })?.type ?? [])[0];
    const field = type ? typeToField.get(type) : undefined;
    if (!field || !type) continue;
    const rows = (r[type] as Array<{ asOfDate?: string; currencyCode?: string; reportedValue?: { raw?: number } } | null>) ?? [];
    for (const row of rows) {
      const date = row?.asOfDate;
      const value = row?.reportedValue?.raw;
      if (!date || typeof value !== 'number' || !Number.isFinite(value)) continue;
      if (row?.currencyCode && field !== 'sharesOutstanding') currency = row.currencyCode;
      const y = byDate.get(date) ?? { fiscalYearEnd: date };
      (y as unknown as Record<string, number>)[field] = value;
      byDate.set(date, y);
    }
  }
  return { years: [...byDate.values()].sort((a, b) => a.fiscalYearEnd.localeCompare(b.fiscalYearEnd)), currency };
}
