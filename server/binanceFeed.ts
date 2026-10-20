/**
 * binanceFeed.ts — Server-side Binance public market data (no API key): the USDT universe (top
 * 100 by 24h quote volume, refreshed daily from exchangeInfo + hourly ranking), all-market tickers
 * (one WebSocket to !miniTicker@arr, or REST ticker/24hr polling when the WebSocket is unavailable),
 * futures tickers and funding (premiumIndex), and a background candle queue for the top pairs that
 * stays inside 20% of the per-IP weight. Polls only while someone looked at Binance data in the
 * last 10 minutes. Every failure is recorded in `binanceStatus()` so the UI can say why.
 */
import {
  BinanceClient,
  BinanceHttpError,
  FUTURES_BASE,
  SPOT_BASES,
  SPOT_MINI_TICKER_WS,
  WEIGHTS,
  WeightGovernor,
  DEFAULT_FUTURES_WEIGHT_LIMIT,
  closedKlines,
  parseExchangeInfo,
  parseKlines,
  parseMiniTickers,
  parseDerivatives,
  parsePremiumIndex,
  parseTicker24h,
  rankUniverse,
  usdtPairs,
  weightLimitPerMinute,
  type DerivativesSnapshot,
  type Kline,
  type KlineInterval,
  type PremiumIndex,
  type SpotSymbol,
} from '../src/crypto/binance.ts';
import type { UsdQuote } from '../src/crypto/cryptoPricing.ts';

const DEMAND_WINDOW_MS = 10 * 60_000;
const TICKER_POLL_MS = 15_000;
const FUTURES_POLL_MS = 60_000;
const RANKING_MS = 60 * 60_000;
const EXCHANGE_INFO_MS = 24 * 60 * 60_000;
/** Reconnect well before Binance closes a stream connection at 24 h. */
const WS_MAX_AGE_MS = 23 * 60 * 60_000;
const KLINE_TTL: Record<KlineInterval, number> = {
  '1m': 30_000,
  '5m': 30_000,
  '15m': 60_000,
  '30m': 60_000,
  '1h': 60_000,
  '4h': 60_000,
  '1d': 5 * 60_000,
  '1w': 30 * 60_000,
};
/** Candles the ranking scan keeps for every top-100 pair. */
const SCAN_SERIES: Array<{ interval: KlineInterval; limit: number; everyMs: number }> = [
  { interval: '1h', limit: 200, everyMs: 5 * 60_000 },
  { interval: '1d', limit: 500, everyMs: 30 * 60_000 },
];

export interface UniversePair extends SpotSymbol {
  rank: number;
  quoteVolume: number;
}

export interface SpotTicker extends UsdQuote {
  symbol: string;
  openPrice: number;
}

const spotGovernor = new WeightGovernor();
const futuresGovernor = new WeightGovernor(DEFAULT_FUTURES_WEIGHT_LIMIT);
const spot = new BinanceClient({ bases: SPOT_BASES, governor: spotGovernor });
const futures = new BinanceClient({ bases: [FUTURES_BASE], governor: futuresGovernor });

const state = {
  lastDemandAt: 0,
  pairs: [] as SpotSymbol[],
  pairsAt: 0,
  universe: [] as UniversePair[],
  universeAt: 0,
  tickers: new Map<string, SpotTicker>(),
  tickersAt: 0,
  futuresTickers: new Map<string, SpotTicker>(),
  premium: new Map<string, PremiumIndex>(),
  futuresAt: 0,
  klines: new Map<string, { data: Kline[]; at: number }>(),
  scanCursor: 0,
  ws: null as WebSocket | null,
  wsState: 'off' as 'off' | 'connecting' | 'live' | 'unsupported' | 'failed',
  wsOpenedAt: 0,
  wsFailures: 0,
  busy: false,
  lastError: null as string | null,
  futuresError: null as string | null,
};

/** Marks that someone looked at Binance data (starts/keeps the background loop). */
export function noteBinanceDemand(): void {
  state.lastDemandAt = Date.now();
  connectMiniTickers();
}

