/**
 * server.ts — Express server for AssetRadar. Serves the React app (Vite middleware in
 * development, dist/ in production) and the /api/market/* endpoints: price snapshot
 * (Indodax, Yahoo Finance, gold-api.com), sentiment + news (Google News, optional Gemini),
 * OHLC history for the alternative chart, 30-day correlation and the combined news feed.
 * All upstream data is cached in memory; API keys stay on the server.
 */
import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import {
  ASSETS,
  getAssetBySymbol,
  type PriceTick,
  type AssetGroup,
  type PriceCurrency,
  type SparklinePoint,
  type AssetIntelligence,
  type MarketNewsItem,
  type SentimentLabel,
  type OhlcCandle,
  type CorrelationMatrix,
} from './src/config/assets.ts';
import { correlationMatrixFromSeries, type DatedClose } from './src/utils/correlation.ts';
import { aggregateCandles } from './src/utils/candles.ts';
import { convertXauUsdToIdrPerGram } from './src/utils/format.ts';
import { isExchangeOpen, isIdxMarketOpen } from './src/utils/marketHours.ts';
import { GEO_TAG, MACRO_TAG, detectGeoAlert, mergeNewsItems, tagHeadline } from './src/utils/newsTags.ts';
import {
  computeMarketSentiment,
  parseRssItems,
} from './src/utils/sentiment.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const indodaxCache: { entry: CacheEntry<Record<string, PriceTick>> | null } = {
  entry: null,
};
const indodaxSparklineCache = new Map<string, CacheEntry<SparklinePoint[]>>();
const yahooCache = new Map<string, CacheEntry<PriceTick>>();
const goldCache: { entry: CacheEntry<PriceTick> | null } = { entry: null };
const intelligenceCache = new Map<string, CacheEntry<AssetIntelligence>>();
const historyCache = new Map<string, CacheEntry<OhlcCandle[]>>();
const correlationCache: { entry: CacheEntry<CorrelationMatrix> | null } = { entry: null };

// ---------------------------------------------------------------------------------------
// Live news hub
// Polls publisher RSS feeds every 60 s and Google News every 2 min (only while someone is
// watching), tags each headline with the assets it mentions, and pushes new headlines to
// browsers over Server-Sent Events. Headlines are never translated: Indonesian sources stay
// in Indonesian, international sources stay in English.
// ---------------------------------------------------------------------------------------

type Asset = (typeof ASSETS)[number];

interface NewsSource {
  id: string;
  url: string;
  minIntervalMs: number;
  maxItems: number;
  /** Publisher name for direct feeds (keeps full titles); Google News reads it per item. */
  sourceName?: string;
  /** Asset the query is about (Google News); direct feeds are tagged by keywords only. */
  asset?: Asset;
  /** Conflict search feeds: keep only "high" alerts so ongoing-war coverage does not flood the feed. */
  highAlertsOnly?: boolean;
}

const FEED_INTERVAL_MS = 60_000;
const GOOGLE_INTERVAL_MS = 120_000;
const NEWS_IDLE_AFTER_MS = 5 * 60_000; // stop polling 5 min after the last viewer/request
const NEWS_FEED_LIMIT = 60;
const NEWS_PER_ASSET = 10;

