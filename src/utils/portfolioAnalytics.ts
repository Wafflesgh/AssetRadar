/**
 * portfolioAnalytics.ts — Pure maths for the portfolio analytics: dividends (recorded cash
 * dividends and suggestions from the dividend history × shares held before the ex-date, which the
 * user confirms), the daily portfolio value in Rupiah from price history, the time-weighted return
 * (TWR: buys and sells are deposits and withdrawals, so only price moves and dividends count)
 * against a benchmark such as the IHSG, and risk figures (annualized volatility, maximum drawdown,
 * correlation between holdings). Education, not advice.
 */
import type { PortfolioTx } from './portfolio.ts';
import type { CalendarEvent } from './corporateCalendar.ts';
import { pearson } from './correlation.ts';

export interface DividendRecord {
  id: string;
  symbol: string;
  /** Ex-dividend date (YYYY-MM-DD). */
  exDate: string;
  /** Payment date if known; the cash counts on this date (or the ex-date). */
  payDate?: string;
  perShare: number;
  shares: number;
  /** Cash received (after tax if the user entered it so), trade currency. */
  amount: number;
  currency: string;
  source: 'manual' | 'suggested';
  note?: string;
}

export interface DividendSuggestion {
  key: string;
  symbol: string;
  exDate: string;
  perShare: number;
  shares: number;
  amount: number;
}

export function dividendKey(symbol: string, exDate: string): string {
  return `${symbol}|${exDate}`;
}

/** Quantity held at the end of the day before `date` (trades on the ex-date itself do not qualify). */
export function sharesBefore(txs: PortfolioTx[], symbol: string, date: string): number {
  let q = 0;
  for (const t of txs) if (t.symbol === symbol && t.date < date) q += t.side === 'buy' ? t.quantity : -t.quantity;
  return Math.max(0, Math.round(q * 1e8) / 1e8);
}

/**
 * Past dividends (from the dividend history) that you were entitled to — shares held before the
 * ex-date — and that are not recorded or dismissed yet. Newest first.
 */
export function suggestDividends(
  events: CalendarEvent[],
  txs: PortfolioTx[],
  recorded: DividendRecord[],
  dismissed: ReadonlySet<string>,
  today: string
): DividendSuggestion[] {
  const have = new Set(recorded.map((d) => dividendKey(d.symbol, d.exDate)));
  const out: DividendSuggestion[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    if ((e.type !== 'dividend' && e.type !== 'exDividend') || !e.amount || e.date > today) continue;
    const key = dividendKey(e.symbol, e.date);
    if (have.has(key) || dismissed.has(key) || seen.has(key)) continue;
    const shares = sharesBefore(txs, e.symbol, e.date);
    if (shares <= 0) continue;
    seen.add(key);
    out.push({ key, symbol: e.symbol, exDate: e.date, perShare: e.amount, shares, amount: shares * e.amount });
  }
  return out.sort((a, b) => b.exDate.localeCompare(a.exDate));
}

export function parseDividends(raw: unknown): DividendRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (d): d is DividendRecord =>
      Boolean(d) && typeof d.id === 'string' && typeof d.symbol === 'string' && typeof d.exDate === 'string' && typeof d.amount === 'number'
  );
}

// ---- Daily value and time-weighted return -------------------------------------------------------

export interface ValuePoint {
  date: string;
  /** Market value in Rupiah at the close. */
  value: number;
  /** Net money put in that day (buys + fees − sells), Rupiah. */
  flow: number;
  /** Dividends received that day, Rupiah. */
  dividends: number;
  /** Time-weighted return index (start = 100). */
  twr: number;
  /** Holdings valued with a carried trade price because no close was available. */
  estimated: boolean;
}

/**
 * Daily portfolio value and TWR. `priceIdr(symbol, date)` gives the close in Rupiah per base unit
 * (share, coin, gram) on that date or the last one before it; when it is unknown the last trade
 * price is used and the day is marked as estimated. `toIdr(currency, date)` converts trade
 * amounts. Each day's return is (value + dividends − net flow) ÷ previous value − 1, so deposits
 * and withdrawals do not count as performance; on a day the portfolio starts from zero the return
 * is value ÷ money put in − 1.
 */
