/**
 * corporateCalendar.ts — Pure helpers for the IDX corporate calendar: parse Yahoo's
 * calendarEvents (next earnings date, ex-dividend and payment dates) and chart events (past
 * dividends with ex-date and amount, stock splits) into one event list, and select events in a
 * date window. Only dates the source publishes are used — nothing is estimated here.
 */

export type CalendarEventType = 'earnings' | 'exDividend' | 'dividendPayment' | 'dividend' | 'split';

export interface CalendarEvent {
  symbol: string;
  type: CalendarEventType;
  /** YYYY-MM-DD (exchange date). */
  date: string;
  /** Dividend per share (quote currency) for past dividends. */
  amount?: number;
  /** Split ratio text, e.g. "5:1". */
  ratio?: string;
  /** The source marks the earnings date as an estimate. */
  estimate?: boolean;
}

export const EVENT_LABELS: Record<CalendarEventType, string> = {
  earnings: 'Earnings report',
  exDividend: 'Ex-dividend date',
  dividendPayment: 'Dividend payment',
  dividend: 'Dividend (ex-date)',
  split: 'Stock split',
};

/** Unix seconds → YYYY-MM-DD in the given time zone. */
export function toDate(unixSec: number, timeZone = 'Asia/Jakarta'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(unixSec * 1000));
}

interface RawValue {
  raw?: number;
}

/** Upcoming events from quoteSummary calendarEvents. */
export function parseCalendarEvents(symbol: string, json: unknown, timeZone = 'Asia/Jakarta'): CalendarEvent[] {
  const ce = (json as { quoteSummary?: { result?: Array<{ calendarEvents?: Record<string, unknown> }> } })?.quoteSummary?.result?.[0]
    ?.calendarEvents;
  if (!ce) return [];
  const out: CalendarEvent[] = [];
  const earnings = ce.earnings as { earningsDate?: RawValue[]; isEarningsDateEstimate?: boolean } | undefined;
  const first = earnings?.earningsDate?.[0]?.raw;
  if (typeof first === 'number') out.push({ symbol, type: 'earnings', date: toDate(first, timeZone), estimate: Boolean(earnings?.isEarningsDateEstimate) });
  const ex = (ce.exDividendDate as RawValue | undefined)?.raw;
  if (typeof ex === 'number') out.push({ symbol, type: 'exDividend', date: toDate(ex, timeZone) });
  const pay = (ce.dividendDate as RawValue | undefined)?.raw;
  if (typeof pay === 'number') out.push({ symbol, type: 'dividendPayment', date: toDate(pay, timeZone) });
  return out;
}

/** Past dividends and splits from chart `events=div,split`. */
export function parseChartEvents(symbol: string, json: unknown, timeZone = 'Asia/Jakarta'): CalendarEvent[] {
  const events = (json as { chart?: { result?: Array<{ events?: Record<string, Record<string, unknown>> }> } })?.chart?.result?.[0]?.events;
  if (!events) return [];
  const out: CalendarEvent[] = [];
  for (const d of Object.values(events.dividends ?? {}) as Array<{ amount?: number; date?: number }>) {
    if (typeof d?.date === 'number' && typeof d.amount === 'number') out.push({ symbol, type: 'dividend', date: toDate(d.date, timeZone), amount: d.amount });
  }
  for (const s of Object.values(events.splits ?? {}) as Array<{ date?: number; splitRatio?: string; numerator?: number; denominator?: number }>) {
    if (typeof s?.date === 'number') {
      const ratio = s.splitRatio ?? (s.numerator && s.denominator ? `${s.numerator}:${s.denominator}` : undefined);
      out.push({ symbol, type: 'split', date: toDate(s.date, timeZone), ratio: ratio?.replace('/', ':') });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Upcoming ex-dividend dates already listed in the past-dividend history are merged (amount added). */
export function mergeEvents(upcoming: CalendarEvent[], history: CalendarEvent[]): CalendarEvent[] {
  const byExDate = new Map(history.filter((h) => h.type === 'dividend').map((h) => [h.date, h]));
  const merged = upcoming.map((e) => (e.type === 'exDividend' && byExDate.get(e.date) ? { ...e, amount: byExDate.get(e.date)?.amount } : e));
  return [...merged, ...history].sort((a, b) => a.date.localeCompare(b.date));
}

/** Events with from ≤ date ≤ to (inclusive), oldest first. */
export function eventsBetween(events: CalendarEvent[], from: string, to: string): CalendarEvent[] {
  return events.filter((e) => e.date >= from && e.date <= to).sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
