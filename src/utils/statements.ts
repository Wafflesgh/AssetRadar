/**
 * statements.ts — Company financial statements for the detail page: parses Yahoo's
 * fundamentals time series (annual ±4–5 years, quarterly ±5 quarters) and SEC EDGAR company
 * facts (US companies, 10+ years of 10-Q/10-K data), turns year-to-date filings into quarters by
 * differencing, merges both sources period by period, builds semesters (H1/H2) from quarters,
 * and computes ratios (margins, ROE, ROA, DER, current ratio, asset turnover, growth, EPS, P/E,
 * P/B, dividend yield). Numbers a source does not report stay empty — nothing is estimated;
 * values computed from other reported values are marked "derived".
 */

export type StatementPeriod = 'annual' | 'semester' | 'quarterly';

export type ItemKey =
  | 'revenue'
  | 'grossProfit'
  | 'operatingIncome'
  | 'netIncome'
  | 'eps'
  | 'netInterestIncome'
  | 'totalAssets'
  | 'totalLiabilities'
  | 'equity'
  | 'cash'
  | 'totalDebt'
  | 'currentAssets'
  | 'currentLiabilities'
  | 'operatingCashFlow'
  | 'investingCashFlow'
  | 'financingCashFlow'
  | 'capex'
  | 'freeCashFlow'
  | 'dividendsPaid'
  | 'shares'
  | 'costOfRevenue'
  | 'sga'
  | 'pretaxIncome'
  | 'taxProvision'
  | 'inventory'
  | 'receivables';

export type Statement = 'income' | 'balance' | 'cashflow';

export const LINE_ITEMS: Array<{ key: ItemKey; label: string; statement: Statement; flow: boolean; perShare?: boolean }> = [
  { key: 'revenue', label: 'Revenue', statement: 'income', flow: true },
  { key: 'netInterestIncome', label: 'Net interest income (banks)', statement: 'income', flow: true },
  { key: 'grossProfit', label: 'Gross profit', statement: 'income', flow: true },
  { key: 'operatingIncome', label: 'Operating income', statement: 'income', flow: true },
  { key: 'netIncome', label: 'Net income', statement: 'income', flow: true },
  { key: 'eps', label: 'EPS (diluted)', statement: 'income', flow: true, perShare: true },
  { key: 'totalAssets', label: 'Total assets', statement: 'balance', flow: false },
  { key: 'totalLiabilities', label: 'Total liabilities', statement: 'balance', flow: false },
  { key: 'equity', label: "Shareholders' equity", statement: 'balance', flow: false },
  { key: 'cash', label: 'Cash & equivalents', statement: 'balance', flow: false },
  { key: 'totalDebt', label: 'Total debt', statement: 'balance', flow: false },
  { key: 'currentAssets', label: 'Current assets', statement: 'balance', flow: false },
  { key: 'currentLiabilities', label: 'Current liabilities', statement: 'balance', flow: false },
  { key: 'operatingCashFlow', label: 'Operating cash flow', statement: 'cashflow', flow: true },
  { key: 'investingCashFlow', label: 'Investing cash flow', statement: 'cashflow', flow: true },
  { key: 'financingCashFlow', label: 'Financing cash flow', statement: 'cashflow', flow: true },
  { key: 'capex', label: 'Capital expenditure', statement: 'cashflow', flow: true },
  { key: 'freeCashFlow', label: 'Free cash flow', statement: 'cashflow', flow: true },
  { key: 'dividendsPaid', label: 'Dividends paid', statement: 'cashflow', flow: true },
  { key: 'shares', label: 'Shares (diluted / outstanding)', statement: 'balance', flow: false },
  // Inputs for the operational audit (Abarbanell & Bushee) and the effective tax rate
  { key: 'costOfRevenue', label: 'Cost of revenue', statement: 'income', flow: true },
  { key: 'sga', label: 'Selling, general & administrative', statement: 'income', flow: true },
  { key: 'pretaxIncome', label: 'Pretax income', statement: 'income', flow: true },
  { key: 'taxProvision', label: 'Income tax', statement: 'income', flow: true },
  { key: 'inventory', label: 'Inventory', statement: 'balance', flow: false },
  { key: 'receivables', label: 'Accounts receivable', statement: 'balance', flow: false },
];

