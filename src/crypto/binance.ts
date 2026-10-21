/**
 * binance.ts — Public Binance market data only (no API key, no account or order endpoints):
 * base endpoints in fallback order, parsers for exchangeInfo / ticker / klines / miniTicker /
 * premiumIndex (field names as in docs/binance/*.openapi.json), the USDT trading universe
 * (stablecoins and leveraged tokens removed, non-ASCII symbols kept as-is), and a weight
 * governor that stays under 20% of the per-IP limit and obeys 429 / 418 / 451 with Retry-After.
 * Weight is shared by all spot base endpoints, so switching endpoints never resets the budget.
 */

/** Spot market-data endpoints in the order Binance recommends for "market data only". */
export const SPOT_BASES = [
  'https://data-api.binance.vision',
  'https://api.binance.com',
  'https://api-gcp.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
  'https://api4.binance.com',
];
export const FUTURES_BASE = 'https://fapi.binance.com';
/** All-market mini tickers (±1 s), public market streams only. */
export const SPOT_MINI_TICKER_WS = 'wss://data-stream.binance.vision:443/ws/!miniTicker@arr';
/** Futures mark and index prices of every contract, once a second (market streams moved under /market/ in 2026). */
export const FUTURES_MARK_PRICE_WS = 'wss://fstream.binance.com/market/ws/!markPrice@arr@1s';

/** Our own share of the per-IP weight limit (the server IP may be shared). */
export const WEIGHT_BUDGET_SHARE = 0.2;
export const DEFAULT_SPOT_WEIGHT_LIMIT = 6000;
export const DEFAULT_FUTURES_WEIGHT_LIMIT = 2400;
/** Binance times requests out after 10 s; the client waits a little longer. */
export const REQUEST_TIMEOUT_MS = 12_000;

/** Weights from the Binance docs (see docs/binance/README.md). */
export const WEIGHTS = {
  exchangeInfo: 20,
  klines: 2,
  ticker24hAll: 80,
  premiumIndexAll: 10,
  futuresExchangeInfo: 1,
  futuresKlines: 5,
  ticker24hSymbols: (n: number) => (n <= 20 ? 2 * Math.max(1, n) : n <= 100 ? 40 : 80),
  tickerWindow: (n: number) => Math.min(200, 4 * Math.max(1, n)),
};

// ---- Universe --------------------------------------------------------------------------------

/** Stablecoins and fiat-backed tokens: their "momentum" is meaningless for ranking. */
export const STABLECOINS = new Set([
  'USDT', 'USDC', 'FDUSD', 'TUSD', 'BUSD', 'DAI', 'USDP', 'PYUSD', 'USDD', 'USDE', 'USDS', 'USD1', 'RLUSD', 'EURI', 'EUR',
  'AEUR', 'XUSD', 'BFUSD', 'USDJ', 'UST', 'USTC', 'GUSD', 'FRAX', 'LUSD', 'SUSD', 'EURC', 'TRY', 'BRL', 'GBP', 'JPY', 'ARS',
]);

export interface SpotSymbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
}

export interface RateLimit {
  rateLimitType: string;
  interval: string;
  intervalNum: number;
  limit: number;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : NaN;
};

/** /api/v3/exchangeInfo (also /fapi/v1/exchangeInfo): symbols plus the published rate limits. */
export function parseExchangeInfo(json: unknown): { symbols: SpotSymbol[]; rateLimits: RateLimit[] } {
  const o = (json ?? {}) as { symbols?: unknown[]; rateLimits?: unknown[] };
  const symbols: SpotSymbol[] = [];
  for (const s of o.symbols ?? []) {
    const r = s as Record<string, unknown>;
    if (typeof r.symbol !== 'string' || typeof r.baseAsset !== 'string' || typeof r.quoteAsset !== 'string') continue;
    symbols.push({ symbol: r.symbol, baseAsset: r.baseAsset, quoteAsset: r.quoteAsset, status: String(r.status ?? '') });
  }
  const rateLimits: RateLimit[] = [];
  for (const l of o.rateLimits ?? []) {
    const r = l as Record<string, unknown>;
    if (typeof r.rateLimitType !== 'string') continue;
    rateLimits.push({ rateLimitType: r.rateLimitType, interval: String(r.interval ?? ''), intervalNum: num(r.intervalNum), limit: num(r.limit) });
  }
  return { symbols, rateLimits };
}

