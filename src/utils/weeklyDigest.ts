/** weeklyDigest.ts — Deterministic watchlist changes and upcoming cached events, in WIB. */
import { wibDate } from './sync.ts';
export interface WeeklyEvent { symbol: string; kind: string; date: string }
export interface WeeklyDigest { moves: { symbol: string; chg: number | null }[]; events: WeeklyEvent[]; missing: string[] }
export function weeklyDigest({ watchlist, snapToday, snapWeekAgo, events, now }: {
  watchlist: string[]; snapToday: Record<string, { p: number }>;
  snapWeekAgo: Record<string, { p: number }>; events: WeeklyEvent[]; now: number;
}): WeeklyDigest {
  const symbols = [...new Set(watchlist)].sort();
  const moves = symbols.map(symbol => {
    const a = snapToday[symbol]?.p, b = snapWeekAgo[symbol]?.p;
    const value = a > 0 && b > 0 && Number.isFinite(a) && Number.isFinite(b) ? (a / b - 1) * 100 : null;
    return { symbol, chg: value !== null && Number.isFinite(value) ? value : null };
  }).sort((a, b) => (b.chg === null ? -1 : Math.abs(b.chg)) - (a.chg === null ? -1 : Math.abs(a.chg)) || a.symbol.localeCompare(b.symbol));
  const start = wibDate(now), end = wibDate(now + 7 * 86400000);
  const seen = new Set<string>();
  return { moves, missing: moves.filter(x => x.chg === null).map(x => x.symbol),
    events: events.filter(e => {
      const key = `${e.symbol}|${e.kind}|${e.date}`;
      if (!symbols.includes(e.symbol) || e.date < start || e.date >= end || seen.has(key)) return false;
      seen.add(key); return true;
    }).sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol) || a.kind.localeCompare(b.kind)) };
}
