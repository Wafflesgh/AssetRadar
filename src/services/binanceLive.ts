/**
 * binanceLive.ts — Live Binance prices straight from the browser over two public WebSockets (no
 * key, no account): the spot all-market mini-ticker stream (every pair that changed, about once a
 * second) and the futures mark/index price stream (every contract, once a second). Each is opened
 * while something listens and the tab is visible, closed otherwise, with backoff on failure. Used by
 * the Binance page, the coins priced from Binance and spot gold (MarketDataManager) and the "≈ live"
 * indications of stocks and commodities. If a stream is blocked the app keeps its 10-second refresh.
 */
import { useSyncExternalStore } from 'react';
import { FUTURES_MARK_PRICE_WS, parseMarkPrices, parseMiniTickers, SPOT_MINI_TICKER_WS, type MarkPriceTick, type MiniTicker } from '../crypto/binance.ts';

export type BinanceLiveStatus = 'connecting' | 'live' | 'off';

export interface LiveState<T> {
  status: BinanceLiveStatus;
  tickers: ReadonlyMap<string, T>;
}

/** One shared, demand-driven WebSocket whose messages are rows keyed by symbol. */
class LiveStream<T extends { symbol: string }> {
  private listeners = new Set<() => void>();
  state: LiveState<T> = { status: 'off', tickers: new Map() };
  private ws: WebSocket | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private url: string;
  private parse: (json: unknown) => T[];

  constructor(url: string, parse: (json: unknown) => T[]) {
    this.url = url;
    this.parse = parse;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this.disconnect();
        else this.connect();
      });
    }
  }

  private emit(patch: Partial<LiveState<T>>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private connect(): void {
    if (this.ws || typeof WebSocket === 'undefined' || this.listeners.size === 0) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    this.emit({ status: 'connecting' });
    const socket = new WebSocket(this.url);
    this.ws = socket;
    socket.onmessage = (ev) => {
      let rows: T[] = [];
      try {
        rows = this.parse(JSON.parse(String(ev.data)));
      } catch {
        return;
      }
      if (!rows.length) return;
      this.failures = 0;
      const next = new Map(this.state.tickers);
      for (const r of rows) next.set(r.symbol, r);
      this.emit({ status: 'live', tickers: next });
    };
    socket.onclose = () => {
      if (this.ws !== socket) return;
      this.ws = null;
      this.emit({ status: 'off' });
      if (this.listeners.size === 0) return;
      // 2 s, 4 s, 8 s … up to one minute
      const delay = Math.min(60_000, 2000 * 2 ** this.failures);
      this.failures += 1;
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.connect();
      }, delay);
    };
    socket.onerror = () => socket.close();
  }

  private disconnect(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const socket = this.ws;
    this.ws = null;
    socket?.close();
    if (this.state.status !== 'off') this.emit({ status: 'off' });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.connect();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.disconnect();
    };
  };

  snapshot = (): LiveState<T> => this.state;
}

export const binanceSpotLive = new LiveStream<MiniTicker>(SPOT_MINI_TICKER_WS, parseMiniTickers);
export const binanceFuturesLive = new LiveStream<MarkPriceTick>(FUTURES_MARK_PRICE_WS, parseMarkPrices);

/** Live spot mini-tickers by pair (e.g. BTCUSDT) while the component is mounted. */
export function useBinanceLive(): LiveState<MiniTicker> {
  return useSyncExternalStore(binanceSpotLive.subscribe, binanceSpotLive.snapshot, binanceSpotLive.snapshot);
}

/** Live futures index/mark prices by contract (e.g. NVDAUSDT) while the component is mounted. */
export function useBinanceFuturesLive(): LiveState<MarkPriceTick> {
  return useSyncExternalStore(binanceFuturesLive.subscribe, binanceFuturesLive.snapshot, binanceFuturesLive.snapshot);
}