/** REQUEST_WEIGHT per minute from exchangeInfo.rateLimits (fallback when missing). */
export function weightLimitPerMinute(rateLimits: RateLimit[], fallback = DEFAULT_SPOT_WEIGHT_LIMIT): number {
  const l = rateLimits.find((r) => r.rateLimitType === 'REQUEST_WEIGHT' && r.interval === 'MINUTE');
  if (!l || !Number.isFinite(l.limit) || l.limit <= 0) return fallback;
  return l.limit / Math.max(1, Number.isFinite(l.intervalNum) ? l.intervalNum : 1);
}

/**
 * Leveraged tokens: a base ending in UP/DOWN/BULL/BEAR whose stem is itself a listed base
 * (BTCUP → BTC). This keeps genuine coins whose names happen to end that way (e.g. JUP).
 */
export function isLeveragedToken(base: string, allBases: Set<string>): boolean {
  const m = /^(.+?)(UP|DOWN|BULL|BEAR)$/.exec(base);
  return Boolean(m && m[1].length >= 2 && allBases.has(m[1]));
}

/** Trading USDT pairs without stablecoins or leveraged tokens. Symbols may be non-ASCII. */
export function usdtPairs(symbols: SpotSymbol[]): SpotSymbol[] {
  const trading = symbols.filter((s) => s.status === 'TRADING' || s.status === '');
  const bases = new Set(trading.map((s) => s.baseAsset));
  return trading.filter(
    (s) => s.quoteAsset === 'USDT' && !STABLECOINS.has(s.baseAsset.toUpperCase()) && !isLeveragedToken(s.baseAsset, bases)
  );
}

export interface Ticker24h {
  symbol: string;
  lastPrice: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  priceChangePercent: number;
  /** Base-asset volume. */
  volume: number;
  /** Volume in the quote asset (USDT): the ranking measure. */
  quoteVolume: number;
  closeTime: number;
}

/** /api/v3/ticker/24hr (FULL or MINI; MINI has no priceChangePercent, so it is derived). */
export function parseTicker24h(json: unknown): Ticker24h[] {
  const arr = Array.isArray(json) ? json : json && typeof json === 'object' ? [json] : [];
  const out: Ticker24h[] = [];
  for (const t of arr) {
    const r = t as Record<string, unknown>;
    if (typeof r.symbol !== 'string') continue;
    const last = num(r.lastPrice);
    const open = num(r.openPrice);
    if (!Number.isFinite(last)) continue;
    let change = num(r.priceChangePercent);
    if (!Number.isFinite(change) && Number.isFinite(open) && open > 0) change = (last / open - 1) * 100;
    out.push({
      symbol: r.symbol,
      lastPrice: last,
      openPrice: open,
      highPrice: num(r.highPrice),
      lowPrice: num(r.lowPrice),
      priceChangePercent: change,
      volume: num(r.volume),
      quoteVolume: num(r.quoteVolume),
      closeTime: num(r.closeTime),
    });
  }
  return out;
}

/** The top-N USDT pairs by 24h quote volume (Binance ranks; we only filter). */
export function rankUniverse(pairs: SpotSymbol[], tickers: Ticker24h[], n = 100): Array<SpotSymbol & { quoteVolume: number; rank: number }> {
  const vol = new Map(tickers.map((t) => [t.symbol, t.quoteVolume]));
  return pairs
    .map((p) => ({ ...p, quoteVolume: vol.get(p.symbol) ?? NaN }))
    .filter((p) => Number.isFinite(p.quoteVolume) && p.quoteVolume > 0)
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, n)
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

// ---- Candles & streams -----------------------------------------------------------------------

export type KlineInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';

/** App chart intervals (TradingView style) → Binance kline intervals. */
export const APP_TO_BINANCE_INTERVAL: Record<string, KlineInterval> = { '1': '1m', '5': '5m', '15': '15m', '30': '30m', '60': '1h', '240': '4h', D: '1d', W: '1w' };

export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
  trades: number;
  /** False for the newest candle while it is still open: indicators must skip it. */
  closed: boolean;
}

