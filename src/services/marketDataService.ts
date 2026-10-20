/**
 * marketDataService.ts — Client-side live market data. MarketDataManager streams Indodax
 * crypto prices over the official public WebSocket (with backoff and a REST fallback only
 * while the socket is down) and receives every other price (stocks, indices, commodities,
 * currencies, gold) from the server's price stream (SSE, ±5 s, only changed quotes). If the
 * stream breaks or stalls (>30 s without data or ping) it falls back to REST polling every 10 s
 * and reconnects with backoff. Reports the connection state and feed mode, keeps an offline
 * price snapshot, and exports fetch helpers for sentiment, history, correlation and news.
 * Views register symbols they show (IDX universe stocks, watchlist, portfolio, detail page) with
 * trackSymbols(); the stream refreshes those first.
 */
import type { StatementPeriod, StatementRow } from '../utils/statements.ts';
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
import type { CalendarEvent } from '../utils/corporateCalendar.ts';
import type { MacroIndicator, MacroPoint, MacroSeries, PulseCategory } from '../utils/macro.ts';
import { loadTickSnapshot, saveTickSnapshot } from '../utils/storage.ts';
import { convertXauUsdToIdrPerGram } from '../utils/format.ts';
import { isStreamStalled, reconnectDelayMs } from '../utils/priceStream.ts';
import { langParam } from '../i18n/index.ts';

export type ConnectionState = 'live' | 'reconnecting' | 'delayed' | 'offline';
/** How non-crypto prices arrive: pushed by the server stream, or REST polling as the fallback. */
export type FeedMode = 'streaming' | 'polling';

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
  onFeedModeChange?: (mode: FeedMode) => void;
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

/** Every symbol a view has on screen (core assets included), for the stream's priority list. */
function allTrackedSymbols(): string[] {
  const all = new Set<string>();
  for (const list of trackedByOwner.values()) for (const sym of list) all.add(sym);
  return [...all];
}

