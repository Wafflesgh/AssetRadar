/**
 * geoReaction.ts — Market reaction measured from the moment a news item was published, not over
 * 24 hours: the last intraday bar at or before the publish time is the base, the latest bar is
 * "now". Also the move in the first 15 and 60 minutes after the news when those bars exist.
 * When a market has not traded since the news (closed, weekend), that is said honestly instead
 * of showing an old move. Pure; the server feeds it 1-minute or 5-minute candles.
 */
import type { OhlcCandle } from '../config/assets.ts';

export type ReactionStatus = 'ok' | 'noTradeSince' | 'noBase' | 'noData';

export interface Reaction {
  symbol: string;
  status: ReactionStatus;
  /** % change from the bar before the news to the latest bar. */
  changePct: number | null;
  /** % change in the first 15 / 60 minutes after the news (null until that time has traded). */
  after15Pct: number | null;
  after60Pct: number | null;
  /** Minutes between the publish time and the latest bar used. */
  minutes: number | null;
  /** Time (unix ms) of the base and the latest bar. */
  baseAt: number | null;
  lastAt: number | null;
  /** Bar size used, in minutes. */
  barMinutes: number | null;
}

const pct = (a: number, b: number) => (b / a - 1) * 100;

/** Close of the last bar that starts at or before `ms` (index), or -1. */
function lastAtOrBefore(candles: OhlcCandle[], ms: number): number {
  let idx = -1;
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].time * 1000 <= ms) idx = i;
    else break;
  }
  return idx;
}

/**
 * Reaction since `sinceMs`. A bar that opened before the news but closed after it would mix
 * pre- and post-news trading, so the base is the close of the bar *before* the one containing
 * the publish time when the bar size is known.
 */
export function reactionSince(symbol: string, candles: OhlcCandle[], sinceMs: number, barMinutes: number): Reaction {
  const empty: Reaction = { symbol, status: 'noData', changePct: null, after15Pct: null, after60Pct: null, minutes: null, baseAt: null, lastAt: null, barMinutes };
  const bars = candles.filter((c) => Number.isFinite(c.close) && c.close > 0).sort((a, b) => a.time - b.time);
  if (bars.length === 0) return empty;
  const barMs = barMinutes * 60_000;
  let baseIdx = lastAtOrBefore(bars, sinceMs);
  // The bar that contains the publish moment started before it; use the bar before that one
  if (baseIdx >= 0 && bars[baseIdx].time * 1000 + barMs > sinceMs) baseIdx -= 1;
  if (baseIdx < 0) return { ...empty, status: 'noBase' };
  const base = bars[baseIdx];
  const last = bars[bars.length - 1];
  if (last.time * 1000 + barMs <= sinceMs || bars.length - 1 === baseIdx) {
    return { ...empty, status: 'noTradeSince', baseAt: base.time * 1000, lastAt: last.time * 1000 };
  }
  const closeBy = (ms: number): number | null => {
    if (last.time * 1000 + barMs < ms) return null; // not traded that far yet
    const i = lastAtOrBefore(bars, ms - barMs);
    return i > baseIdx ? bars[i].close : null;
  };
  const at15 = closeBy(sinceMs + 15 * 60_000);
  const at60 = closeBy(sinceMs + 60 * 60_000);
  const lastEnd = last.time * 1000 + barMs;
  return {
    symbol,
    status: 'ok',
    changePct: pct(base.close, last.close),
    after15Pct: at15 === null ? null : pct(base.close, at15),
    after60Pct: at60 === null ? null : pct(base.close, at60),
    minutes: Math.max(0, Math.round((lastEnd - sinceMs) / 60_000)),
    baseAt: base.time * 1000,
    lastAt: last.time * 1000,
    barMinutes,
  };
}

/** Bar size to ask for: 1-minute bars cover about a day, 5-minute bars about five days. */
export function reactionInterval(sinceMs: number, now: number): '1' | '5' | null {
  const age = now - sinceMs;
  if (age < 0 || age > 5 * 86_400_000) return null;
  return age <= 18 * 3600_000 ? '1' : '5';
}