/** /api/v3/klines and /fapi/v1/klines rows: [openTime, o, h, l, c, v, closeTime, quoteVolume, trades, …]. */
export function parseKlines(json: unknown, nowMs: number): Kline[] {
  if (!Array.isArray(json)) return [];
  const out: Kline[] = [];
  const seen = new Set<number>();
  for (const row of json) {
    if (!Array.isArray(row) || row.length < 9) continue;
    const k: Kline = {
      openTime: num(row[0]),
      open: num(row[1]),
      high: num(row[2]),
      low: num(row[3]),
      close: num(row[4]),
      volume: num(row[5]),
      closeTime: num(row[6]),
      quoteVolume: num(row[7]),
      trades: num(row[8]),
      closed: num(row[6]) < nowMs,
    };
    // Klines are unique by open time
    if (![k.openTime, k.open, k.high, k.low, k.close].every(Number.isFinite) || seen.has(k.openTime)) continue;
    seen.add(k.openTime);
    out.push(k);
  }
  return out.sort((a, b) => a.openTime - b.openTime);
}

/** Only the finished candles (for indicators that need closed bars). */
export const closedKlines = (k: Kline[]): Kline[] => k.filter((x) => x.closed);

export interface MiniTicker {
  symbol: string;
  close: number;
  open: number;
  high: number;
  low: number;
  /** Base volume. */
  volume: number;
  quoteVolume: number;
  eventTime: number;
}

/** WebSocket !miniTicker@arr payload: [{ e, E, s, c, o, h, l, v, q }, …]. */
export function parseMiniTickers(json: unknown): MiniTicker[] {
  const arr = Array.isArray(json) ? json : [];
  const out: MiniTicker[] = [];
  for (const t of arr) {
    const r = t as Record<string, unknown>;
    if (typeof r.s !== 'string') continue;
    const close = num(r.c);
    if (!Number.isFinite(close)) continue;
    out.push({ symbol: r.s, close, open: num(r.o), high: num(r.h), low: num(r.l), volume: num(r.v), quoteVolume: num(r.q), eventTime: num(r.E) });
  }
  return out;
}

/** One futures contract from the mark-price stream: mark (p) and index (i, from the underlying markets). */
export interface MarkPriceTick {
  symbol: string;
  mark: number;
  index: number;
  eventTime: number;
}

/** !markPrice@arr@1s payload: [{ e, E, s, p, i, … }, …]; entries without a usable index are skipped. */
export function parseMarkPrices(json: unknown): MarkPriceTick[] {
  const arr = Array.isArray(json) ? json : [];
  const out: MarkPriceTick[] = [];
  for (const t of arr) {
    const r = t as Record<string, unknown>;
    if (typeof r.s !== 'string') continue;
    const index = num(r.i);
    if (!Number.isFinite(index) || index <= 0) continue;
    out.push({ symbol: r.s, mark: num(r.p), index, eventTime: num(r.E) });
  }
  return out;
}

export interface PremiumIndex {
  symbol: string;
  markPrice: number;
  indexPrice: number;
  lastFundingRate: number;
  nextFundingTime: number;
  time: number;
}

/** /fapi/v1/premiumIndex (all symbols): mark price and the last funding rate. */
export function parsePremiumIndex(json: unknown): PremiumIndex[] {
  const arr = Array.isArray(json) ? json : json && typeof json === 'object' ? [json] : [];
  const out: PremiumIndex[] = [];
  for (const t of arr) {
    const r = t as Record<string, unknown>;
    if (typeof r.symbol !== 'string') continue;
    out.push({
      symbol: r.symbol,
      markPrice: num(r.markPrice),
      indexPrice: num(r.indexPrice),
      lastFundingRate: num(r.lastFundingRate),
      nextFundingTime: num(r.nextFundingTime),
      time: num(r.time),
    });
  }
  return out;
}

/** Futures contracts quoted per 1000 coins (1000PEPEUSDT): divide by the multiplier. */
export function futuresMultiplierOf(symbol: string): number {
  const m = /^(1000000|1000)[^0-9]/.exec(symbol);
  return m ? Number(m[1]) : 1;
}

// ---- Weight governor ---------------------------------------------------------------------------

export type BinanceAvailability = 'ok' | 'rate-limited' | 'ip-banned' | 'region-blocked' | 'unreachable';

/**
 * Tracks REQUEST_WEIGHT per minute (from our own count and X-MBX-USED-WEIGHT-1M, whichever is
 * higher), keeps us under WEIGHT_BUDGET_SHARE of the limit, and pauses after 429 / 418.
 */
export class WeightGovernor {
  limitPerMinute: number;
  share: number;
  private windowStart = 0;
  private spent = 0;
  private headerUsed = 0;
  blockedUntil = 0;
  availability: BinanceAvailability = 'ok';
  lastError: string | null = null;