const hasDemand = (now: number) => now - state.lastDemandAt <= DEMAND_WINDOW_MS;

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function refreshPairs(now: number): Promise<void> {
  if (state.pairs.length && now - state.pairsAt < EXCHANGE_INFO_MS) return;
  const info = parseExchangeInfo(await spot.get('/api/v3/exchangeInfo', { permissions: 'SPOT', symbolStatus: 'TRADING' }, WEIGHTS.exchangeInfo));
  spotGovernor.limitPerMinute = weightLimitPerMinute(info.rateLimits);
  state.pairs = usdtPairs(info.symbols);
  state.pairsAt = now;
}

function storeTickers(rows: ReturnType<typeof parseTicker24h>, into: Map<string, SpotTicker>, source: string, now: number): void {
  for (const t of rows) {
    into.set(t.symbol, {
      symbol: t.symbol,
      price: t.lastPrice,
      openPrice: t.openPrice,
      changePct24h: Number.isFinite(t.priceChangePercent) ? t.priceChangePercent : undefined,
      high24h: Number.isFinite(t.highPrice) ? t.highPrice : undefined,
      low24h: Number.isFinite(t.lowPrice) ? t.lowPrice : undefined,
      quoteVolume: Number.isFinite(t.quoteVolume) ? t.quoteVolume : undefined,
      updatedAt: Number.isFinite(t.closeTime) ? Math.min(t.closeTime, now) : now,
      source,
    });
  }
}

async function refreshTickers(now: number): Promise<void> {
  // With a live WebSocket the REST snapshot is only needed for the hourly volume ranking
  const wsLive = state.wsState === 'live';
  const due = wsLive ? now - state.universeAt >= RANKING_MS : now - state.tickersAt >= TICKER_POLL_MS;
  if (!due && state.tickers.size) return;
  const rows = parseTicker24h(await spot.get('/api/v3/ticker/24hr', {}, WEIGHTS.ticker24hAll));
  storeTickers(rows, state.tickers, 'Binance', now);
  state.tickersAt = now;
  if (!state.universe.length || now - state.universeAt >= RANKING_MS) {
    state.universe = rankUniverse(state.pairs, rows, 100);
    state.universeAt = now;
  }
}

async function refreshFutures(now: number): Promise<void> {
  if (now - state.futuresAt < FUTURES_POLL_MS) return;
  state.futuresAt = now;
  try {
    const [premium, tickers] = await Promise.all([
      futures.get('/fapi/v1/premiumIndex', {}, WEIGHTS.premiumIndexAll),
      futures.get('/fapi/v1/ticker/24hr', {}, 40),
    ]);
    state.premium = new Map(parsePremiumIndex(premium).map((p) => [p.symbol, p]));
    storeTickers(parseTicker24h(tickers), state.futuresTickers, 'Binance Futures', now);
    state.futuresError = null;
  } catch (err) {
    state.futuresError =
      err instanceof BinanceHttpError && err.status === 451 ? "Binance futures data is not available from this server's region" : errorText(err);
  }
}

/** Next candle series of the top pairs, as far as the weight budget allows this round. */
async function scanKlines(now: number): Promise<void> {
  const jobs: Array<{ symbol: string; interval: KlineInterval; limit: number; everyMs: number }> = [];
  for (const p of state.universe) for (const s of SCAN_SERIES) jobs.push({ symbol: p.symbol, ...s });
  for (let n = 0; n < jobs.length; n++) {
    const job = jobs[(state.scanCursor + n) % jobs.length];
    const key = `${job.symbol}|${job.interval}`;
    const have = state.klines.get(key);
    if (have && now - have.at < job.everyMs) continue;
    if (!spotGovernor.canSpend(WEIGHTS.klines, Date.now())) {
      state.scanCursor = (state.scanCursor + n) % jobs.length;
      return;
    }
    try {
      const rows = await spot.get('/api/v3/klines', { symbol: job.symbol, interval: job.interval, limit: job.limit }, WEIGHTS.klines);
      state.klines.set(key, { data: parseKlines(rows, Date.now()), at: Date.now() });
    } catch (err) {
      state.lastError = errorText(err);
      return;
    }
  }
}

