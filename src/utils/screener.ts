/**
 * screener.ts — Pure logic for the IDX stock screener: the row shape (price data from the IDX
 * sweep plus ratios from the latest financial statements), the filterable fields, range filters
 * with sector/board/text filters, sorting with missing values last, ready-made presets, CSV
 * export, and the step that turns statement rows into screener ratios. A screen is a filter on
 * reported numbers, not a recommendation.
 */
import type { StatementRow } from './statements.ts';

export interface ScreenerFundamentals {
  /** Period end of the figures used (YYYY-MM-DD) and its label, e.g. "FY2025" or "Q2 FY2026". */
  asOf: string;
  label: string;
  /** annual = latest fiscal year; ttm = trailing 12 months from quarterly reports. */
  basis: 'annual' | 'ttm';
  currency: string;
  pe: number | null;
  pb: number | null;
  /** Percent values (20 = 20 %). */
  roe: number | null;
  netMargin: number | null;
  der: number | null;
  dividendYield: number | null;
  netIncomeYoY: number | null;
  fScore: number | null;
  fScoreMax: number | null;
}

export interface ScreenerRow {
  symbol: string;
  code: string;
  name: string;
  sector: string;
  board: string;
  price: number | null;
  /** Percent changes. */
  chg1d: number | null;
  chg1w: number | null;
  valueTraded: number | null;
  marketCap: number | null;
  /** null = scanned, nothing reported; undefined = not scanned yet. */
  f?: ScreenerFundamentals | null;
  /** When the statements were fetched (ms). */
  fetchedAt?: number | null;
}

export type FieldKey =
  | 'price'
  | 'chg1d'
  | 'chg1w'
  | 'valueTraded'
  | 'marketCap'
  | 'pe'
  | 'pb'
  | 'roe'
  | 'netMargin'
  | 'der'
  | 'dividendYield'
  | 'fScore'
  | 'netIncomeYoY';

export interface FieldDef {
  key: FieldKey;
  label: string;
  short: string;
  /** Units typed in the filter boxes: value × scale = stored value. */
  unit: string;
  scale: number;
  digits: number;
  fundamental: boolean;
}

export const FIELDS: FieldDef[] = [
  { key: 'price', label: 'Price (Rp)', short: 'Price', unit: 'Rp', scale: 1, digits: 0, fundamental: false },
  { key: 'chg1d', label: '1-day change (%)', short: '1D %', unit: '%', scale: 1, digits: 2, fundamental: false },
  { key: 'chg1w', label: '1-week change (%)', short: '1W %', unit: '%', scale: 1, digits: 2, fundamental: false },
  { key: 'valueTraded', label: 'Value traded (Rp billion)', short: 'Value (Rp bn)', unit: 'Rp bn', scale: 1e9, digits: 1, fundamental: false },
  { key: 'marketCap', label: 'Market cap (Rp trillion)', short: 'Mkt cap (Rp tn)', unit: 'Rp tn', scale: 1e12, digits: 2, fundamental: false },
  { key: 'pe', label: 'P/E', short: 'P/E', unit: '×', scale: 1, digits: 1, fundamental: true },
  { key: 'pb', label: 'P/B', short: 'P/B', unit: '×', scale: 1, digits: 2, fundamental: true },
  { key: 'roe', label: 'ROE (%)', short: 'ROE %', unit: '%', scale: 1, digits: 1, fundamental: true },
  { key: 'netMargin', label: 'Net margin (%)', short: 'Net margin %', unit: '%', scale: 1, digits: 1, fundamental: true },
  { key: 'der', label: 'Debt-to-equity (liabilities ÷ equity)', short: 'DER', unit: '×', scale: 1, digits: 2, fundamental: true },
  { key: 'dividendYield', label: 'Dividend yield (%)', short: 'Div yield %', unit: '%', scale: 1, digits: 2, fundamental: true },
  { key: 'fScore', label: 'Piotroski F-score (0–9)', short: 'F-score', unit: '', scale: 1, digits: 0, fundamental: true },
  { key: 'netIncomeYoY', label: 'Net income growth YoY (%)', short: 'NI YoY %', unit: '%', scale: 1, digits: 1, fundamental: true },
];

