/**
 * binanceLive.ts — Live Binance spot prices straight from the browser: one shared WebSocket to
 * Binance's public all-market mini-ticker stream (every pair that changed, about once a second; no
 * key, no account). Opened while a component listens and the tab is visible, closed otherwise, with
 * backoff on failure. The server keeps the slower columns (1h/4h/7d, funding, sentiment); this only
 * overlays the last price and the 24-hour change. If the stream is blocked the page keeps the
 * server's 10-second refresh.
 */
import { useSyncExternalStore } from 'react';
import { parseMiniTickers, SPOT_MINI_TICKER_WS, type MiniTicker } from '../crypto/binance.ts';

export type BinanceLiveStatus = 'connecting' | 'live' | 'off';

interface LiveState {
  status: BinanceLiveStatus;
  tickers: ReadonlyMap<string, MiniTicker>;
}

const listeners = new Set<() => void>();
let state: LiveState = { status: 'off', tickers: new Map() };
let ws: WebSocket | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;

function emit(patch: Partial<LiveState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function connect(): void {
  if (ws || typeof WebSocket === 'undefined' || listeners.size === 0) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  emit({ status: 'connecting' });
  const socket = new WebSocket(SPOT_MINI_TICKER_WS);
  ws = socket;
  socket.onmessage = (ev) => {
    let rows: MiniTicker[] = [];
    try {
      rows = parseMiniTickers(JSON.parse(String(ev.data)));
    } catch {
      return;
    }
    if (!rows.length) return;
    failures = 0;
    const next = new Map(state.tickers);
    for (const r of rows) next.set(r.symbol, r);
    emit({ status: 'live', tickers: next });
  };
  socket.onclose = () => {
    if (ws !== socket) return;
    ws = null;
    emit({ status: 'off' });
    if (listeners.size === 0) return;
    // 2 s, 4 s, 8 s … up to one minute
    const delay = Math.min(60_000, 2000 * 2 ** failures);
    failures += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, delay);
  };
  socket.onerror = () => socket.close();
}

function disconnect(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  const socket = ws;
  ws = null;
  socket?.close();
  emit({ status: 'off' });
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') disconnect();
    else connect();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  connect();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) disconnect();
  };
}

/** Live mini-tickers by pair (e.g. BTCUSDT) while the component is mounted. */
export function useBinanceLive(): LiveState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
