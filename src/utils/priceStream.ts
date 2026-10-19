/**
 * priceStream.ts — Pure logic behind the server-push price stream, shared by server and client:
 * which quotes are due for a refresh (priority assets every ±5 s while their market is open,
 * others less often, closed markets every 5 min), an adaptive backoff when Yahoo rate-limits
 * (5 → 10 → 20 → 40 s, recovering step by step), the tick diff (only changed quotes are pushed),
 * per-symbol throttling of real-time trades, and the client's stream watchdog / reconnect delay.
 */
import type { PriceTick } from '../config/assets.ts';

export const STREAM_BASE_MS = 5_000;
export const CLOSED_MARKET_MS = 5 * 60_000;
/** Non-priority assets refresh at this multiple of the base interval. */
export const BACKGROUND_FACTOR = 3;
/** The client treats the stream as stalled after this long without any event (pings come every 20 s). */
export const STREAM_STALL_MS = 30_000;

/** Cache lifetime of a quote: priority assets every base interval while open, others 3× slower. */
export function refreshIntervalMs(opts: { open: boolean; priority: boolean; streaming: boolean; backoffFactor?: number }): number {
  if (!opts.open) return CLOSED_MARKET_MS;
  const factor = opts.backoffFactor ?? 1;
  // Without stream clients the REST endpoints keep the previous 15 s cache
  if (!opts.streaming) return Math.max(15_000, STREAM_BASE_MS * factor);
  return STREAM_BASE_MS * factor * (opts.priority ? 1 : BACKGROUND_FACTOR);
}

/** Symbols whose quote is older than its refresh interval, priority ones first. */
export function dueSymbols(
  entries: Array<{ symbol: string; open: boolean; priority: boolean; fetchedAt?: number }>,
  now: number,
  opts: { streaming: boolean; backoffFactor?: number }
): string[] {
  return entries
    .filter((e) => e.fetchedAt === undefined || now - e.fetchedAt >= refreshIntervalMs({ ...e, ...opts }) - 250)
    .sort((a, b) => Number(b.priority) - Number(a.priority) || (a.fetchedAt ?? 0) - (b.fetchedAt ?? 0))
    .map((e) => e.symbol);
}

/**
 * Adaptive slow-down for a rate-limited source: each failure doubles the interval factor (max
 * 8×); after `recoverAfter` successes in a row it halves again until it is back at 1×.
 */
export class Backoff {
  factor = 1;
  maxFactor: number;
  recoverAfter: number;
  private streak = 0;

  constructor(maxFactor = 8, recoverAfter = 3) {
    this.maxFactor = maxFactor;
    this.recoverAfter = recoverAfter;
  }

  /** Returns true when the factor changed. */
  failure(): boolean {
    this.streak = 0;
    const next = Math.min(this.maxFactor, this.factor * 2);
    const changed = next !== this.factor;
    this.factor = next;
    return changed;
  }

  success(): boolean {
    if (this.factor === 1) return false;
    this.streak += 1;
    if (this.streak < this.recoverAfter) return false;
    this.streak = 0;
    this.factor = Math.max(1, this.factor / 2);
    return true;
  }
}

/** HTTP statuses that mean "slow down" (rate limit or server trouble). */
export function isThrottleStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

const COMPARED: Array<keyof PriceTick> = ['price', 'changePct24h', 'changePct1h', 'high24h', 'low24h', 'status', 'isMarketOpen', 'volume', 'marketCapUsd', 'source'];

/** Ticks in `next` that differ from `prev` in a field the UI shows (a new timestamp alone is not a change). */
export function diffTicks(prev: Record<string, PriceTick>, next: Record<string, PriceTick>): Record<string, PriceTick> {
  const out: Record<string, PriceTick> = {};
  for (const [sym, tick] of Object.entries(next)) {
    if (!tick || tick.status === 'error' || !Number.isFinite(tick.price)) continue; // never push empty prices
    const old = prev[sym];
    if (!old || COMPARED.some((k) => old[k] !== tick[k])) out[sym] = tick;
  }
  return out;
}

/**
 * Real-time trades: symbols whose latest trade has not been forwarded yet and whose last
 * forward is at least `minGapMs` ago (at most one update per symbol per second).
 */
export function tradesToFlush(
  latest: Map<string, { price: number; time: number }>,
  lastSent: Map<string, number>,
  now: number,
  minGapMs = 1000
): string[] {
  const out: string[] = [];
  for (const [sym, trade] of latest) {
    const sent = lastSent.get(sym);
    if (sent !== undefined && (sent >= trade.time || now - sent < minGapMs)) continue;
    out.push(sym);
  }
  return out;
}

/** Applies a real-time trade to a quote: new price, 24 h change from the previous close. */
export function applyTrade(tick: PriceTick, trade: { price: number; time: number }, source: string): PriceTick {
  const prevClose = tick.changePct24h !== undefined && Number.isFinite(tick.price) ? tick.price / (1 + tick.changePct24h / 100) : undefined;
  return {
    ...tick,
    price: trade.price,
    changePct24h: prevClose ? (trade.price / prevClose - 1) * 100 : tick.changePct24h,
    high24h: tick.high24h !== undefined ? Math.max(tick.high24h, trade.price) : undefined,
    low24h: tick.low24h !== undefined ? Math.min(tick.low24h, trade.price) : undefined,
    updatedAt: trade.time,
    status: 'live',
    source,
  };
}

/** Client: has the stream gone quiet for too long? */
export function isStreamStalled(lastEventAt: number, now: number, stallMs = STREAM_STALL_MS): boolean {
  return now - lastEventAt > stallMs;
}

/** Client: reconnect delay after `attempt` failed tries (1, 2, 4 … 30 s). */
export function reconnectDelayMs(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt));
}