const NEWS_SOURCES: NewsSource[] = [
  // Direct publisher feeds: published within minutes
  { id: 'coindesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', sourceName: 'CoinDesk', minIntervalMs: FEED_INTERVAL_MS, maxItems: 25 },
  { id: 'cointelegraph', url: 'https://cointelegraph.com/rss', sourceName: 'Cointelegraph', minIntervalMs: FEED_INTERVAL_MS, maxItems: 30 },
  { id: 'cnbcid', url: 'https://www.cnbcindonesia.com/market/rss', sourceName: 'CNBC Indonesia', minIntervalMs: FEED_INTERVAL_MS, maxItems: 40 },
  { id: 'antara', url: 'https://www.antaranews.com/rss/ekonomi-bursa.xml', sourceName: 'ANTARA', minIntervalMs: FEED_INTERVAL_MS, maxItems: 20 },
  { id: 'fxstreet', url: 'https://www.fxstreet.com/rss/news', sourceName: 'FXStreet', minIntervalMs: FEED_INTERVAL_MS, maxItems: 30 },
  // Global markets & macro (US, Europe, Asia; rates, currencies)
  { id: 'cnbc-econ', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258', sourceName: 'CNBC', minIntervalMs: FEED_INTERVAL_MS, maxItems: 30 },
  { id: 'cnbc-markets', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664', sourceName: 'CNBC', minIntervalMs: FEED_INTERVAL_MS, maxItems: 30 },
  { id: 'investing', url: 'https://www.investing.com/rss/news_25.rss', sourceName: 'Investing.com', minIntervalMs: FEED_INTERVAL_MS, maxItems: 20 },
  // World news for sudden war/attack alerts (only conflict headlines are kept from these)
  { id: 'bbcworld', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', sourceName: 'BBC News', minIntervalMs: FEED_INTERVAL_MS, maxItems: 30 },
  { id: 'aljazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', sourceName: 'Al Jazeera', minIntervalMs: FEED_INTERVAL_MS, maxItems: 25 },
  {
    id: 'gn-geo-en',
    highAlertsOnly: true,
    url: `https://news.google.com/rss/search?q=${encodeURIComponent('war OR invasion OR missile OR airstrike OR "declares war" when:1h')}&hl=en-US&gl=US&ceid=US:en`,
    minIntervalMs: FEED_INTERVAL_MS,
    maxItems: 40,
  },
  {
    id: 'gn-geo-id',
    highAlertsOnly: true,
    url: `https://news.google.com/rss/search?q=${encodeURIComponent('perang OR invasi OR rudal OR "serangan udara" when:1h')}&hl=id&gl=ID&ceid=ID:id`,
    minIntervalMs: FEED_INTERVAL_MS,
    maxItems: 30,
  },
  // Google News search per asset, Indonesian and English editions, last 24 hours
  ...ASSETS.flatMap((asset): NewsSource[] => [
    {
      id: `gn-id-${asset.id}`,
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(`${asset.newsQueryId} when:1d`)}&hl=id&gl=ID&ceid=ID:id`,
      asset,
      minIntervalMs: GOOGLE_INTERVAL_MS,
      maxItems: 6,
    },
    {
      id: `gn-en-${asset.id}`,
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(`${asset.newsQuery} when:1d`)}&hl=en-US&gl=US&ceid=US:en`,
      asset,
      minIntervalMs: GOOGLE_INTERVAL_MS,
      maxItems: 6,
    },
  ]),
];

const newsHub = {
  items: [] as MarketNewsItem[],
  lastFetchedAt: new Map<string, number>(),
  lastPollAt: 0,
  lastDemandAt: 0,
  polling: null as Promise<void> | null,
  initialized: false,
  clients: new Set<express.Response>(),
};

async function fetchNewsSource(source: NewsSource): Promise<MarketNewsItem[]> {
  const res = await fetchWithTimeout(source.url, {}, 6000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  return parseRssItems(xml, source.maxItems, { sourceName: source.sourceName })
    .map((item) => {
      const tags = tagHeadline(item.title);
      if (source.asset) tags.unshift(source.asset.code);
      const geoAlert = detectGeoAlert(item.title) ?? undefined;
      if (geoAlert) tags.push(GEO_TAG);
      return { ...item, id: `${source.id}-${item.id}`, assetTags: [...new Set(tags)], geoAlert };
    })
    // keep only market-relevant headlines
    .filter((item) => (source.highAlertsOnly ? item.geoAlert === 'high' : item.assetTags.length > 0));
}

/** One polling round over the sources that are due; broadcasts newly seen headlines. */
async function pollNews(force = false): Promise<void> {
  if (newsHub.polling) return newsHub.polling;
  newsHub.polling = (async () => {
    const now = Date.now();
    const due = NEWS_SOURCES.filter(
      (s) => force || now - (newsHub.lastFetchedAt.get(s.id) ?? 0) >= s.minIntervalMs
    );
    const results = await Promise.all(
      due.map(async (s) => {
        try {
          const items = await fetchNewsSource(s);
          newsHub.lastFetchedAt.set(s.id, now);
          return items;
        } catch (err) {
          console.warn(`[News] ${s.id} failed:`, err instanceof Error ? err.message : err);
          return [];
        }
      })
    );
    const { items, added } = mergeNewsItems(newsHub.items, results.flat(), Date.now(), {
      maxItems: 400,
    });
    newsHub.items = items;
    newsHub.lastPollAt = Date.now();

    // The first round is the baseline; only later rounds count as "breaking"
    if (newsHub.initialized && added.length > 0) {
      for (const tag of new Set(added.flatMap((a) => a.assetTags ?? []))) {
        const asset = ASSETS.find((a) => a.code === tag);
        if (asset) intelligenceCache.delete(asset.symbol); // sentiment reacts to the news
        if (tag === MACRO_TAG || tag === GEO_TAG) intelligenceCache.clear();
      }
      broadcastNews('news', added);
    }
    newsHub.initialized = true;
  })().finally(() => {
    newsHub.polling = null;
  });
  return newsHub.polling;
}

/** Makes sure the hub data is at most one feed interval old (used by REST endpoints). */
async function ensureNewsFresh(): Promise<void> {
  newsHub.lastDemandAt = Date.now();
  if (!newsHub.initialized) await pollNews(true);
  else if (Date.now() - newsHub.lastPollAt >= FEED_INTERVAL_MS) await pollNews();
}

function broadcastNews(event: 'news' | 'snapshot', items: MarketNewsItem[]): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify({ items, serverTime: Date.now() })}\n\n`;
  for (const client of newsHub.clients) client.write(payload);
}

function getNewsFeed(): MarketNewsItem[] {
  return newsHub.items.slice(0, NEWS_FEED_LIMIT);
}

/** Latest headlines tagged with this asset (newest first). */
async function fetchNewsForAsset(asset: Asset): Promise<MarketNewsItem[]> {
  await ensureNewsFresh();
  const code = asset.code;
  return newsHub.items.filter((i) => i.assetTags?.includes(code)).slice(0, NEWS_PER_ASSET);
}

// Background loop: keeps polling while browsers are connected or recently asked for news
setInterval(() => {
  const active =
    newsHub.clients.size > 0 || Date.now() - newsHub.lastDemandAt < NEWS_IDLE_AFTER_MS;
  if (active) pollNews().catch(() => {});
}, 15_000);

// App timeframe -> Yahoo Finance & Indodax parameters (rangeSec ≈ the Yahoo range)
const DAY_SEC = 86_400;
const HISTORY_INTERVALS: Record<
  string,
  {
    yahooInterval: string;
    range: string;
    aggregateSec?: number;
    indodaxTf: string;
    rangeSec: number;
    cacheMs: number;
  }
> = {
  '1': { yahooInterval: '1m', range: '1d', indodaxTf: '1', rangeSec: DAY_SEC, cacheMs: 60_000 },
  '5': { yahooInterval: '5m', range: '5d', indodaxTf: '5', rangeSec: 5 * DAY_SEC, cacheMs: 60_000 },
  '15': { yahooInterval: '15m', range: '5d', indodaxTf: '15', rangeSec: 5 * DAY_SEC, cacheMs: 60_000 },
  '30': { yahooInterval: '30m', range: '1mo', indodaxTf: '30', rangeSec: 30 * DAY_SEC, cacheMs: 60_000 },
  '60': { yahooInterval: '60m', range: '1mo', indodaxTf: '60', rangeSec: 30 * DAY_SEC, cacheMs: 60_000 },
  '240': {
    yahooInterval: '60m',
    range: '3mo',
    aggregateSec: 4 * 3600,
    indodaxTf: '240',
    rangeSec: 90 * DAY_SEC,
    cacheMs: 5 * 60_000,
  },
  D: { yahooInterval: '1d', range: '1y', indodaxTf: '1D', rangeSec: 365 * DAY_SEC, cacheMs: 60 * 60_000 },
  W: { yahooInterval: '1wk', range: '5y', indodaxTf: '1W', rangeSec: 5 * 365 * DAY_SEC, cacheMs: 60 * 60_000 },
};

async function fetchYahooChartRaw(yahooSymbol: string, yahooInterval: string, range: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooSymbol
  )}?interval=${yahooInterval}&range=${range}`;
  const res = await fetchWithTimeout(url, {}, 8000);
  if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status} for ${yahooSymbol}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Empty Yahoo Finance data for ${yahooSymbol}`);
  return result;
}

/** OHLC candles from Indodax (Rupiah crypto; Yahoo has no BTC-IDR etc. pairs). */
async function fetchIndodaxCandles(indodaxPair: string, interval: string): Promise<OhlcCandle[]> {
  const cfg = HISTORY_INTERVALS[interval];
  if (!cfg) throw new Error(`Unknown interval: ${interval}`);
  const nowSec = Math.floor(Date.now() / 1000);
  const url = `https://indodax.com/tradingview/history_v2?symbol=${encodeURIComponent(
    indodaxPair.toUpperCase()
  )}&tf=${cfg.indodaxTf}&from=${nowSec - cfg.rangeSec}&to=${nowSec}`;
  const res = await fetchWithTimeout(url, {}, 8000);
  if (!res.ok) throw new Error(`Indodax HTTP ${res.status} for ${indodaxPair}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error(`Empty Indodax candle data for ${indodaxPair}`);
  const candles: OhlcCandle[] = [];
  let lastT = 0;
  for (const row of rows) {
    const t = Number(row?.Time);
    const o = Number(row?.Open);
    const h = Number(row?.High);
    const l = Number(row?.Low);
    const c = Number(row?.Close);
    if (![t, o, h, l, c].every(Number.isFinite) || t <= lastT) continue;
    lastT = t;
    const v = Number(row?.Volume);
    candles.push({ time: t, open: o, high: h, low: l, close: c, volume: Number.isFinite(v) ? v : undefined });
  }
  return candles;
}

