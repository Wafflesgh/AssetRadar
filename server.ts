/**
 * server.ts — Express server for AssetRadar. Serves the React app (Vite middleware in
 * development, dist/ in production) and the /api/market/* endpoints: price snapshot
 * (Indodax, Yahoo Finance, gold-api.com), sentiment + news (Google News, optional Gemini),
 * OHLC history for the alternative chart, 30-day correlation, the combined news feed, a
 * server-push price stream (SSE, optional Finnhub real-time trades), financial statements,
 * the IDX calendar, Indonesia macro data and the AI Advisor.
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
  ALL_ASSETS,
  IDX_LIST_UPDATED,
  getAssetBySymbol,
  type PriceTick,
  type AssetGroup,
  type PriceCurrency,
  type ExchangeId,
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
import { EXCHANGE_HOURS, isExchangeOpen, isIdxMarketOpen } from './src/utils/marketHours.ts';
import {
  GEO_TAG,
  MACRO_TAG,
  detectGeoAlert,
  mergeNewsItems,
  selectGeoAlert,
  tagHeadline,
} from './src/utils/newsTags.ts';
import { alignByDate, type DailyBar } from './src/ai/indicators.ts';
import { eventStudy, fedStanceSeries, nextMeeting, resolveMeetings } from './src/ai/events.ts';
import {
  RISK_PROFILES,
  buildAssetOutlook,
  compareIdMacro,
  rankOutlooks,
  type AssetOutlook,
  type RiskProfile,
} from './src/ai/outlook.ts';
import { parseLang, translate, type AppLang, type TranslationKey } from './src/i18n/core.ts';
import { APP_TO_BINANCE_INTERVAL, closedKlines, futuresMultiplierOf, windowChanges, type KlineInterval } from './src/crypto/binance.ts';
import { convertedTick, pickUsdQuote, type UsdQuote } from './src/crypto/cryptoPricing.ts';
import {
  binanceStatus,
  binanceUniverse,
  cachedClosedKlines,
  fundingFor,
  futuresQuotes,
  getBinanceKlines,
  getDerivatives,
  isKnownSpotPair,
  noteBinanceDemand,
  spotQuotes,
  warmBinance,
} from './server/binanceFeed.ts';
import {
  computeMarketSentiment,
  parseRssItems,
} from './src/utils/sentiment.ts';
import { analyzeTechnicals } from './src/ai/technical.ts';
import {
  analyzeFundamentals,
  parseYahooFundamentals,
  piotroski,
  YAHOO_FUNDAMENTAL_TYPES,
  type AnnualFigures,
} from './src/ai/fundamentals.ts';
import { analyzeNewsDrivers } from './src/ai/newsDrivers.ts';
import {
  addDerivedLines,
  buildSemesters,
  buildStatementRows,
  fillMissingPeriods,
  fillQuartersFromAnnual,
  fiscalYearEndMonth,
  fiscalYears,
  mergePeriods,
  parseSecFacts,
  parseYahooStatements,
  yahooStatementTypeList,
  type PeriodValues,
  type StatementPeriod,
} from './src/utils/statements.ts';
import { secCikFor } from './src/config/secCik.ts';
import {
  applyTrade,
  Backoff,
  diffTicks,
  isThrottleStatus,
  refreshIntervalMs,
  STREAM_BASE_MS,
  tradesToFlush,
} from './src/utils/priceStream.ts';
import { buildAnalysis, type AssetAnalysis } from './src/ai/analysis.ts';
import {
  mergeSeries,
  parseBiTable,
  parseFredCsv,
  parseWorldBank,
  periodChange,
  shiftToRelease,
  type MacroPoint,
  type MacroSeries,
} from './src/utils/macro.ts';
import {
  addDays,
  eventsBetween,
  mergeEvents,
  parseCalendarEvents,
  parseChartEvents,
  type CalendarEvent,
} from './src/utils/corporateCalendar.ts';
import {
  addMonths,
  buildFactorSeries,
  despike,
  monthKey,
  type FScoreTimeline,
  type MonthlySeries,
  type QuantFactorsPayload,
  type QuantUniverse,
} from './src/ai/factorPortfolio.ts';

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
  // Only assets with their own search phrases (others are tagged from the feeds above;
  // building a query from a missing phrase searched for "undefined" and tagged random news)
  ...ASSETS.filter((a) => a.newsQuery && a.newsQueryId).flatMap((asset): NewsSource[] => [
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
      const geoAlert = detectGeoAlert(item.title, item.source) ?? undefined;
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
        if (asset) {
          for (const l of ['en', 'id']) intelligenceCache.delete(`${asset.symbol}|${l}`); // sentiment reacts to the news
          analysisCache.delete(asset.symbol);
        }
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
  await ensureAssetNews(asset).catch(() => {});
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
  if (asset.group === 'crypto') {
    const candles = await binanceCandlesIdr(asset, APP_TO_BINANCE_INTERVAL[interval] ?? '1d');
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

  // Every crypto asset in the config (Indodax summaries cover all pairs in one request)
  const pairs = ASSETS.filter((a) => a.indodaxPair).map((a) => {
    const pair = a.indodaxPair as string;
    return {
      symbol: a.symbol,
      tickerKey: pair.replace(/idr$/, '_idr'),
      price24hKey: pair,
      tvHistorySymbol: pair.toUpperCase(),
    };
  });

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
  return group === 'idStock' || group === 'usStock' || group === 'globalStock' || group === 'index';
}

// Assets priced from Yahoo Finance (spot gold has its own source; crypto uses Indodax)
const YAHOO_ASSETS = ASSETS.filter((a) => a.yahooSymbol && !a.indodaxPair && a.symbol !== 'XAU/USD');
// Exchange rates needed only to convert market caps to USD (not shown as assets)
const FX_HELPERS = ['KRW=X', 'HKD=X'];

/**
 * Quote cache lifetime: while price-stream clients are connected, ±5 s for priority assets of an
 * open market and 15 s for the rest (slower while Yahoo rate-limits); 15 s without stream
 * clients; 5 min while the market is closed.
 */
function yahooCacheMs(asset: Asset, nowMs = Date.now()): number {
  return refreshIntervalMs({
    open: isExchangeOpen(asset.exchange, nowMs),
    priority: priceStream.priority.has(asset.symbol),
    streaming: priceStream.clients.size > 0,
    backoffFactor: yahooBackoff.factor,
  });
}

interface SparkSeries {
  meta: Record<string, unknown>;
  timestamps: number[];
  closes: Array<number | null>;
}

