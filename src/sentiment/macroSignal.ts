/**
 * macroSignal.ts — The Indonesian macro component (0–100) for assets linked to it: IHSG and IDX
 * stocks read falling policy rates and falling inflation as supportive; Rupiah pairs (X/IDR, a
 * rising price = weaker Rupiah) read the same moves the other way. Uses the 3-month change of the
 * BI-Rate (or the interbank rate) and of CPI inflation; data older than the stale limit is ignored.
 */
import type { AssetGroup } from '../config/assets.ts';
import type { MacroPoint } from '../utils/macro.ts';

export interface MacroSignal {
  score: number | null;
  rateChange3m: number | null;
  inflationChange3m: number | null;
  /** Newest data date used. */
  dataDate: string | null;
}

/** Change of the last value against the value about `months` months earlier. */
export function changeOver(points: MacroPoint[], months: number, asOf: string, staleDays = 120): { change: number; date: string } | null {
  const pts = points.filter((p) => p.date <= asOf).sort((a, b) => a.date.localeCompare(b.date));
  const last = pts[pts.length - 1];
  if (!last || (Date.parse(asOf) - Date.parse(last.date)) / 86_400_000 > staleDays) return null;
  const cut = new Date(Date.parse(last.date));
  cut.setUTCMonth(cut.getUTCMonth() - months);
  const ref = pts.filter((p) => p.date <= cut.toISOString().slice(0, 10)).pop();
  return ref ? { change: last.value - ref.value, date: last.date } : null;
}

export function macroSignal(group: AssetGroup, symbol: string, rate: MacroPoint[], inflation: MacroPoint[], asOf: string): MacroSignal {
  const r = changeOver(rate, 3, asOf);
  const inf = changeOver(inflation, 3, asOf);
  const parts: number[] = [];
  // Rupiah pairs: weaker-Rupiah conditions lift the pair
  const sign = group === 'forex' && symbol.endsWith('/IDR') ? 1 : -1;
  if (r) parts.push(50 + sign * 50 * Math.tanh(r.change / 0.5)); // ±0.5 pt BI-Rate ≈ strong
  if (inf) parts.push(50 + sign * 50 * Math.tanh(inf.change / 1)); // ±1 pt inflation ≈ strong
  const dates = [r?.date, inf?.date].filter((d): d is string => Boolean(d)).sort();
  return {
    score: parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null,
    rateChange3m: r?.change ?? null,
    inflationChange3m: inf?.change ?? null,
    dataDate: dates.length ? dates[dates.length - 1] : null,
  };
}

/** IHSG, IDX stocks and Rupiah currency pairs. */
export const isMacroLinked = (group: AssetGroup, symbol: string) => group === 'idStock' || symbol === '^JKSE' || (group === 'forex' && symbol.endsWith('/IDR'));
