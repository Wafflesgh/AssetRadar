/**
 * movers.ts — Live price history buffer and movers ranking. The buffer keeps the last
 * ~20 minutes of ticks per asset in memory so the Radar and Terminal can show which assets
 * are moving fastest *right now* (e.g. % change over the last 5 minutes), next to the
 * 1-hour, 24-hour and 7-day movers computed from the price feeds.
 */
import type { PriceTick } from '../config/assets.ts';

export interface PriceSample {
  at: number; // epoch ms
  price: number;
}

/** Windows offered by the movers tables. "now" = the short live window (5 minutes). */
export type MoverWindow = 'now' | '1h' | '24h' | '7d';

export const LIVE_WINDOW_MS = 5 * 60_000;

export const MOVER_WINDOWS: Array<{ key: MoverWindow; label: string; hint: string }> = [
  { key: 'now', label: 'Live 5m', hint: 'Change over the last 5 minutes, measured from the live ticks this app received' },
  { key: '1h', label: '1H', hint: 'Change over the last hour' },
  { key: '24h', label: '24H', hint: 'Change over the last 24 hours (or since the previous close for exchange-traded assets)' },
  { key: '7d', label: '7D', hint: 'Change over the last 7 days' },
];

export class PriceHistoryBuffer {
  private samples = new Map<string, PriceSample[]>();
  private readonly maxAgeMs: number;
  private readonly minSpacingMs: number;

  constructor(maxAgeMs = 20 * 60_000, minSpacingMs = 1_000) {
    this.maxAgeMs = maxAgeMs;
    this.minSpacingMs = minSpacingMs;
  }

  /** Records a price; repeated prices within minSpacingMs are skipped to bound memory. */
  record(symbol: string, price: number, at: number): void {
    if (!Number.isFinite(price) || price <= 0) return;
    let list = this.samples.get(symbol);
    if (!list) {
      list = [];
      this.samples.set(symbol, list);
    }
    const last = list[list.length - 1];
    if (last && at <= last.at) return;
    if (last && last.price === price && at - last.at < this.minSpacingMs) return;
    list.push({ at, price });
    const cutoff = at - this.maxAgeMs;
    let drop = 0;
    while (drop < list.length - 1 && list[drop].at < cutoff) drop += 1;
    if (drop > 0) list.splice(0, drop);
  }

  /** Records every live tick (snapshot or failed ticks are ignored). */
  recordTicks(ticks: Record<string, PriceTick>, at: number = Date.now()): void {
    for (const tick of Object.values(ticks)) {
      if (tick.status === 'error' || tick.fromSnapshot) continue;
      this.record(tick.symbol, tick.price, at);
    }
  }

  get(symbol: string): PriceSample[] {
    return this.samples.get(symbol) ?? [];
  }

  /**
   * % change from the price about `windowMs` ago to the latest price. When the buffer is
   * younger than the window, it measures from the oldest sample (and `coveredMs` says so).
   * Returns undefined with fewer than two samples.
   */
  changeOver(symbol: string, windowMs: number, now: number = Date.now()): { pct: number; coveredMs: number } | undefined {
    const list = this.samples.get(symbol);
    if (!list || list.length < 2) return undefined;
    const latest = list[list.length - 1];
    const target = now - windowMs;
    // Latest sample at or before the window start; fall back to the oldest one
    let base = list[0];
    for (const s of list) {
      if (s.at <= target) base = s;
      else break;
    }
    if (base === latest) return undefined;
    return { pct: ((latest.price - base.price) / base.price) * 100, coveredMs: latest.at - base.at };
  }

  /** How long the buffer has been collecting (oldest sample age across all assets). */
  coverageMs(now: number = Date.now()): number {
    let oldest = now;
    for (const list of this.samples.values()) {
      if (list.length > 0 && list[0].at < oldest) oldest = list[0].at;
    }
    return now - oldest;
  }

  clear(): void {
    this.samples.clear();
  }
}

/** App-wide buffer, fed by App.tsx on every price update. */
export const liveHistory = new PriceHistoryBuffer();

/** % change of one tick for a movers window (the live window reads the buffer). */
export function changeForWindow(
  tick: PriceTick | undefined,
  window: MoverWindow,
  buffer: PriceHistoryBuffer = liveHistory,
  now: number = Date.now()
): number | undefined {
  if (!tick || tick.status === 'error') return undefined;
  switch (window) {
    case 'now':
      return tick.fromSnapshot ? undefined : buffer.changeOver(tick.symbol, LIVE_WINDOW_MS, now)?.pct;
    case '1h':
      return tick.changePct1h;
    case '24h':
      return tick.changePct24h;
    case '7d':
      return tick.changePct7d;
  }
}

export interface MoverRow<T> {
  item: T;
  value: number;
}

/**
 * Top gainers and losers for a set of items. Items without a finite value are skipped; a
 * mover must actually have moved (|value| > minAbs) to be listed.
 */
export function rankMovers<T>(
  items: T[],
  valueOf: (item: T) => number | undefined,
  count = 5,
  minAbs = 0
): { gainers: MoverRow<T>[]; losers: MoverRow<T>[] } {
  const rows: MoverRow<T>[] = [];
  for (const item of items) {
    const value = valueOf(item);
    if (value !== undefined && Number.isFinite(value) && Math.abs(value) > minAbs) rows.push({ item, value });
  }
  const gainers = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value).slice(0, count);
  const losers = rows.filter((r) => r.value < 0).sort((a, b) => a.value - b.value).slice(0, count);
  return { gainers, losers };
}