export const FIELD_BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f])) as Record<FieldKey, FieldDef>;

export function fieldValue(row: ScreenerRow, key: FieldKey): number | null {
  switch (key) {
    case 'price':
    case 'chg1d':
    case 'chg1w':
    case 'valueTraded':
    case 'marketCap':
      return row[key];
    default: {
      const v = row.f?.[key];
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    }
  }
}

export interface RangeFilter {
  field: FieldKey;
  /** In display units (see FieldDef.scale). */
  min?: number;
  max?: number;
}

export interface Screen {
  id: string;
  name: string;
  query?: string;
  sectors?: string[];
  boards?: string[];
  filters: RangeFilter[];
  sort?: { field: FieldKey | 'code'; dir: 'asc' | 'desc' };
  /** Saved by the user (presets are built in). */
  custom?: boolean;
}

export interface ScreenResult {
  rows: ScreenerRow[];
  /** Rows dropped only because a filtered number is not reported (or not scanned yet). */
  missingData: number;
}

/** Applies the text, sector, board and range filters. */
export function applyScreen(rows: ScreenerRow[], screen: Screen): ScreenResult {
  const q = screen.query?.trim().toLowerCase();
  const sectors = screen.sectors?.length ? new Set(screen.sectors) : null;
  const boards = screen.boards?.length ? new Set(screen.boards) : null;
  const filters = screen.filters.filter((f) => f.min !== undefined || f.max !== undefined);
  let missingData = 0;
  const out: ScreenerRow[] = [];
  for (const r of rows) {
    if (q && !r.code.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q)) continue;
    if (sectors && !sectors.has(r.sector)) continue;
    if (boards && !boards.has(r.board)) continue;
    let missing = false;
    let fails = false;
    for (const f of filters) {
      const v = fieldValue(r, f.field);
      if (v === null) {
        missing = true;
        continue;
      }
      const scale = FIELD_BY_KEY[f.field].scale;
      if (f.min !== undefined && v < f.min * scale) fails = true;
      if (f.max !== undefined && v > f.max * scale) fails = true;
    }
    if (fails) continue;
    if (missing) {
      missingData++;
      continue;
    }
    out.push(r);
  }
  return { rows: sortRows(out, screen.sort?.field ?? 'marketCap', screen.sort?.dir ?? 'desc'), missingData };
}

/** Sorts by a field; rows without a value always go last. */
export function sortRows(rows: ScreenerRow[], field: FieldKey | 'code', dir: 'asc' | 'desc'): ScreenerRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (field === 'code') return sign * a.code.localeCompare(b.code);
    const va = fieldValue(a, field);
    const vb = fieldValue(b, field);
    if (va === null && vb === null) return a.code.localeCompare(b.code);
    if (va === null) return 1;
    if (vb === null) return -1;
    return sign * (va - vb) || a.code.localeCompare(b.code);
  });
}

export const PRESETS: Screen[] = [
  {
    id: 'preset-roe-pe',
    name: 'High ROE, low P/E',
    filters: [
      { field: 'roe', min: 15 },
      { field: 'pe', min: 0, max: 12 },
    ],
    sort: { field: 'roe', dir: 'desc' },
  },
  {
    id: 'preset-dividend',
    name: 'Dividend payers',
    filters: [
      { field: 'dividendYield', min: 4 },
      { field: 'netIncomeYoY', min: 0 },
    ],
    sort: { field: 'dividendYield', dir: 'desc' },
  },
  {
    id: 'preset-fscore',
    name: 'Strong F-score',
    filters: [{ field: 'fScore', min: 7 }],
    sort: { field: 'fScore', dir: 'desc' },
  },
  {
    id: 'preset-liquid-value',
    name: 'Liquid, below book value',
    filters: [
      { field: 'pb', min: 0, max: 1 },
      { field: 'valueTraded', min: 5 },
    ],
    sort: { field: 'valueTraded', dir: 'desc' },
  },
  {
    id: 'preset-growth',
    name: 'Profit growth, low debt',
    filters: [
      { field: 'netIncomeYoY', min: 20 },
      { field: 'der', max: 1 },
    ],
    sort: { field: 'netIncomeYoY', dir: 'desc' },
  },
];

