/**
 * compare.ts — Pure helpers for the Compare page (#/compare?s=BBCA,BBRI): reading and writing the
 * asset list in the URL (2–4 assets by code, symbol or id), the period choices (1M/3M/1Y/3Y/5Y),
 * and the normalized performance chart: every series starts at 100 on the first day all assets
 * have a price, and days when one market is closed (different holidays per exchange, weekends for
 * stocks vs crypto) carry that asset's last close forward. Performance is in % of each asset's own
 * currency, so no currency conversion is needed.
 */
import { ALL_ASSETS, type AssetConfig } from '../config/assets.ts';

export const MAX_COMPARE = 4;

/** Finds an asset by code (BBCA), symbol (BBCA.JK, BTC/IDR) or id, ignoring case. */
export function findCompareAsset(token: string): AssetConfig | undefined {
  const t = token.trim().toLowerCase();
  if (!t) return undefined;
  return (
    ALL_ASSETS.find((a) => a.code.toLowerCase() === t || a.shortName.toLowerCase() === t) ??
    ALL_ASSETS.find((a) => a.symbol.toLowerCase() === t || a.id.toLowerCase() === t || a.aliases?.some((x) => x.toLowerCase() === t))
  );
}

/** "BBCA,bbri, BMRI" → asset symbols (unknown entries dropped, duplicates removed, at most 4). */
export function parseCompareParam(param: string | null | undefined): string[] {
  const out: string[] = [];
  for (const token of decodeURIComponent(param ?? '').split(',')) {
    const a = findCompareAsset(token);
    if (a && !out.includes(a.symbol)) out.push(a.symbol);
    if (out.length >= MAX_COMPARE) break;
  }
  return out;
}

/** Symbols → "BBCA,BBRI" (codes, as typed by people; clashing IDX codes keep their ".JK"). */
export function buildCompareParam(symbols: string[]): string {
  return symbols
    .map((s) => ALL_ASSETS.find((a) => a.symbol === s)?.code ?? s)
    .slice(0, MAX_COMPARE)
    .map(encodeURIComponent)
    .join(',');
}

export type ComparePeriod = '1M' | '3M' | '1Y' | '3Y' | '5Y' | '10Y' | 'MAX';
export const COMPARE_PERIODS: Array<{ key: ComparePeriod; label: string; months: number }> = [
  { key: '1M', label: '1M', months: 1 },
  { key: '3M', label: '3M', months: 3 },
  { key: '1Y', label: '1Y', months: 12 },
  { key: '3Y', label: '3Y', months: 36 },
  { key: '5Y', label: '5Y', months: 60 },
  { key: '10Y', label: '10Y', months: 120 },
  // Since the first trade: the rebasing starts where every compared asset has data
  { key: 'MAX', label: 'MAX', months: 12 * 150 },
];

/** First date of a period that ends on `lastDate` (YYYY-MM-DD). */
export function periodStart(period: ComparePeriod, lastDate: string): string {
  const months = COMPARE_PERIODS.find((p) => p.key === period)?.months ?? 12;
  const d = new Date(`${lastDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

export interface DatedClose {
  date: string;
  close: number;
}

export interface NormalizedPoint {
  date: string;
  /** symbol → value (start = 100). */
  values: Record<string, number>;
}

/**
 * Rebases the series to 100 from the first date on or after `start` where every series has a
 * close (its own or carried forward). Returns [] when the series never overlap.
 */
export function normalizeSeries(series: Array<{ symbol: string; bars: DatedClose[] }>, start: string): NormalizedPoint[] {
  const usable = series.map((s) => ({ symbol: s.symbol, bars: [...s.bars].filter((b) => b.close > 0).sort((a, b) => a.date.localeCompare(b.date)) }));
  if (usable.length === 0 || usable.some((s) => s.bars.length === 0)) return [];
  const dates = [...new Set(usable.flatMap((s) => s.bars.map((b) => b.date)))].filter((d) => d >= start).sort();
  const idx = usable.map(() => -1);
  const last: Array<number | null> = usable.map(() => null);
  // Closes before the start date seed the carry-forward value
  usable.forEach((s, k) => {
    for (let i = 0; i < s.bars.length && s.bars[i].date < start; i++) {
      idx[k] = i;
      last[k] = s.bars[i].close;
    }
  });
  let base: number[] | null = null;
  const out: NormalizedPoint[] = [];
  for (const date of dates) {
    usable.forEach((s, k) => {
      while (idx[k] + 1 < s.bars.length && s.bars[idx[k] + 1].date <= date) {
        idx[k]++;
        last[k] = s.bars[idx[k]].close;
      }
    });
    if (last.some((v) => v === null)) continue;
    // The base is the first date on or after the start where every asset has a close (a close
    // carried forward from just before the start counts)
    if (!base) base = last.map((v) => v as number);
    const values: Record<string, number> = {};
    usable.forEach((s, k) => {
      values[s.symbol] = ((last[k] as number) / (base as number[])[k]) * 100;
    });
    out.push({ date, values });
  }
  return out;
}

/** Total change over the chart (%), per symbol. */
export function periodReturns(points: NormalizedPoint[]): Record<string, number> {
  const end = points[points.length - 1];
  if (!end) return {};
  return Object.fromEntries(Object.entries(end.values).map(([s, v]) => [s, v - 100]));
}