const FLOW = new Set(LINE_ITEMS.filter((i) => i.flow && !i.perShare).map((i) => i.key));

export type ValueSource = 'yahoo' | 'sec' | 'derived';

export interface PeriodValues {
  /** Period end, YYYY-MM-DD. */
  end: string;
  months: 3 | 6 | 12;
  /** First SEC filing date of this period's figures (point-in-time checks); absent for Yahoo. */
  filed?: string;
  values: Partial<Record<ItemKey, number>>;
  sources: Partial<Record<ItemKey, ValueSource>>;
}

// ---- Yahoo ----------------------------------------------------------------------------------

export const YAHOO_STATEMENT_TYPES: Record<ItemKey, string | null> = {
  revenue: 'TotalRevenue',
  grossProfit: 'GrossProfit',
  operatingIncome: 'OperatingIncome',
  netIncome: 'NetIncome',
  eps: 'DilutedEPS',
  netInterestIncome: 'NetInterestIncome',
  totalAssets: 'TotalAssets',
  totalLiabilities: 'TotalLiabilitiesNetMinorityInterest',
  equity: 'StockholdersEquity',
  cash: 'CashAndCashEquivalents',
  totalDebt: 'TotalDebt',
  currentAssets: 'CurrentAssets',
  currentLiabilities: 'CurrentLiabilities',
  operatingCashFlow: 'OperatingCashFlow',
  investingCashFlow: 'InvestingCashFlow',
  financingCashFlow: 'FinancingCashFlow',
  capex: 'CapitalExpenditure',
  freeCashFlow: 'FreeCashFlow',
  dividendsPaid: 'CashDividendsPaid',
  shares: 'OrdinarySharesNumber',
  costOfRevenue: 'CostOfRevenue',
  sga: 'SellingGeneralAndAdministration',
  pretaxIncome: 'PretaxIncome',
  taxProvision: 'TaxProvision',
  inventory: 'Inventory',
  receivables: 'AccountsReceivable',
};

/** All "annualX,quarterlyX" type names for one fundamentals-timeseries request. */
export function yahooStatementTypeList(): string {
  return Object.values(YAHOO_STATEMENT_TYPES)
    .filter((t): t is string => Boolean(t))
    .flatMap((t) => [`annual${t}`, `quarterly${t}`])
    .join(',');
}

export function parseYahooStatements(json: unknown): { annual: PeriodValues[]; quarterly: PeriodValues[]; currency: string } {
  const results = (json as { timeseries?: { result?: Array<Record<string, unknown>> } })?.timeseries?.result ?? [];
  const byType = new Map<string, ItemKey>();
  for (const [key, t] of Object.entries(YAHOO_STATEMENT_TYPES)) if (t) byType.set(t, key as ItemKey);
  const annual = new Map<string, PeriodValues>();
  const quarterly = new Map<string, PeriodValues>();
  let currency = '';
  for (const r of results) {
    const type = ((r.meta as { type?: string[] })?.type ?? [])[0] ?? '';
    const m = type.match(/^(annual|quarterly)(.+)$/);
    const key = m ? byType.get(m[2]) : undefined;
    if (!m || !key) continue;
    const target = m[1] === 'annual' ? annual : quarterly;
    for (const row of (r[type] as Array<{ asOfDate?: string; currencyCode?: string; reportedValue?: { raw?: number } } | null>) ?? []) {
      const end = row?.asOfDate;
      const value = row?.reportedValue?.raw;
      if (!end || typeof value !== 'number' || !Number.isFinite(value)) continue;
      if (row?.currencyCode && key !== 'shares' && key !== 'eps') currency = row.currencyCode;
      const p = target.get(end) ?? { end, months: m[1] === 'annual' ? 12 : 3, values: {}, sources: {} };
      p.values[key] = value;
      p.sources[key] = 'yahoo';
      target.set(end, p);
    }
  }
  const sorted = (x: Map<string, PeriodValues>) => [...x.values()].sort((a, b) => a.end.localeCompare(b.end));
  return { annual: sorted(annual), quarterly: sorted(quarterly), currency };
}