/** Yahoo "spark" endpoint: up to 20 symbols per request (one request instead of 20). */
async function fetchYahooSpark(symbols: string[], range: string, interval: string): Promise<Map<string, SparkSeries>> {
  const out = new Map<string, SparkSeries>();
  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += 20) batches.push(symbols.slice(i, i + 20));
  await Promise.all(
    batches.map(async (batch) => {
      const url = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${batch
        .map(encodeURIComponent)
        .join(',')}&range=${range}&interval=${interval}`;
      try {
        const res = await fetchWithTimeout(url, {}, 8000);
        if (!res.ok) {
          noteYahooResult(false, res.status);
          throw new Error(`HTTP ${res.status}`);
        }
        noteYahooResult(true);
        const json = await res.json();
        for (const r of json?.spark?.result ?? []) {
          const resp = r?.response?.[0];
          if (!resp?.meta) continue;
          out.set(r.symbol, {
            meta: resp.meta,
            timestamps: resp.timestamp ?? [],
            closes: resp.indicators?.quote?.[0]?.close ?? [],
          });
        }
      } catch (err) {
        if (!(err instanceof Error && err.message.startsWith('HTTP'))) noteYahooResult(false);
        console.warn(`[Yahoo] spark batch failed (${batch.length} symbols):`, err instanceof Error ? err.message : err);
      }
    })
  );
  return out;
}

/** Today's volume and the approximate value traded (price × volume) from Yahoo metadata. */
function volumeFields(meta: Record<string, number | undefined>, price: number): Pick<PriceTick, 'volume' | 'valueTraded'> {
  const volume = Number(meta.regularMarketVolume);
  return Number.isFinite(volume) && volume > 0 ? { volume, valueTraded: volume * price } : {};
}

/** Builds a price tick from a Yahoo chart/spark response. */
function tickFromYahoo(asset: Asset, s: SparkSeries, now: number): PriceTick | null {
  const meta = s.meta as Record<string, number | undefined>;
  const price = Number(meta.regularMarketPrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  const prevClose = Number(meta.previousClose ?? meta.chartPreviousClose ?? price);
  const changePct24h = Number.isFinite(Number(meta.regularMarketChangePercent))
    ? Number(meta.regularMarketChangePercent)
    : prevClose > 0
      ? ((price - prevClose) / prevClose) * 100
      : 0;
  const sparkline: SparklinePoint[] = [];
  let lastT = 0;
  s.timestamps.forEach((t, i) => {
    const c = s.closes[i];
    if (Number.isFinite(t) && c !== null && c !== undefined && Number.isFinite(c) && t > lastT) {
      sparkline.push({ time: t, value: Number(c) });
      lastT = t;
    }
  });
  const recent = sparkline.slice(-48);
  const values = recent.map((p) => p.value);
  return {
    symbol: asset.symbol,
    group: asset.group,
    price,
    changePct24h,
    changePct1h: hourChange(recent, price, now),
    high24h: Number.isFinite(Number(meta.regularMarketDayHigh)) ? Number(meta.regularMarketDayHigh) : values.length ? Math.max(...values) : undefined,
    low24h: Number.isFinite(Number(meta.regularMarketDayLow)) ? Number(meta.regularMarketDayLow) : values.length ? Math.min(...values) : undefined,
    sparkline: recent,
    isMarketOpen: marketOpenFor(asset.symbol, now),
    currency: asset.currency,
    source: 'Yahoo Finance',
    updatedAt: meta.regularMarketTime ? Number(meta.regularMarketTime) * 1000 : now,
    status: isDelayedFeed(asset.symbol) ? 'delayed' : 'live',
    ...volumeFields(meta, price),
  };
}

const fxHelperCache = new Map<string, number>();
const SAR_PER_USD = 3.75;
const weeklyCache: { entry: CacheEntry<Map<string, { d7?: number; d30?: number }>> | null } = { entry: null };

/** 7-day and 30-day % changes from daily closes (cached 30 min; one batched request per 20 symbols). */
async function getWeeklyChanges(): Promise<Map<string, { d7?: number; d30?: number }>> {
  if (weeklyCache.entry && weeklyCache.entry.expiresAt > Date.now()) return weeklyCache.entry.data;
  // Spot gold is priced from gold-api.com, so its weekly change comes from the GC=F futures
  const targets = [
    ...YAHOO_ASSETS.map((a) => ({ yahoo: a.yahooSymbol as string, symbol: a.symbol })),
    { yahoo: 'GC=F', symbol: 'XAU/USD' },
  ];
  const series = await fetchYahooSpark(targets.map((t) => t.yahoo), '1mo', '1d');
  const out = new Map<string, { d7?: number; d30?: number }>();
  const nowSec = Date.now() / 1000;
  for (const a of targets) {
    const s = series.get(a.yahoo);
    if (!s) continue;
    const pts = s.timestamps
      .map((t, i) => ({ t, c: s.closes[i] }))
      .filter((p): p is { t: number; c: number } => p.c !== null && Number.isFinite(p.c) && p.c > 0);
    if (pts.length < 2) continue;
    const last = Number((s.meta as { regularMarketPrice?: number }).regularMarketPrice) || pts[pts.length - 1].c;
    const weekAgo = pts.filter((p) => p.t <= nowSec - 7 * 86400).pop();
    out.set(a.symbol, {
      d7: weekAgo ? (last / weekAgo.c - 1) * 100 : undefined,
      d30: (last / pts[0].c - 1) * 100,
    });
  }
  if (out.size > 0) weeklyCache.entry = { data: out, expiresAt: Date.now() + 30 * 60_000 };
  return out;
}

/** Quotes for every Yahoo-priced asset in a few batched requests; failures keep the last price. */
async function getYahooTicks(): Promise<Record<string, PriceTick>> {
  const now = Date.now();
  const stale = YAHOO_ASSETS.filter((a) => {
    if (a.symbol === 'SAR/IDR') return false; // derived from USD/IDR below
    const c = yahooCache.get(a.symbol);
    return !c || c.expiresAt <= now + 1500;
  });
  if (stale.length > 0) {
    const series = await fetchYahooSpark(
      [...stale.map((a) => a.yahooSymbol as string), ...FX_HELPERS],
      '2d',
      '15m'
    );
    for (const a of stale) {
      const s = series.get(a.yahooSymbol as string);
      const tick = s ? tickFromYahoo(a, s, now) : null;
      if (tick) yahooCache.set(a.symbol, { data: tick, expiresAt: now + yahooCacheMs(a, now) });
    }
    for (const fx of FX_HELPERS) {
      const p = Number((series.get(fx)?.meta as { regularMarketPrice?: number } | undefined)?.regularMarketPrice);
      if (Number.isFinite(p) && p > 0) fxHelperCache.set(fx, p);
    }
  }
  const weekly = await getWeeklyChanges().catch(() => new Map<string, { d7?: number; d30?: number }>());
  const ticks: Record<string, PriceTick> = {};
  // Saudi Riyal has been pegged at 3.75 per US Dollar since 1986; Yahoo has no SARIDR=X quote
  const usd = yahooCache.get('USD/IDR')?.data;
  const sar = YAHOO_ASSETS.find((a) => a.symbol === 'SAR/IDR');
  if (usd && sar) {
    yahooCache.set('SAR/IDR', {
      data: {
        ...usd,
        symbol: 'SAR/IDR',
        price: usd.price / SAR_PER_USD,
        high24h: usd.high24h !== undefined ? usd.high24h / SAR_PER_USD : undefined,
        low24h: usd.low24h !== undefined ? usd.low24h / SAR_PER_USD : undefined,
        sparkline: usd.sparkline?.map((p) => ({ time: p.time, value: p.value / SAR_PER_USD })),
        source: 'USD/IDR ÷ 3.75 (SAR peg)',
      },
      expiresAt: now + 15_000,
    });
    const w = weekly.get('USD/IDR');
    if (w) weekly.set('SAR/IDR', w);
  }
  for (const a of YAHOO_ASSETS) {
    const yahooTick = yahooCache.get(a.symbol)?.data;
    const live = finnhub.overlay.get(a.symbol);
    const cached = live && yahooTick && live.updatedAt > yahooTick.updatedAt && isExchangeOpen(a.exchange, now) ? live : yahooTick;
    const w = weekly.get(a.symbol);
    ticks[a.symbol] = cached
      ? { ...cached, isMarketOpen: marketOpenFor(a.symbol, now), changePct7d: w?.d7, changePct30d: w?.d30 }
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
  }
  return ticks;
}

// ---- Price stream (Server-Sent Events) -----------------------------------------------------
// One price loop for every viewer: Yahoo quotes of open markets refresh every ±5 s for priority
// assets (Quick Chart, and what viewers have on screen, in the watchlist or portfolio) and 3×
// slower for the rest; closed markets every 5 min. Only changed quotes are pushed. Yahoo errors
// (429/5xx) slow the loop down automatically (see Backoff in src/utils/priceStream.ts).

interface StreamClient {
  id: string;
  res: express.Response;
  /** Last quote sent to this client per symbol (for the diff). */
  sent: Record<string, PriceTick>;
}

const priceStream = {
  clients: new Set<StreamClient>(),
  /** Client id → symbols it has on screen (watchlist, portfolio, detail page, IDX rows). */
  focus: new Map<string, { symbols: string[]; at: number }>(),
  priority: new Set<string>(ASSETS.filter((a) => a.quick).map((a) => a.symbol)),
  running: false,
  lastDemandAt: 0,
};

const yahooBackoff = new Backoff();
const FOCUS_TTL_MS = 10 * 60_000;

function recomputePriority(): void {
  const now = Date.now();
  const next = new Set<string>(ASSETS.filter((a) => a.quick).map((a) => a.symbol));
  for (const [id, f] of priceStream.focus) {
    if (now - f.at > FOCUS_TTL_MS) {
      priceStream.focus.delete(id);
      continue;
    }
    for (const s of f.symbols) next.add(s);
  }
  priceStream.priority = next;
}

function noteYahooResult(ok: boolean, status?: number): void {
  if (ok) {
    if (yahooBackoff.success()) console.log(`[Yahoo] recovering: refresh interval ×${yahooBackoff.factor}`);
  } else if (status === undefined || isThrottleStatus(status)) {
    if (yahooBackoff.failure()) console.warn(`[Yahoo] ${status ?? 'network error'}: slowing down, refresh interval ×${yahooBackoff.factor}`);
  }
}

/** Universe stocks (outside the core loop) that some connected client has on screen. */
function focusUniverseAssets(clientId?: string): Asset[] {
  const out = new Map<string, Asset>();
  for (const [id, f] of priceStream.focus) {
    if (clientId && id !== clientId) continue;
    for (const s of f.symbols) {
      const a = getAssetBySymbol(s);
      if (a?.universe && a.yahooSymbol) out.set(a.symbol, a);
    }
  }
  return [...out.values()].slice(0, 240);
}

/** Every quote the stream serves: Yahoo assets, spot gold and focused universe stocks. */
async function buildStreamTicks(): Promise<Record<string, PriceTick>> {
  const ticks: Record<string, PriceTick> = { ...(await getYahooTicks()) };
  const universe = focusUniverseAssets();
  if (universe.length) Object.assign(ticks, await getQuotesFor(universe).catch(() => ({})));
  const usd = ticks['USD/IDR']?.price;
  try {
    ticks['XAU/USD'] = await getGoldTick(Number.isFinite(usd) ? (usd as number) : 0);
  } catch {
    // Gold keeps its last pushed price on the client
  }
  Object.assign(ticks, await getNonIndodaxCryptoTicks(usd ?? 0).catch(() => ({})));
  await addMarketCaps(ticks).catch(() => {});
  return ticks;
}

function ticksForClient(all: Record<string, PriceTick>, client: StreamClient): Record<string, PriceTick> {
  const own = new Set(focusUniverseAssets(client.id).map((a) => a.symbol));
  const out: Record<string, PriceTick> = {};
  for (const [sym, t] of Object.entries(all)) {
    if (getAssetBySymbol(sym)?.universe && !own.has(sym)) continue;
    out[sym] = t;
  }
  return out;
}

function pushPrices(all: Record<string, PriceTick>, event: 'prices' | 'snapshot' = 'prices', only?: StreamClient): void {
  const now = Date.now();
  for (const client of only ? [only] : priceStream.clients) {
    const mine = ticksForClient(all, client);
    const changed = event === 'snapshot' ? mine : diffTicks(client.sent, mine);
    const keys = Object.keys(changed);
    if (event === 'prices' && keys.length === 0) continue;
    for (const k of keys) client.sent[k] = changed[k];
    client.res.write(`event: ${event}\ndata: ${JSON.stringify({ ticks: changed, serverTime: now, idxMarketOpen: isIdxMarketOpen(now), feeds: streamFeeds() })}\n\n`);
  }
}

function streamFeeds() {
  return { yahooIntervalSec: (STREAM_BASE_MS * yahooBackoff.factor) / 1000, finnhub: finnhub.state };
}

async function streamTick(): Promise<void> {
  if (priceStream.running || priceStream.clients.size === 0) return;
  priceStream.running = true;
  try {
    recomputePriority();
    pushPrices(await buildStreamTicks());
  } catch (err) {
    console.warn('[Stream] tick failed:', err instanceof Error ? err.message : err);
  } finally {
    priceStream.running = false;
  }
}

setInterval(() => {
  streamTick().catch(() => {});
}, 1000);

// ---- Finnhub real-time trades (optional, only with FINNHUB_API_KEY) -----------------------------
// Free plan: personal use, one WebSocket per key, up to 50 symbols. Used for the US stocks only
// (crypto and Rupiah pairs have no matching Finnhub feed). The key never leaves the server.

const FINNHUB_MAX_SYMBOLS = 50;
const finnhub = {
  state: (process.env.FINNHUB_API_KEY ? 'idle' : 'off') as 'off' | 'idle' | 'connecting' | 'live',
  ws: null as WebSocket | null,
  attempts: 0,
  retryTimer: null as ReturnType<typeof setTimeout> | null,
  /** Finnhub symbol → app symbol. */
  symbols: new Map<string, string>(
    ASSETS.filter((a) => a.group === 'usStock' && a.yahooSymbol)
      .slice(0, FINNHUB_MAX_SYMBOLS)
      .map((a) => [(a.yahooSymbol as string).replace('-', '.'), a.symbol] as [string, string])
  ),
  latest: new Map<string, { price: number; time: number }>(),
  lastSent: new Map<string, number>(),
  overlay: new Map<string, PriceTick>(),
};

function connectFinnhub(): void {
  const key = process.env.FINNHUB_API_KEY;
  if (!key || finnhub.ws || typeof WebSocket === 'undefined') return;
  finnhub.state = 'connecting';
  let ws: WebSocket;
  try {
    ws = new WebSocket(`wss://ws.finnhub.io?token=${encodeURIComponent(key)}`);
  } catch {
    scheduleFinnhubRetry();
    return;
  }
  finnhub.ws = ws;
  ws.onopen = () => {
    finnhub.state = 'live';
    finnhub.attempts = 0;
    console.log(`[Finnhub] connected, ${finnhub.symbols.size} US stocks subscribed`);
    for (const sym of finnhub.symbols.keys()) ws.send(JSON.stringify({ type: 'subscribe', symbol: sym }));
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(String(ev.data));
      if (msg?.type !== 'trade' || !Array.isArray(msg.data)) return;
      for (const t of msg.data) {
        const app = finnhub.symbols.get(t?.s);
        const price = Number(t?.p);
        const time = Number(t?.t);
        if (!app || !Number.isFinite(price) || price <= 0 || !Number.isFinite(time)) continue;
        const prev = finnhub.latest.get(app);
        if (!prev || time >= prev.time) finnhub.latest.set(app, { price, time });
      }
    } catch {
      // Ignore malformed frames
    }
  };
  ws.onerror = () => {
    // The event can carry the connection URL (with the key), so it is not logged
    console.warn('[Finnhub] connection error');
  };
  ws.onclose = () => {
    finnhub.ws = null;
    if (finnhub.state !== 'off') finnhub.state = 'idle';
    scheduleFinnhubRetry();
  };
}

function scheduleFinnhubRetry(): void {
  if (finnhub.retryTimer || priceStream.clients.size === 0) return;
  const delay = Math.min(5 * 60_000, 5000 * 2 ** finnhub.attempts);
  finnhub.attempts += 1;
  finnhub.retryTimer = setTimeout(() => {
    finnhub.retryTimer = null;
    if (priceStream.clients.size > 0) connectFinnhub();
  }, delay);
}

function disconnectFinnhub(): void {
  if (finnhub.retryTimer) clearTimeout(finnhub.retryTimer);
  finnhub.retryTimer = null;
  const ws = finnhub.ws;
  finnhub.ws = null;
  if (ws) {
    ws.onclose = null;
    try {
      ws.close();
    } catch {
      // ignore
    }
  }
  if (finnhub.state !== 'off') finnhub.state = 'idle';
}

/** Applies the newest Finnhub trades (≤1 per symbol per second) to the cached Yahoo quotes. */
function flushFinnhubTrades(): Record<string, PriceTick> {
  const now = Date.now();
  const out: Record<string, PriceTick> = {};
  for (const sym of tradesToFlush(finnhub.latest, finnhub.lastSent, now)) {
    const trade = finnhub.latest.get(sym) as { price: number; time: number };
    const base = yahooCache.get(sym)?.data;
    const asset = getAssetBySymbol(sym);
    finnhub.lastSent.set(sym, trade.time);
    // Regular session only: the 24 h change is measured against the previous regular close
    if (!base || !asset || !isExchangeOpen(asset.exchange, now) || trade.time <= base.updatedAt) continue;
    const t = applyTrade(base, trade, 'Finnhub (real-time)');
    finnhub.overlay.set(sym, t);
    out[sym] = t;
  }
  return out;
}

setInterval(() => {
  if (finnhub.state === 'off') return;
  if (priceStream.clients.size === 0) {
    if (finnhub.ws && Date.now() - priceStream.lastDemandAt > 5 * 60_000) disconnectFinnhub();
    return;
  }
  if (!finnhub.ws && !finnhub.retryTimer) connectFinnhub();
  const changed = flushFinnhubTrades();
  if (Object.keys(changed).length) pushPrices(changed);
}, 1000);

// ---- Market caps ----------------------------------------------------------------------

interface CoinStats {
  marketCapUsd?: number;
  priceUsd?: number;
  ch24h?: number;
  high24h?: number;
  low24h?: number;
  volumeUsd?: number;
  ch1h?: number;
  ch7d?: number;
  ch30d?: number;
}
const coinCache: { entry: CacheEntry<Map<string, CoinStats>> | null } = { entry: null };

