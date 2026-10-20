/**
 * pinkSheet.ts — World Bank "Pink Sheet" (CMO historical data, monthly prices in nominal US$):
 * finds the current download link on the commodity-markets page and turns the "Monthly Prices"
 * worksheet into monthly series for the commodities that matter for Indonesia — palm oil (CPO),
 * Australian (Newcastle) coal, nickel, tin, rubber, cocoa, robusta coffee and Thai rice. Months
 * without a value ("…") are skipped; nothing is filled in.
 */
import type { MacroPoint } from './macro.ts';
import type { SheetRows } from './xlsxSheet.ts';

export const PINK_SHEET_PAGE = 'https://www.worldbank.org/en/research/commodity-markets';

export interface PinkSeriesDef {
  id: string;
  /** Matches the column header in the worksheet. */
  match: RegExp;
  label: string;
  unit: string;
  /** True when a higher price is usually good for Indonesia (export earnings). */
  higherIsBetter: boolean | null;
}

export const PINK_SERIES: PinkSeriesDef[] = [
  { id: 'palmOil', match: /^Palm oil\b/i, label: 'Palm oil (CPO)', unit: 'US$/t', higherIsBetter: true },
  { id: 'coalAustralia', match: /^Coal, Australian/i, label: 'Coal, Australian (Newcastle)', unit: 'US$/t', higherIsBetter: true },
  { id: 'nickel', match: /^Nickel\b/i, label: 'Nickel', unit: 'US$/t', higherIsBetter: true },
  { id: 'tin', match: /^Tin\b/i, label: 'Tin', unit: 'US$/t', higherIsBetter: true },
  { id: 'rubber', match: /^Rubber, TSR20/i, label: 'Rubber, TSR20', unit: 'US$/kg', higherIsBetter: true },
  { id: 'cocoa', match: /^Cocoa\b/i, label: 'Cocoa', unit: 'US$/kg', higherIsBetter: true },
  { id: 'coffeeRobusta', match: /^Coffee, Robusta/i, label: 'Coffee, Robusta', unit: 'US$/kg', higherIsBetter: true },
  { id: 'riceThai', match: /^Rice, Thai 5%/i, label: 'Rice, Thai 5% (import price)', unit: 'US$/t', higherIsBetter: false },
];

/** The monthly xlsx link on the World Bank page (its address changes every month). */
export function findPinkSheetLink(html: string): string | null {
  const m = html.match(/https?:\/\/[^"'\s>]*CMO-Historical-Data-Monthly\.xlsx/i);
  return m ? m[0].replace(/^http:/, 'https:') : null;
}

export interface PinkSheet {
  /** "Updated on October 02, 2026" → "October 02, 2026". */
  updated: string | null;
  series: Map<string, MacroPoint[]>;
}

/** Monthly series from the "Monthly Prices" worksheet. */
export function parsePinkSheet(rows: SheetRows): PinkSheet {
  let updated: string | null = null;
  let headerRow = -1;
  for (const [r, cells] of [...rows].sort((a, b) => a[0] - b[0])) {
    for (const v of cells.values()) {
      if (typeof v !== 'string') continue;
      const u = v.match(/^Updated on (.+)$/i);
      if (u) updated = u[1].trim();
      if (/^Crude oil, Brent/i.test(v)) headerRow = r;
    }
    if (headerRow >= 0) break;
  }
  const series = new Map<string, MacroPoint[]>();
  if (headerRow < 0) return { updated, series };
  const header = rows.get(headerRow) as Map<string, string | number>;
  const columns = new Map<string, string>();
  for (const def of PINK_SERIES) {
    const col = [...header].find(([, v]) => typeof v === 'string' && def.match.test(v.trim()))?.[0];
    if (col) columns.set(def.id, col);
  }
  for (const id of columns.keys()) series.set(id, []);
  for (const [r, cells] of [...rows].sort((a, b) => a[0] - b[0])) {
    if (r <= headerRow) continue;
    const m = String(cells.get('A') ?? '').match(/^(\d{4})M(\d{2})$/);
    if (!m) continue;
    const date = `${m[1]}-${m[2]}-01`;
    for (const [id, col] of columns) {
      const v = cells.get(col);
      if (typeof v === 'number' && Number.isFinite(v)) series.get(id)?.push({ date, value: v });
    }
  }
  return { updated, series };
}