// ---- SEC EDGAR company facts ------------------------------------------------------------------

const SEC_TAGS: Partial<Record<ItemKey, string[]>> = {
  revenue: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'RevenuesNetOfInterestExpense'],
  grossProfit: ['GrossProfit'],
  operatingIncome: ['OperatingIncomeLoss'],
  netIncome: ['NetIncomeLoss', 'ProfitLoss'],
  eps: ['EarningsPerShareDiluted'],
  netInterestIncome: ['InterestIncomeExpenseNet'],
  totalAssets: ['Assets'],
  totalLiabilities: ['Liabilities'],
  equity: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
  cash: ['CashAndCashEquivalentsAtCarryingValue'],
  currentAssets: ['AssetsCurrent'],
  currentLiabilities: ['LiabilitiesCurrent'],
  operatingCashFlow: ['NetCashProvidedByUsedInOperatingActivities'],
  investingCashFlow: ['NetCashProvidedByUsedInInvestingActivities'],
  financingCashFlow: ['NetCashProvidedByUsedInFinancingActivities'],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment'],
  dividendsPaid: ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock'],
  shares: ['WeightedAverageNumberOfDilutedSharesOutstanding'],
  costOfRevenue: ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold'],
  sga: ['SellingGeneralAndAdministrativeExpense'],
  pretaxIncome: [
    'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
    'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
  ],
  taxProvision: ['IncomeTaxExpenseBenefit'],
  inventory: ['InventoryNet'],
  receivables: ['AccountsReceivableNetCurrent'],
};

interface SecFact {
  start?: string;
  end: string;
  val: number;
  filed?: string;
  form?: string;
  /** Earliest filing that reported this period (later 10-Ks repeat it as a comparative). */
  firstFiled?: string;
}

const dayMs = 86_400_000;
const monthsBetween = (start: string, end: string) => Math.round((Date.parse(end) - Date.parse(start)) / dayMs / 30.44);

/** Latest filed value per (start, end). */
function dedupe(facts: SecFact[]): SecFact[] {
  const by = new Map<string, SecFact>();
  for (const f of facts) {
    if (!f || typeof f.val !== 'number' || !f.end) continue;
    if (f.form && !/^(10-K|10-Q|10-K\/A|10-Q\/A)/.test(f.form)) continue;
    const k = `${f.start ?? ''}|${f.end}`;
    const prev = by.get(k);
    const first = [prev?.firstFiled, f.filed].filter((x): x is string => Boolean(x)).sort()[0];
    // The latest filing's value (restatements) with the date it first became public
    if (!prev || (f.filed ?? '') > (prev.filed ?? '')) by.set(k, { ...f, firstFiled: first });
    else prev.firstFiled = first;
  }
  return [...by.values()];
}

function pickTag(gaap: Record<string, { units?: Record<string, SecFact[]> }>, tags: string[], unit: string): SecFact[] {
  // The tag with the most recent data wins (companies switch tags over the years)
  let best: SecFact[] = [];
  let bestEnd = '';
  for (const t of tags) {
    const facts = dedupe(gaap[t]?.units?.[unit] ?? []);
    const last = facts.reduce((m, f) => (f.end > m ? f.end : m), '');
    if (last > bestEnd) {
      best = facts;
      bestEnd = last;
    }
  }
  return best;
}