/** CoinGecko public API: market caps and 1h/7d/30d changes for all crypto in one request (2 min cache). */
async function getCoinStats(): Promise<Map<string, CoinStats>> {
  if (coinCache.entry && coinCache.entry.expiresAt > Date.now()) return coinCache.entry.data;
  const ids = ASSETS.filter((a) => a.coingeckoId).map((a) => a.coingeckoId as string);
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.join(',')}&price_change_percentage=1h,7d,30d&per_page=100`;
  try {
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    const out = new Map<string, CoinStats>();
    for (const r of Array.isArray(rows) ? rows : []) {
      out.set(r.id, {
        marketCapUsd: Number(r.market_cap) || undefined,
        priceUsd: Number(r.current_price) || undefined,
        ch24h: Number.isFinite(r.price_change_percentage_24h) ? r.price_change_percentage_24h : undefined,
        high24h: Number(r.high_24h) || undefined,
        low24h: Number(r.low_24h) || undefined,
        volumeUsd: Number(r.total_volume) || undefined,
        ch1h: Number.isFinite(r.price_change_percentage_1h_in_currency) ? r.price_change_percentage_1h_in_currency : undefined,
        ch7d: Number.isFinite(r.price_change_percentage_7d_in_currency) ? r.price_change_percentage_7d_in_currency : undefined,
        ch30d: Number.isFinite(r.price_change_percentage_30d_in_currency) ? r.price_change_percentage_30d_in_currency : undefined,
      });
    }
    coinCache.entry = { data: out, expiresAt: Date.now() + 120_000 };
    return out;
  } catch (err) {
    console.warn('[CoinGecko] failed:', err instanceof Error ? err.message : err);
    return coinCache.entry?.data ?? new Map();
  }
}

/** USD value of one unit of a quote currency (null when the rate is unknown). */
function usdPerUnit(currency: PriceCurrency, usdIdr: number): number | null {
  switch (currency) {
    case 'USD':
      return 1;
    case 'USX':
      return 0.01;
    case 'IDR':
      return usdIdr > 0 ? 1 / usdIdr : null;
    case 'SAR':
      return 1 / 3.75; // pegged
    case 'KRW':
      return fxHelperCache.get('KRW=X') ? 1 / (fxHelperCache.get('KRW=X') as number) : null;
    case 'HKD':
      return fxHelperCache.get('HKD=X') ? 1 / (fxHelperCache.get('HKD=X') as number) : null;
    default:
      return null;
  }
}

/**
 * % change against the intraday point about one hour ago (15-minute bars). Undefined when the
 * market has not traded in the last ~75 minutes, so a closed market shows "—" instead of 0%.
 */
function hourChange(points: Array<{ time: number; value: number }> | undefined, price: number, now = Date.now()): number | undefined {
  if (!points || points.length < 2) return undefined;
  const nowSec = now / 1000;
  if (points[points.length - 1].time < nowSec - 75 * 60) return undefined;
  const base = points.filter((p) => p.time <= nowSec - 3600).pop();
  return base && base.value > 0 ? (price / base.value - 1) * 100 : undefined;
}

/** Adds live market caps (and crypto 1h/7d/30d changes) to the ticks in place. */
async function addMarketCaps(ticks: Record<string, PriceTick>): Promise<void> {
  const usdIdr = ticks['USD/IDR']?.price ?? yahooCache.get('USD/IDR')?.data.price ?? 0;
  const coins = await getCoinStats();
  const gold = ticks['XAU/USD'];
  if (gold && Number.isFinite(gold.price)) {
    const w = (await getWeeklyChanges().catch(() => null))?.get('XAU/USD');
    gold.changePct7d = gold.changePct7d ?? w?.d7;
    gold.changePct30d = gold.changePct30d ?? w?.d30;
    gold.changePct1h = gold.changePct1h ?? hourChange(gold.sparkline, gold.price);
  }
  for (const [symbol, t] of Object.entries(ticks)) {
    const a = getAssetBySymbol(symbol);
    if (!a || !t || !Number.isFinite(t.price)) continue;
    if (a.coingeckoId) {
      const c = coins.get(a.coingeckoId);
      if (c) {
        t.marketCapUsd = c.marketCapUsd;
        t.changePct1h = t.changePct1h ?? c.ch1h;
        t.changePct7d = c.ch7d;
        t.changePct30d = c.ch30d;
      }
    } else if (a.supply) {
      const rate = usdPerUnit(a.currency, usdIdr);
      if (rate) t.marketCapUsd = t.price * rate * a.supply;
    }
  }
}


// ---- Crypto without an Indodax pair (Binance USDT / CoinGecko USD → Rupiah) --------------------

const NON_INDODAX_CRYPTO = ASSETS.filter((a) => a.group === 'crypto' && !a.indodaxPair);

function coingeckoQuotes(coins: Map<string, CoinStats>): Map<string, UsdQuote> {
  const out = new Map<string, UsdQuote>();
  const at = coinCache.entry ? coinCache.entry.expiresAt - 120_000 : Date.now();
  for (const [id, c] of coins) {
    if (c.priceUsd === undefined) continue;
    out.set(id, { price: c.priceUsd, changePct24h: c.ch24h, high24h: c.high24h, low24h: c.low24h, quoteVolume: c.volumeUsd, updatedAt: at, source: 'CoinGecko' });
  }
  return out;
}

/** Rupiah ticks for crypto priced on Binance (or CoinGecko), converted at the live USD/IDR rate. */
async function getNonIndodaxCryptoTicks(usdIdr: number): Promise<Record<string, PriceTick>> {
  if (!NON_INDODAX_CRYPTO.length) return {};
  noteBinanceDemand();
  const rate = usdIdr > 0 ? usdIdr : (yahooCache.get('USD/IDR')?.data.price ?? 0);
  const sources = { spot: spotQuotes(), futures: futuresQuotes(), coingecko: coingeckoQuotes(await getCoinStats()) };
  const now = Date.now();
  const out: Record<string, PriceTick> = {};
  for (const a of NON_INDODAX_CRYPTO) out[a.symbol] = convertedTick(a, pickUsdQuote(a, sources), rate, now);
  return out;
}

const coingeckoHistoryCache = new Map<string, CacheEntry<OhlcCandle[]>>();

/** Daily Rupiah closes for one year from CoinGecko (open = high = low = close; cache 6 h). */
async function coingeckoDailyIdr(asset: Asset): Promise<OhlcCandle[]> {
  const id = asset.coingeckoId;
  if (!id) throw new Error(`No chart source for ${asset.symbol}`);
  const cached = coingeckoHistoryCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const res = await fetchWithTimeout(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=idr&days=365&interval=daily`, {}, 10_000);
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const body = (await res.json()) as { prices?: Array<[number, number]> };
  const byDay = new Map<number, number>();
  for (const [t, p] of body.prices ?? []) if (Number.isFinite(t) && Number.isFinite(p) && p > 0) byDay.set(Math.floor(t / 86_400_000) * 86_400, p);
  const data = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([time, c]) => ({ time, open: c, high: c, low: c, close: c }));
  coingeckoHistoryCache.set(id, { data, expiresAt: Date.now() + 6 * 3600_000 });
  return data;
}

/** Binance candles (spot, else futures per coin) converted to Rupiah at today's USD/IDR rate. */
async function binanceCandlesIdr(asset: Asset, interval: KlineInterval, limit = 500): Promise<OhlcCandle[]> {
  const market = asset.binanceSpot ? 'spot' : asset.binanceFutures ? 'futures' : null;
  if (!market) {
    // CoinGecko-only coins: daily closes in Rupiah (no intraday candles on the free API)
    if (interval !== '1d' && interval !== '1w') throw new Error('Only daily data is available for this coin (CoinGecko)');
    return coingeckoDailyIdr(asset);
  }
  const rate = yahooCache.get('USD/IDR')?.data.price ?? 0;
  if (!(rate > 0)) throw new Error('USD/IDR rate unavailable for conversion');
  const pair = (market === 'spot' ? asset.binanceSpot : asset.binanceFutures) as string;
  const div = market === 'futures' ? asset.futuresMultiplier || 1 : 1;
  const k = await getBinanceKlines(pair, interval, limit, market);
  const f = rate / div;
  return k.map((c) => ({
    time: Math.floor(c.openTime / 1000),
    open: c.open * f,
    high: c.high * f,
    low: c.low * f,
    close: c.close * f,
    volume: c.volume * div,
  }));
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
    yahooGold = await getYahooQuote('GC=F', 'XAU/USD', 'commodity', 'USD', 30_000);
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
    group: 'commodity',
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

  // Cache 30 s (gold-api.com spot) so the gold price stays close to real time
  goldCache.entry = {
    data: goldTick,
    expiresAt: now + 30_000,
  };

  return goldTick;
}