/** OHLC candles for the alternative chart: crypto from Indodax, other assets from Yahoo Finance. */
async function getHistoryCandles(
  asset: (typeof ASSETS)[number],
  interval: string
): Promise<OhlcCandle[]> {
  const cfg = HISTORY_INTERVALS[interval];
  if (!cfg) throw new Error(`Unknown interval: ${interval}`);
  const key = `${asset.symbol}|${interval}`;
  const now = Date.now();
  const cached = historyCache.get(key);
  if (cached && cached.expiresAt > now) return cached.data;

  if (asset.indodaxPair) {
    const candles = await fetchIndodaxCandles(asset.indodaxPair, interval);
    historyCache.set(key, { data: candles, expiresAt: now + cfg.cacheMs });
    return candles;
  }

  const yahooSymbol = asset.yahooSymbol;
  if (!yahooSymbol) throw new Error(`No chart source for ${asset.symbol}`);
  const result = await fetchYahooChartRaw(yahooSymbol, cfg.yahooInterval, cfg.range);
  const ts: number[] = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  let candles: OhlcCandle[] = [];
  let lastT = 0;
  for (let i = 0; i < ts.length; i++) {
    const t = Number(ts[i]);
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    const c = q.close?.[i];
    if (![t, o, h, l, c].every((v) => v !== null && v !== undefined && Number.isFinite(Number(v)))) {
      continue;
    }
    if (t <= lastT) continue;
    lastT = t;
    candles.push({
      time: t,
      open: Number(o),
      high: Number(h),
      low: Number(l),
      close: Number(c),
      volume: Number.isFinite(Number(q.volume?.[i])) ? Number(q.volume[i]) : undefined,
    });
  }
  if (cfg.aggregateSec) candles = aggregateCandles(candles, cfg.aggregateSec);
  historyCache.set(key, { data: candles, expiresAt: now + cfg.cacheMs });
  return candles;
}