/**
 * Annual and quarterly periods from SEC company facts. Flows reported year-to-date (6 or 9
 * months, common for cash flows) become quarters by subtracting the previous cumulative value;
 * the fourth quarter is the annual value minus the first three. Those quarters are "derived".
 */
export function parseSecFacts(json: unknown): { annual: PeriodValues[]; quarterly: PeriodValues[] } {
  const gaap = (json as { facts?: { 'us-gaap'?: Record<string, { units?: Record<string, SecFact[]> }> } })?.facts?.['us-gaap'] ?? {};
  const annual = new Map<string, PeriodValues>();
  const quarterly = new Map<string, PeriodValues>();
  const put = (target: Map<string, PeriodValues>, end: string, months: 3 | 12, key: ItemKey, value: number, src: ValueSource, filed?: string) => {
    const p: PeriodValues = target.get(end) ?? { end, months, values: {}, sources: {} };
    if (p.values[key] === undefined || (p.sources[key] === 'derived' && src === 'sec')) {
      p.values[key] = value;
      p.sources[key] = src;
    }
    // A period is public once its last needed figure is filed
    if (filed && (!p.filed || filed > p.filed)) p.filed = filed;
    target.set(end, p);
  };

  for (const [key, tags] of Object.entries(SEC_TAGS) as Array<[ItemKey, string[]]>) {
    const unit = key === 'eps' ? 'USD/shares' : key === 'shares' ? 'shares' : 'USD';
    const facts = pickTag(gaap, tags, unit);
    const isInstant = !LINE_ITEMS.find((i) => i.key === key)?.flow || key === 'shares';
    if (isInstant && key !== 'shares') {
      // Balance sheet: one value per period end; attach to the quarter and (if it is a FY end) the year
      for (const f of facts.filter((x) => !x.start)) put(quarterly, f.end, 3, key, f.val, 'sec', f.firstFiled);
      continue;
    }
    const withDur = facts.filter((f) => f.start).map((f) => ({ ...f, months: monthsBetween(f.start as string, f.end) }));
    for (const f of withDur) {
      if (f.months === 12) put(annual, f.end, 12, key, f.val, 'sec', f.firstFiled);
      if (f.months === 3) put(quarterly, f.end, 3, key, f.val, 'sec', f.firstFiled);
    }
    if (key === 'eps' || key === 'shares') continue; // not additive: no differencing
    // Year-to-date → quarters: group cumulative values by fiscal-year start
    const byStart = new Map<string, Array<{ end: string; months: number; val: number; firstFiled?: string }>>();
    for (const f of withDur) {
      if (![3, 6, 9, 12].includes(f.months)) continue;
      byStart.set(f.start as string, [...(byStart.get(f.start as string) ?? []), f]);
    }
    for (const list of byStart.values()) {
      list.sort((a, b) => a.months - b.months);
      for (let i = 1; i < list.length; i++) {
        if (list[i].months - list[i - 1].months !== 3) continue;
        put(quarterly, list[i].end, 3, key, list[i].val - list[i - 1].val, 'derived', list[i].firstFiled);
      }
    }
    // Fourth quarter when only the three quarters and the full year are filed: year − Q1..Q3
    for (const y of withDur.filter((f) => f.months === 12)) {
      if (quarterly.get(y.end)?.values[key] !== undefined) continue;
      const inYear = [...quarterly.values()].filter((p) => p.end > (y.start as string) && p.end < y.end && p.values[key] !== undefined);
      if (inYear.length !== 3) continue;
      put(quarterly, y.end, 3, key, y.val - inYear.reduce((sum, p) => sum + (p.values[key] as number), 0), 'derived', y.firstFiled);
    }
  }
  // Balance-sheet values at fiscal year ends also belong to the annual periods
  for (const a of annual.values()) {
    const q = quarterly.get(a.end);
    if (!q) continue;
    for (const item of LINE_ITEMS) {
      if (!item.flow && item.key !== 'shares' && q.values[item.key] !== undefined && a.values[item.key] === undefined) {
        a.values[item.key] = q.values[item.key];
        a.sources[item.key] = q.sources[item.key];
      }
    }
  }
  // Keep only quarters that look like real quarter ends (drop stray instants)
  const sorted = (x: Map<string, PeriodValues>) => [...x.values()].sort((a, b) => a.end.localeCompare(b.end));
  return { annual: sorted(annual), quarterly: sorted(quarterly).filter((q) => Object.keys(q.values).length >= 2) };
}