function newClientId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }
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
  private clientId = newClientId();
  private stream: EventSource | null = null;
  private streaming = false;
  private streamAttempts = 0;
  private streamLastEventAt = 0;
  private streamRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private streamWatchdog: ReturnType<typeof setInterval> | null = null;
  private lastFocusKey = '';
  private lastFocusSentAt = 0;

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
    this.connectPriceStream();
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
    this.disconnectPriceStream();
    this.stopStreamWatchdog();
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
    this.streamAttempts = 0;
    this.connectPriceStream();
  }

  private handleOffline(): void {
    if (this.isDestroyed) return;
    this.disconnectWebSocket();
    this.disconnectPriceStream();
    this.callbacks.onConnectionStateChange('offline');
  }

  private handleVisibilityChange(): void {
    if (this.isDestroyed) return;
    if (document.visibilityState === 'hidden') {
      // Disconnect while the tab is hidden
      this.disconnectWebSocket();
      this.disconnectPriceStream();
      this.clearPollingTimers();
    } else if (document.visibilityState === 'visible') {
      // Reconnect when visible again
      this.fetchInitialSnapshot();
      this.connectIndodaxWebSocket();
      this.streamAttempts = 0;
      this.connectPriceStream();
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

  // ---- Server-push price stream (SSE) -----------------------------------------------------------

  /** Opens the price stream; while it is healthy the Yahoo / gold / quote polling pauses. */
  private connectPriceStream(): void {
    if (this.isDestroyed || typeof EventSource === 'undefined' || this.isOffline()) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    this.disconnectPriceStream();
    const es = new EventSource(`/api/market/price-stream?client=${encodeURIComponent(this.clientId)}`);
    this.stream = es;
    const onData = (ev: MessageEvent) => {
      if (this.isDestroyed || this.stream !== es) return;
      this.streamLastEventAt = Date.now();
      try {
        const data = JSON.parse(String(ev.data));
        if (data?.ticks && Object.keys(data.ticks).length) this.mergeTicks(data.ticks as Record<string, PriceTick>);
      } catch {
        // Ignore malformed events
      }
      if (!this.streaming) {
        this.streaming = true;
        this.streamAttempts = 0;
        this.callbacks.onFeedModeChange?.('streaming');
        if (!this.wsConnected) this.callbacks.onConnectionStateChange('live');
        this.sendFocus(true);
      }
    };
    es.addEventListener('snapshot', onData as EventListener);
    es.addEventListener('prices', onData as EventListener);
    es.addEventListener('ping', (() => {
      if (this.stream === es) this.streamLastEventAt = Date.now();
    }) as EventListener);
    // The browser's own retry is replaced by ours (backoff + polling meanwhile)
    es.onerror = () => {
      if (this.stream === es) this.streamFailed();
    };
    this.streamLastEventAt = Date.now();
    if (!this.streamWatchdog) {
      this.streamWatchdog = setInterval(() => {
        if (this.stream && isStreamStalled(this.streamLastEventAt, Date.now())) this.streamFailed();
        // The server forgets focus lists after 10 min: refresh them every 4 min
        else if (this.streaming && Date.now() - this.lastFocusSentAt > 4 * 60_000) this.sendFocus(true);
      }, 5000);
    }
  }

  /** Stream broken or stalled: fall back to REST polling and retry with backoff. */
  private streamFailed(): void {
    this.disconnectPriceStream();
    if (this.isDestroyed) return;
    this.callbacks.onFeedModeChange?.('polling');
    // Catch up right away instead of waiting for the next polling round
    this.pollYahoo();
    this.pollGold();
    const delay = reconnectDelayMs(this.streamAttempts);
    this.streamAttempts += 1;
    this.streamRetryTimer = setTimeout(() => {
      this.streamRetryTimer = null;
      this.connectPriceStream();
    }, delay);
  }

  private disconnectPriceStream(): void {
    if (this.streamRetryTimer) {
      clearTimeout(this.streamRetryTimer);
      this.streamRetryTimer = null;
    }
    if (this.stream) {
      this.stream.onerror = null;
      this.stream.close();
      this.stream = null;
    }
    this.streaming = false;
  }

  private stopStreamWatchdog(): void {
    if (this.streamWatchdog) {
      clearInterval(this.streamWatchdog);
      this.streamWatchdog = null;
    }
  }

  /** Tells the server which symbols are on screen, so they refresh first (and universe stocks at all). */
  private sendFocus(force = false): void {
    if (!this.streaming) return;
    const symbols = allTrackedSymbols();
    const key = symbols.sort().join(',');
    if (!force && key === this.lastFocusKey) return;
    this.lastFocusKey = key;
    this.lastFocusSentAt = Date.now();
    fetch('/api/market/price-focus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client: this.clientId, symbols }),
    }).catch(() => {
      // Next change or reconnect sends it again
    });
  }

  private startPollingTimers(): void {
    this.clearPollingTimers();

    // 1. Indodax REST polling every 10 seconds ONLY while the WebSocket is disconnected
    this.indodaxPollTimer = setInterval(() => {
      if (!this.wsConnected) {
        this.pollIndodaxRest();
      }
    }, 10_000);

    // 2–4 run only while the price stream is down (it pushes the same prices):
    // 2. Yahoo Finance polling every 10 seconds (stocks, indices, commodities, currencies)
    this.yahooPollTimer = setInterval(() => {
      if (!this.streaming) this.pollYahoo();
    }, 10_000);

    // 3. On-demand quotes for tracked IDX universe stocks every 10 seconds
    this.quotesPollTimer = setInterval(() => {
      if (!this.streaming && trackedUniverseSymbols().length > 0) this.pollTrackedQuotes();
    }, 10_000);

    // 4. Spot gold polling every 30 seconds (server caches gold-api.com for 30 s)
    this.goldPollTimer = setInterval(() => {
      if (!this.streaming) this.pollGold();
    }, 30_000);
  }

  /** Called when the tracked symbol set changes: fetch new symbols right away. */
  public refreshTracked(): void {
    this.sendFocus();
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
  const res = await fetch(`/api/market/intelligence?symbol=${encodeURIComponent(symbol)}&${langParam()}`);
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

export interface FinancialStatements {
  symbol: string;
  code: string;
  period: StatementPeriod;
  /** Reporting currency of the figures, and the currency the share trades in. */
  currency: string;
  quoteCurrency: string;
  valuationNote: string | null;
  fiscalYearEndMonth: number;
  rows: StatementRow[];
  fScore: { score: number; max: number; fiscalYearEnd: string } | null;
  sources: Array<{ id: 'yahoo' | 'sec'; label: string; url: string }>;
  generatedAt: number;
}

export async function fetchFinancialStatements(symbol: string, period: StatementPeriod): Promise<FinancialStatements> {
  const res = await fetch(`/api/fundamentals/statements?symbol=${encodeURIComponent(symbol)}&period=${period}`);
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
  const res = await fetch(`/api/ai/outlook?horizon=${horizon}&profile=${encodeURIComponent(profile)}&${langParam()}`);
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

export interface CalendarResponse {
  events: CalendarEvent[];
  from?: string;
  to?: string;
  scanned?: number;
  total?: number;
  scanning?: boolean;
  source: string;
}

/** Corporate calendar for one stock, or (no symbol) every IDX stock from -30 to +90 days. */
export async function fetchCorporateCalendar(symbol?: string): Promise<CalendarResponse> {
  const res = await fetch(symbol ? `/api/idx/calendar?symbol=${encodeURIComponent(symbol)}` : '/api/idx/calendar');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export interface IndonesiaMacro {
  series: MacroSeries[];
  biRate: MacroPoint[];
  unavailable: Array<{ id?: string; label: string; reason: string }>;
  failed: string[];
  generatedAt: number;
  /** Stage 4: categorized indicators with z-scores and stale flags, the Macro Pulse and IDX valuation. */
  indicators?: MacroIndicator[];
  pulse?: PulseCategory[];
  idxValuation?: {
    medianPE: number | null;
    medianPB: number | null;
    earningsYield: number | null;
    eyMinusBiRate: number | null;
    advancers: number;
    decliners: number;
    unchanged: number;
    n: number;
  } | null;
  calendar?: Array<{ type: 'fomc'; date: string }>;
  bpsConfigured?: boolean;
}

/** Indonesia macro indicators (Bank Indonesia, FRED, World Bank; cached 6 h on the server). */
export async function fetchIndonesiaMacro(): Promise<IndonesiaMacro> {
  const res = await fetch('/api/macro/indonesia');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export interface ScreenerResponse {
  rows: import('../utils/screener.ts').ScreenerRow[];
  scan: { scanned: number; withData: number; total: number; scanning: boolean; finishedAt: number | null };
  pricesAt: number | null;
  source: string;
}

/** Every IDX stock with prices and statement ratios (the server scans statements slowly, 24 h cache). */
export async function fetchScreener(): Promise<ScreenerResponse> {
  const res = await fetch('/api/screener/idx');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export interface DailyBarOhlc {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface DailyHistory {
  symbol: string;
  currency: string;
  source: string;
  bars: DailyBarOhlc[];
}

const dailyMemo = new Map<string, { at: number; data: Promise<DailyHistory> }>();

/** About 5 years of daily OHLC bars (cached in this tab for 30 min). */
export function fetchDailyHistory(symbol: string): Promise<DailyHistory> {
  const memo = dailyMemo.get(symbol);
  if (memo && Date.now() - memo.at < 30 * 60_000) return memo.data;
  const data = fetch(`/api/market/daily?symbol=${encodeURIComponent(symbol)}`).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as DailyHistory;
  });
  data.catch(() => dailyMemo.delete(symbol));
  dailyMemo.set(symbol, { at: Date.now(), data });
  return data;
}

export interface BriefResponse {
  brief: import('../utils/morningBrief.ts').MorningBrief;
  /** Generated on the fly (nothing saved for that date yet). */
  preview: boolean;
  nextAt?: string;
  telegram?: boolean;
  persistent?: boolean;
}

/** Today's morning brief (from 07:30 WIB; before that yesterday's), or a saved one by date. */
export async function fetchMorningBrief(date?: string): Promise<BriefResponse> {
  const res = await fetch(date ? `/api/brief?date=${encodeURIComponent(date)}` : '/api/brief');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export async function fetchBriefDates(): Promise<string[]> {
  const res = await fetch('/api/brief/dates');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).dates ?? [];
}