  constructor(limitPerMinute = DEFAULT_SPOT_WEIGHT_LIMIT, share = WEIGHT_BUDGET_SHARE) {
    this.limitPerMinute = limitPerMinute;
    this.share = share;
  }

  private roll(now: number): void {
    const minute = Math.floor(now / 60_000) * 60_000;
    if (minute !== this.windowStart) {
      this.windowStart = minute;
      this.spent = 0;
      this.headerUsed = 0;
    }
  }

  /** Our budget for this minute. */
  budget(): number {
    return Math.floor(this.limitPerMinute * this.share);
  }

  /** Weight used this minute as far as we know. */
  used(now: number): number {
    this.roll(now);
    return Math.max(this.spent, this.headerUsed);
  }

  /** True when a request of this weight fits the budget and no ban/backoff is active. */
  canSpend(weight: number, now: number): boolean {
    if (now < this.blockedUntil) return false;
    if (this.availability === 'region-blocked') return false;
    return this.used(now) + weight <= this.budget();
  }

  /** Milliseconds until a request of this weight may be sent. */
  waitMs(weight: number, now: number): number {
    if (now < this.blockedUntil) return this.blockedUntil - now;
    if (this.canSpend(weight, now)) return 0;
    return this.windowStart + 60_000 - now;
  }

  /** Counts a sent request and reads X-MBX-USED-WEIGHT-1M when present. */
  record(weight: number, usedHeader: string | null | undefined, now: number): void {
    this.roll(now);
    this.spent += weight;
    const h = Number(usedHeader);
    if (usedHeader != null && Number.isFinite(h)) this.headerUsed = Math.max(this.headerUsed, h);
  }

  /**
   * Reacts to an HTTP status. 429: stop until Retry-After (default 60 s). 418: IP banned —
   * stop all requests until Retry-After (default 10 min). 451: region blocked.
   */
  onStatus(status: number, retryAfter: string | null | undefined, now: number): void {
    const seconds = Number(retryAfter);
    const wait = (fallbackSec: number) => (Number.isFinite(seconds) && seconds > 0 ? seconds : fallbackSec) * 1000;
    if (status === 429) {
      this.blockedUntil = Math.max(this.blockedUntil, now + wait(60));
      this.availability = 'rate-limited';
      this.lastError = 'HTTP 429: request weight limit reached';
    } else if (status === 418) {
      this.blockedUntil = Math.max(this.blockedUntil, now + wait(600));
      this.availability = 'ip-banned';
      this.lastError = 'HTTP 418: IP temporarily banned by Binance';
    } else if (status === 451) {
      this.availability = 'region-blocked';
      this.lastError = "HTTP 451: Binance is not available from this server's region";
    } else if (status >= 200 && status < 300) {
      if (now >= this.blockedUntil && this.availability !== 'region-blocked') this.availability = 'ok';
    }
  }
}

// ---- Client ------------------------------------------------------------------------------------

export class BinanceHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