// ---- Merging, derived lines, semesters ----------------------------------------------------------

const near = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) <= 12 * dayMs;

/** Primary periods win; the secondary fills items the primary lacks (matched by end date ±12 days). */
export function mergePeriods(primary: PeriodValues[], secondary: PeriodValues[]): PeriodValues[] {
  const out = primary.map((p) => ({ ...p, values: { ...p.values }, sources: { ...p.sources } }));
  for (const s of secondary) {
    const match = out.find((p) => near(p.end, s.end));
    if (!match) {
      out.push({ ...s, values: { ...s.values }, sources: { ...s.sources } });
      continue;
    }
    for (const [k, v] of Object.entries(s.values) as Array<[ItemKey, number]>) {
      if (match.values[k] === undefined) {
        match.values[k] = v;
        match.sources[k] = s.sources[k];
      }
    }
  }
  return out.sort((a, b) => a.end.localeCompare(b.end));
}

/** Free cash flow = operating cash flow + capex (capex is negative in Yahoo, positive in SEC). */
export function addDerivedLines(periods: PeriodValues[], capexPositive: boolean): PeriodValues[] {
  return periods.map((p) => {
    const v = { ...p.values };
    const s = { ...p.sources };
    if (v.capex !== undefined && capexPositive) v.capex = -Math.abs(v.capex);
    if (v.dividendsPaid !== undefined) v.dividendsPaid = -Math.abs(v.dividendsPaid);
    if (v.freeCashFlow === undefined && v.operatingCashFlow !== undefined && v.capex !== undefined) {
      v.freeCashFlow = v.operatingCashFlow + v.capex;
      s.freeCashFlow = 'derived';
    }
    return { ...p, values: v, sources: s };
  });
}

/**
 * Month of a period end, moved back 15 days first: 52/53-week companies end quarters a few days
 * into the next month (Apple's "1 July" quarter belongs to June).
 */
const monthOf = (d: string) => new Date(Date.parse(d) - 15 * dayMs).getUTCMonth() + 1;
const yearOf = (d: string) => new Date(Date.parse(d) - 15 * dayMs).getUTCFullYear();