async function getAssetIntelligence(
  symbol: string,
  tick?: PriceTick,
  lang: AppLang = 'en'
): Promise<AssetIntelligence> {
  const now = Date.now();
  // Cached per language: only the Gemini-written text differs
  const cacheKey = `${symbol}|${lang}`;
  const cached = intelligenceCache.get(cacheKey);
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

  // Prefer the evidence-weighted analysis (technicals, factors, fundamentals, news drivers);
  // the simple price + headline-tone score is only a fallback while history is unavailable
  const analysis = await Promise.race([
    getAssetAnalysis(asset).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
  ]);

  const initialIntelligence: AssetIntelligence = {
    symbol: asset.symbol,
    sentimentScore: analysis?.score ?? baseSentiment.score,
    sentimentLabel: analysis?.label ?? baseSentiment.label,
    summary: analysis?.summary ?? baseSentiment.summary,
    keyFactors: analysis?.keyFactors.length ? analysis.keyFactors : baseSentiment.keyFactors,
    summaryParts: analysis?.summaryParts,
    keyFactorParts: analysis?.keyFactors.length ? analysis.keyFactorParts : undefined,
    news: newsItems,
    updatedAt: now,
    aiPowered: false,
  };

  // Cache immediately so subsequent requests are instant
  intelligenceCache.set(cacheKey, {
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

        const prompt = `Analyze the current market sentiment, in ${lang === 'id' ? 'Indonesian (Bahasa Indonesia)' : 'English'}, for the asset ${asset.name} (${asset.symbol}).
Current price: ${tick?.price ?? 'N/A'} (${asset.currency}), 24-hour change: ${
          tick?.changePct24h !== undefined ? tick.changePct24h.toFixed(2) + '%' : 'N/A'
        }.
Latest news:
${headlinesList}
${
          analysis
            ? `
Measured evidence (score ${analysis.score}/100, ${analysis.label}):
${analysis.components.map((c) => `- ${c.label}: ${c.value.toFixed(2)} (weight ${Math.round(c.weight * 100)}%) — ${c.explanation}`).join('\n')}
Use this evidence as given; do not invent other numbers.`
            : ''
        }

Return a sentiment score (0-100), a label ("Bullish", "Neutral", or "Bearish"), an objective and educational 2-sentence summary that explains WHY using the evidence (not buy/sell advice), and the 3 main market drivers.`;

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
          const enriched: AssetIntelligence = analysis
            ? {
                // The measured score stays; Gemini only words the explanation
                ...initialIntelligence,
                summary:
                  typeof parsed.summary === 'string' && parsed.summary.length > 15
                    ? parsed.summary
                    : initialIntelligence.summary,
                summaryParts:
                  typeof parsed.summary === 'string' && parsed.summary.length > 15 ? undefined : initialIntelligence.summaryParts,
                aiPowered: true,
              }
            : {
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
            summaryParts: undefined,
            keyFactors:
              Array.isArray(parsed.keyFactors) && parsed.keyFactors.length > 0
                ? parsed.keyFactors.slice(0, 4)
                : initialIntelligence.keyFactors,
            keyFactorParts: undefined,
            aiPowered: true,
          };
          intelligenceCache.set(cacheKey, {
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

// ---------------------------------------------------------------------------------------
// AI outlook engine
// ~5 years of daily closes per asset (Yahoo; crypto from Indodax in IDR) + US rates and the
// dollar index, Fed decisions (recorded or inferred), walk-forward backtested logistic model.
// The latest live price is used as today's bar, so the outlook moves with the market.
// ---------------------------------------------------------------------------------------

const AI_HISTORY_TTL_MS = 6 * 3600_000;
const AI_OUTLOOK_TTL_MS = 10 * 60_000;
const AI_HORIZONS = [20, 60] as const;
type AiHorizon = (typeof AI_HORIZONS)[number];

const aiHistoryCache = new Map<string, CacheEntry<DailyBar[]>>();
const aiOutlookCache = new Map<AiHorizon, CacheEntry<AiOutlookPayload>>();
const aiComputing = new Map<AiHorizon, Promise<AiOutlookPayload>>();
const aiSummaryCache = new Map<string, CacheEntry<{ text: string; aiPowered: boolean }>>();

interface AiOutlookPayload {
  generatedAt: number;
  horizonDays: number;
  assets: AssetOutlook[];
  nextFomc: { date: string; daysUntil: number } | null;
  recentFedDecisions: Array<{ date: string; decision: string; inferred: boolean }>;
  geoAlertActive: boolean;
}

/** Local trading-day date (YYYY-MM-DD) for an exchange. */
function localDate(ms: number, exchange: ExchangeId): string {
  const tz =
    exchange === 'CRYPTO'
      ? 'Asia/Jakarta'
      : exchange === 'FX' || exchange === 'FUTURES'
        ? 'America/New_York'
        : EXCHANGE_HOURS[exchange].timeZone;
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}

async function fetchYahooDaily(yahooSymbol: string): Promise<DailyBar[]> {
  const key = `y:${yahooSymbol}`;
  const cached = aiHistoryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const result = await fetchYahooChartRaw(yahooSymbol, '1d', '5y');
  const ts: number[] = result.timestamp || [];
  const closes: Array<number | null> = result.indicators?.quote?.[0]?.close || [];
  const offsetSec = Number(result.meta?.gmtoffset) || 0;
  const bars: DailyBar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c === null || c === undefined || !Number.isFinite(c) || c <= 0) continue;
    const date = new Date((Number(ts[i]) + offsetSec) * 1000).toISOString().slice(0, 10);
    if (bars.length && bars[bars.length - 1].date === date) bars[bars.length - 1].close = Number(c);
    else bars.push({ date, close: Number(c) });
  }
  aiHistoryCache.set(key, { data: bars, expiresAt: Date.now() + AI_HISTORY_TTL_MS });
  return bars;
}

async function fetchIndodaxDaily(pair: string): Promise<DailyBar[]> {
  const key = `i:${pair}`;
  const cached = aiHistoryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const nowSec = Math.floor(Date.now() / 1000);
  const url = `https://indodax.com/tradingview/history_v2?symbol=${pair.toUpperCase()}&tf=1D&from=${nowSec - 5 * 365 * DAY_SEC}&to=${nowSec}`;
  const res = await fetchWithTimeout(url, {}, 10_000);
  if (!res.ok) throw new Error(`Indodax HTTP ${res.status}`);
  const rows = await res.json();
  const bars: DailyBar[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const t = Number(row?.Time);
    const c = Number(row?.Close);
    if (!Number.isFinite(t) || !Number.isFinite(c) || c <= 0) continue;
    const date = localDate(t * 1000, 'CRYPTO');
    if (bars.length && bars[bars.length - 1].date === date) bars[bars.length - 1].close = c;
    else bars.push({ date, close: c });
  }
  aiHistoryCache.set(key, { data: bars, expiresAt: Date.now() + AI_HISTORY_TTL_MS });
  return bars;
}

/** Latest live price for an asset from the price caches (null if unknown). */
function livePriceFor(asset: Asset): { price: number; at: number } | null {
  const tick = asset.indodaxPair
    ? indodaxCache.entry?.data?.[asset.symbol]
    : yahooCache.get(asset.symbol)?.data; // gold: GC=F futures, matching its history
  return tick && Number.isFinite(tick.price) && tick.price > 0 ? { price: tick.price, at: tick.updatedAt } : null;
}

/** Puts the live price in as today's bar (replacing a same-day close) without mutating the cache. */
function withLiveBar(bars: DailyBar[], asset: Asset): DailyBar[] {
  const live = livePriceFor(asset);
  if (!live || bars.length === 0) return bars;
  const date = localDate(live.at, asset.exchange);
  const last = bars[bars.length - 1];
  if (date < last.date) return bars;
  return date === last.date
    ? [...bars.slice(0, -1), { date, close: live.price }]
    : [...bars, { date, close: live.price }];
}


// ---- Asset analysis: technical scorecard + chart patterns + fundamentals + news drivers ----

const ANALYSIS_TTL_MS = 2 * 60_000;
const FUNDAMENTALS_TTL_MS = 12 * 3600_000;
const ON_DEMAND_NEWS_MS = 3 * 60_000;
const analysisCache = new Map<string, CacheEntry<AssetAnalysis>>();
const analysisJobs = new Map<string, Promise<AssetAnalysis>>();
const fundamentalsCache = new Map<string, CacheEntry<{ years: AnnualFigures[]; currency: string } | null>>();
const onDemandNewsAt = new Map<string, number>();

const STOCK_GROUPS: AssetGroup[] = ['idStock', 'usStock', 'globalStock'];

/** About 5 years of daily bars (without today's live bar). */
async function dailyHistoryFor(asset: Asset): Promise<DailyBar[]> {
  if (asset.indodaxPair) return fetchIndodaxDaily(asset.indodaxPair);
  if (asset.group === 'crypto') {
    return (await binanceCandlesIdr(asset, '1d', 1000)).map((c) => ({ date: localDate(c.time * 1000, 'CRYPTO'), close: c.close }));
  }
  // Spot gold uses the GC=F futures history
  if (asset.symbol === 'XAU/USD') return fetchYahooDaily('GC=F');
  // SAR is pegged at 3.75 per USD, so its Rupiah history is USD/IDR ÷ 3.75
  if (asset.symbol === 'SAR/IDR') return (await fetchYahooDaily('IDR=X')).map((b) => ({ date: b.date, close: b.close / SAR_PER_USD }));
  return asset.yahooSymbol ? fetchYahooDaily(asset.yahooSymbol) : [];
}

/** Daily closes with today's live price as the last bar. */
async function dailyClosesFor(asset: Asset): Promise<number[]> {
  return withLiveBar(await dailyHistoryFor(asset), asset).map((b) => b.close);
}

/** Annual statements from Yahoo's fundamentals-timeseries (stocks only, cached 12 h). */
async function fundamentalsFor(asset: Asset): Promise<{ years: AnnualFigures[]; currency: string } | null> {
  if (!STOCK_GROUPS.includes(asset.group) || !asset.yahooSymbol) return null;
  const cached = fundamentalsCache.get(asset.symbol);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const sym = encodeURIComponent(asset.yahooSymbol);
  const nowSec = Math.floor(Date.now() / 1000);
  const types = Object.values(YAHOO_FUNDAMENTAL_TYPES).join(',');
  const url = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${sym}?symbol=${sym}&type=${types}&period1=${nowSec - 6 * 365 * DAY_SEC}&period2=${nowSec}`;
  let data: { years: AnnualFigures[]; currency: string } | null = null;
  try {
    const res = await fetchWithTimeout(url, {}, 8000);
    if (res.ok) {
      const parsed = parseYahooFundamentals(await res.json());
      data = parsed.years.length >= 2 ? parsed : null;
    }
  } catch (err) {
    console.warn(`[Fundamentals] ${asset.code} failed:`, err instanceof Error ? err.message : err);
  }
  fundamentalsCache.set(asset.symbol, { data, expiresAt: Date.now() + (data ? FUNDAMENTALS_TTL_MS : 30 * 60_000) });
  return data;
}

// ---- Financial statements (Yahoo fundamentals-timeseries + SEC EDGAR company facts) ----------

const SEC_USER_AGENT = 'AssetRadar personal research app (non-commercial)';

interface RawStatements {
  annual: PeriodValues[];
  quarterly: PeriodValues[];
  currency: string;
  sources: Array<{ id: 'yahoo' | 'sec'; label: string; url: string }>;
}

const statementsCache = new Map<string, CacheEntry<RawStatements | null>>();
const statementsPending = new Map<string, Promise<RawStatements | null>>();

async function loadStatements(asset: Asset): Promise<RawStatements | null> {
  const sym = encodeURIComponent(asset.yahooSymbol as string);
  const nowSec = Math.floor(Date.now() / 1000);
  const yahooUrl = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${sym}?symbol=${sym}&type=${yahooStatementTypeList()}&period1=${nowSec - 7 * 365 * DAY_SEC}&period2=${nowSec}`;
  const cik = asset.group === 'usStock' ? secCikFor(asset.code) : null;
  const [yahoo, sec] = await Promise.all([
    fetchWithTimeout(yahooUrl, {}, 12_000)
      .then(async (r) => (r.ok ? parseYahooStatements(await r.json()) : null))
      .catch((err) => {
        console.warn(`[Statements] Yahoo ${asset.code} failed:`, err instanceof Error ? err.message : err);
        return null;
      }),
    cik
      ? fetchWithTimeout(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, { headers: { 'User-Agent': SEC_USER_AGENT } }, 20_000)
          .then(async (r) => (r.ok ? parseSecFacts(await r.json()) : null))
          .catch((err) => {
            console.warn(`[Statements] SEC ${asset.code} failed:`, err instanceof Error ? err.message : err);
            return null;
          })
      : Promise.resolve(null),
  ]);
  if (!yahoo && !sec) return null;
  const sources: RawStatements['sources'] = [];
  // SEC filings are the primary source for US companies; Yahoo fills the gaps
  let annual = addDerivedLines(yahoo?.annual ?? [], false);
  let quarterly = addDerivedLines(yahoo?.quarterly ?? [], false);
  if (sec && (sec.annual.length || sec.quarterly.length)) {
    annual = addDerivedLines(mergePeriods(addDerivedLines(sec.annual, true), annual), false);
    quarterly = addDerivedLines(mergePeriods(addDerivedLines(sec.quarterly, true), quarterly), false);
    sources.push({ id: 'sec', label: 'SEC EDGAR (10-K / 10-Q filings)', url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=10-&dateb=&owner=include&count=40` });
  }
  if (yahoo && (yahoo.annual.length || yahoo.quarterly.length)) {
    sources.push({ id: 'yahoo', label: 'Yahoo Finance (fundamentals)', url: `https://finance.yahoo.com/quote/${sym}/financials` });
  }
  if (!annual.length && !quarterly.length) return null;
  return { annual, quarterly, currency: yahoo?.currency || (sec ? 'USD' : ''), sources };
}

async function rawStatementsFor(asset: Asset): Promise<RawStatements | null> {
  const cached = statementsCache.get(asset.symbol);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  let pending = statementsPending.get(asset.symbol);
  if (!pending) {
    pending = loadStatements(asset)
      .then((data) => {
        statementsCache.set(asset.symbol, { data, expiresAt: Date.now() + (data ? FUNDAMENTALS_TTL_MS : 30 * 60_000) });
        return data;
      })
      .finally(() => statementsPending.delete(asset.symbol));
    statementsPending.set(asset.symbol, pending);
  }
  return pending;
}

const STATEMENT_LIMITS: Record<StatementPeriod, number> = { annual: 5, semester: 10, quarterly: 20 };

async function getStatements(asset: Asset, period: StatementPeriod) {
  const raw = await rawStatementsFor(asset);
  if (!raw) return null;
  const fyEnd = fiscalYearEndMonth(raw.annual);
  const quarters = fillQuartersFromAnnual(raw.quarterly, raw.annual, fyEnd);
  const base = period === 'annual' ? fiscalYears(raw.annual, fyEnd) : period === 'semester' ? buildSemesters(quarters, fyEnd) : quarters;
  // All periods go into the ratio math (YoY / TTM need earlier ones); only the last five years are returned
  const periods = fillMissingPeriods(base);
  const [monthly, quotes, fund] = await Promise.all([
    fetchYahooMonthly(asset.yahooSymbol as string).catch(() => new Map<string, number>()),
    getQuotesFor([asset]).catch(() => ({}) as Record<string, PriceTick>),
    fundamentalsFor(asset).catch(() => null),
  ]);
  const live = quotes[asset.symbol]?.price;
  const sameCurrency = !raw.currency || raw.currency === asset.currency;
  const all = buildStatementRows(periods, fyEnd, {
    sameCurrency,
    livePrice: typeof live === 'number' && live > 0 ? live : undefined,
    priceAt: (end) => monthly.get(monthKey(Date.parse(end) - 15 * 86_400_000)),
  });
  const f = fund ? piotroski([...fund.years].sort((a, b) => a.fiscalYearEnd.localeCompare(b.fiscalYearEnd))) : null;
  return {
    symbol: asset.symbol,
    code: asset.code,
    period,
    currency: raw.currency || asset.currency,
    quoteCurrency: asset.currency,
    valuationNote: sameCurrency
      ? null
      : `Reported in ${raw.currency} while the share trades in ${asset.currency}: P/E, P/B and dividend yield are not shown.`,
    fiscalYearEndMonth: fyEnd,
    rows: all.slice(-STATEMENT_LIMITS[period]),
    fScore: f && f.max >= 5 ? { score: f.score, max: f.max, fiscalYearEnd: fund?.years.at(-1)?.fiscalYearEnd ?? '' } : null,
    sources: raw.sources,
    generatedAt: Date.now(),
  };
}

/** Google News searches for assets that the hub does not poll on its own. */
function onDemandQueries(asset: Asset): Array<{ q: string; lang: 'en' | 'id' }> {
  const name = asset.name.replace(/\s*\(.*\)\s*/g, ' ').trim();
  switch (asset.group) {
    case 'idStock':
      return [
        { q: `saham ${asset.code} when:3d`, lang: 'id' },
        { q: `"${name}" when:3d`, lang: 'en' },
      ];
    case 'usStock':
    case 'globalStock':
      return [
        { q: `"${name}" stock when:2d`, lang: 'en' },
        { q: `saham ${name} when:3d`, lang: 'id' },
      ];
    case 'crypto':
      return [
        { q: `${name} ${asset.code} crypto when:2d`, lang: 'en' },
        { q: `${name} kripto when:3d`, lang: 'id' },
      ];
    case 'forex':
      return [
        { q: `kurs ${asset.code} rupiah when:2d`, lang: 'id' },
        { q: `${asset.keywords?.[0] ?? name} when:2d`, lang: 'en' },
      ];
    default:
      return [{ q: `"${name}" when:2d`, lang: 'en' }];
  }
}

async function ensureAssetNews(asset: Asset): Promise<void> {
  if (asset.newsQuery) return; // already polled by the hub
  const last = onDemandNewsAt.get(asset.id) ?? 0;
  if (Date.now() - last < ON_DEMAND_NEWS_MS) return;
  onDemandNewsAt.set(asset.id, Date.now());
  const sources: NewsSource[] = onDemandQueries(asset).map(({ q, lang }, i) => ({
    id: `gn-od-${asset.id}-${i}`,
    url:
      lang === 'id'
        ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=id&gl=ID&ceid=ID:id`
        : `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`,
    asset,
    minIntervalMs: ON_DEMAND_NEWS_MS,
    maxItems: 8,
  }));
  const results = await Promise.all(sources.map((s) => fetchNewsSource(s).catch(() => [] as MarketNewsItem[])));
  newsHub.items = mergeNewsItems(newsHub.items, results.flat(), Date.now(), { maxItems: 400 }).items;
}

/** Headlines for the drivers study: the asset's own news plus the latest market-wide macro news. */
function driverNewsFor(asset: Asset): MarketNewsItem[] {
  const own = newsHub.items.filter((i) => i.assetTags?.includes(asset.code)).slice(0, 25);
  // Market-wide news only when it is purely macro (a gold headline that mentions the Fed is gold news)
  const macro = newsHub.items
    .filter((i) => !own.includes(i) && i.assetTags?.includes(MACRO_TAG) && i.assetTags.every((t) => t === MACRO_TAG || t === GEO_TAG))
    .slice(0, 6);
  return [...own, ...macro];
}

async function computeAssetAnalysis(asset: Asset): Promise<AssetAnalysis> {
  const [closes, fund] = await Promise.all([
    dailyClosesFor(asset),
    fundamentalsFor(asset).catch(() => null),
    ensureNewsFresh()
      .then(() => ensureAssetNews(asset))
      .catch(() => {}),
  ]);
  return analysisFromCloses(asset, closes, fund, 20);
}

/** The analysis itself, from closes already loaded (also used by the AI screen with its horizon). */
async function analysisFromCloses(
  asset: Asset,
  closes: number[],
  fund: { years: AnnualFigures[]; currency: string } | null,
  horizonDays: number
): Promise<AssetAnalysis> {
  if (closes.length < 60) throw new Error(`Not enough price history for ${asset.name}`);
  const yearBars = asset.group === 'crypto' ? 365 : 252;
  const technical = analyzeTechnicals(closes, horizonDays, yearBars);

  let fundamentals = null;
  if (fund) {
    // P/E and P/B need the market cap in the reporting currency
    const usdIdr = yahooCache.get('USD/IDR')?.data.price ?? 0;
    const tick = yahooCache.get(asset.symbol)?.data;
    const ticks: Record<string, PriceTick> = tick ? { [asset.symbol]: { ...tick } } : {};
    if (tick) await addMarketCaps(ticks);
    const mcUsd = ticks[asset.symbol]?.marketCapUsd;
    const rate = usdPerUnit(fund.currency as PriceCurrency, usdIdr);
    fundamentals = analyzeFundamentals(fund.years, fund.currency, mcUsd && rate ? mcUsd / rate : undefined);
  }

  const news = analyzeNewsDrivers(driverNewsFor(asset), asset.group, asset.symbol);
  return buildAnalysis({ symbol: asset.symbol, group: asset.group, closes, technical, fundamentals, news });
}

/** Cached analysis (2 minutes); concurrent callers share one computation. */
async function getAssetAnalysis(asset: Asset): Promise<AssetAnalysis> {
  const cached = analysisCache.get(asset.symbol);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  let job = analysisJobs.get(asset.symbol);
  if (!job) {
    job = computeAssetAnalysis(asset)
      .then((data) => {
        analysisCache.set(asset.symbol, { data, expiresAt: Date.now() + ANALYSIS_TTL_MS });
        return data;
      })
      .finally(() => analysisJobs.delete(asset.symbol));
    analysisJobs.set(asset.symbol, job);
  }
  return job;
}

// ---- Quant simulator: value & momentum factor portfolios (monthly) ------------------------

const QUANT_TTL_MS = 6 * 3600_000;
const quantCache = new Map<string, CacheEntry<QuantFactorsPayload>>();
const quantJobs = new Map<string, Promise<QuantFactorsPayload>>();
const monthlyCache = new Map<string, CacheEntry<Map<string, number>>>();

const QUANT_UNIVERSES: Record<QuantUniverse, { label: string; filter: (a: Asset) => boolean; stocks: boolean }> = {
  usStock: { label: 'US stocks', filter: (a) => a.group === 'usStock' && a.code !== 'SPCX', stocks: true },
  idStock: { label: 'Indonesian stocks', filter: (a) => a.group === 'idStock', stocks: true },
  index: { label: 'World stock indices', filter: (a) => a.group === 'index' && a.code !== 'VIX', stocks: false },
  forex: { label: 'Currencies vs Rupiah', filter: (a) => a.group === 'forex' && a.code !== 'DXY' && a.code !== 'SAR', stocks: false },
  commodity: { label: 'Commodities', filter: (a) => a.group === 'commodity', stocks: false },
  everywhere: {
    label: 'Everywhere (indices + currencies + commodities)',
    filter: (a) =>
      (a.group === 'index' && a.code !== 'VIX') || (a.group === 'forex' && a.code !== 'DXY' && a.code !== 'SAR') || a.group === 'commodity',
    stocks: false,
  },
};

/** Month-end closes over the full available history (Yahoo monthly bars, cached 12 h). */
async function fetchYahooMonthly(yahooSymbol: string): Promise<Map<string, number>> {
  const cached = monthlyCache.get(yahooSymbol);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const result = await fetchYahooChartRaw(yahooSymbol, '1mo', 'max');
  const ts: number[] = result.timestamp || [];
  const closes: Array<number | null> = result.indicators?.quote?.[0]?.close || [];
  const offsetSec = Number(result.meta?.gmtoffset) || 0;
  const byMonth = new Map<string, number>();
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c === null || c === undefined || !Number.isFinite(c) || c <= 0) continue;
    byMonth.set(monthKey((Number(ts[i]) + offsetSec) * 1000), Number(c));
  }
  const points = [...byMonth.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([key, close]) => ({ key, close }));
  const out = new Map(despike(points).map((p) => [p.key, p.close] as [string, number]));
  monthlyCache.set(yahooSymbol, { data: out, expiresAt: Date.now() + AI_HISTORY_TTL_MS * 2 });
  return out;
}

/** Published F-scores per stock (fiscal year end + 4 months reporting lag), scaled to 0–9. */
async function fscoreTimeline(assets: Asset[]): Promise<FScoreTimeline> {
  const timeline: FScoreTimeline = new Map();
  await mapLimit(assets, 6, async (asset) => {
    const fund = await fundamentalsFor(asset).catch(() => null);
    if (!fund) return;
    const entries: Array<{ from: string; score: number }> = [];
    for (let k = 1; k < fund.years.length; k++) {
      const f = piotroski(fund.years.slice(0, k + 1));
      if (!f || f.max < 5) continue;
      const fy = fund.years[k].fiscalYearEnd;
      entries.push({ from: addMonths(fy.slice(0, 7), 4), score: Math.round((f.score / f.max) * 9) });
    }
    if (entries.length) timeline.set(asset.symbol, entries);
  });
  return timeline;
}

async function computeQuantFactors(universe: QuantUniverse): Promise<QuantFactorsPayload> {
  const cfg = QUANT_UNIVERSES[universe];
  const assets = ASSETS.filter((a) => cfg.filter(a) && a.yahooSymbol);
  const series: MonthlySeries[] = [];
  await mapLimit(assets, 6, async (a) => {
    try {
      series.push({ symbol: a.code, closes: await fetchYahooMonthly(a.yahooSymbol as string) });
    } catch (err) {
      console.warn(`[Quant] ${a.code} failed:`, err instanceof Error ? err.message : err);
    }
  });
  const fscores = cfg.stocks ? await fscoreTimeline(assets) : undefined;
  // F-score timeline is keyed by app symbol; the series by code
  const byCode: FScoreTimeline | undefined = fscores
    ? new Map([...fscores.entries()].map(([sym, v]) => [getAssetBySymbol(sym)?.code ?? sym, v]))
    : undefined;
  const factors = buildFactorSeries(series, byCode);
  const irx = await fetchYahooMonthly('^IRX').catch(() => new Map<string, number>());
  return {
    ...factors,
    universe,
    label: cfg.label,
    members: series.map((s) => s.symbol).sort(),
    rf: factors.months.map((m) => {
      const y = irx.get(m);
      return y === undefined ? null : y / 100 / 12;
    }),
    hasQuality: Boolean(byCode && byCode.size > 0),
    generatedAt: Date.now(),
  };
}

async function getQuantFactors(universe: QuantUniverse): Promise<QuantFactorsPayload> {
  const cached = quantCache.get(universe);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  let job = quantJobs.get(universe);
  if (!job) {
    job = computeQuantFactors(universe)
      .then((data) => {
        quantCache.set(universe, { data, expiresAt: Date.now() + QUANT_TTL_MS });
        return data;
      })
      .finally(() => quantJobs.delete(universe));
    quantJobs.set(universe, job);
  }
  return job;
}

// ---- US Treasury yield curve (Terminal CURV) ----------------------------------------------

const YIELD_TENORS: Array<{ symbol: string; tenor: string; years: number }> = [
  { symbol: '^IRX', tenor: '3M', years: 0.25 },
  { symbol: '^FVX', tenor: '5Y', years: 5 },
  { symbol: '^TNX', tenor: '10Y', years: 10 },
  { symbol: '^TYX', tenor: '30Y', years: 30 },
];
const yieldsCache: { entry: CacheEntry<YieldCurvePayload> | null } = { entry: null };

interface YieldCurvePayload {
  points: Array<{ tenor: string; years: number; yield: number; prevClose: number | null; monthAgo: number | null }>;
  updatedAt: number;
}

async function getYieldCurve(): Promise<YieldCurvePayload> {
  if (yieldsCache.entry && yieldsCache.entry.expiresAt > Date.now()) return yieldsCache.entry.data;
  const series = await fetchYahooSpark(YIELD_TENORS.map((t) => t.symbol), '1mo', '1d');
  const points: YieldCurvePayload['points'] = [];
  for (const t of YIELD_TENORS) {
    const sp = series.get(t.symbol);
    const meta = sp?.meta as { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number } | undefined;
    const y = Number(meta?.regularMarketPrice);
    if (!Number.isFinite(y)) continue;
    const closes = (sp?.closes ?? []).filter((c): c is number => c !== null && Number.isFinite(c));
    const prev = Number(meta?.previousClose ?? closes[closes.length - 2]);
    points.push({
      tenor: t.tenor,
      years: t.years,
      yield: y,
      prevClose: Number.isFinite(prev) ? prev : null,
      monthAgo: closes.length ? closes[0] : null,
    });
  }
  if (points.length === 0) throw new Error('Yield data unavailable');
  const data = { points, updatedAt: Date.now() };
  yieldsCache.entry = { data, expiresAt: Date.now() + 60_000 };
  return data;
}

// ---- On-demand quotes and the full IDX sweep --------------------------------------------

const QUOTES_MAX = 60;

/**
 * Quotes for specific symbols (what a viewer has on screen, in the watchlist or portfolio):
 * same 15 s / 5 min cache as the core Yahoo loop. Missing quotes come back as status "error"
 * so the UI can say "Data unavailable" instead of hiding the row.
 */
async function getQuotesFor(assets: Asset[]): Promise<Record<string, PriceTick>> {
  const now = Date.now();
  const yahoo = assets.filter((a) => a.yahooSymbol && !a.indodaxPair);
  const stale = yahoo.filter((a) => {
    const c = yahooCache.get(a.symbol);
    return !c || c.expiresAt <= now;
  });
  if (stale.length) {
    const series = await fetchYahooSpark(stale.map((a) => a.yahooSymbol as string), '2d', '15m');
    for (const a of stale) {
      const sp = series.get(a.yahooSymbol as string);
      const tick = sp ? tickFromYahoo(a, sp, now) : null;
      if (tick) yahooCache.set(a.symbol, { data: tick, expiresAt: now + yahooCacheMs(a, now) });
    }
  }
  const out: Record<string, PriceTick> = {};
  for (const a of yahoo) {
    const cached = yahooCache.get(a.symbol)?.data;
    const swept = idxSweep.ticks.get(a.symbol);
    out[a.symbol] = cached
      ? { ...cached, isMarketOpen: marketOpenFor(a.symbol, now), changePct7d: cached.changePct7d ?? swept?.changePct7d }
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
  }
  await addMarketCaps(out);
  return out;
}

const IDX_ALL = ALL_ASSETS.filter((a) => a.group === 'idStock' && a.yahooSymbol);
const IDX_SWEEP_OPEN_MS = 5 * 60_000;
const IDX_SWEEP_CLOSED_MS = 30 * 60_000;
const idxSweep = {
  ticks: new Map<string, PriceTick>(),
  lastRunAt: 0,
  lastDemandAt: 0,
  running: null as Promise<void> | null,
};

/** One pass over every listed stock: 60 symbols per step, two steps in flight (≈16 requests). */
async function runIdxSweep(): Promise<void> {
  if (idxSweep.running) return idxSweep.running;
  idxSweep.running = (async () => {
    const now = Date.now();
    const chunks: Asset[][] = [];
    for (let i = 0; i < IDX_ALL.length; i += 60) chunks.push(IDX_ALL.slice(i, i + 60));
    await mapLimit(chunks, 2, async (chunk) => {
      const series = await fetchYahooSpark(chunk.map((a) => a.yahooSymbol as string), '1mo', '1d');
      for (const a of chunk) {
        const sp = series.get(a.yahooSymbol as string);
        const meta = (sp?.meta ?? {}) as Record<string, number | undefined>;
        const price = Number(meta.regularMarketPrice);
        if (!sp || !Number.isFinite(price) || price <= 0) continue; // keep the previous sweep's value
        const closes = sp.closes.filter((c): c is number => c !== null && Number.isFinite(c) && c > 0);
        const weekAgo = closes.length > 5 ? closes[closes.length - 6] : undefined;
        const change = Number(meta.regularMarketChangePercent);
        idxSweep.ticks.set(a.symbol, {
          symbol: a.symbol,
          group: a.group,
          price,
          changePct24h: Number.isFinite(change) ? change : undefined,
          changePct7d: weekAgo ? (price / weekAgo - 1) * 100 : undefined,
          changePct30d: closes.length > 1 ? (price / closes[0] - 1) * 100 : undefined,
          high24h: Number.isFinite(Number(meta.regularMarketDayHigh)) ? Number(meta.regularMarketDayHigh) : undefined,
          low24h: Number.isFinite(Number(meta.regularMarketDayLow)) ? Number(meta.regularMarketDayLow) : undefined,
          currency: a.currency,
          source: 'Yahoo Finance',
          updatedAt: meta.regularMarketTime ? Number(meta.regularMarketTime) * 1000 : now,
          status: 'delayed',
          isMarketOpen: marketOpenFor(a.symbol, now),
          ...volumeFields(meta, price),
        });
      }
    });
    idxSweep.lastRunAt = Date.now();
  })().finally(() => {
    idxSweep.running = null;
  });
  return idxSweep.running;
}

// Sweep in the background while someone looked at IDX data in the last 10 minutes
setInterval(() => {
  const now = Date.now();
  if (now - idxSweep.lastDemandAt > 10 * 60_000) return;
  const every = isExchangeOpen('IDX', now) ? IDX_SWEEP_OPEN_MS : IDX_SWEEP_CLOSED_MS;
  if (now - idxSweep.lastRunAt >= every) runIdxSweep().catch(() => {});
}, 30_000);

// ---- IDX corporate calendar (Yahoo calendarEvents + chart dividend/split events) ----------

/** Yahoo's quoteSummary needs a session cookie and a matching crumb (refreshed every 6 h). */
const yahooSession = { cookie: '', crumb: '', expiresAt: 0, pending: null as Promise<void> | null };

async function ensureYahooSession(force = false): Promise<void> {
  if (!force && yahooSession.crumb && yahooSession.expiresAt > Date.now()) return;
  if (yahooSession.pending) return yahooSession.pending;
  yahooSession.pending = (async () => {
    const res = await fetchWithTimeout('https://fc.yahoo.com', { redirect: 'manual' }, 8000);
    const cookies = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
    if (!cookie) throw new Error('Yahoo session cookie unavailable');
    const crumbRes = await fetchWithTimeout('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers: { Cookie: cookie } }, 8000);
    const crumb = (await crumbRes.text()).trim();
    if (!crumbRes.ok || !crumb || crumb.includes('<')) throw new Error('Yahoo crumb unavailable');
    Object.assign(yahooSession, { cookie, crumb, expiresAt: Date.now() + 6 * 3600_000 });
  })().finally(() => {
    yahooSession.pending = null;
  });
  return yahooSession.pending;
}

async function fetchQuoteSummary(yahooSymbol: string, modules: string): Promise<unknown> {
  await ensureYahooSession();
  const url = () =>
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=${modules}&crumb=${encodeURIComponent(yahooSession.crumb)}`;
  let res = await fetchWithTimeout(url(), { headers: { Cookie: yahooSession.cookie } }, 8000);
  if (res.status === 401 || res.status === 403) {
    await ensureYahooSession(true);
    res = await fetchWithTimeout(url(), { headers: { Cookie: yahooSession.cookie } }, 8000);
  }
  if (!res.ok) throw new Error(`quoteSummary HTTP ${res.status}`);
  return res.json();
}

const CALENDAR_TTL_MS = 12 * 3600_000;
const calendarCache = new Map<string, CacheEntry<CalendarEvent[]>>();

/** Upcoming events plus 5 years of dividends and splits for one stock (cached 12 h). */
async function getCalendarFor(asset: Asset): Promise<CalendarEvent[]> {
  const cached = calendarCache.get(asset.symbol);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const tz = EXCHANGE_HOURS[asset.exchange as keyof typeof EXCHANGE_HOURS]?.timeZone ?? 'Asia/Jakarta';
  const sym = asset.yahooSymbol as string;
  const [upcoming, history] = await Promise.all([
    fetchQuoteSummary(sym, 'calendarEvents')
      .then((j) => parseCalendarEvents(asset.symbol, j, tz))
      .catch(() => [] as CalendarEvent[]),
    fetchWithTimeout(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5y&interval=1mo&events=div,split`, {}, 8000)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j ? parseChartEvents(asset.symbol, j, tz) : []))
      .catch(() => [] as CalendarEvent[]),
  ]);
  const data = mergeEvents(upcoming, history);
  calendarCache.set(asset.symbol, { data, expiresAt: Date.now() + CALENDAR_TTL_MS });
  return data;
}

/** Whole-exchange scan: slow and steady (2 at a time), once per 12 h, only while someone looks. */
const calendarScan = { done: 0, startedAt: 0, finishedAt: 0, lastDemandAt: 0, running: null as Promise<void> | null };

function runCalendarScan(): Promise<void> {
  if (calendarScan.running) return calendarScan.running;
  calendarScan.done = 0;
  calendarScan.startedAt = Date.now();
  calendarScan.running = mapLimit(IDX_ALL, 2, async (a) => {
    await getCalendarFor(a).catch(() => []);
    calendarScan.done += 1;
    await new Promise((r) => setTimeout(r, 250));
  })
    .then(() => {
      calendarScan.finishedAt = Date.now();
    })
    .finally(() => {
      calendarScan.running = null;
    });
  return calendarScan.running;
}

setInterval(() => {
  const now = Date.now();
  if (now - calendarScan.lastDemandAt > 60 * 60_000) return;
  if (!calendarScan.running && now - calendarScan.finishedAt > CALENDAR_TTL_MS) runCalendarScan().catch(() => {});
}, 60_000);

// ---- Indonesia macro (Bank Indonesia pages, FRED, World Bank) -----------------------------

const MACRO_TTL_MS = 6 * 3600_000;
const macroCache: { entry: CacheEntry<IndonesiaMacroPayload> | null; pending: Promise<IndonesiaMacroPayload> | null } = { entry: null, pending: null };

interface IndonesiaMacroPayload {
  series: MacroSeries[];
  /** Official BI-Rate decisions (latest first page of bi.go.id). */
  biRate: MacroPoint[];
  unavailable: Array<{ label: string; reason: string }>;
  failed: string[];
  generatedAt: number;
}

const FRED_URL = (id: string) => `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`;
const FRED_PAGE = (id: string) => `https://fred.stlouisfed.org/series/${id}`;

async function fetchText(url: string): Promise<string> {
  const res = await fetchWithTimeout(url, {}, 15_000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function computeIndonesiaMacro(): Promise<IndonesiaMacroPayload> {
  const failed: string[] = [];
  const get = async <T,>(id: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      console.warn(`[Macro] ${id} failed:`, err instanceof Error ? err.message : err);
      failed.push(id);
      return fallback;
    }
  };
  const fred = (id: string) => get(id, async () => parseFredCsv(await fetchText(FRED_URL(id))), [] as MacroPoint[]);
  const wb = (id: string) =>
    get(id, async () => parseWorldBank(JSON.parse(await fetchText(`https://api.worldbank.org/v2/country/IDN/indicator/${id}?format=json&per_page=60`))), [] as MacroPoint[]);
  const [biRate, biInflation, interbank, cpiYoy, cpiIndex, gdp, reserves, trade, usdIdr, wbInfl, wbGdp] = await Promise.all([
    get('bi-rate', async () => parseBiTable(await fetchText('https://www.bi.go.id/en/statistik/indikator/bi-rate.aspx')), [] as MacroPoint[]),
    get('bi-inflation', async () => parseBiTable(await fetchText('https://www.bi.go.id/en/statistik/indikator/data-inflasi.aspx')), [] as MacroPoint[]),
    fred('IRSTCI01IDM156N'),
    fred('CPALTT01IDM659N'),
    fred('IDNCPIALLMINMEI'),
    fred('IDNGDPRQPSMEI'),
    fred('TRESEGIDM052N'),
    fred('XTNTVA01IDM667S'),
    fred('CCUSMA02IDM618N'),
    wb('FP.CPI.TOTL.ZG'),
    wb('NY.GDP.MKTP.KD.ZG'),
  ]);
  const since = (pts: MacroPoint[], from = '2014-01-01') => pts.filter((p) => p.date >= from);
  const series: MacroSeries[] = [
    {
      id: 'policyRate',
      label: 'Interbank overnight rate (follows the BI-Rate)',
      unit: '%',
      frequency: 'monthly',
      source: 'OECD via FRED',
      sourceUrl: FRED_PAGE('IRSTCI01IDM156N'),
      points: since(interbank),
      note: 'Monthly average of the overnight interbank rate, which tracks Bank Indonesia\'s policy rate.',
    },
    {
      id: 'inflationYoy',
      label: 'Inflation, CPI year-on-year',
      unit: '%',
      frequency: 'monthly',
      source: 'OECD via FRED; latest months from Bank Indonesia',
      sourceUrl: 'https://www.bi.go.id/en/statistik/indikator/data-inflasi.aspx',
      points: since(mergeSeries(cpiYoy, biInflation)),
      note: 'FRED stops in April 2025 and bi.go.id lists only the latest 10 months, so months in between may be missing.',
    },
    {
      id: 'inflationMom',
      label: 'Inflation, CPI month-on-month',
      unit: '%',
      frequency: 'monthly',
      source: 'OECD via FRED',
      sourceUrl: FRED_PAGE('IDNCPIALLMINMEI'),
      points: since(periodChange(cpiIndex)),
      note: 'Computed from the CPI index; the free series currently ends in April 2025.',
    },
    { id: 'gdpYoy', label: 'Real GDP growth, year-on-year', unit: '%', frequency: 'quarterly', source: 'OECD via FRED', sourceUrl: FRED_PAGE('IDNGDPRQPSMEI'), points: since(gdp) },
    {
      id: 'reserves',
      label: 'FX reserves (excluding gold)',
      unit: 'US$ bn',
      frequency: 'monthly',
      source: 'IMF via FRED',
      sourceUrl: FRED_PAGE('TRESEGIDM052N'),
      points: since(reserves.map((p) => ({ date: p.date, value: p.value / 1000 }))),
    },
    {
      id: 'tradeBalance',
      label: 'Trade balance (seasonally adjusted)',
      unit: 'US$ bn',
      frequency: 'monthly',
      source: 'OECD via FRED',
      sourceUrl: FRED_PAGE('XTNTVA01IDM667S'),
      points: since(trade.map((p) => ({ date: p.date, value: p.value / 1e9 }))),
    },
    { id: 'usdIdr', label: 'USD/IDR (monthly average)', unit: 'Rp', frequency: 'monthly', source: 'OECD via FRED', sourceUrl: FRED_PAGE('CCUSMA02IDM618N'), points: since(usdIdr) },
    { id: 'inflationAnnual', label: 'Inflation, annual', unit: '%', frequency: 'annual', source: 'World Bank', sourceUrl: 'https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG?locations=ID', points: since(wbInfl, '2000-01-01') },
    { id: 'gdpAnnual', label: 'GDP growth, annual', unit: '%', frequency: 'annual', source: 'World Bank', sourceUrl: 'https://data.worldbank.org/indicator/NY.GDP.MKTP.KD.ZG?locations=ID', points: since(wbGdp, '2000-01-01') },
  ].filter((x) => x.points.length > 0) as MacroSeries[];
  return {
    series,
    biRate,
    unavailable: [
      { label: '10-year government bond (SBN) yield', reason: 'No free source with current data was found.' },
      { label: 'Manufacturing PMI', reason: 'PMI data is licensed (S&P Global) and not free.' },
    ],
    failed,
    generatedAt: Date.now(),
  };
}

async function getIndonesiaMacro(): Promise<IndonesiaMacroPayload> {
  if (macroCache.entry && macroCache.entry.expiresAt > Date.now()) return macroCache.entry.data;
  if (!macroCache.pending) {
    macroCache.pending = computeIndonesiaMacro()
      .then((data) => {
        macroCache.entry = { data, expiresAt: Date.now() + (data.failed.length ? 30 * 60_000 : MACRO_TTL_MS) };
        return data;
      })
      .finally(() => {
        macroCache.pending = null;
      });
  }
  return macroCache.pending;
}

/** AI inputs dated by publication: interbank rate known ~2 months later, CPI ~1 month + 5 days. */
async function indonesiaMacroBars(): Promise<{ rate: DailyBar[]; inflation: DailyBar[] } | null> {
  const m = await getIndonesiaMacro().catch(() => null);
  const rate = m?.series.find((x) => x.id === 'policyRate')?.points ?? [];
  const infl = m?.series.find((x) => x.id === 'inflationYoy')?.points ?? [];
  if (rate.length < 24 || infl.length < 24) return null;
  const toBars = (pts: MacroPoint[]) => pts.map((p) => ({ date: p.date, close: p.value }));
  return { rate: toBars(shiftToRelease(rate, 2)), inflation: toBars(shiftToRelease(infl, 1, 5)) };
}

/** IHSG, Indonesian stocks and Rupiah currency pairs (not crypto, which is only quoted in IDR). */
function usesIdMacro(asset: Asset): boolean {
  return asset.group === 'idStock' || asset.code === 'JCI' || (asset.group === 'forex' && asset.symbol.endsWith('/IDR'));
}

/** Runs fn over items with at most `limit` calls in flight (keeps Yahoo from rate-limiting us). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function computeAiOutlook(horizon: AiHorizon): Promise<AiOutlookPayload> {
  // Kick off price caches so live bars are available (ignore failures)
  await Promise.allSettled([getIndodaxPrices(), getYahooTicks(), ensureNewsFresh()]);

  const [tbillBars, yieldBars, dollarBars, idMacro] = await Promise.all([
    fetchYahooDaily('^IRX'),
    fetchYahooDaily('^TNX'),
    fetchYahooDaily('DX-Y.NYB'),
    indonesiaMacroBars(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const meetings = resolveMeetings(tbillBars, today);

  // The AI screen covers the assets flagged `ai` (major markets with 5 years of clean daily data)
  const candidates = ASSETS.filter((a) => a.ai && (a.indodaxPair || a.yahooSymbol));
  const outlooks = await mapLimit(candidates, 6, async (asset): Promise<AssetOutlook | null> => {
    try {
      const bars = withLiveBar(await dailyHistoryFor(asset), asset);
      const dates = bars.map((b) => b.date);
      const macro = {
        tbill: alignByDate(dates, tbillBars),
        yield10y: alignByDate(dates, yieldBars),
        dollar: asset.code === 'DXY' ? dates.map(() => null) : alignByDate(dates, dollarBars),
        fedStance: fedStanceSeries(dates, meetings),
      };
      const build = (m: typeof macro & { idRate?: Array<number | null>; idInflation?: Array<number | null> }) =>
        buildAssetOutlook({
          symbol: asset.symbol,
          code: asset.code,
          name: asset.name,
          group: asset.group,
          bars,
          macro: m,
          horizonDays: horizon,
          fedReactions: eventStudy(bars, meetings),
        });
      let outlook = build(macro);
      // Indonesian assets: test BI-Rate proxy + inflation features; keep them only if they
      // improved the validation period, and report the holdout either way
      if (idMacro && usesIdMacro(asset)) {
        const withId = build({ ...macro, idRate: alignByDate(dates, idMacro.rate), idInflation: alignByDate(dates, idMacro.inflation) });
        const test = compareIdMacro(withId, outlook);
        outlook = { ...(test?.used ? withId : outlook), idMacroTest: test };
      }
      // Evidence-weighted analysis on the same bars (fundamentals from the 12 h cache, hub news only)
      const evidence = await analysisFromCloses(
        asset,
        bars.map((b) => b.close),
        await fundamentalsFor(asset).catch(() => null),
        horizon
      )
        .then((a) => ({
          composite: a.composite,
          score: a.score,
          label: a.label,
          summary: a.summary,
          scorecard: a.technical?.edge
            ? {
                lean: a.technical.edge.lean,
                upRate: a.technical.edge.upRate,
                baseUpRate: a.technical.edge.baseUpRate,
                samples: a.technical.edge.samples,
                horizonDays: a.technical.edge.horizonDays,
              }
            : null,
        }))
        .catch(() => null);
      return { ...outlook, evidence };
    } catch (err) {
      console.warn(`[AI] ${asset.code} failed:`, err instanceof Error ? err.message : err);
      return null;
    }
  });

  const next = nextMeeting(today);
  return {
    generatedAt: Date.now(),
    horizonDays: horizon,
    assets: outlooks.filter((o): o is AssetOutlook => o !== null),
    nextFomc: next
      ? { date: next, daysUntil: Math.round((Date.parse(next) - Date.parse(today)) / 86_400_000) }
      : null,
    recentFedDecisions: meetings
      .filter((m) => m.decision && m.date <= today)
      .slice(-4)
      .map((m) => ({ date: m.date, decision: m.decision as string, inferred: m.inferred })),
    geoAlertActive: selectGeoAlert(newsHub.items, Date.now()) !== null,
  };
}

/** Cached outlook; recomputes in the background when stale (first call waits). */
async function getAiOutlook(horizon: AiHorizon): Promise<AiOutlookPayload> {
  const cached = aiOutlookCache.get(horizon);
  const refresh = () => {
    if (!aiComputing.has(horizon)) {
      const job = computeAiOutlook(horizon)
        .then((data) => {
          aiOutlookCache.set(horizon, { data, expiresAt: Date.now() + AI_OUTLOOK_TTL_MS });
          return data;
        })
        .finally(() => aiComputing.delete(horizon));
      aiComputing.set(horizon, job);
    }
    return aiComputing.get(horizon) as Promise<AiOutlookPayload>;
  };
  if (cached) {
    if (cached.expiresAt <= Date.now()) refresh().catch(() => {});
    return cached.data;
  }
  return refresh();
}

/** Rule-based summary of the ranked outlook in the chosen language (used when Gemini is not configured). */
function ruleBasedSummary(payload: AiOutlookPayload, profile: RiskProfile, lang: AppLang = 'en'): string {
  const tr = (key: TranslationKey, params?: Record<string, string | number>) => translate(lang, key, params);
  const ranked = rankOutlooks(payload.assets, profile, { geoAlertActive: payload.geoAlertActive, lang });
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(0)}%`);
  const favorable = ranked.filter((o) => o.verdict === 'favorable');
  const watch = ranked.filter((o) => o.verdict === 'watch');
  const weak = ranked.filter((o) => o.verdict === 'unfavorable');
  const horizon = tr(payload.horizonDays === 20 ? 'srv.ai.horizon20' : 'srv.ai.horizon60');
  const profileLabel = tr(`risk.profile.${profile}` as TranslationKey).toLowerCase();
  const parts: string[] = [];
  if (favorable.length) {
    const items = favorable
      .slice(0, 3)
      .map((o) => {
        const sc = o.evidence?.scorecard;
        const proof =
          o.reliability > 0 && o.signal === 'bullish'
            ? tr('srv.ai.proofBacktest', { hit: pct(o.backtest?.signalHitRate), base: pct(o.backtest?.baseRate) })
            : sc
              ? tr('srv.ai.proofScorecard', { up: pct(sc.upRate), base: pct(sc.baseUpRate) })
              : tr('srv.ai.proofEdge');
        return tr('srv.ai.item', { name: o.name, chance: pct(o.adjustedProbability), proof });
      })
      .join(', ');
    parts.push(tr('srv.ai.favorable', { profile: profileLabel, horizon, items }));
  } else {
    parts.push(tr('srv.ai.none', { profile: profileLabel, horizon }));
  }
  if (watch.length) parts.push(tr('srv.ai.watch', { names: watch.slice(0, 4).map((o) => o.name).join(', ') }));
  if (weak.length) parts.push(tr('srv.ai.weak', { names: weak.slice(0, 4).map((o) => o.name).join(', ') }));
  if (payload.nextFomc) parts.push(tr('srv.ai.fomc', { date: payload.nextFomc.date, days: payload.nextFomc.daysUntil }));
  if (payload.geoAlertActive) parts.push(tr('srv.ai.geo'));
  return parts.join(' ');
}

async function getAiSummary(payload: AiOutlookPayload, profile: RiskProfile, lang: AppLang = 'en') {
  const key = `${payload.generatedAt}|${payload.horizonDays}|${profile}|${lang}`;
  const cached = aiSummaryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const fallback = { text: ruleBasedSummary(payload, profile, lang), aiPowered: false };
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    aiSummaryCache.set(key, { data: fallback, expiresAt: Date.now() + AI_OUTLOOK_TTL_MS });
    return fallback;
  }
  const ranked = rankOutlooks(payload.assets, profile, { geoAlertActive: payload.geoAlertActive });
  const facts = ranked.map((o) => ({
    asset: o.name,
    verdict: o.verdict,
    adjustedProbabilityUp: o.adjustedProbability?.toFixed(2),
    backtestSignalHitRate: o.backtest?.signalHitRate?.toFixed(2),
    backtestBaseRate: o.backtest?.baseRate?.toFixed(2),
    volatility: o.stats.volatility?.toFixed(2),
    return1y: o.stats.return1y?.toFixed(2),
    topDrivers: o.drivers.slice(0, 2).map((d) => `${d.label} (${d.impact > 0 ? '+' : '-'})`),
    evidenceScore: o.evidence?.score,
    checks: o.checks.map((c) => `${c.label}: ${c.pass === null ? 'n/a' : c.pass ? 'pass' : 'fail'} (${c.detail})`),
  }));
  const prompt = `You are a quantitative market analyst. Using ONLY the data below (for each instrument: its verdict and the checks behind it — a walk-forward backtested strategy judged on a holdout, a technical scorecard tested on the asset's own history, and an evidence score from technicals, momentum, value, quality and news — for the next ${payload.horizonDays} trading days), write 4-6 plain ${lang === 'id' ? 'Indonesian (Bahasa Indonesia)' : 'English'} sentences for a ${RISK_PROFILES[profile].label} investor: which instruments currently look statistically favorable and why (cite the chance of a gain and the hit rate vs base rate from the passing check), what looks weak, the main macro context (next Fed decision: ${payload.nextFomc?.date ?? 'unknown'}; recent decisions: ${JSON.stringify(payload.recentFedDecisions)}; geopolitical alert: ${payload.geoAlertActive}), and one risk caveat. Never promise returns. End with: "${lang === 'id' ? 'Ini adalah penyaringan statistik, bukan nasihat keuangan pribadi.' : 'This is a statistical screen, not personal financial advice.'}"
DATA: ${JSON.stringify(facts)}`;
  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
    const response = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 12_000)),
    ]);
    const text = response?.text?.trim();
    const data = text ? { text, aiPowered: true } : fallback;
    aiSummaryCache.set(key, { data, expiresAt: Date.now() + AI_OUTLOOK_TTL_MS });
    return data;
  } catch (err) {
    console.warn('[AI] Gemini summary failed:', err instanceof Error ? err.message : err);
    return fallback;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Headline translation (Gemini, only with GEMINI_API_KEY; cached 24 h). Without a key: 503 and
  // the browser opens Google Translate instead.
  const translateCache = new Map<string, CacheEntry<string>>();
  app.get('/api/translate', async (req, res) => {
    const text = String(req.query.text || '').trim().slice(0, 300);
    const to = req.query.to === 'id' ? 'id' : 'en';
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!text) {
      res.status(400).json({ error: 'text required' });
      return;
    }
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({ error: 'Translation needs GEMINI_API_KEY on the server' });
      return;
    }
    const key = `${to}|${text}`;
    const cached = translateCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      res.json({ translated: cached.data, cached: true });
      return;
    }
    try {
      const ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
      const response = await Promise.race([
        ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `Translate this news headline into ${to === 'id' ? 'Indonesian' : 'English'}. Reply with the translation only.\n${text}`,
          config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
        }),
        new Promise<null>((r) => setTimeout(() => r(null), 8000)),
      ]);
      const translated = response?.text?.trim().slice(0, 400);
      if (!translated) {
        res.status(502).json({ error: 'Translation unavailable' });
        return;
      }
      if (translateCache.size > 2000) translateCache.clear();
      translateCache.set(key, { data: translated, expiresAt: Date.now() + 24 * 3600_000 });
      res.json({ translated });
    } catch (err) {
      console.warn('[Translate] failed:', err instanceof Error ? err.message : err);
      res.status(502).json({ error: 'Translation unavailable' });
    }
  });

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
      for (const sym of ASSETS.filter((a) => a.indodaxPair).map((a) => a.symbol)) {
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
    Object.assign(ticks, await getNonIndodaxCryptoTicks(usdIdrRate).catch(() => ({})));

    try {
      const goldTick = await getGoldTick(usdIdrRate);
      ticks['XAU/USD'] = goldTick;
    } catch {
      ticks['XAU/USD'] = {
        symbol: 'XAU/USD',
        group: 'commodity',
        price: NaN,
        currency: 'USD',
        source: 'Spot XAU',
        updatedAt: now,
        status: 'error',
        errorMessage: 'Gold data unavailable',
      };
    }

    await addMarketCaps(ticks);
    res.json({
      ticks,
      serverTime: now,
      idxMarketOpen: isIdxMarketOpen(now),
    });
  });

  // 2. Indodax-only endpoint (for 10s REST fallback polling)
  app.get('/api/market/indodax', async (_req, res) => {
    try {
      const ticks = { ...(await getIndodaxPrices()) };
      await addMarketCaps(ticks);
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
    Object.assign(all, await getNonIndodaxCryptoTicks(all['USD/IDR']?.price ?? 0).catch(() => ({})));
    // Failed quotes are left out so the client keeps its last good price
    const ticks = Object.fromEntries(Object.entries(all).filter(([, t]) => t.status !== 'error'));
    await addMarketCaps(ticks);
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

      const intelligence = await getAssetIntelligence(symbol, currentTick, parseLang(req.query.lang));
      res.json(intelligence);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to load sentiment analysis and news',
      });
    }
  });

  // 5b. Evidence-weighted analysis: technical scorecard, chart patterns, fundamentals, news drivers
  app.get('/api/market/analysis', async (req, res) => {
    const asset = getAssetBySymbol(String(req.query.symbol || ''));
    if (!asset) {
      res.status(404).json({ error: 'Unknown asset' });
      return;
    }
    try {
      res.json(await getAssetAnalysis(asset));
    } catch (err) {
      console.warn(`[Analysis] ${asset.code} failed:`, err instanceof Error ? err.message : err);
      res.status(502).json({ error: err instanceof Error ? err.message : 'Analysis unavailable' });
    }
  });

  // 5b2. Financial statements + ratios (stocks)
  app.get('/api/fundamentals/statements', async (req, res) => {
    const asset = getAssetBySymbol(String(req.query.symbol || ''));
    const period = String(req.query.period || 'annual') as StatementPeriod;
    if (!asset || !STOCK_GROUPS.includes(asset.group) || !asset.yahooSymbol) {
      res.status(404).json({ error: 'Statements are available for stocks only' });
      return;
    }
    if (!['annual', 'semester', 'quarterly'].includes(period)) {
      res.status(400).json({ error: 'Unknown period' });
      return;
    }
    try {
      const data = await getStatements(asset, period);
      if (!data) {
        res.status(502).json({ error: 'Statements unavailable' });
        return;
      }
      res.json(data);
    } catch (err) {
      console.warn(`[Statements] ${asset.code} failed:`, err instanceof Error ? err.message : err);
      res.status(502).json({ error: 'Statements unavailable' });
    }
  });

  // 5c. Value & momentum factor portfolios for the quant simulator
  app.get('/api/quant/factors', async (req, res) => {
    const universe = String(req.query.universe || 'usStock') as QuantUniverse;
    if (!Object.prototype.hasOwnProperty.call(QUANT_UNIVERSES, universe)) {
      res.status(400).json({ error: 'Unknown universe' });
      return;
    }
    try {
      res.json(await getQuantFactors(universe));
    } catch (err) {
      console.warn('[Quant] failed:', err instanceof Error ? err.message : err);
      res.status(502).json({ error: 'Factor data unavailable' });
    }
  });

  // 5d. US Treasury yield curve
  app.get('/api/market/yields', async (_req, res) => {
    try {
      res.json(await getYieldCurve());
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Yield data unavailable' });
    }
  });

  // 5e. On-demand quotes for assets outside the core loop (IDX universe), max 60 per call
  app.get('/api/market/quotes', async (req, res) => {
    const symbols = String(req.query.symbols || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, QUOTES_MAX);
    const assets = symbols.map((x) => getAssetBySymbol(x)).filter((a): a is Asset => Boolean(a));
    if (assets.length === 0) {
      res.json({ ticks: {}, serverTime: Date.now() });
      return;
    }
    try {
      res.json({ ticks: await getQuotesFor(assets), serverTime: Date.now() });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Quotes unavailable' });
    }
  });

  // 5f. Every listed Indonesian stock (background sweep: 5 min while IDX is open, 30 min closed)
  app.get('/api/market/idx', async (_req, res) => {
    idxSweep.lastDemandAt = Date.now();
    try {
      if (idxSweep.ticks.size === 0) await runIdxSweep();
      else if (Date.now() - idxSweep.lastRunAt >= (isExchangeOpen('IDX', Date.now()) ? IDX_SWEEP_OPEN_MS : IDX_SWEEP_CLOSED_MS)) {
        runIdxSweep().catch(() => {});
      }
      const usdIdr = yahooCache.get('USD/IDR')?.data.price ?? 0;
      const rows = IDX_ALL.map((a) => {
        const t = idxSweep.ticks.get(a.symbol);
        const cap = t && a.supply ? t.price * a.supply : undefined;
        return {
          symbol: a.symbol,
          price: t?.price ?? null,
          changePct24h: t?.changePct24h ?? null,
          changePct7d: t?.changePct7d ?? null,
          changePct30d: t?.changePct30d ?? null,
          volume: t?.volume ?? null,
          valueTraded: t?.valueTraded ?? null,
          marketCapIdr: cap ?? null,
          marketCapUsd: cap && usdIdr > 0 ? cap / usdIdr : null,
          updatedAt: t?.updatedAt ?? null,
        };
      });
      res.json({
        rows,
        sweptAt: idxSweep.lastRunAt || null,
        refreshMs: isExchangeOpen('IDX', Date.now()) ? IDX_SWEEP_OPEN_MS : IDX_SWEEP_CLOSED_MS,
        listUpdated: IDX_LIST_UPDATED,
        marketOpen: isExchangeOpen('IDX', Date.now()),
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'IDX data unavailable' });
    }
  });

  // 5g. Corporate calendar: one stock (?symbol=) or every IDX stock in a date window
  app.get('/api/idx/calendar', async (req, res) => {
    const symbol = String(req.query.symbol || '');
    try {
      if (symbol) {
        const asset = getAssetBySymbol(symbol);
        if (!asset?.yahooSymbol || !['idStock', 'usStock', 'globalStock'].includes(asset.group)) {
          res.status(400).json({ error: 'Calendar is available for stocks only' });
          return;
        }
        res.json({ symbol: asset.symbol, events: await getCalendarFor(asset), source: 'Yahoo Finance' });
        return;
      }
      calendarScan.lastDemandAt = Date.now();
      if (!calendarScan.running && Date.now() - calendarScan.finishedAt > CALENDAR_TTL_MS) runCalendarScan().catch(() => {});
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
      const from = addDays(today, -30);
      const to = addDays(today, 90);
      const events: CalendarEvent[] = [];
      for (const a of IDX_ALL) {
        const c = calendarCache.get(a.symbol)?.data;
        if (c) events.push(...eventsBetween(c, from, to));
      }
      res.json({
        events: events.sort((x, y) => x.date.localeCompare(y.date)),
        from,
        to,
        scanned: IDX_ALL.filter((a) => calendarCache.has(a.symbol)).length,
        total: IDX_ALL.length,
        scanning: Boolean(calendarScan.running),
        source: 'Yahoo Finance',
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Calendar unavailable' });
    }
  });

  // 5h. Indonesia macro: BI-Rate, inflation, GDP growth, FX reserves, trade balance, USD/IDR
  app.get('/api/macro/indonesia', async (_req, res) => {
    try {
      res.json(await getIndonesiaMacro());
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Macro data unavailable' });
    }
  });

  // 6. OHLC candles for the alternative chart (Indodax / Yahoo Finance)
  app.get('/api/market/history', async (req, res) => {
    const symbol = String(req.query.symbol || '');
    const interval = String(req.query.interval || '15');
    const asset = getAssetBySymbol(symbol);
    if (!asset || (!asset.yahooSymbol && !asset.indodaxPair && asset.group !== 'crypto')) {
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
        source: asset.indodaxPair ? 'Indodax' : asset.group === 'crypto' ? 'Binance (USDT → IDR at today\'s USD/IDR)' : 'Yahoo Finance',
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


  // ---- Binance (public market data only; no API key) ----------------------------------------
  // Top-100 USDT pairs with live price, 1h/4h/24h/7d change, volume and funding
  app.get('/api/crypto/binance', async (_req, res) => {
    await warmBinance();
    const byPair = new Map(ASSETS.filter((a) => a.binanceSpot).map((a) => [a.binanceSpot as string, a]));
    const quotes = spotQuotes();
    const fundingOf = (base: string) => fundingFor(`${base}USDT`) ?? fundingFor(`1000${base}USDT`);
    const rows = binanceUniverse().map((p) => {
      const q = quotes.get(p.symbol);
      const w = windowChanges(cachedClosedKlines(p.symbol, '1h').concat(), q?.price ?? NaN);
      const f = fundingOf(p.baseAsset);
      const asset = byPair.get(p.symbol);
      return {
        rank: p.rank,
        symbol: p.symbol,
        base: p.baseAsset,
        price: q?.price ?? null,
        change1h: w.h1 ?? null,
        change4h: w.h4 ?? null,
        change24h: q?.changePct24h ?? null,
        change7d: w.d7 ?? null,
        quoteVolume: q?.quoteVolume ?? p.quoteVolume,
        fundingRate: f && Number.isFinite(f.lastFundingRate) ? f.lastFundingRate : null,
        futures: f ? f.symbol : null,
        futuresMultiplier: f ? futuresMultiplierOf(f.symbol) : null,
        assetId: asset?.id ?? null,
        updatedAt: q?.updatedAt ?? null,
      };
    });
    res.json({ status: binanceStatus(), rows, serverTime: Date.now() });
  });

  // Candles of one pair (1h / 4h / 1d / 1w); the last candle is marked open
  app.get('/api/crypto/binance/klines', async (req, res) => {
    const symbol = String(req.query.symbol || '');
    const interval = String(req.query.interval || '1d') as KlineInterval;
    if (!['1h', '4h', '1d', '1w'].includes(interval)) {
      res.status(400).json({ error: 'interval must be 1h, 4h, 1d or 1w' });
      return;
    }
    await warmBinance(2000);
    if (!isKnownSpotPair(symbol)) {
      res.status(404).json({ error: 'Unknown Binance pair', status: binanceStatus() });
      return;
    }
    try {
      const klines = await getBinanceKlines(symbol, interval, 500);
      res.json({ symbol, interval, klines, closed: closedKlines(klines).length, status: binanceStatus() });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Binance unavailable', status: binanceStatus() });
    }
  });

  // Futures statistics of one perpetual (open interest change, long/short, taker ratio, basis)
  app.get('/api/crypto/binance/derivatives', async (req, res) => {
    const contract = String(req.query.contract || '');
    if (!/^[^\s]{2,40}USDT$/u.test(contract)) {
      res.status(400).json({ error: 'contract required, e.g. BTCUSDT' });
      return;
    }
    try {
      res.json({ ...(await getDerivatives(contract)), funding: fundingFor(contract) ?? null });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Binance futures unavailable', status: binanceStatus() });
    }
  });

  // 10. AI outlook: backtested model per asset + personalized summary
  app.get('/api/ai/outlook', async (req, res) => {
    const horizon = (Number(req.query.horizon) === 60 ? 60 : 20) as AiHorizon;
    const profileParam = String(req.query.profile || 'moderate');
    const profile: RiskProfile = profileParam in RISK_PROFILES ? (profileParam as RiskProfile) : 'moderate';
    try {
      const payload = await getAiOutlook(horizon);
      const summary = await getAiSummary(payload, profile, parseLang(req.query.lang));
      res.json({ ...payload, profile, summary });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to compute the AI outlook',
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

  // 9b. Live price stream (Server-Sent Events): a snapshot first, then only the changed quotes
  app.get('/api/market/price-stream', async (req, res) => {
    const id = String(req.query.client || '').slice(0, 64) || `anon-${Math.random().toString(36).slice(2)}`;
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write('retry: 5000\n\n');
    const client: StreamClient = { id, res, sent: {} };
    priceStream.clients.add(client);
    priceStream.lastDemandAt = Date.now();
    const heartbeat = setInterval(() => {
      res.write(`event: ping\ndata: ${JSON.stringify({ serverTime: Date.now(), feeds: streamFeeds() })}\n\n`);
    }, 20_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      priceStream.clients.delete(client);
      priceStream.lastDemandAt = Date.now();
    });
    try {
      recomputePriority();
      pushPrices(await buildStreamTicks(), 'snapshot', client);
    } catch (err) {
      console.warn('[Stream] snapshot failed:', err instanceof Error ? err.message : err);
    }
  });

  // 9c. Symbols a stream client has on screen (watchlist, portfolio, detail page, IDX rows)
  app.post('/api/market/price-focus', (req, res) => {
    const id = String(req.body?.client || '').slice(0, 64);
    const raw: unknown[] = Array.isArray(req.body?.symbols) ? req.body.symbols : [];
    if (!id) {
      res.status(400).json({ error: 'client required' });
      return;
    }
    const symbols = [...new Set(raw.map(String))].filter((s) => getAssetBySymbol(s)).slice(0, 240);
    priceStream.focus.set(id, { symbols, at: Date.now() });
    recomputePriority();
    // Newly focused symbols are priced on the next loop round (≤1 s)
    res.status(204).end();
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
    // Warm up the AI outlook so the first visitor does not wait for 5 years of data
    setTimeout(() => getAiOutlook(20).catch((err) => console.warn('[AI] warm-up failed:', err)), 3000);
  });
}

startServer();