/** Builds a query string; values are URI-encoded (symbols may be non-ASCII). */
export function buildQuery(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * GET client over a list of base endpoints. A network failure moves on to the next base; HTTP
 * 429/418 stop everything (shared per-IP weight); 451 on every base marks the region blocked.
 */
export class BinanceClient {
  bases: string[];
  governor: WeightGovernor;
  private fetchFn: FetchLike;
  private now: () => number;
  private timeoutMs: number;
  /** Index of the base that answered last. */
  current = 0;

  constructor(opts: { bases: string[]; governor: WeightGovernor; fetch?: FetchLike; now?: () => number; timeoutMs?: number }) {
    this.bases = opts.bases;
    this.governor = opts.governor;
    this.fetchFn = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.now = opts.now ?? Date.now;
    this.timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  async get(path: string, params: Record<string, string | number | undefined>, weight: number): Promise<unknown> {
    const now = this.now();
    if (!this.governor.canSpend(weight, now)) {
      throw new BinanceHttpError(0, `Binance budget: wait ${Math.ceil(this.governor.waitMs(weight, now) / 1000)} s`);
    }
    const query = buildQuery(params);
    let regionBlocked = 0;
    let lastErr: unknown = null;
    for (let k = 0; k < this.bases.length; k++) {
      const i = (this.current + k) % this.bases.length;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchFn(`${this.bases[i]}${path}${query}`, { signal: controller.signal, headers: { Accept: 'application/json' } });
        const t = this.now();
        this.governor.record(weight, res.headers.get('x-mbx-used-weight-1m'), t);
        this.governor.onStatus(res.status, res.headers.get('retry-after'), t);
        if (res.status === 429 || res.status === 418) throw new BinanceHttpError(res.status, this.governor.lastError ?? `HTTP ${res.status}`);
        if (res.status === 451) {
          regionBlocked++;
          continue;
        }
        if (!res.ok) throw new BinanceHttpError(res.status, `HTTP ${res.status}`);
        this.current = i;
        return await res.json();
      } catch (err) {
        if (err instanceof BinanceHttpError && (err.status === 429 || err.status === 418)) throw err;
        lastErr = err;
      } finally {
        clearTimeout(timer);
      }
    }
    if (regionBlocked === this.bases.length) {
      throw new BinanceHttpError(451, "Binance data is not available from this server's region");
    }
    if (regionBlocked === 0 && this.governor.availability === 'ok') {
      this.governor.availability = 'unreachable';
      this.governor.lastError = lastErr instanceof Error ? lastErr.message : 'Binance unreachable';
    }
    throw lastErr instanceof Error ? lastErr : new Error('Binance unreachable');
  }
}

// ---- Scheduling ----------------------------------------------------------------------------------

/**
 * Splits work items into rounds that each fit a per-minute weight budget, e.g. 100 pairs ×
 * 3 timeframes × weight 2 = 600 weight → one round when the budget is ≥ 600, else several.
 */
export function planRounds<T>(items: T[], weightEach: number, budgetPerRound: number): T[][] {
  const perRound = Math.max(1, Math.floor(budgetPerRound / Math.max(1, weightEach)));
  const rounds: T[][] = [];
  for (let i = 0; i < items.length; i += perRound) rounds.push(items.slice(i, i + perRound));
  return rounds;
}

/**
 * % change over the last 1 h / 4 h / 7 d from hourly candles (open of the window's first candle)
 * against the live price; undefined when the candles do not reach back that far.
 */
export function windowChanges(hourly: Kline[], lastPrice: number): { h1?: number; h4?: number; d7?: number } {
  const pct = (hours: number) => {
    if (!Number.isFinite(lastPrice) || hourly.length < hours) return undefined;
    const base = hourly[hourly.length - hours].open;
    return base > 0 ? (lastPrice / base - 1) * 100 : undefined;
  };
  return { h1: pct(1), h4: pct(4), d7: pct(168) };
}

export interface DerivativesSnapshot {
  contract: string;
  /** Open interest now and its % change over the last 24 h (Binance keeps 30 days). */
  openInterest?: number;
  openInterestChange24h?: number;
  /** All-account long/short ratio (not the top-trader ratio, which needs an API key). */
  longShortRatio?: number;
  /** Taker buy/sell volume ratio over the last hour. */
  takerBuySellRatio?: number;
  /** Annualized basis of the perpetual vs the index, % (when reported). */
  basisRate?: number;
  updatedAt: number;
}

const lastRow = (json: unknown): Record<string, unknown> | undefined =>
  Array.isArray(json) && json.length ? (json[json.length - 1] as Record<string, unknown>) : undefined;

/** Builds the derivatives snapshot from the /futures/data/* responses (fixtures in tests). */
export function parseDerivatives(
  contract: string,
  oiHist: unknown,
  longShort: unknown,
  taker: unknown,
  basis: unknown,
  now: number
): DerivativesSnapshot {
  const oi = Array.isArray(oiHist) ? (oiHist as Array<Record<string, unknown>>).map((r) => num(r.sumOpenInterest)).filter(Number.isFinite) : [];
  const ls = lastRow(longShort);
  const tk = lastRow(taker);
  const bs = lastRow(basis);
  const first = oi[0];
  const last = oi[oi.length - 1];
  return {
    contract,
    openInterest: last,
    openInterestChange24h: oi.length >= 2 && first > 0 ? (last / first - 1) * 100 : undefined,
    longShortRatio: ls ? num(ls.longShortRatio) : undefined,
    takerBuySellRatio: tk ? num(tk.buySellRatio) : undefined,
    basisRate: bs && Number.isFinite(num(bs.annualizedBasisRate)) ? num(bs.annualizedBasisRate) * 100 : undefined,
    updatedAt: now,
  };
}