/** Fiscal year-end month (1–12) from the annual periods (most common), default December. */
export function fiscalYearEndMonth(annual: PeriodValues[]): number {
  const counts = new Map<number, number>();
  for (const a of annual) {
    const m = monthOf(a.end);
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 12;
}

/** Fiscal quarter (1–4) of a quarter ending at `end`. */
export function fiscalQuarter(end: string, fyEnd: number): number {
  const diff = (monthOf(end) - fyEnd + 12) % 12;
  // A quarter ending in the FY end month (diff 0) is Q4
  return [4, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4][diff];
}

export function fiscalYear(end: string, fyEnd: number): number {
  const y = yearOf(end);
  return monthOf(end) > fyEnd ? y + 1 : y;
}

/**
 * Fills one missing quarter per fiscal year from the annual report: when three quarters and
 * the full year report a flow, the fourth quarter = year − the other three ("derived"). Balance
 * sheet items of a quarter that was never published stay empty.
 */
export function fillQuartersFromAnnual(quarters: PeriodValues[], annual: PeriodValues[], fyEnd: number): PeriodValues[] {
  const out = quarters.map((p) => ({ ...p, values: { ...p.values }, sources: { ...p.sources } }));
  for (const year of annual) {
    if (year.months !== 12 || monthOf(year.end) !== fyEnd) continue;
    const fy = fiscalYear(year.end, fyEnd);
    const inYear = out.filter((p) => p.months === 3 && fiscalYear(p.end, fyEnd) === fy);
    for (const key of FLOW) {
      const total = year.values[key];
      if (total === undefined) continue;
      const have = inYear.filter((p) => p.values[key] !== undefined);
      const seen = new Set(have.map((p) => fiscalQuarter(p.end, fyEnd)));
      if (have.length !== 3 || seen.size !== 3) continue;
      const missingQ = [1, 2, 3, 4].find((n) => !seen.has(n)) as number;
      let target = inYear.find((p) => fiscalQuarter(p.end, fyEnd) === missingQ);
      if (!target) {
        // Month end of the missing quarter: the fiscal year end moved back 3 months per quarter
        const fyEndDate = new Date(Date.parse(year.end) - 15 * dayMs);
        const end = new Date(Date.UTC(fyEndDate.getUTCFullYear(), fyEndDate.getUTCMonth() + 1 - 3 * (4 - missingQ), 0)).toISOString().slice(0, 10);
        target = { end, months: 3, values: {}, sources: {} };
        out.push(target);
        inYear.push(target);
      }
      target.values[key] = total - have.reduce((sum, p) => sum + (p.values[key] as number), 0);
      target.sources[key] = 'derived';
    }
  }
  return out.sort((a, b) => a.end.localeCompare(b.end));
}

/** H1 = fiscal Q1+Q2, H2 = Q3+Q4 (both quarters required). Balance items from the later quarter. */
export function buildSemesters(quarters: PeriodValues[], fyEnd: number): PeriodValues[] {
  const out: PeriodValues[] = [];
  const sorted = [...quarters].sort((a, b) => a.end.localeCompare(b.end));
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    const qb = fiscalQuarter(b.end, fyEnd);
    if ((qb !== 2 && qb !== 4) || fiscalQuarter(a.end, fyEnd) !== qb - 1) continue;
    const gap = (Date.parse(b.end) - Date.parse(a.end)) / dayMs;
    if (gap < 75 || gap > 105) continue;
    const values: PeriodValues['values'] = {};
    const sources: PeriodValues['sources'] = {};
    for (const item of LINE_ITEMS) {
      const k = item.key;
      if (FLOW.has(k) || k === 'eps') {
        if (a.values[k] !== undefined && b.values[k] !== undefined) {
          values[k] = (a.values[k] as number) + (b.values[k] as number);
          sources[k] = 'derived';
        }
      } else if (b.values[k] !== undefined) {
        values[k] = b.values[k];
        sources[k] = b.sources[k];
      }
    }
    out.push({ end: b.end, months: 6, values, sources });
  }
  return out;
}

/** Annual periods that end in the fiscal year-end month (drops stray 12-month spans). */
export function fiscalYears(annual: PeriodValues[], fyEnd: number): PeriodValues[] {
  return annual.filter((a) => monthOf(a.end) === fyEnd);
}

export function periodLabel(p: Pick<PeriodValues, 'end' | 'months'>, fyEnd: number): string {
  const fy = fiscalYear(p.end, fyEnd);
  const prefix = fyEnd === 12 ? '' : 'FY';
  if (p.months === 12) return `FY${fy}`;
  if (p.months === 6) return `H${fiscalQuarter(p.end, fyEnd) <= 2 ? 1 : 2} ${prefix}${fy}`;
  return `Q${fiscalQuarter(p.end, fyEnd)} ${prefix}${fy}`;
}

// ---- Ratios -----------------------------------------------------------------------------------

export interface PeriodRatios {
  grossMargin?: number;
  operatingMargin?: number;
  netMargin?: number;
  roe?: number;
  roa?: number;
  der?: number;
  currentRatio?: number;
  assetTurnover?: number;
  revenueYoY?: number;
  netIncomeYoY?: number;
  revenueQoQ?: number;
  netIncomeQoQ?: number;
  pe?: number;
  pb?: number;
  dividendYield?: number;
  /**
   * How flows were turned into a yearly figure for ROE, ROA, asset turnover, P/E and yield:
   * the period itself (annual), the trailing 12 months (ttm) or the period × 12/months when
   * earlier periods are missing (annualized).
   */
  basis: 'annual' | 'ttm' | 'annualized';
}

