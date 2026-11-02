/**
 * dca.ts — Saving-plan simulator (dollar-cost averaging) on real daily closes: a fixed Rupiah
 * amount buys the asset on the first trading day of every month, after a fee. Assets priced in
 * another currency are bought at that day's USD/IDR (or other) rate when a rate series is given.
 * Reports invested amount, final value, annualized return (money-weighted, XIRR), the deepest fall
 * of the price along the way, and the same total invested all at once on the first day.
 * Education only: past prices, no promise about the future.
 */

export interface DcaBar {
  date: string;
  close: number;
}

export interface DcaInput {
  bars: DcaBar[];
  /** Rupiah invested each month. */
  monthly: number;
  /** Years back from the last bar. */
  years: number;
  /** Fee per buy as a share of the amount. */
  feeRate?: number;
  /** Rupiah per unit of the asset's currency by date (omit for Rupiah assets). */
  fx?: DcaBar[] | null;
}

export interface DcaPoint {
  date: string;
  invested: number;
  value: number;
}

export interface DcaResult {
  points: DcaPoint[];
  buys: number;
  invested: number;
  value: number;
  units: number;
  /** Total gain as a fraction of the amount invested. */
  ret: number;
  /** Money-weighted annual return (XIRR) as a fraction; null when it cannot be solved. */
  annualized: number | null;
  /** Deepest fall of the Rupiah price over the period, as a fraction (≤ 0): the dip a saver sits through. */
  maxDrawdown: number;
  /** Everything invested on the first buy day instead. */
  lumpSum: { value: number; ret: number };
  startDate: string;
  endDate: string;
}

/** Value on or before `date` from a date-sorted series (null before the series starts). */
export function valueOn(series: DcaBar[], date: string): number | null {
  let lo = 0;
  let hi = series.length - 1;
  let found: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].date <= date) {
      found = series[mid].close;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

function shiftYears(date: string, years: number): string {
  const y = Number(date.slice(0, 4)) - years;
  return `${String(y).padStart(4, '0')}${date.slice(4)}`;
}

const yearsBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / (365.25 * 86_400_000);

/** Annual rate where the cash flows (negative = paid in) are worth zero; bisection on [-99%, +1000%]. */
export function xirr(flows: Array<{ date: string; amount: number }>): number | null {
  if (flows.length < 2) return null;
  const t0 = flows[0].date;
  const npv = (r: number) => flows.reduce((s, f) => s + f.amount / Math.pow(1 + r, yearsBetween(t0, f.date)), 0);
  let lo = -0.99;
  let hi = 10;
  let fLo = npv(lo);
  const fHi = npv(hi);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLo * fMid < 0) hi = mid;
    else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

export function simulateDca(input: DcaInput): DcaResult | null {
  const bars = input.bars.filter((b) => b.close > 0 && /^\d{4}-\d{2}-\d{2}$/.test(b.date)).sort((a, b) => a.date.localeCompare(b.date));
  if (bars.length < 2 || !(input.monthly > 0) || !(input.years > 0)) return null;
  const fx = input.fx ? [...input.fx].filter((b) => b.close > 0).sort((a, b) => a.date.localeCompare(b.date)) : null;
  const rate = (date: string) => (fx ? valueOn(fx, date) : 1);
  const fee = input.feeRate ?? 0;
  const end = bars[bars.length - 1];
  const from = shiftYears(end.date, input.years);
  let units = 0;
  let invested = 0;
  let month = '';
  const points: DcaPoint[] = [];
  const flows: Array<{ date: string; amount: number }> = [];
  let firstBuy: { date: string; price: number } | null = null;
  for (const b of bars) {
    if (b.date < from) continue;
    const r = rate(b.date);
    if (r === null || !(r > 0)) continue;
    const m = b.date.slice(0, 7);
    if (m !== month) {
      // First trading day of a new month: buy
      month = m;
      units += (input.monthly * (1 - fee)) / r / b.close;
      invested += input.monthly;
      flows.push({ date: b.date, amount: -input.monthly });
      firstBuy ??= { date: b.date, price: b.close * r };
      points.push({ date: b.date, invested, value: units * b.close * r });
    }
  }
  if (!firstBuy || invested === 0) return null;
  const endRate = rate(end.date) ?? 1;
  const value = units * end.close * endRate;
  if (points[points.length - 1].date !== end.date) points.push({ date: end.date, invested, value });
  flows.push({ date: end.date, amount: value });
  const lumpValue = (invested * (1 - fee) * (end.close * endRate)) / firstBuy.price;
  return {
    points,
    buys: flows.length - 1,
    invested,
    value,
    units,
    ret: value / invested - 1,
    annualized: xirr(flows),
    maxDrawdown: unitDrawdown(bars, from, rate),
    lumpSum: { value: lumpValue, ret: lumpValue / invested - 1 },
    startDate: firstBuy.date,
    endDate: end.date,
  };
}

/** Deepest fall of the Rupiah price itself over the plan's period (what the saver lives through). */
function unitDrawdown(bars: DcaBar[], from: string, rate: (d: string) => number | null): number {
  let peak = 0;
  let worst = 0;
  for (const b of bars) {
    if (b.date < from) continue;
    const r = rate(b.date);
    if (r === null || !(r > 0)) continue;
    const p = b.close * r;
    peak = Math.max(peak, p);
    worst = Math.min(worst, p / peak - 1);
  }
  return worst;
}