export function dailyValues(
  txs: PortfolioTx[],
  dividends: DividendRecord[],
  dates: string[],
  priceIdr: (symbol: string, date: string) => number | undefined,
  toIdr: (currency: string, date: string) => number | undefined,
  currencyOf: (symbol: string) => string
): ValuePoint[] {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  if (sorted.length === 0) return [];
  const first = sorted[0].date;
  const days = [...new Set([...dates, ...sorted.map((t) => t.date)])].filter((d) => d >= first).sort();
  const qty = new Map<string, number>();
  const lastPrice = new Map<string, number>();
  let ti = 0;
  let prevValue = 0;
  let index = 100;
  const out: ValuePoint[] = [];
  for (const date of days) {
    let flow = 0;
    while (ti < sorted.length && sorted[ti].date === date) {
      const t = sorted[ti++];
      const fx = toIdr(currencyOf(t.symbol), date) ?? 1;
      const cash = t.quantity * t.price * fx;
      flow += t.side === 'buy' ? cash + t.fee * fx : -(cash - t.fee * fx);
      qty.set(t.symbol, (qty.get(t.symbol) ?? 0) + (t.side === 'buy' ? t.quantity : -t.quantity));
      lastPrice.set(t.symbol, t.price * fx);
    }
    let value = 0;
    let estimated = false;
    for (const [sym, q] of qty) {
      if (q <= 1e-12) continue;
      const p = priceIdr(sym, date);
      if (p !== undefined && p > 0) lastPrice.set(sym, p);
      else estimated = true;
      value += q * (lastPrice.get(sym) ?? 0);
    }
    const divs = dividends
      .filter((d) => (d.payDate ?? d.exDate) === date)
      .reduce((s, d) => s + d.amount * (toIdr(d.currency, date) ?? 1), 0);
    let r = 0;
    if (prevValue > 0) r = (value + divs - flow) / prevValue - 1;
    else if (flow > 0) r = (value + divs) / flow - 1;
    index *= 1 + r;
    out.push({ date, value, flow, dividends: divs, twr: index, estimated });
    prevValue = value;
  }
  return out;
}

/** Benchmark index rebased to 100 on `start` (closes carried forward over its holidays). */
export function rebaseBenchmark(closes: Array<{ date: string; close: number }>, dates: string[]): Array<number | null> {
  const sorted = [...closes].sort((a, b) => a.date.localeCompare(b.date));
  let i = -1;
  let base: number | null = null;
  return dates.map((d) => {
    while (i + 1 < sorted.length && sorted[i + 1].date <= d) i++;
    if (i < 0) return null;
    if (base === null) base = sorted[i].close;
    return (sorted[i].close / base) * 100;
  });
}

/** Simple daily returns of an index series (start = 100 or any level). */
export function returnsOf(index: Array<number | null>): number[] {
  const out: number[] = [];
  for (let i = 1; i < index.length; i++) {
    const a = index[i - 1];
    const b = index[i];
    if (a !== null && b !== null && a > 0) out.push(b / a - 1);
  }
  return out;
}

/** Annualized volatility of daily returns (sample standard deviation × √periods). */
export function annualizedVolatility(returns: number[], periodsPerYear = 252): number | null {
  if (returns.length < 10) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance * periodsPerYear);
}

/** Largest fall from a running peak (≤ 0), with the peak and trough dates. */
export function maxDrawdown(points: Array<{ date: string; v: number | null }>): { drawdown: number; peak: string; trough: string } | null {
  let peak: { date: string; v: number } | null = null;
  let worst: { drawdown: number; peak: string; trough: string } | null = null;
  for (const p of points) {
    if (p.v === null || !(p.v > 0)) continue;
    if (!peak || p.v > peak.v) peak = { date: p.date, v: p.v };
    const dd = p.v / peak.v - 1;
    if (!worst || dd < worst.drawdown) worst = { drawdown: dd, peak: peak.date, trough: p.date };
  }
  return worst;
}

/** Compound annual growth from a start = 100 index over `days` calendar days (null under 1 year). */
export function annualized(totalIndex: number, days: number): number | null {
  if (days < 365 || totalIndex <= 0) return null;
  return (totalIndex / 100) ** (365 / days) - 1;
}

/** Correlation of daily returns between holdings on shared dates (last `window` days). */
export function holdingCorrelations(
  series: Array<{ symbol: string; bars: Array<{ date: string; close: number }> }>,
  window = 250
): Array<{ a: string; b: string; r: number | null; days: number }> {
  const rets = series.map((s) => {
    const m = new Map<string, number>();
    const bars = [...s.bars].sort((x, y) => x.date.localeCompare(y.date)).slice(-(window + 1));
    for (let i = 1; i < bars.length; i++) if (bars[i - 1].close > 0) m.set(bars[i].date, bars[i].close / bars[i - 1].close - 1);
    return { symbol: s.symbol, m };
  });
  const out: Array<{ a: string; b: string; r: number | null; days: number }> = [];
  for (let i = 0; i < rets.length; i++) {
    for (let j = i + 1; j < rets.length; j++) {
      const shared = [...rets[i].m.keys()].filter((d) => rets[j].m.has(d));
      out.push({
        a: rets[i].symbol,
        b: rets[j].symbol,
        r: pearson(
          shared.map((d) => rets[i].m.get(d) as number),
          shared.map((d) => rets[j].m.get(d) as number)
        ),
        days: shared.length,
      });
    }
  }
  return out;
}

/** Close on `date` or the last one before it (series sorted by date). */
export function closeOn(bars: Array<{ date: string; close: number }>, date: string): number | undefined {
  let lo = 0;
  let hi = bars.length - 1;
  let found: number | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].date <= date) {
      found = bars[mid].close;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}