export interface StatementRow extends PeriodValues {
  label: string;
  /** True for a period that should exist between reported ones but has no data. */
  missing?: boolean;
  ratios: PeriodRatios;
  /** Share price used for P/E, P/B and yield, and where it came from. */
  price?: number;
  priceKind?: 'live' | 'period-end';
}

const div = (a: number | undefined, b: number | undefined) => (a !== undefined && b !== undefined && b !== 0 ? a / b : undefined);
const growth = (a: number | undefined, b: number | undefined) => (a !== undefined && b !== undefined && b !== 0 ? (a / Math.abs(b) - Math.sign(b)) * 100 : undefined);

/** Sum of a flow over the trailing periods that make up 12 months (undefined if any is missing). */
function trailing(rows: PeriodValues[], i: number, key: ItemKey): number | undefined {
  const per = rows[i].months;
  const n = 12 / per;
  if (i - n + 1 < 0) return undefined;
  let sum = 0;
  for (let k = i - n + 1; k <= i; k++) {
    const v = rows[k].values[key];
    if (v === undefined) return undefined;
    sum += v;
  }
  // Periods must be consecutive (about 12 months from the first to the last end)
  const span = (Date.parse(rows[i].end) - Date.parse(rows[i - n + 1].end)) / dayMs;
  return span > 365 - per * 30.44 + 25 ? undefined : sum;
}

/**
 * Builds the table rows with ratios. `priceAt(end)` gives the share price at a period end; the
 * newest period uses `livePrice` instead. Valuation ratios are skipped when the report currency
 * differs from the share's quote currency.
 */
export function buildStatementRows(
  periods: PeriodValues[],
  fyEnd: number,
  opts: { livePrice?: number; priceAt?: (end: string) => number | undefined; sameCurrency: boolean }
): StatementRow[] {
  const rows = [...periods].sort((a, b) => a.end.localeCompare(b.end));
  return rows.map((p, i) => {
    const v = p.values;
    const factor = 12 / p.months;
    const ttmNi = p.months === 12 ? v.netIncome : trailing(rows, i, 'netIncome');
    const basis: PeriodRatios['basis'] = p.months === 12 ? 'annual' : ttmNi !== undefined ? 'ttm' : 'annualized';
    const yearly = (key: ItemKey) => (basis === 'annual' ? v[key] : basis === 'ttm' ? trailing(rows, i, key) : v[key] !== undefined ? (v[key] as number) * factor : undefined);
    const ni = yearly('netIncome');
    const rev = yearly('revenue');
    const shares = v.shares;
    const reportedEps = yearly('eps');
    // EPS is not reported for derived quarters (Q4 = year − 9 months): use net income ÷ shares
    const eps = reportedEps ?? (ni !== undefined && shares ? ni / shares : undefined);
    const divs = yearly('dividendsPaid');
    const yearAgo = rows.find((r) => r.months === p.months && Math.abs(Date.parse(p.end) - Date.parse(r.end) - 365 * dayMs) < 25 * dayMs);
    const gap = i > 0 ? (Date.parse(p.end) - Date.parse(rows[i - 1].end)) / dayMs : 0;
    const prev = p.months !== 12 && gap > p.months * 30.44 - 25 && gap < p.months * 30.44 + 25 ? rows[i - 1] : undefined;
    const isLatest = i === rows.length - 1;
    const price = !opts.sameCurrency ? undefined : isLatest && opts.livePrice ? opts.livePrice : opts.priceAt?.(p.end);
    const ratios: PeriodRatios = {
      grossMargin: div(v.grossProfit, v.revenue),
      operatingMargin: div(v.operatingIncome, v.revenue),
      netMargin: div(v.netIncome, v.revenue),
      roe: div(ni, v.equity),
      roa: div(ni, v.totalAssets),
      der: div(v.totalLiabilities, v.equity),
      currentRatio: div(v.currentAssets, v.currentLiabilities),
      assetTurnover: div(rev, v.totalAssets),
      revenueYoY: growth(v.revenue, yearAgo?.values.revenue),
      netIncomeYoY: growth(v.netIncome, yearAgo?.values.netIncome),
      revenueQoQ: prev ? growth(v.revenue, prev.values.revenue) : undefined,
      netIncomeQoQ: prev ? growth(v.netIncome, prev.values.netIncome) : undefined,
      pe: price !== undefined && eps !== undefined && eps > 0 ? price / eps : undefined,
      pb: price !== undefined && shares && v.equity && v.equity > 0 ? (price * shares) / v.equity : undefined,
      dividendYield: price !== undefined && shares && divs !== undefined && price > 0 ? Math.abs(divs) / shares / price : undefined,
      basis,
    };
    return { ...p, missing: (p as { missing?: boolean }).missing, label: periodLabel(p, fyEnd), ratios, price, priceKind: price === undefined ? undefined : isLatest && opts.livePrice ? 'live' : 'period-end' };
  });
}