const CORRELATION_SYMBOLS: Array<{ yahoo: string; label: string }> = [
  { yahoo: 'BTC-USD', label: 'BTC' },
  { yahoo: 'ETH-USD', label: 'ETH' },
  { yahoo: '^JKSE', label: 'JCI' },
  { yahoo: '^GSPC', label: 'SPX' },
  { yahoo: '^NDX', label: 'NDX' },
  { yahoo: '^N225', label: 'N225' },
  { yahoo: '^FTSE', label: 'FTSE' },
  { yahoo: 'GC=F', label: 'GOLD' },
  { yahoo: 'IDR=X', label: 'USD' },
  { yahoo: 'EURIDR=X', label: 'EUR' },
];
const CORRELATION_WINDOW = 30;

async function getCorrelationMatrix(): Promise<CorrelationMatrix> {
  const now = Date.now();
  if (correlationCache.entry && correlationCache.entry.expiresAt > now) {
    return correlationCache.entry.data;
  }
  const seriesList = await Promise.all(
    CORRELATION_SYMBOLS.map(async ({ yahoo }) => {
      try {
        const result = await fetchYahooChartRaw(yahoo, '1d', '3mo');
        const ts: number[] = result.timestamp || [];
        const closes: Array<number | null> = result.indicators?.quote?.[0]?.close || [];
        const offsetSec = Number(result.meta?.gmtoffset) || 0;
        const series: DatedClose[] = [];
        for (let i = 0; i < ts.length; i++) {
          const c = closes[i];
          if (c === null || c === undefined || !Number.isFinite(c)) continue;
          const date = new Date((Number(ts[i]) + offsetSec) * 1000).toISOString().slice(0, 10);
          series.push({ date, close: Number(c) });
        }
        return series;
      } catch (err) {
        console.warn(`[Correlation] Failed to load ${yahoo}:`, err);
        return [] as DatedClose[];
      }
    })
  );
  const matrix = correlationMatrixFromSeries(seriesList, CORRELATION_WINDOW);
  const data: CorrelationMatrix = {
    labels: CORRELATION_SYMBOLS.map((s) => s.label),
    symbols: CORRELATION_SYMBOLS.map((s) => s.yahoo),
    matrix,
    windowDays: CORRELATION_WINDOW,
    updatedAt: now,
  };
  correlationCache.entry = { data, expiresAt: now + 6 * 60 * 60_000 };
  return data;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 8000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json, text/plain, application/xml, text/xml, */*',
        ...(options.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchIndodaxSparkline(pairSymbol: string): Promise<SparklinePoint[]> {
  const key = pairSymbol.toUpperCase();
  const now = Date.now();
  const cached = indodaxSparklineCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  try {
    const nowSec = Math.floor(now / 1000);
    const fromSec = nowSec - 24 * 3600;
    const url = `https://indodax.com/tradingview/history_v2?symbol=${encodeURIComponent(
      key
    )}&tf=30&from=${fromSec}&to=${nowSec}`;
    const res = await fetchWithTimeout(url, {}, 5000);
    if (!res.ok) return cached?.data ?? [];
    const data = await res.json();
    if (!Array.isArray(data)) return cached?.data ?? [];
    const points: SparklinePoint[] = [];
    let lastTime = 0;
    for (const row of data) {
      const t = Number(row.Time);
      const close = Number(row.Close);
      if (Number.isFinite(t) && Number.isFinite(close) && t > lastTime) {
        points.push({ time: t, value: close });
        lastTime = t;
      }
    }
    const result = points.slice(-48);
    // Cache the sparkline for 5 minutes (300_000 ms) per pair
    indodaxSparklineCache.set(key, {
      data: result,
      expiresAt: now + 300_000,
    });
    return result;
  } catch {
    return cached?.data ?? [];
  }
}

async function getIndodaxPrices(): Promise<Record<string, PriceTick>> {
  const now = Date.now();
  if (indodaxCache.entry && indodaxCache.entry.expiresAt > now) {
    return indodaxCache.entry.data;
  }

  const res = await fetchWithTimeout('https://indodax.com/api/summaries', {}, 8000);
  if (!res.ok) {
    throw new Error(`Indodax HTTP ${res.status}`);
  }
  const json = await res.json();
  const tickers = json?.tickers || {};
  const prices24h = json?.prices_24h || {};

  const pairs: Array<{ symbol: string; tickerKey: string; price24hKey: string; tvHistorySymbol: string }> = [
    { symbol: 'BTC/IDR', tickerKey: 'btc_idr', price24hKey: 'btcidr', tvHistorySymbol: 'BTCIDR' },
    { symbol: 'ETH/IDR', tickerKey: 'eth_idr', price24hKey: 'ethidr', tvHistorySymbol: 'ETHIDR' },
    { symbol: 'SOL/IDR', tickerKey: 'sol_idr', price24hKey: 'solidr', tvHistorySymbol: 'SOLIDR' },
  ];

  const sparklines = await Promise.all(
    pairs.map((p) => fetchIndodaxSparkline(p.tvHistorySymbol))
  );

  const result: Record<string, PriceTick> = {};

  pairs.forEach((p, idx) => {
    const t = tickers[p.tickerKey];
    if (!t) return;
    const last = Number(t.last);
    const high = Number(t.high);
    const low = Number(t.low);
    const p24 = Number(prices24h[p.price24hKey]);
    const changePct24h =
      Number.isFinite(p24) && p24 > 0 ? ((last - p24) / p24) * 100 : undefined;

    result[p.symbol] = {
      symbol: p.symbol,
      group: 'crypto',
      price: last,
      changePct24h,
      high24h: Number.isFinite(high) ? high : undefined,
      low24h: Number.isFinite(low) ? low : undefined,
      sparkline: sparklines[idx],
      currency: 'IDR',
      source: 'Indodax',
      updatedAt: Number(t.server_time) ? Number(t.server_time) * 1000 : now,
      status: 'live',
    };
  });

  indodaxCache.entry = {
    data: result,
    expiresAt: now + 6000, // 6s server cache
  };

  return result;
}

/** Open/closed flag for an app symbol, from its exchange's regular session. */
function marketOpenFor(appSymbol: string, nowMs: number): boolean | undefined {
  const asset = getAssetBySymbol(appSymbol);
  return asset && asset.exchange !== 'CRYPTO' ? isExchangeOpen(asset.exchange, nowMs) : undefined;
}

/** Yahoo stock/index quotes are delayed (≈15 min); FX and futures are close to real time. */
function isDelayedFeed(appSymbol: string): boolean {
  const group = getAssetBySymbol(appSymbol)?.group;
  return group === 'stock' || group === 'index';
}

// Assets priced from Yahoo Finance (gold uses its own spot source; crypto uses Indodax)
const YAHOO_ASSETS = ASSETS.filter((a) => a.yahooSymbol && !a.indodaxPair && a.group !== 'gold');

/** Cache 30 s while the asset's market is open (near real time), 5 min while closed. */
function yahooCacheMs(asset: Asset, nowMs = Date.now()): number {
  return isExchangeOpen(asset.exchange, nowMs) ? 30_000 : 5 * 60_000;
}

/** Quotes for every Yahoo-priced asset; failures become "unavailable" ticks. */
async function getYahooTicks(): Promise<Record<string, PriceTick>> {
  const now = Date.now();
  const results = await Promise.allSettled(
    YAHOO_ASSETS.map((a) =>
      getYahooQuote(a.yahooSymbol as string, a.symbol, a.group, a.currency, yahooCacheMs(a, now))
    )
  );
  const ticks: Record<string, PriceTick> = {};
  results.forEach((r, i) => {
    const a = YAHOO_ASSETS[i];
    ticks[a.symbol] =
      r.status === 'fulfilled'
        ? r.value
        : {
            symbol: a.symbol,
            group: a.group,
            price: NaN,
            currency: a.currency,
            source: 'Yahoo Finance',
            updatedAt: now,
            status: 'error',
            errorMessage: `${a.name} data unavailable`,
          };
  });
  return ticks;
}

async function getYahooQuote(
  yahooSymbol: string,
  appSymbol: string,
  group: AssetGroup,
  currency: PriceCurrency,
  cacheMs: number = 60_000
): Promise<PriceTick> {
  const now = Date.now();
  const cached = yahooCache.get(appSymbol);
  if (cached && cached.expiresAt > now) {
    return {
      ...cached.data,
      isMarketOpen: marketOpenFor(appSymbol, now),
    };
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooSymbol
  )}?interval=15m&range=2d`;
  const res = await fetchWithTimeout(url, {}, 8000);
  if (!res.ok) {
    throw new Error(`Yahoo Finance HTTP ${res.status} for ${yahooSymbol}`);
  }

  const json = await res.json();
  const chartResult = json?.chart?.result?.[0];
  if (!chartResult || !chartResult.meta) {
    throw new Error(`Empty Yahoo Finance data for ${yahooSymbol}`);
  }

  const meta = chartResult.meta;
  const price = Number(meta.regularMarketPrice);
  const prevClose = Number(meta.previousClose ?? meta.chartPreviousClose ?? price);
  const changePct24h = Number.isFinite(Number(meta.regularMarketChangePercent))
    ? Number(meta.regularMarketChangePercent)
    : Number.isFinite(prevClose) && prevClose > 0
      ? ((price - prevClose) / prevClose) * 100
      : 0;

  const timestamps: number[] = chartResult.timestamp || [];
  const closes: Array<number | null> =
    chartResult.indicators?.quote?.[0]?.close || [];

  const sparkline: SparklinePoint[] = [];
  let lastT = 0;
  for (let i = 0; i < timestamps.length; i++) {
    const t = Number(timestamps[i]);
    const c = closes[i];
    if (Number.isFinite(t) && c !== null && c !== undefined && Number.isFinite(c) && t > lastT) {
      sparkline.push({ time: t, value: Number(c) });
      lastT = t;
    }
  }

  const recentSparkline = sparkline.slice(-48);
  const valuesForRange = recentSparkline.map((pt) => pt.value);
  const high24h = Number.isFinite(Number(meta.regularMarketDayHigh))
    ? Number(meta.regularMarketDayHigh)
    : valuesForRange.length > 0
      ? Math.max(...valuesForRange)
      : undefined;
  const low24h = Number.isFinite(Number(meta.regularMarketDayLow))
    ? Number(meta.regularMarketDayLow)
    : valuesForRange.length > 0
      ? Math.min(...valuesForRange)
      : undefined;

  const tick: PriceTick = {
    symbol: appSymbol,
    group,
    price,
    changePct24h,
    high24h,
    low24h,
    sparkline: recentSparkline,
    isMarketOpen: marketOpenFor(appSymbol, now),
    currency,
    source: 'Yahoo Finance',
    updatedAt: meta.regularMarketTime ? Number(meta.regularMarketTime) * 1000 : now,
    status: isDelayedFeed(appSymbol) ? 'delayed' : 'live',
  };

  yahooCache.set(appSymbol, {
    data: tick,
    expiresAt: now + cacheMs,
  });

  return tick;
}

async function getGoldTick(usdIdrRate: number): Promise<PriceTick> {
  const now = Date.now();
  if (goldCache.entry && goldCache.entry.expiresAt > now) {
    const cached = goldCache.entry.data;
    return {
      ...cached,
      priceIdrPerGram:
        usdIdrRate > 0
          ? convertXauUsdToIdrPerGram(cached.price, usdIdrRate)
          : cached.priceIdrPerGram,
    };
  }

  // Get 24h chart & fallback stats from Yahoo Finance GC=F / XAU
  let yahooGold: PriceTick | null = null;
  try {
    yahooGold = await getYahooQuote('GC=F', 'XAU/USD', 'gold', 'USD', 300_000);
  } catch {
    yahooGold = null;
  }

  let spotPriceUsd = yahooGold?.price ?? 0;
  let sourceName = 'Spot XAU (Gold API)';
  let updatedAtMs = now;

  let fetchedPrimaryGold = false;

  // 1. Optional GoldAPI.io if GOLD_API_KEY secret is set
  const goldApiKey = process.env.GOLD_API_KEY?.trim();
  if (goldApiKey) {
    try {
      const res = await fetchWithTimeout(
        'https://www.goldapi.io/api/XAU/USD',
        {
          headers: {
            'x-access-token': goldApiKey,
          },
        },
        6000
      );
      if (res.ok) {
        const data = await res.json();
        if (Number.isFinite(Number(data?.price)) && Number(data.price) > 0) {
          spotPriceUsd = Number(data.price);
          sourceName = 'GoldAPI.io (XAU/USD)';
          updatedAtMs = data.timestamp ? Number(data.timestamp) * 1000 : now;
          fetchedPrimaryGold = true;
        }
      }
    } catch {
      // Fallback to public Gold API
    }
  }

  // 2. Public free Gold Spot API (api.gold-api.com/price/XAU)
  if (!fetchedPrimaryGold) {
    try {
      const res = await fetchWithTimeout('https://api.gold-api.com/price/XAU', {}, 6000);
      if (res.ok) {
        const data = await res.json();
        if (Number.isFinite(Number(data?.price)) && Number(data.price) > 0) {
          spotPriceUsd = Number(data.price);
          sourceName = 'Gold-API Spot (XAU/USD)';
          if (data.updatedAt) {
            const parsed = Date.parse(data.updatedAt);
            if (!Number.isNaN(parsed)) updatedAtMs = parsed;
          }
        }
      }
    } catch {
      // Use Yahoo Gold fallback if public Gold API is unreachable
    }
  }

  if (!spotPriceUsd || spotPriceUsd <= 0) {
    throw new Error('Spot gold XAU/USD price is currently unavailable');
  }

  const priceIdrPerGram =
    usdIdrRate > 0 ? convertXauUsdToIdrPerGram(spotPriceUsd, usdIdrRate) : undefined;

  const goldTick: PriceTick = {
    symbol: 'XAU/USD',
    group: 'gold',
    price: spotPriceUsd,
    priceIdrPerGram,
    changePct24h: yahooGold?.changePct24h,
    high24h: yahooGold?.high24h,
    low24h: yahooGold?.low24h,
    sparkline: yahooGold?.sparkline,
    currency: 'USD',
    source: sourceName,
    updatedAt: updatedAtMs,
    status: 'live',
  };

  // Cache 5 minutes (300_000 ms) per spec 3.3
  goldCache.entry = {
    data: goldTick,
    expiresAt: now + 300_000,
  };

  return goldTick;
}

async function getAssetIntelligence(
  symbol: string,
  tick?: PriceTick
): Promise<AssetIntelligence> {
  const now = Date.now();
  const cached = intelligenceCache.get(symbol);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const asset = getAssetBySymbol(symbol) ?? ASSETS[0];

  // Real news from Google News (10-minute cache)
  const newsItems: MarketNewsItem[] = (await fetchNewsForAsset(asset)).slice(0, 6);

  const baseSentiment = computeMarketSentiment({
    assetName: asset.name,
    symbol: asset.symbol,
    changePct24h: tick?.changePct24h,
    price: tick?.price,
    high24h: tick?.high24h,
    low24h: tick?.low24h,
    news: newsItems,
  });

  const initialIntelligence: AssetIntelligence = {
    symbol: asset.symbol,
    sentimentScore: baseSentiment.score,
    sentimentLabel: baseSentiment.label,
    summary: baseSentiment.summary,
    keyFactors: baseSentiment.keyFactors,
    news: newsItems,
    updatedAt: now,
    aiPowered: false,
  };

  // Cache immediately so subsequent requests are instant
  intelligenceCache.set(symbol, {
    data: initialIntelligence,
    expiresAt: now + 300_000,
  });

  // Optional Gemini enrichment if GEMINI_API_KEY is configured on server
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
    const enrichPromise = (async (): Promise<AssetIntelligence | null> => {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const headlinesList =
          newsItems.length > 0
            ? newsItems.map((n, i) => `${i + 1}. ${n.title} (${n.source})`).join('\n')
            : 'No specific news today.';

        const prompt = `Analyze the current market sentiment, in English, for the asset ${asset.name} (${asset.symbol}).
Current price: ${tick?.price ?? 'N/A'} (${asset.currency}), 24-hour change: ${
          tick?.changePct24h !== undefined ? tick.changePct24h.toFixed(2) + '%' : 'N/A'
        }.
Latest news:
${headlinesList}

Return a sentiment score (0-100), a label ("Bullish", "Neutral", or "Bearish"), an objective and educational 2-sentence summary (not buy/sell advice), and the 3 main market drivers.`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                sentimentScore: { type: Type.INTEGER },
                sentimentLabel: { type: Type.STRING },
                summary: { type: Type.STRING },
                keyFactors: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['sentimentScore', 'sentimentLabel', 'summary', 'keyFactors'],
            },
          },
        });

        const rawText = response.text?.trim();
        if (rawText) {
          const parsed = JSON.parse(rawText);
          const enriched: AssetIntelligence = {
            ...initialIntelligence,
            sentimentScore:
              typeof parsed.sentimentScore === 'number'
                ? Math.max(5, Math.min(98, parsed.sentimentScore))
                : initialIntelligence.sentimentScore,
            sentimentLabel:
              parsed.sentimentLabel === 'Bullish' ||
              parsed.sentimentLabel === 'Neutral' ||
              parsed.sentimentLabel === 'Bearish'
                ? (parsed.sentimentLabel as SentimentLabel)
                : initialIntelligence.sentimentLabel,
            summary:
              typeof parsed.summary === 'string' && parsed.summary.length > 15
                ? parsed.summary
                : initialIntelligence.summary,
            keyFactors:
              Array.isArray(parsed.keyFactors) && parsed.keyFactors.length > 0
                ? parsed.keyFactors.slice(0, 4)
                : initialIntelligence.keyFactors,
            aiPowered: true,
          };
          intelligenceCache.set(symbol, {
            data: enriched,
            expiresAt: Date.now() + 300_000,
          });
          return enriched;
        }
      } catch (err) {
        console.warn(`[Gemini sentiment error for ${asset.symbol}]:`, err);
      }
      return null;
    })();

    const raced = await Promise.race([
      enrichPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1800)),
    ]);

    if (raced) {
      return raced;
    }
  }

  return initialIntelligence;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // 1. All market snapshot endpoint (Indodax + Yahoo JCI & USD/IDR + Gold XAU/USD)
  app.get('/api/market/snapshot', async (_req, res) => {
    const ticks: Record<string, PriceTick> = {};
    const now = Date.now();

    const [indodaxResult, yahooTicks] = await Promise.all([
      Promise.allSettled([getIndodaxPrices()]).then(([r]) => r),
      getYahooTicks(),
    ]);
    Object.assign(ticks, yahooTicks);

    if (indodaxResult.status === 'fulfilled') {
      Object.assign(ticks, indodaxResult.value);
    } else {
      for (const sym of ['BTC/IDR', 'ETH/IDR', 'SOL/IDR']) {
        ticks[sym] = {
          symbol: sym,
          group: 'crypto',
          price: NaN,
          currency: 'IDR',
          source: 'Indodax',
          updatedAt: now,
          status: 'error',
          errorMessage: 'Indodax data unavailable',
        };
      }
    }

    const usdIdrPrice = ticks['USD/IDR']?.price;
    const usdIdrRate = Number.isFinite(usdIdrPrice) ? usdIdrPrice : 0;

    try {
      const goldTick = await getGoldTick(usdIdrRate);
      ticks['XAU/USD'] = goldTick;
    } catch {
      ticks['XAU/USD'] = {
        symbol: 'XAU/USD',
        group: 'gold',
        price: NaN,
        currency: 'USD',
        source: 'Spot XAU',
        updatedAt: now,
        status: 'error',
        errorMessage: 'Gold data unavailable',
      };
    }

    res.json({
      ticks,
      serverTime: now,
      idxMarketOpen: isIdxMarketOpen(now),
    });
  });

  // 2. Indodax-only endpoint (for 10s REST fallback polling)
  app.get('/api/market/indodax', async (_req, res) => {
    try {
      const ticks = await getIndodaxPrices();
      res.json({ ticks, serverTime: Date.now() });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to fetch Indodax data',
      });
    }
  });

  // 3. Yahoo Finance endpoint: JCI, global indices and currencies (client polls every 30 s)
  app.get('/api/market/yahoo', async (_req, res) => {
    const now = Date.now();
    const all = await getYahooTicks();
    // Failed quotes are left out so the client keeps its last good price
    const ticks = Object.fromEntries(Object.entries(all).filter(([, t]) => t.status !== 'error'));
    res.json({ ticks, serverTime: now, idxMarketOpen: isIdxMarketOpen(now) });
  });

  // 4. Gold endpoint (cached 5 mins)
  app.get('/api/market/gold', async (_req, res) => {
    try {
      let usdIdrRate = yahooCache.get('USD/IDR')?.data?.price ?? 0;
      if (!usdIdrRate) {
        try {
          const usdTick = await getYahooQuote('IDR=X', 'USD/IDR', 'forex', 'IDR', 60_000);
          usdIdrRate = usdTick.price;
        } catch {
          usdIdrRate = 0;
        }
      }
      const tick = await getGoldTick(usdIdrRate);
      res.json({ tick, serverTime: Date.now() });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to fetch the gold price',
      });
    }
  });

  // 5. Sentiment Analysis & Related Market News endpoint
  app.get('/api/market/intelligence', async (req, res) => {
    const symbol = String(req.query.symbol || 'BTC/IDR');
    try {
      // Find latest tick from cache if available
      let currentTick: PriceTick | undefined;
      if (indodaxCache.entry?.data?.[symbol]) {
        currentTick = indodaxCache.entry.data[symbol];
      } else if (symbol === 'XAU/USD' && goldCache.entry) {
        currentTick = goldCache.entry.data;
      } else if (yahooCache.get(symbol)) {
        currentTick = yahooCache.get(symbol)?.data;
      }

      const intelligence = await getAssetIntelligence(symbol, currentTick);
      res.json(intelligence);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to load sentiment analysis and news',
      });
    }
  });

  // 6. OHLC candles for the alternative chart (Indodax / Yahoo Finance)
  app.get('/api/market/history', async (req, res) => {
    const symbol = String(req.query.symbol || '');
    const interval = String(req.query.interval || '15');
    const asset = getAssetBySymbol(symbol);
    if (!asset || (!asset.yahooSymbol && !asset.indodaxPair)) {
      res.status(400).json({ error: 'Unsupported symbol' });
      return;
    }
    if (!HISTORY_INTERVALS[interval]) {
      res.status(400).json({ error: 'Unsupported interval' });
      return;
    }
    try {
      const candles = await getHistoryCandles(asset, interval);
      res.json({
        symbol: asset.symbol,
        source: asset.indodaxPair ? 'Indodax' : 'Yahoo Finance',
        interval,
        candles,
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to load chart data',
      });
    }
  });

  // 7. 30-day correlation matrix (6-hour cache)
  app.get('/api/market/correlation', async (_req, res) => {
    try {
      res.json(await getCorrelationMatrix());
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to compute correlation',
      });
    }
  });

  // 8. Combined news feed for all assets (10-minute cache)
  app.get('/api/market/news-feed', async (_req, res) => {
    try {
      await ensureNewsFresh();
      res.json({ items: getNewsFeed(), updatedAt: newsHub.lastPollAt || Date.now() });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to load the news feed',
      });
    }
  });

  // 9. Live news stream (Server-Sent Events): a snapshot first, then every new headline
  app.get('/api/market/news-stream', async (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // ask proxies not to buffer the stream
    });
    res.flushHeaders();
    res.write('retry: 5000\n\n');
    newsHub.clients.add(res);
    newsHub.lastDemandAt = Date.now();

    // Heartbeat so the browser can tell a live stream from a stalled proxy
    const heartbeat = setInterval(() => {
      res.write(`event: ping\ndata: ${JSON.stringify({ serverTime: Date.now() })}\n\n`);
    }, 20_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      newsHub.clients.delete(res);
    });

    try {
      await ensureNewsFresh();
    } catch {
      // Snapshot below still sends whatever the hub has
    }
    res.write(
      `event: snapshot\ndata: ${JSON.stringify({ items: getNewsFeed(), serverTime: Date.now() })}\n\n`
    );
  });

  // Vite middleware in development, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AssetRadar server listening on http://localhost:${PORT}`);
  });
}

startServer();