const csvCell = (v: string | number | null | undefined) => {
  if (v === null || v === undefined) return 'Not reported';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function screenerCsv(rows: ScreenerRow[]): string {
  const head = ['Code', 'Name', 'Sector', 'Board', ...FIELDS.map((f) => f.label), 'Figures as of', 'Basis'];
  const lines = rows.map((r) =>
    [
      r.code,
      r.name,
      r.sector,
      r.board,
      ...FIELDS.map((f) => {
        const v = fieldValue(r, f.key);
        return v === null ? null : Number((v / f.scale).toFixed(f.digits + 2));
      }),
      r.f?.label ?? null,
      r.f?.basis ?? null,
    ]
      .map(csvCell)
      .join(',')
  );
  return [head.map(csvCell).join(','), ...lines].join('\n');
}

const pct = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? null : v * 100);
const num = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? null : v);

/**
 * Screener ratios from statement rows (built with the live price): the newest quarterly row when
 * it has full trailing-12-month figures and is newer than the last annual report, otherwise the
 * latest fiscal year. Returns null when no period has any of the ratios.
 */
export function fundamentalsFromRows(
  annual: StatementRow[],
  quarterly: StatementRow[],
  currency: string,
  fScore: { score: number; max: number } | null
): ScreenerFundamentals | null {
  const lastAnnual = [...annual].reverse().find((r) => !r.missing);
  const lastQuarter = [...quarterly].reverse().find((r) => !r.missing);
  const useTtm = lastQuarter && lastQuarter.ratios.basis === 'ttm' && (!lastAnnual || lastQuarter.end > lastAnnual.end);
  const row = useTtm ? lastQuarter : lastAnnual;
  if (!row) return null;
  const r = row.ratios;
  const out: ScreenerFundamentals = {
    asOf: row.end,
    label: row.label,
    basis: useTtm ? 'ttm' : 'annual',
    currency,
    pe: num(r.pe),
    pb: num(r.pb),
    roe: pct(r.roe),
    netMargin: pct(r.netMargin),
    der: num(r.der),
    dividendYield: pct(r.dividendYield),
    netIncomeYoY: num(r.netIncomeYoY),
    fScore: fScore && fScore.max >= 5 ? fScore.score : null,
    fScoreMax: fScore && fScore.max >= 5 ? fScore.max : null,
  };
  const any = [out.pe, out.pb, out.roe, out.netMargin, out.der, out.dividendYield, out.netIncomeYoY, out.fScore].some((v) => v !== null);
  return any ? out : null;
}

export function parseScreens(raw: unknown): Screen[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is Screen => Boolean(s) && typeof s.id === 'string' && typeof s.name === 'string' && Array.isArray(s.filters));
}

/**
 * Valuation ratios scale with the share price: P/E and P/B in proportion, the dividend yield
 * inversely. Re-prices ratios computed at `priceThen` to `priceNow` (other ratios unchanged).
 */
export function rescaleForPrice(f: ScreenerFundamentals, priceThen: number | null | undefined, priceNow: number | null | undefined): ScreenerFundamentals {
  if (!priceThen || !priceNow || priceThen <= 0 || priceNow <= 0 || priceThen === priceNow) return f;
  const k = priceNow / priceThen;
  return {
    ...f,
    pe: f.pe === null ? null : f.pe * k,
    pb: f.pb === null ? null : f.pb * k,
    dividendYield: f.dividendYield === null ? null : f.dividendYield / k,
  };
}
