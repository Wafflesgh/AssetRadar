/**
 * dividendYield.ts — Dividend summary per stock from the corporate calendar (5 years of paid
 * dividends from the chart events plus upcoming ex-dates): trailing-12-month dividend per share,
 * how many of the last five calendar years paid, the latest and the next dividend, and the
 * trailing yield at a given price. Used by the server's /api/idx/dividends and the Dividends page.
 */
import type { CalendarEvent } from './corporateCalendar.ts';
import { addDays } from './corporateCalendar.ts';

export interface DividendSummary {
  symbol: string;
  /** Dividends per share with an ex-date in the last 365 days. */
  ttm: number;
  paymentsTtm: number;
  /** Calendar years (of the last five full years) with at least one dividend. */
  yearsPaid: number;
  last: { date: string; amount: number } | null;
  /** Next announced ex-dividend (or payment) date on or after today. */
  next: { date: string; type: 'exDividend' | 'dividendPayment'; amount?: number } | null;
  /** Paid dividends per year, newest first (at most 6 years). */
  byYear: Array<{ year: number; total: number; count: number }>;
}

/** Null when the stock neither paid in the last five years nor has an upcoming dividend. */
export function summarizeDividends(symbol: string, events: CalendarEvent[], today: string): DividendSummary | null {
  const paid = events
    .filter((e) => e.type === 'dividend' && typeof e.amount === 'number' && e.amount > 0 && e.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));
  const yearAgo = addDays(today, -365);
  const ttmList = paid.filter((e) => e.date > yearAgo);
  const thisYear = Number(today.slice(0, 4));
  const years = new Map<number, { total: number; count: number }>();
  for (const e of paid) {
    const y = Number(e.date.slice(0, 4));
    if (y < thisYear - 5) continue;
    const cur = years.get(y) ?? { total: 0, count: 0 };
    cur.total += e.amount!;
    cur.count += 1;
    years.set(y, cur);
  }
  const upcoming = events
    .filter((e): e is CalendarEvent & { type: 'exDividend' | 'dividendPayment' } => (e.type === 'exDividend' || e.type === 'dividendPayment') && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.type === 'exDividend' ? -1 : 1));
  if (paid.length === 0 && upcoming.length === 0) return null;
  let yearsPaid = 0;
  for (let y = thisYear - 5; y < thisYear; y++) if (years.has(y)) yearsPaid++;
  return {
    symbol,
    ttm: ttmList.reduce((s, e) => s + e.amount!, 0),
    paymentsTtm: ttmList.length,
    yearsPaid,
    last: paid[0] ? { date: paid[0].date, amount: paid[0].amount! } : null,
    next: upcoming[0] ? { date: upcoming[0].date, type: upcoming[0].type, ...(upcoming[0].amount ? { amount: upcoming[0].amount } : {}) } : null,
    byYear: [...years.entries()]
      .sort((a, b) => b[0] - a[0])
      .slice(0, 6)
      .map(([year, v]) => ({ year, total: v.total, count: v.count })),
  };
}

/** Trailing dividend yield in percent (null without a price or dividend). */
export function dividendYieldPct(ttm: number, price: number | null | undefined): number | null {
  return price && price > 0 && ttm > 0 ? (ttm / price) * 100 : null;
}

export interface DividendRow extends DividendSummary {
  price: number | null;
  yieldPct: number | null;
}

/** Stocks with an ex-date or payment in the next `days` days, soonest first. */
export function upcomingDividends(rows: DividendRow[], today: string, days = 60): DividendRow[] {
  const until = addDays(today, days);
  return rows.filter((r) => r.next && r.next.date <= until).sort((a, b) => a.next!.date.localeCompare(b.next!.date) || a.symbol.localeCompare(b.symbol));
}

/**
 * Highest trailing yields among stocks that paid in at least `minYears` of the last five years
 * (one-off payouts make a single year's yield look better than it is).
 */
export function topYields(rows: DividendRow[], minYears = 3, limit = 50): DividendRow[] {
  return rows
    .filter((r) => r.yieldPct !== null && r.yearsPaid >= minYears)
    .sort((a, b) => b.yieldPct! - a.yieldPct! || a.symbol.localeCompare(b.symbol))
    .slice(0, limit);
}
