/**
 * marketDataService.ts — Client-side live market data. MarketDataManager streams Indodax
 * crypto prices over the official public WebSocket (with backoff and a REST fallback only
 * while the socket is down), polls Yahoo (JCI, global indices, currencies) every 30 s and gold
 * every 5 min, reports the connection state and keeps an offline price snapshot. Also
 * exports fetch helpers for sentiment, chart history, correlation and the news feed.
 * Views register extra symbols (IDX universe stocks on screen, in the watchlist or portfolio)
 * with trackSymbols(); those are priced on demand every 10 s.
 */
import {
  PriceTick,
  AssetIntelligence,
  OhlcCandle,
  CorrelationMatrix,
  MarketNewsItem,
  TimeframeInterval,
  getAssetBySymbol,
  ASSETS,
} from '../config/assets.ts';
import type { AssetAnalysis } from '../ai/analysis.ts';
import type { QuantFactorsPayload, QuantUniverse } from '../ai/factorPortfolio.ts';
import { loadTickSnapshot, saveTickSnapshot } from '../utils/storage.ts';
import { convertXauUsdToIdrPerGram } from '../utils/format.ts';

export type ConnectionState = 'live' | 'reconnecting' | 'delayed' | 'offline';

/**
 * Fetches a live price endpoint. Offline copies served by the service worker are rejected, so
 * old prices are never shown as live; the saved snapshot (marked fromSnapshot) is used instead.
 */
async function fetchLivePrices(url: string): Promise<Response> {
  const res = await fetch(url);
  if (res.headers.get('X-AssetRadar-Offline') === '1') throw new Error('offline copy');
  return res;
}

const INDODAX_WS_URL = 'wss://ws3.indodax.com/ws/';
// Official public static token from btcid/indodax-official-api-docs Market Data WebSocket documentation
const INDODAX_PUBLIC_WS_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE5NDY2MTg0MTV9.UR1lBM6Eqh0yWz-PVirw1uPCxe60FdchR8eNVdsskeo';

// Indodax WebSocket pair id → app symbol, for every crypto asset in the config
const PAIR_MAP: Record<string, string> = Object.fromEntries(
  ASSETS.filter((a) => a.indodaxPair).map((a) => [a.indodaxPair as string, a.symbol])
);

export interface MarketStreamCallbacks {
  onTicksUpdate: (ticks: Record<string, PriceTick>) => void;
  onConnectionStateChange: (state: ConnectionState) => void;
}

/** Owner → symbols outside the core loop that are on screen (IDX universe stocks). */
const trackedByOwner = new Map<string, string[]>();
let activeManager: MarketDataManager | null = null;

/**
 * Registers the extra symbols a view needs priced (e.g. visible IDX rows, watchlist or
 * portfolio stocks). Only assets outside the core price loop are fetched, on demand.
 */
export function trackSymbols(owner: string, symbols: string[]): void {
  if (symbols.length === 0) trackedByOwner.delete(owner);
  else trackedByOwner.set(owner, symbols);
  activeManager?.refreshTracked();
}

function trackedUniverseSymbols(): string[] {
  const all = new Set<string>();
  for (const list of trackedByOwner.values()) {
    for (const sym of list) if (getAssetBySymbol(sym)?.universe) all.add(sym);
  }
  return [...all];
}

export class MarketDataManager {
  private callbacks: MarketStreamCallbacks;
  private ticks: Record<string, PriceTick> = {};
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private indodaxPollTimer: ReturnType<typeof setInterval> | null = null;
  private yahooPollTimer: ReturnType<typeof setInterval> | null = null;
  private goldPollTimer: ReturnType<typeof setInterval> | null = null;
  private quotesPollTimer: ReturnType<typeof setInterval> | null = null;
  private lastTrackedKey = '';
  private isDestroyed = false;
  private wsConnected = false;
  private lastSnapshotSave = 0;

  constructor(callbacks: MarketStreamCallbacks) {
    this.callbacks = callbacks;
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleOnline = this.handleOnline.bind(this);
    this.handleOffline = this.handleOffline.bind(this);
  }

  public start(): void {
    this.isDestroyed = false;
    activeManager = this;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }

    // Show the last saved prices first (useful when offline)
    const snapshot = loadTickSnapshot();
    if (snapshot && Object.keys(snapshot).length > 0) {
      this.ticks = snapshot;
      this.callbacks.onTicksUpdate(this.ticks);
    }
    if (this.isOffline()) {
      this.callbacks.onConnectionStateChange('offline');
    }
    this.fetchInitialSnapshot();
    this.connectIndodaxWebSocket();
    this.startPollingTimers();
  }

  public stop(): void {
    this.isDestroyed = true;
    if (activeManager === this) activeManager = null;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
    this.disconnectWebSocket();
    this.clearPollingTimers();
  }

  public async retrySymbol(symbol: string): Promise<void> {
    if (getAssetBySymbol(symbol)?.indodaxPair) {
      await this.pollIndodaxRest();
      if (!this.wsConnected) {
        this.connectIndodaxWebSocket();
      }
    } else if (symbol === 'XAU/USD') {
      await this.pollGold();
    } else if (getAssetBySymbol(symbol)?.yahooSymbol) {
      await this.pollYahoo();
    } else {
      await this.fetchInitialSnapshot();
    }
  }

  private isOffline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  private handleOnline(): void {
    if (this.isDestroyed) return;
    this.callbacks.onConnectionStateChange('reconnecting');
    this.fetchInitialSnapshot();
    this.connectIndodaxWebSocket();
  }

  private handleOffline(): void {
    if (this.isDestroyed) return;
    this.disconnectWebSocket();
    this.callbacks.onConnectionStateChange('offline');
  }

  private handleVisibilityChange(): void {
    if (this.isDestroyed) return;
    if (document.visibilityState === 'hidden') {
      // Disconnect while the tab is hidden
      this.disconnectWebSocket();
      this.clearPollingTimers();
    } else if (document.visibilityState === 'visible') {
      // Reconnect when visible again
      this.fetchInitialSnapshot();
      this.connectIndodaxWebSocket();
      this.startPollingTimers();
    }
  }

  private async fetchInitialSnapshot(): Promise<void> {
    try {
      const res = await fetchLivePrices('/api/market/snapshot');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.ticks) {
        this.mergeTicks(data.ticks);
      }
      if (!this.wsConnected) {
        this.callbacks.onConnectionStateChange('live');
      }
    } catch {
      this.callbacks.onConnectionStateChange(this.isOffline() ? 'offline' : 'reconnecting');
    }
  }

  private mergeTicks(incoming: Record<string, PriceTick>): void {
    const next = { ...this.ticks };
    for (const [sym, tick] of Object.entries(incoming)) {
      const existing = next[sym];
      next[sym] = {
        ...existing,
        ...tick,
        fromSnapshot: tick.fromSnapshot ?? false,
        sparkline:
          tick.sparkline && tick.sparkline.length > 0
            ? tick.sparkline
            : existing?.sparkline,
      };
    }

    // Recompute Gold IDR/gram whenever XAU/USD or USD/IDR updates
    const xau = next['XAU/USD'];
    const usdIdr = next['USD/IDR'];
    if (
      xau &&
      usdIdr &&
      Number.isFinite(xau.price) &&
      xau.price > 0 &&
      Number.isFinite(usdIdr.price) &&
      usdIdr.price > 0
    ) {
      next['XAU/USD'] = {
        ...xau,
        priceIdrPerGram: convertXauUsdToIdrPerGram(xau.price, usdIdr.price),
      };
    }

    this.ticks = next;
    this.callbacks.onTicksUpdate(this.ticks);

    // Save the latest price snapshot (at most every 5 seconds) for offline mode
    const nowMs = Date.now();
    if (nowMs - this.lastSnapshotSave > 5000) {
      this.lastSnapshotSave = nowMs;
      saveTickSnapshot(this.ticks);
    }
  }

  private connectIndodaxWebSocket(): void {
    if (this.isDestroyed || typeof window === 'undefined') return;
    if (this.isOffline()) return;
    this.disconnectWebSocket();

    try {
      const ws = new WebSocket(INDODAX_WS_URL);
      this.ws = ws;

      ws.onopen = () => {
        if (this.isDestroyed) return;
        this.wsConnected = true;
        this.reconnectAttempts = 0;
        this.callbacks.onConnectionStateChange('live');

        // 1. Send Auth Token per Indodax WS v3 specification
        ws.send(
          JSON.stringify({
            params: { token: INDODAX_PUBLIC_WS_TOKEN },
            id: 1,
          })
        );

        // 2. Subscribe to market:summary-24h channel
        ws.send(
          JSON.stringify({
            method: 1,
            params: { channel: 'market:summary-24h' },
            id: 2,
          })
        );
      };

      ws.onmessage = (event) => {
        if (this.isDestroyed) return;
        try {
          const msg = JSON.parse(String(event.data));
          const rows = msg?.result?.data?.data;
          if (Array.isArray(rows)) {
            const updates: Record<string, PriceTick> = {};
            const now = Date.now();
            for (const row of rows) {
              // Indodax summary-24h row: [pairId, epochSec, last, low, high, prev24h, volIdr, volCoin]
              if (Array.isArray(row) && row.length >= 6) {
                const pairId = String(row[0]).toLowerCase();
                const symbol = PAIR_MAP[pairId];
                if (!symbol) continue;

                const last = Number(row[2]);
                const low = Number(row[3]);
                const high = Number(row[4]);
                const prev24h = Number(row[5]);
                if (!Number.isFinite(last) || last <= 0) continue;

                const changePct24h =
                  Number.isFinite(prev24h) && prev24h > 0
                    ? ((last - prev24h) / prev24h) * 100
                    : this.ticks[symbol]?.changePct24h;

                const existingSparkline = this.ticks[symbol]?.sparkline || [];
                const nowSec = Math.floor(now / 1000);
                const lastPt = existingSparkline[existingSparkline.length - 1];
                const updatedSparkline =
                  lastPt && nowSec > lastPt.time
                    ? [...existingSparkline.slice(-47), { time: nowSec, value: last }]
                    : existingSparkline;

                updates[symbol] = {
                  symbol,
                  group: 'crypto',
                  price: last,
                  changePct24h,
                  high24h: Number.isFinite(high) ? high : this.ticks[symbol]?.high24h,
                  low24h: Number.isFinite(low) ? low : this.ticks[symbol]?.low24h,
                  sparkline: updatedSparkline,
                  currency: 'IDR',
                  source: 'Indodax WS',
                  updatedAt: now,
                  status: 'live',
                };
              }
            }
            if (Object.keys(updates).length > 0) {
              this.mergeTicks(updates);
            }
          }
        } catch {
          // Ignore malformed WS frames
        }
      };

      ws.onerror = () => {
        this.wsConnected = false;
      };

      ws.onclose = () => {
        this.wsConnected = false;
        if (this.isDestroyed) return;
        this.scheduleReconnect();
      };
    } catch {
      this.wsConnected = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.isDestroyed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    this.callbacks.onConnectionStateChange('reconnecting');
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
    const delaySec = Math.min(30, Math.pow(2, this.reconnectAttempts));
    this.reconnectAttempts += 1;

    this.reconnectTimer = setTimeout(() => {
      if (!this.isDestroyed && document.visibilityState !== 'hidden') {
        this.connectIndodaxWebSocket();
      }
    }, delaySec * 1000);
  }

  private disconnectWebSocket(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close();
      } catch {
        // Ignore close error
      }
      this.ws = null;
    }
    this.wsConnected = false;
  }

  private startPollingTimers(): void {
    this.clearPollingTimers();

    // 1. Indodax REST polling every 10 seconds ONLY while the WebSocket is disconnected
    this.indodaxPollTimer = setInterval(() => {
      if (!this.wsConnected) {
        this.pollIndodaxRest();
      }
    }, 10_000);

    // 2. Yahoo Finance polling every 10 seconds (stocks, indices, commodities, currencies);
    //    the server only refetches symbols whose 15 s cache expired
    this.yahooPollTimer = setInterval(() => {
      this.pollYahoo();
    }, 10_000);

    // 3. On-demand quotes for tracked IDX universe stocks every 10 seconds
    this.quotesPollTimer = setInterval(() => {
      if (trackedUniverseSymbols().length > 0) this.pollTrackedQuotes();
    }, 10_000);

    // 4. Spot gold polling every 30 seconds (server caches gold-api.com for 30 s)
    this.goldPollTimer = setInterval(() => {
      this.pollGold();
    }, 30_000);
  }

  /** Called when the tracked symbol set changes: fetch new symbols right away. */
  public refreshTracked(): void {
    const key = trackedUniverseSymbols().sort().join(',');
    if (key === this.lastTrackedKey) return;
    this.lastTrackedKey = key;
    if (key) this.pollTrackedQuotes();
  }

  /** On-demand quotes for tracked universe stocks (60 symbols per request). */
  private async pollTrackedQuotes(): Promise<void> {
    const symbols = trackedUniverseSymbols();
    for (let i = 0; i < symbols.length; i += 60) {
      try {
        const res = await fetchLivePrices(`/api/market/quotes?symbols=${symbols.slice(i, i + 60).map(encodeURIComponent).join(',')}`);
        if (!res.ok) continue;
        const data = await res.json();
        if (data?.ticks) this.mergeTicks(data.ticks as Record<string, PriceTick>);
      } catch {
        // Keep the last known quotes
      }
    }
  }

  private clearPollingTimers(): void {
    if (this.quotesPollTimer) {
      clearInterval(this.quotesPollTimer);
      this.quotesPollTimer = null;
    }
    if (this.indodaxPollTimer) {
      clearInterval(this.indodaxPollTimer);
      this.indodaxPollTimer = null;
    }
    if (this.yahooPollTimer) {
      clearInterval(this.yahooPollTimer);
      this.yahooPollTimer = null;
    }
    if (this.goldPollTimer) {
      clearInterval(this.goldPollTimer);
      this.goldPollTimer = null;
    }
  }

  private async pollIndodaxRest(): Promise<void> {
    try {
      const res = await fetchLivePrices('/api/market/indodax');
      if (!res.ok) return;
      const data = await res.json();
      if (data?.ticks) {
        this.mergeTicks(data.ticks);
        if (!this.wsConnected) {
          // REST works but the WebSocket is not connected yet: data keeps flowing via polling
          this.callbacks.onConnectionStateChange('delayed');
        }
      }
    } catch {
      if (!this.wsConnected) {
        this.callbacks.onConnectionStateChange(this.isOffline() ? 'offline' : 'reconnecting');
      }
    }
  }

  private async pollYahoo(): Promise<void> {
    try {
      const res = await fetchLivePrices('/api/market/yahoo');
      if (!res.ok) return;
      const data = await res.json();
      if (data?.ticks) {
        // JCI, global indices and currencies; the server caches 30 s while a market is open
        this.mergeTicks(data.ticks as Record<string, PriceTick>);
      }
    } catch {
      // Keep existing tick
    }
  }

  private async pollGold(): Promise<void> {
    try {
      const res = await fetchLivePrices('/api/market/gold');
      if (!res.ok) return;
      const data = await res.json();
      if (data?.tick) {
        this.mergeTicks({ 'XAU/USD': data.tick });
      }
    } catch {
      // Keep existing gold tick
    }
  }
}