async function loop(): Promise<void> {
  const now = Date.now();
  if (state.busy || !hasDemand(now)) return;
  state.busy = true;
  try {
    await refreshPairs(now);
    await refreshTickers(now);
    state.lastError = null;
    await refreshFutures(now);
    await scanKlines(now);
  } catch (err) {
    state.lastError = errorText(err);
  } finally {
    state.busy = false;
  }
}

setInterval(() => {
  loop().catch(() => {});
}, 5_000);

// ---- WebSocket (all-market mini tickers) ------------------------------------------------------

function connectMiniTickers(): void {
  if (state.ws || state.wsState === 'unsupported' || spotGovernor.availability === 'region-blocked') return;
  const WS = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
  if (!WS) {
    state.wsState = 'unsupported';
    return;
  }
  if (state.wsFailures >= 5) return; // REST polling carries on; retried after the next quiet spell
  state.wsState = 'connecting';
  let ws: WebSocket;
  try {
    ws = new WS(SPOT_MINI_TICKER_WS);
  } catch {
    state.wsState = 'failed';
    state.wsFailures++;
    return;
  }
  state.ws = ws;
  ws.onopen = () => {
    state.wsState = 'live';
    state.wsOpenedAt = Date.now();
    state.wsFailures = 0;
  };
  ws.onmessage = (ev: MessageEvent) => {
    let rows: ReturnType<typeof parseMiniTickers>;
    try {
      rows = parseMiniTickers(JSON.parse(String(ev.data)));
    } catch {
      return;
    }
    for (const m of rows) {
      const prev = state.tickers.get(m.symbol);
      state.tickers.set(m.symbol, {
        symbol: m.symbol,
        price: m.close,
        openPrice: m.open,
        changePct24h: m.open > 0 ? (m.close / m.open - 1) * 100 : prev?.changePct24h,
        high24h: Number.isFinite(m.high) ? m.high : prev?.high24h,
        low24h: Number.isFinite(m.low) ? m.low : prev?.low24h,
        quoteVolume: Number.isFinite(m.quoteVolume) ? m.quoteVolume : prev?.quoteVolume,
        updatedAt: Number.isFinite(m.eventTime) ? m.eventTime : Date.now(),
        source: 'Binance',
      });
    }
    // Close an idle or day-old connection; it reopens on the next demand
    const now = Date.now();
    if (!hasDemand(now) || now - state.wsOpenedAt > WS_MAX_AGE_MS) ws.close();
  };
  ws.onerror = () => {
    state.wsFailures++;
  };
  ws.onclose = () => {
    state.ws = null;
    if (state.wsState !== 'unsupported') state.wsState = state.wsFailures > 0 ? 'failed' : 'off';
    if (hasDemand(Date.now())) setTimeout(connectMiniTickers, Math.min(60_000, 2_000 * 2 ** state.wsFailures));
  };
}

// ---- Public API for server.ts --------------------------------------------------------------------

/** Spot USDT quotes by pair (live from the WebSocket, else the last REST poll). */
export function spotQuotes(): Map<string, UsdQuote> {
  return state.tickers;
}

/** USDⓈ-M futures quotes by contract (prices per contract; see futuresMultiplier). */
export function futuresQuotes(): Map<string, UsdQuote> {
  return state.futuresTickers;
}

export function fundingFor(contract: string): PremiumIndex | undefined {
  return state.premium.get(contract);
}

/** Cached candles; fetched on demand (weight 2) when stale. Only closed candles go into indicators. */
export async function getBinanceKlines(symbol: string, interval: KlineInterval, limit = 500, market: 'spot' | 'futures' = 'spot'): Promise<Kline[]> {
  noteBinanceDemand();
  const key = `${market === 'futures' ? 'F:' : ''}${symbol}|${interval}`;
  const have = state.klines.get(key);
  if (have && Date.now() - have.at < KLINE_TTL[interval] && have.data.length >= Math.min(limit, 50)) return have.data;
  const rows =
    market === 'futures'
      ? await futures.get('/fapi/v1/klines', { symbol, interval, limit: Math.min(limit, 1000) }, WEIGHTS.futuresKlines)
      : await spot.get('/api/v3/klines', { symbol, interval, limit: Math.min(limit, 1000) }, WEIGHTS.klines);
  const data = parseKlines(rows, Date.now());
  state.klines.set(key, { data, at: Date.now() });
  return data;
}