/**
 * Inserts empty rows for periods that should exist between the first and last reported one
 * (e.g. a quarter the source skipped), so the table can show "Not reported".
 */
export function fillMissingPeriods(periods: PeriodValues[]): Array<PeriodValues & { missing?: boolean }> {
  const sorted = [...periods].sort((a, b) => a.end.localeCompare(b.end));
  const out: Array<PeriodValues & { missing?: boolean }> = [];
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const prev = out[out.length - 1];
    if (prev) {
      const step = p.months * 30.44 * dayMs;
      let t = Date.parse(prev.end) + step;
      while (Date.parse(p.end) - t > step * 0.5) {
        const d = new Date(t);
        // Snap to the month end
        const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + (d.getUTCDate() > 15 ? 1 : 0), 0)).toISOString().slice(0, 10);
        out.push({ end, months: p.months, values: {}, sources: {}, missing: true });
        t += step;
      }
    }
    out.push(p);
  }
  return out;
}

/** CSV of the visible rows (items + ratios), one period per column. */
export function statementsCsv(rows: StatementRow[], currency: string): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const head = ['Item', ...rows.map((r) => `${r.label} (${r.end})`)];
  const lines = [head.map(esc).join(',')];
  for (const item of LINE_ITEMS) {
    if (!rows.some((r) => r.values[item.key] !== undefined)) continue;
    lines.push([esc(`${item.label} (${item.perShare ? `${currency}/share` : item.key === 'shares' ? 'shares' : currency})`), ...rows.map((r) => (r.values[item.key] ?? '').toString())].join(','));
  }
  const ratioKeys: Array<[keyof PeriodRatios, string]> = [
    ['grossMargin', 'Gross margin'],
    ['operatingMargin', 'Operating margin'],
    ['netMargin', 'Net margin'],
    ['roe', 'ROE'],
    ['roa', 'ROA'],
    ['der', 'DER (liabilities / equity)'],
    ['currentRatio', 'Current ratio'],
    ['assetTurnover', 'Asset turnover'],
    ['revenueYoY', 'Revenue growth YoY %'],
    ['netIncomeYoY', 'Net income growth YoY %'],
    ['pe', 'P/E'],
    ['pb', 'P/B'],
    ['dividendYield', 'Dividend yield'],
  ];
  for (const [k, label] of ratioKeys) {
    if (!rows.some((r) => typeof r.ratios[k] === 'number')) continue;
    lines.push([esc(label), ...rows.map((r) => (typeof r.ratios[k] === 'number' ? String(r.ratios[k]) : ''))].join(','));
  }
  return lines.join('\n');
}