export async function fetchAssetIntelligence(symbol: string): Promise<AssetIntelligence> {
  const res = await fetch(`/api/market/intelligence?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return await res.json();
}

/** Evidence-weighted analysis: technical scorecard, chart patterns, fundamentals and news drivers. */
export async function fetchAssetAnalysis(symbol: string): Promise<AssetAnalysis> {
  const res = await fetch(`/api/market/analysis?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export async function fetchHistory(
  symbol: string,
  interval: TimeframeInterval
): Promise<OhlcCandle[]> {
  const res = await fetch(
    `/api/market/history?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.candles) ? data.candles : [];
}

export async function fetchCorrelation(): Promise<CorrelationMatrix> {
  const res = await fetch('/api/market/correlation');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export async function fetchNewsFeed(): Promise<MarketNewsItem[]> {
  const res = await fetch('/api/market/news-feed');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.items) ? data.items : [];
}

/** Response of /api/ai/outlook (see server.ts and src/ai/outlook.ts). */
export interface AiOutlookResponse {
  generatedAt: number;
  horizonDays: number;
  profile: string;
  assets: import('../ai/outlook.ts').AssetOutlook[];
  nextFomc: { date: string; daysUntil: number } | null;
  recentFedDecisions: Array<{ date: string; decision: string; inferred: boolean }>;
  geoAlertActive: boolean;
  summary: { text: string; aiPowered: boolean };
}

export async function fetchAiOutlook(horizon: number, profile: string): Promise<AiOutlookResponse> {
  const res = await fetch(`/api/ai/outlook?horizon=${horizon}&profile=${encodeURIComponent(profile)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

/** Monthly value & momentum factor portfolios for the quant simulator. */
export async function fetchQuantFactors(universe: QuantUniverse): Promise<QuantFactorsPayload> {
  const res = await fetch(`/api/quant/factors?universe=${encodeURIComponent(universe)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export interface YieldCurve {
  points: Array<{ tenor: string; years: number; yield: number; prevClose: number | null; monthAgo: number | null }>;
  updatedAt: number;
}

/** US Treasury yields (3M, 5Y, 10Y, 30Y) for the Terminal CURV panel. */
export async function fetchYieldCurve(): Promise<YieldCurve> {
  const res = await fetch('/api/market/yields');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export interface IdxRow {
  symbol: string;
  price: number | null;
  changePct24h: number | null;
  changePct7d: number | null;
  changePct30d: number | null;
  volume: number | null;
  valueTraded: number | null;
  marketCapIdr: number | null;
  marketCapUsd: number | null;
  updatedAt: number | null;
}

export interface IdxSnapshot {
  rows: IdxRow[];
  sweptAt: number | null;
  refreshMs: number;
  listUpdated: string;
  marketOpen: boolean;
}

/** Every listed Indonesian stock from the server's background sweep. */
export async function fetchIdxSnapshot(): Promise<IdxSnapshot> {
  const res = await fetch('/api/market/idx');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}