/** Closed candles already in the cache (no request), e.g. for ranking. */
export function cachedClosedKlines(symbol: string, interval: KlineInterval): Kline[] {
  return closedKlines(state.klines.get(`${symbol}|${interval}`)?.data ?? []);
}

export function binanceUniverse(): UniversePair[] {
  return state.universe;
}

export function binanceStatus() {
  const now = Date.now();
  const scanned = state.universe.filter((p) => SCAN_SERIES.every((s) => state.klines.has(`${p.symbol}|${s.interval}`))).length;
  return {
    availability: spotGovernor.availability,
    message:
      spotGovernor.availability === 'region-blocked'
        ? "Binance data is not available from this server's region"
        : spotGovernor.availability === 'ip-banned'
          ? 'Binance paused this server (HTTP 418); requests resume automatically'
          : spotGovernor.availability === 'rate-limited'
            ? 'Binance rate limit reached (HTTP 429); waiting as instructed'
            : state.lastError,
    futuresMessage: state.futuresError,
    weightUsed: spotGovernor.used(now),
    weightBudget: spotGovernor.budget(),
    weightLimit: spotGovernor.limitPerMinute,
    resumeAt: spotGovernor.blockedUntil > now ? spotGovernor.blockedUntil : null,
    stream: state.wsState,
    tickersAt: state.tickersAt || null,
    universeAt: state.universeAt || null,
    pairs: state.pairs.length,
    scan: { done: scanned, total: state.universe.length },
  };
}

const derivativesCache = new Map<string, { data: DerivativesSnapshot; at: number }>();
/** Futures /futures/data/* calls left in the current 5-minute window (limit 1000 per IP; we use 20%). */
const derivBudget = { windowStart: 0, used: 0, max: 200 };

/**
 * Open interest change, all-account long/short ratio, taker ratio and basis for one perpetual
 * (cache 5 min). Binance keeps only the last 30 days of these statistics.
 */
export async function getDerivatives(contract: string): Promise<DerivativesSnapshot> {
  noteBinanceDemand();
  const now = Date.now();
  const have = derivativesCache.get(contract);
  if (have && now - have.at < 5 * 60_000) return have.data;
  if (now - derivBudget.windowStart > 5 * 60_000) {
    derivBudget.windowStart = now;
    derivBudget.used = 0;
  }
  if (derivBudget.used + 4 > derivBudget.max) {
    if (have) return have.data;
    throw new Error('Binance futures statistics budget reached; try again in a few minutes');
  }
  derivBudget.used += 4;
  const pair = contract;
  const [oi, ls, taker, basis] = await Promise.all([
    futures.get('/futures/data/openInterestHist', { symbol: contract, period: '1h', limit: 25 }, 0),
    futures.get('/futures/data/globalLongShortAccountRatio', { symbol: contract, period: '1h', limit: 1 }, 0),
    futures.get('/futures/data/takerlongshortRatio', { symbol: contract, period: '1h', limit: 1 }, 0),
    futures.get('/futures/data/basis', { pair, contractType: 'PERPETUAL', period: '1h', limit: 1 }, 0).catch(() => null),
  ]);
  const data = parseDerivatives(contract, oi, ls, taker, basis, now);
  derivativesCache.set(contract, { data, at: now });
  return data;
}

/** True when the pair exists in the current exchangeInfo (protects the candle endpoint). */
export function isKnownSpotPair(symbol: string): boolean {
  return state.pairs.some((p) => p.symbol === symbol) || state.tickers.has(symbol);
}

/** Waits briefly for the first ticker snapshot (used by the first page load). */
export async function warmBinance(timeoutMs = 4000): Promise<void> {
  noteBinanceDemand();
  const until = Date.now() + timeoutMs;
  loop().catch(() => {});
  while (Date.now() < until && !state.tickers.size && !state.lastError) await new Promise((r) => setTimeout(r, 200));
}
