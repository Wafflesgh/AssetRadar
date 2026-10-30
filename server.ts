/**
 * server.ts — Express server for AssetRadar. Serves the React app (Vite middleware in
 * development, dist/ in production) and the /api/market/* endpoints: price snapshot
 * (Indodax, Yahoo Finance, gold-api.com), sentiment + news (Google News, optional Gemini),
 * OHLC history for the alternative chart, 30-day correlation, the combined news feed, a
 * server-push price stream (SSE, optional Finnhub real-time trades), financial statements,
 * the IDX calendar, Indonesia macro data and the AI Advisor; plus owner sync (/api/sync/*,
 * server/sync.ts), the daily server AI forward test and the protected cron endpoint.
 * All upstream data is cached in memory; durable data goes to the optional database
 * (server/store.ts). API keys stay on the server. Runs as an always-on Node server (npm start)
 * or as one Vercel serverless function (createApp(), server/vercelEntry.ts): there timers and
 * streams are off and the long scans run from POST /api/cron/tick (server/runtime.ts).
 */
import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Type, ThinkingLevel } from '@google/genai';
import { geminiGenerate, geminiStatus } from './server/gemini.ts';
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
  scanBinanceUntil,
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
import { CrossSection, monthlyFromBars, type CrossMarket, type CrossPersist } from './server/crossSection.ts';
import { ANALYST_MODULES, parseAnalystData, type AnalystData } from './src/utils/analyst.ts';
import { marketPillars, type MarketPillars, type StockPillars } from './src/sentiment/pillars.ts';
import { newsByHorizon, HORIZONS, type Horizon } from './src/sentiment/newsHorizon.ts';
import { derivativesScore, scoreHorizon, shortTechnical, trendScore, tsMomentumScore, type HorizonScore } from './src/sentiment/horizons.ts';
import { nextCatalyst, type Catalyst } from './src/sentiment/cadence.ts';
import { isMacroLinked, macroSignal } from './src/sentiment/macroSignal.ts';
import { validateMarket, validatePanel, type MarketValidation } from './src/sentiment/validation.ts';
import { annualVol, atr as atrOf, likelyRange, patternTargets, supportResistance, upsideDownside, type RangeBand } from './src/sentiment/projections.ts';
import type { StockInput } from './src/sentiment/factors.ts';
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
import { SP500_GICS, usPeerAssets } from './src/config/usPeers.ts';
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
  SEKI_FLOWS,
  SEKI_URL,
  WB_EXTRA,
  WB_GOV_DEBT,
  macroPulse,
  mergeSeries,
  monthlyPoints,
  parseBiTable,
  parseFredCsv,
  parseWorldBank,
  periodChange,
  shiftToRelease,
  spreadSeries,
  toIndicator,
  type MacroCategory,
  type MacroIndicator,
  type MacroPoint,
  type MacroSeries,
  type PulseCategory,
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
import {
  emptyLog,
  evaluateSnapshots,
  parseForwardLog,
  pendingSymbols,
  recordSnapshots,
  trackRecord,
  type DailyClose,
  type ForwardLog,
} from './src/ai/forwardTest.ts';
import { dailyJobDue, wibDate } from './src/utils/sync.ts';
import { passphraseMatches, bearerToken } from './src/utils/syncAuth.ts';
import { createStore, getPacked, setPacked } from './server/store.ts';
import { ARENA_MANAGER_MODEL, FUND_MANAGERS, parseFundArena, probabilityPicks, sentimentPicks, stepFundArena, type FundManagerId, type FundQuote } from './src/ai/fundArena.ts';
import { arenaLiveBoard, emptyArenaLog, evaluateArenaLog, parseArenaLog, pendingArenaSymbols, recordArenaDay, type ArenaLog } from './src/ai/arena.ts';
import { SERVERLESS, afterMs, everyMs, keepAlive } from './server/runtime.ts';
import { createOwnerAuth, liveValues, loadSyncData, registerSyncRoutes, syncStorageReady, updateSyncData } from './server/sync.ts';
import { loadSubscriptions, pushLang, registerPushRoutes, sendPushToAll, vapidConfigured } from './server/push.ts';
import { diagnosticsProbes, registerDiagnosticsRoute } from './server/diagnostics.ts';
import { getSbnRetail } from './server/sbn.ts';
import { sbnStatus } from './src/utils/sbnRetail.ts';
import {
  analystPrompt,
  cleanNote,
  datesFromKeys,
  extremes,
  parseReport,
  parseSnapshot,
  qualityChecks,
  sentimentChanges,
  topMovers,
  type AnalystFacts,
  type AnalystReport,
  type DailySnapshot,
  type SnapAsset,
} from './src/ai/dailyAnalyst.ts';
import {
  assetTrace,
  emptySentimentLog,
  evaluateSentimentCalls,
  methodSummaries,
  parseSentimentLog,
  pendingCallSymbols,
  recordSentimentCalls,
  type SentimentLog,
  type TraceHorizon,
  type TraceLabel,
} from './src/ai/recommendationTrace.ts';
import { registerSbnRoute } from './server/sbn.ts';
import { registerStaplesRoute, staplesStep } from './server/staples.ts';
import { addToIdxStats, IDX_TRACE_MAX_CALLS, idxStatsSummaries, idxTraceDay, parseIdxStats } from './src/ai/idxTrace.ts';
import { hostingFrom, internalSchedulerOn } from './src/utils/hosting.ts';
import { readXlsxSheet } from './server/xlsx.ts';
import { readXls } from './server/xls.ts';
import { sekiSeries } from './src/utils/sekiTable.ts';
import { BPS_INFLATION_TABLE_ID, parseBpsInflationTable, yoyFromMonthly } from './src/utils/bpsInflation.ts';
import { BIS_EXPLORER, BIS_SERIES, OECD_EXPLORER, OECD_SERIES, bisUrl, oecdUrl, parseOecdCsv, type OecdSeriesDef } from './src/utils/oecd.ts';
import { findPinkSheetLink, monthlyCommodities, parsePinkSheet, PINK_SERIES, PINK_SHEET_PAGE, type MonthlyCommodity, type PinkSheet } from './src/utils/pinkSheet.ts';
import {
  addHistory,
  afterFire,
  evaluateAlert,
  HOLDINGS_CALENDAR_ID,
  inQuietHours,
  parseAlertSettings,
  parseAlerts,
  throttle,
  type AlertHistoryEntry,
  type AlertSettings,
  type AlertState,
  type UserAlert,
} from './src/utils/alerts.ts';
import { formatAssetPrice, getNumberLocale, setNumberLocale, type NumberLocale } from './src/utils/format.ts';
import { BRIEF_TIME, briefDateFor, briefToText, buildBrief, type BriefInput, type BriefQuote, type MorningBrief } from './src/utils/morningBrief.ts';
import { fundamentalsFromRows, rescaleForPrice, type ScreenerFundamentals, type ScreenerRow } from './src/utils/screener.ts';
import { computeSectorRotation, lastChangePct, type LiveDriver, type SectorDrivers, type SectorRotationResult } from './src/utils/sectorRotation.ts';
import { reactionInterval, reactionSince } from './src/utils/geoReaction.ts';

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
          sentimentCache.delete(asset.symbol); // the Short horizon is re-scored on the next request
          analysisCache.delete(asset.symbol);
        }
        if (tag === MACRO_TAG || tag === GEO_TAG) {
          intelligenceCache.clear();
          sentimentCache.clear();
        }
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
  else if (Date.now() - newsHub.lastPollAt >= FEED_INTERVAL_MS) {
    // Serverless (no background loop): answer with what the hub has, refresh behind the response
    if (SERVERLESS) keepAlive(pollNews()).catch(() => {});
    else await pollNews();
  }
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
everyMs(() => {
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

/**
 * Yahoo chart data. `range: 'full'` asks for everything since the first trade with explicit
 * period1/period2 — `range=max` would silently thin daily bars out to monthly or quarterly.
 */
async function fetchYahooChartRaw(yahooSymbol: string, yahooInterval: string, range: string) {
  const span = range === 'full' ? `period1=-2208988800&period2=${Math.floor(Date.now() / 1000)}` : `range=${range}`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${yahooInterval}&${span}`;
  const res = await fetchWithTimeout(url, {}, range === 'full' ? 25_000 : 8000);
  if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status} for ${yahooSymbol}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Empty Yahoo Finance data for ${yahooSymbol}`);
  return result;
}

/**
 * All daily rows from Indodax since the pair was listed: the API returns at most ~3,650 days per
 * call, so older windows are fetched until one comes back empty (Indodax started in 2014).
 */
async function fetchIndodaxDailyRows(pair: string, maxWindows = 4): Promise<Array<Record<string, unknown>>> {
  const WINDOW = 3600 * DAY_SEC;
  const STOP = Date.UTC(2013, 0, 1) / 1000;
  let to = Math.floor(Date.now() / 1000);
  const all: Array<Record<string, unknown>> = [];
  for (let i = 0; i < maxWindows && to > STOP; i++) {
    const from = Math.max(STOP, to - WINDOW);
    const res = await fetchWithTimeout(`https://indodax.com/tradingview/history_v2?symbol=${pair.toUpperCase()}&tf=1D&from=${from}&to=${to}`, {}, 15_000);
    if (!res.ok) {
      if (all.length) break;
      throw new Error(`Indodax HTTP ${res.status}`);
    }
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    all.unshift(...rows);
    to = from - 1;
  }
  return all.sort((a, b) => Number(a.Time) - Number(b.Time));
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
  // The loop also runs without viewers while the server checks alerts for web push
  if (priceStream.running || (priceStream.clients.size === 0 && !serverAlerts.active)) return;
  if (priceStream.clients.size === 0 && Date.now() - serverAlerts.lastCheckAt < 15_000) return;
  priceStream.running = true;
  try {
    recomputePriority();
    const ticks = await buildStreamTicks();
    pushPrices(ticks);
    if (serverAlerts.active) await checkServerAlerts(ticks);
  } catch (err) {
    console.warn('[Stream] tick failed:', err instanceof Error ? err.message : err);
  } finally {
    priceStream.running = false;
  }
}

everyMs(() => {
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

everyMs(() => {
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

        const response = await geminiGenerate({
          tag: `intelligence ${asset.code}`,
          timeoutMs: 10_000,
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

        const rawText = response?.text;
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
// 10 years of daily closes per asset (Yahoo; crypto from Indodax in IDR) + US rates and the
// dollar index, Fed decisions (recorded or inferred), walk-forward backtested logistic model.
// The latest live price is used as today's bar, so the outlook moves with the market.
// ---------------------------------------------------------------------------------------

const AI_HISTORY_TTL_MS = 6 * 3600_000;
/** Daily bars the AI model uses (10 years of trading days; crypto trades every day, so ~7 years). */
const AI_MODEL_MAX_BARS = 2520;
/** Serverless recomputes less often (each cold instance downloads 10 years of data again). */
const AI_OUTLOOK_TTL_MS = (SERVERLESS ? 30 : 10) * 60_000;
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
  // 10 years: what the AI model and the analysis use (the full history is in dailyOhlcFor)
  const result = await fetchYahooChartRaw(yahooSymbol, '1d', '10y');
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
  const rows = await fetchIndodaxDailyRows(pair, 1);
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
function withLiveBar(bars: DailyBar[], asset: Asset, live = livePriceFor(asset)): DailyBar[] {
  if (!live || bars.length === 0) return bars;
  const date = localDate(live.at, asset.exchange);
  const last = bars[bars.length - 1];
  if (date < last.date) return bars;
  return date === last.date
    ? [...bars.slice(0, -1), { date, close: live.price }]
    : [...bars, { date, close: live.price }];
}


// ---- Daily OHLC history (full, since the first trade) for Compare, Backtest and portfolio performance ----

interface DailyOhlc {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

const dailyOhlcCache = new Map<string, CacheEntry<DailyOhlc[]>>();
const dailyOhlcPending = new Map<string, Promise<DailyOhlc[]>>();

async function fetchYahooDailyOhlc(yahooSymbol: string): Promise<DailyOhlc[]> {
  const result = await fetchYahooChartRaw(yahooSymbol, '1d', 'full');
  const ts: number[] = result.timestamp || [];
  const q = result.indicators?.quote?.[0] ?? {};
  const offsetSec = Number(result.meta?.gmtoffset) || 0;
  const bars: DailyOhlc[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = Number(q.close?.[i]);
    if (!Number.isFinite(c) || c <= 0 || q.close?.[i] === null) continue;
    const pick = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 && v !== null ? Number(v) : c);
    const date = new Date((Number(ts[i]) + offsetSec) * 1000).toISOString().slice(0, 10);
    const bar: DailyOhlc = { date, open: pick(q.open?.[i]), high: pick(q.high?.[i]), low: pick(q.low?.[i]), close: c };
    if (Number.isFinite(Number(q.volume?.[i]))) bar.volume = Number(q.volume[i]);
    bar.high = Math.max(bar.high, bar.open, bar.close);
    bar.low = Math.min(bar.low, bar.open, bar.close);
    if (bars.length && bars[bars.length - 1].date === date) bars[bars.length - 1] = bar;
    else bars.push(bar);
  }
  return bars;
}

async function fetchIndodaxDailyOhlc(pair: string): Promise<DailyOhlc[]> {
  const rows = await fetchIndodaxDailyRows(pair);
  const bars: DailyOhlc[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const t = Number(row?.Time);
    const c = Number(row?.Close);
    if (!Number.isFinite(t) || !Number.isFinite(c) || c <= 0) continue;
    const o = Number(row?.Open) || c;
    const bar: DailyOhlc = { date: localDate(t * 1000, 'CRYPTO'), open: o, high: Math.max(Number(row?.High) || c, o, c), low: Math.min(Number(row?.Low) || c, o, c), close: c };
    if (Number.isFinite(Number(row?.Volume))) bar.volume = Number(row.Volume);
    if (bars.length && bars[bars.length - 1].date === bar.date) bars[bars.length - 1] = bar;
    else bars.push(bar);
  }
  return bars;
}

/** Full daily OHLC per asset since its first trade (cached 6 h): Indodax for crypto, Yahoo for the rest. */
async function dailyOhlcFor(asset: Asset): Promise<DailyOhlc[]> {
  const cached = dailyOhlcCache.get(asset.symbol);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  let pending = dailyOhlcPending.get(asset.symbol);
  if (!pending) {
    pending = (async () => {
      if (asset.indodaxPair) return fetchIndodaxDailyOhlc(asset.indodaxPair);
      if (asset.symbol === 'XAU/USD') return fetchYahooDailyOhlc('GC=F');
      if (asset.symbol === 'SAR/IDR') {
        return (await fetchYahooDailyOhlc('IDR=X')).map((b) => ({ ...b, open: b.open / SAR_PER_USD, high: b.high / SAR_PER_USD, low: b.low / SAR_PER_USD, close: b.close / SAR_PER_USD }));
      }
      if (!asset.yahooSymbol) return [];
      return fetchYahooDailyOhlc(asset.yahooSymbol);
    })()
      .then((data) => {
        dailyOhlcCache.set(asset.symbol, { data, expiresAt: Date.now() + (data.length ? AI_HISTORY_TTL_MS : 10 * 60_000) });
        return data;
      })
      .finally(() => dailyOhlcPending.delete(asset.symbol));
    dailyOhlcPending.set(asset.symbol, pending);
  }
  return pending;
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

/** About 10 years of daily closes (without today's live bar); Binance-only coins: last 1,000 days. The full history since the first trade is dailyOhlcFor. */
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

/** The last 10 years of the full history: what the per-asset analysis, sentiment and projections need. */
async function recentHistoryFor(asset: Asset): Promise<DailyBar[]> {
  return (await dailyHistoryFor(asset)).slice(-AI_MODEL_MAX_BARS);
}

/** Daily closes (last 10 years) with today's live price as the last bar. */
async function dailyClosesFor(asset: Asset): Promise<number[]> {
  return withLiveBar(await recentHistoryFor(asset), asset).map((b) => b.close);
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
everyMs(() => {
  const now = Date.now();
  if (now - idxSweep.lastDemandAt > 10 * 60_000) return;
  const every = isExchangeOpen('IDX', now) ? IDX_SWEEP_OPEN_MS : IDX_SWEEP_CLOSED_MS;
  if (now - idxSweep.lastRunAt >= every) keepAlive(runIdxSweep()).catch(() => {});
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


// ---- Cross-section data for the sentiment pillars (paced background scans) -------------------

const analystCache = new Map<string, CacheEntry<AnalystData | null>>();

/** Analyst consensus and EPS surprises (Yahoo quoteSummary with cookie + crumb; cache 12 h). */
async function analystFor(asset: Asset): Promise<AnalystData | null> {
  if (!asset.yahooSymbol || !['idStock', 'usStock', 'globalStock'].includes(asset.group)) return null;
  const cached = analystCache.get(asset.symbol);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const data = parseAnalystData(await fetchQuoteSummary(asset.yahooSymbol, ANALYST_MODULES));
  analystCache.set(asset.symbol, { data, expiresAt: Date.now() + 12 * 3600_000 });
  return data;
}

function crossLoaders() {
  return {
    symbolOf: (a: Asset) => a.symbol,
    monthly: async (batch: Asset[]) => {
      const bySymbol = new Map(batch.map((a) => [a.yahooSymbol as string, a.symbol]));
      const spark = await fetchYahooSpark([...bySymbol.keys()], '10y', '1mo');
      const out = new Map<string, ReturnType<typeof monthlyFromBars>>();
      for (const [ysym, series] of spark) {
        const app = bySymbol.get(ysym);
        if (app) out.set(app, monthlyFromBars(series.timestamps, series.closes));
      }
      return out;
    },
    statements: async (a: Asset) => {
      const raw = await rawStatementsFor(a);
      return raw ? { annual: raw.annual, quarterly: raw.quarterly, currency: raw.currency } : null;
    },
    analyst: analystFor,
  };
}

/** The app's US stocks plus the rest of the S&P 500 as their peer group (peers are not app assets). */
const US_CORE = ASSETS.filter((a) => a.group === 'usStock' && a.yahooSymbol);
const US_UNIVERSE: Asset[] = [...US_CORE, ...(usPeerAssets(US_CORE) as Asset[])];
const IDX_UNIVERSE_STOCKS = () => ALL_ASSETS.filter((a) => a.group === 'idStock' && a.yahooSymbol);

const crossSections: Record<CrossMarket, CrossSection<Asset>> = {
  idx: new CrossSection('idx', IDX_UNIVERSE_STOCKS, crossLoaders()),
  us: new CrossSection('us', () => US_UNIVERSE, crossLoaders()),
};

// Serverless: the scans run from the cron tick (scanStep) and pages read the computed results
for (const cs of Object.values(crossSections)) cs.passive = SERVERLESS;

/** The cross-section a stock belongs to (null for other asset classes). */
function crossSectionOf(asset: Asset): CrossSection<Asset> | null {
  return asset.group === 'idStock' ? crossSections.idx : asset.group === 'usStock' ? crossSections.us : null;
}

// ---- Multi-horizon investment sentiment (stage 4) -------------------------------------------
// A summary of evidence per horizon, not a buy/sell signal.

const SENTIMENT_DISCLAIMER = 'Information and education only, not investment advice.';

/** Latest validation result per market and horizon (filled by the validation run). */
const validationStore = new Map<string, Partial<Record<Horizon, { ic: number; significant: boolean } | null>>>();
function validationFor(market: string | null, h: Horizon): Partial<Record<Horizon, { ic: number; significant: boolean } | null>> {
  const v = market ? validationStore.get(market) : undefined;
  return v ? { [h]: v[h] ?? null } : {};
}
const pillarsCache = new Map<string, CacheEntry<MarketPillars>>();
const sentimentCache = new Map<string, CacheEntry<unknown>>();

const FINANCIAL_INDUSTRY = /bank|insurance|asuransi|perbankan|financ|capital markets|investment/i;

/** The cross-section of a market as StockInput rows (only what the scans already collected). */
function stockInputs(cs: CrossSection<Asset>, assets: Asset[], market: 'idx' | 'us'): StockInput[] {
  const rows: StockInput[] = [];
  for (const a of assets) {
    const monthly = cs.monthlyOf(a.symbol);
    if (!monthly || monthly.length < 14) continue;
    const st = cs.statementsOf(a.symbol);
    const an = cs.analystOf(a.symbol);
    // US: GICS sub-industry for every stock (core and peers), so industry medians compare like with like
    const industry = (market === 'us' ? SP500_GICS.get(a.yahooSymbol ?? '')?.subIndustry : undefined) ?? a.industry ?? an?.industry ?? null;
    const tick = idxSweep.ticks.get(a.symbol) ?? yahooCache.get(a.symbol)?.data;
    rows.push({
      symbol: a.symbol,
      market,
      monthly,
      annual: st?.annual ?? [],
      quarterly: st?.quarterly ?? [],
      analyst: an,
      industry,
      isFinancial: FINANCIAL_INDUSTRY.test(`${a.sector ?? ''} ${industry ?? ''} ${an?.sector ?? ''}`),
      shares: a.supply,
      valueTraded: tick?.valueTraded,
    });
  }
  return rows;
}

/** Pillar scores of a market for the current month (cache 10 min; rebuilt as scans fill in). */
function currentPillars(market: 'idx' | 'us'): MarketPillars | null {
  // Serverless: computed by the cron tick (see ensureCrossDerived)
  if (SERVERLESS) return crossDerived[market]?.pillars ?? null;
  crossSections[market].touch();
  const cached = pillarsCache.get(market);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const data = computePillars(market);
  if (data) pillarsCache.set(market, { data, expiresAt: Date.now() + 10 * 60_000 });
  return data;
}

/** Pillar scores from the scan data in memory (null with fewer than 5 scanned stocks). */
function computePillars(market: 'idx' | 'us'): MarketPillars | null {
  const assets = market === 'idx' ? IDX_UNIVERSE_STOCKS() : US_UNIVERSE;
  const inputs = stockInputs(crossSections[market], assets, market);
  if (inputs.length < 5) return null;
  return marketPillars(inputs, market, new Date().toISOString().slice(0, 7), true);
}

// ---- Serverless: results the cron tick computed from the saved scans --------------------------

type DerivedMarket = CrossMarket | 'crypto';
type CrossStatus = ReturnType<CrossSection<Asset>['status']>;

/** Saved by the tick under xs:<market>:derived (packed); pillars with their stocks as entries. */
interface SavedDerived {
  at: number;
  pillars: (Omit<MarketPillars, 'stocks'> & { stocks: Array<[string, StockPillars]> }) | null;
  valuation: { pe: number[]; pb: number[] } | null;
  validation: unknown;
}

/** Saved under xs:<market>:status (small): scan progress, when the results were computed. */
interface SavedStatus {
  status: CrossStatus | null;
  derivedAt: number;
  /** Symbols fetched since the results were computed. */
  fetchedSince: number;
}

const crossDerived: Partial<Record<DerivedMarket, { at: number; pillars: MarketPillars | null; valuation: SavedDerived['valuation'] }>> = {};
const crossStatusSaved: Partial<Record<DerivedMarket, SavedStatus>> = {};
const crossCheckedAt = new Map<DerivedMarket, number>();

function applyDerived(market: DerivedMarket, d: SavedDerived): void {
  crossDerived[market] = { at: d.at, pillars: d.pillars ? { ...d.pillars, stocks: new Map(d.pillars.stocks) } : null, valuation: d.valuation };
  const v = d.validation as { horizons?: Parameters<typeof storeValidation>[1] } | null;
  if (v?.horizons) {
    storeValidation(market, v.horizons);
    validationCache.set(market, { data: v, expiresAt: Number.POSITIVE_INFINITY });
  }
}

/** Serverless: reads the tick's status every 5 minutes and its results whenever they are newer. */
async function ensureCrossDerived(market: DerivedMarket): Promise<void> {
  if (!SERVERLESS || Date.now() - (crossCheckedAt.get(market) ?? 0) < 5 * 60_000) return;
  crossCheckedAt.set(market, Date.now());
  try {
    const st = await store.get<SavedStatus>(`xs:${market}:status`);
    if (!st) return;
    crossStatusSaved[market] = st;
    if (st.derivedAt && st.derivedAt !== crossDerived[market]?.at) {
      const d = await getPacked<SavedDerived>(store, `xs:${market}:derived`);
      if (d) applyDerived(market, d);
    }
  } catch (err) {
    console.warn(`[Cross] ${market} results unavailable:`, err instanceof Error ? err.message : err);
  }
}

/** Scan progress of a market (serverless: as the last tick saved it). */
function crossStatus(market: CrossMarket): CrossStatus {
  return (SERVERLESS ? crossStatusSaved[market]?.status : null) ?? crossSections[market].status();
}

/** Macro component from the cached Indonesia macro data (never waits for a fresh download). */
function macroComponent(asset: Asset) {
  if (!isMacroLinked(asset.group, asset.symbol)) return null;
  const macro = macroCache.entry?.data;
  if (!macro) {
    keepAlive(getIndonesiaMacro()).catch(() => {});
    return null;
  }
  const rate = macro.biRate.length ? [...macro.biRate].sort((a, b) => a.date.localeCompare(b.date)) : macro.series.find((x) => x.id === 'policyRate')?.points ?? [];
  const infl = macro.series.find((x) => x.id === 'inflationYoy')?.points ?? [];
  return macroSignal(asset.group, asset.symbol, rate, infl, new Date().toISOString().slice(0, 10));
}

/** Scheduled events that matter for an asset (corporate calendar from cache + FOMC). */
function catalystsFor(asset: Asset): Catalyst[] {
  const out: Catalyst[] = [];
  for (const e of calendarCache.get(asset.symbol)?.data ?? []) {
    if (e.type === 'earnings' || e.type === 'exDividend' || e.type === 'dividendPayment') out.push({ type: e.type, date: e.date });
  }
  const fomc = nextMeeting(new Date().toISOString().slice(0, 10));
  if (fomc) out.push({ type: 'fomc', date: fomc });
  return out;
}

async function computeSentimentV2(asset: Asset) {
  const derived = asset.group === 'idStock' ? 'idx' : asset.group === 'usStock' ? 'us' : asset.group === 'crypto' ? 'crypto' : null;
  if (derived) await ensureCrossDerived(derived);
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const bars = await recentHistoryFor(asset).catch(() => [] as DailyBar[]);
  // Medium and Long use closed daily bars only; the Short technicals take today's live price as a
  // provisional candle (owner's choice, 21 Oct 2026), so they move during the trading day
  const closes = bars.map((b) => b.close);
  const live = await livePriceForSentiment(asset);
  const shortBars = live ? withLiveBar(bars, asset, live) : bars;
  const liveBar = shortBars !== bars && shortBars.length ? { price: live!.price, at: live!.at, date: shortBars[shortBars.length - 1].date } : null;
  const yearBars = asset.group === 'crypto' ? 365 : 252;
  const market = asset.group === 'idStock' ? 'idx' : asset.group === 'usStock' ? 'us' : null;
  const mp = market ? currentPillars(market) : null;
  const sp = mp?.stocks.get(asset.symbol) ?? null;
  if (market && !sp) crossSections[market].touch();
  const tech = shortTechnical(shortBars.map((b) => b.close));
  const macro = macroComponent(asset);
  let deriv: number | null = null;
  if (asset.group === 'crypto' && asset.binanceFutures) {
    const f = fundingFor(asset.binanceFutures);
    deriv = derivativesScore({ fundingRate: f?.lastFundingRate ?? null });
  }
  if (asset.group === 'crypto') noteBinanceDemand();
  const news = newsByHorizon(driverNewsFor(asset), asset.group, asset.symbol, now);
  const lastBar = bars.length ? bars[bars.length - 1].date : null;
  const horizons = {} as Record<Horizon, HorizonScore & { cadenceReason: string | null; nextCatalyst: ReturnType<typeof nextCatalyst> }>;
  const vKey = market ?? (asset.group === 'crypto' ? 'crypto' : null);
  if (vKey && !validationCache.get(vKey)) runValidation(vKey as 'idx' | 'us' | 'crypto');
  const events = catalystsFor(asset);
  for (const h of HORIZONS) {
    const r = scoreHorizon(h, {
      group: asset.group,
      pillars: sp?.pillars ?? null,
      technicalShort: tech?.score ?? null,
      tsMomentum: tsMomentumScore(closes, yearBars),
      trend: trendScore(closes),
      news,
      macro: macro?.score ?? null,
      derivatives: deriv,
      binance: Boolean(asset.binanceSpot || asset.binanceFutures),
      macroLinked: isMacroLinked(asset.group, asset.symbol),
      validation: validationFor(market ?? (asset.group === 'crypto' ? 'crypto' : null), h),
      dates: {
        technical: liveBar?.date ?? lastBar,
        tsMomentum: lastBar,
        trend: lastBar,
        momentum: sp ? sp.raw.asOf : null,
        health: sp?.raw.statementsDate ?? null,
        quality: sp?.raw.statementsDate ?? null,
        macro: macro?.dataDate ?? null,
      },
    });
    // Cadence from the measured information decay when the back-test has run
    const vc = (validationCache.get(market ?? '')?.data as MarketValidation | undefined)?.cadence?.[h];
    horizons[h] = { ...r, cadence: vc?.cadence ?? r.cadence, cadenceReason: vc?.reason ?? null, nextCatalyst: nextCatalyst(events, h, today) };
  }
  return {
    symbol: asset.symbol,
    code: asset.code,
    group: asset.group,
    generatedAt: now,
    horizons,
    pillars: sp
      ? {
          scores: sp.pillars,
          dUp: sp.dUp,
          dDown: sp.dDown,
          distressWarning: sp.distressWarning,
          fairValue: sp.fairValue,
          hybridDiscount: sp.hybridDiscount,
          raw: sp.raw,
        }
      : null,
    market: mp
      ? {
          market: mp.market,
          n: mp.n,
          smallPeerGroup: mp.smallPeerGroup,
          liquidityThreshold: mp.liquidityThreshold,
          hybrid: mp.hybrid,
          hybridErrors: mp.hybridErrors,
        }
      : null,
    notApplicable: market ? null : 'no-statements',
    liveBar,
    technicalParts: tech?.parts ?? null,
    macro,
    freshness: {
      prices: lastBar,
      statements: sp?.raw.statementsDate ?? null,
      news: newsHub.lastPollAt || null,
      scans: market ? crossStatus(market) : null,
    },
    disclaimer: SENTIMENT_DISCLAIMER,
  };
}

/** Live price for the Short horizon's provisional candle: a cached quote, else one quick fetch (≤4 s). */
async function livePriceForSentiment(asset: Asset): Promise<{ price: number; at: number } | null> {
  const known = () => {
    const sweep = idxSweep.ticks.get(asset.symbol);
    return livePriceFor(asset) ?? (sweep && sweep.price > 0 ? { price: sweep.price, at: sweep.updatedAt } : null);
  };
  const have = known();
  if (have) return have;
  const fetching = asset.indodaxPair ? getIndodaxPrices() : getQuotesFor([asset]);
  await Promise.race([fetching.catch(() => null), new Promise((r) => setTimeout(r, 4000))]);
  return known();
}

/** Cached 2 minutes; fresh (the panel's "Refresh now") recomputes once the result is 20 s old. */
async function getSentimentV2(asset: Asset, fresh = false) {
  const key = asset.symbol;
  const cached = sentimentCache.get(key);
  const age = cached ? Date.now() - (cached.expiresAt - 2 * 60_000) : Infinity;
  if (cached && cached.expiresAt > Date.now() && !(fresh && age > 20_000)) return cached.data;
  const data = await computeSentimentV2(asset);
  sentimentCache.set(key, { data, expiresAt: Date.now() + 2 * 60_000 });
  return data;
}


// ---- Technical projections: statistical ranges, levels, pattern targets (stage 4) -------------

const projectionsCache = new Map<string, CacheEntry<unknown>>();

/** Horizons per asset class: stocks 1D/1W/1M/3M (daily bars); crypto 4h (4-hour bars) and 1D/1W/1M. */
const PROJECTION_HORIZONS = {
  default: [
    { id: '1D', bars: 1 },
    { id: '1W', bars: 5 },
    { id: '1M', bars: 21 },
    { id: '3M', bars: 63 },
  ],
  crypto: [
    { id: '1D', bars: 1 },
    { id: '1W', bars: 7 },
    { id: '1M', bars: 30 },
  ],
};

async function computeProjections(asset: Asset, fibonacci: boolean) {
  const crypto = asset.group === 'crypto';
  const yearBars = crypto ? 365 : 252;
  const [bars, candles] = await Promise.all([
    recentHistoryFor(asset).catch(() => [] as DailyBar[]),
    getHistoryCandles(asset, 'D').catch(() => [] as OhlcCandle[]),
  ]);
  const closes = bars.map((b) => b.close);
  // The last daily candle may still be open; ranges and levels use finished days
  const finished = candles.length > 1 ? candles.slice(0, -1) : candles;
  const price = livePriceFor(asset)?.price ?? closes[closes.length - 1] ?? null;
  const ranges: Array<{ id: string; limitedHistoryBars?: number } & (RangeBand | { unavailable: string })> = [];
  for (const h of crypto ? PROJECTION_HORIZONS.crypto : PROJECTION_HORIZONS.default) {
    const r = likelyRange(closes, h.bars, crypto ? 365 : 504);
    ranges.push(r ? { id: h.id, ...r } : { id: h.id, unavailable: `needs ${crypto ? 1 : 2} years of daily history` });
  }
  if (crypto) {
    // 4-hour range from the 4h candles available (Binance/Indodax give a few months; stated)
    const k4 = await getHistoryCandles(asset, '240').catch(() => [] as OhlcCandle[]);
    const c4 = k4.slice(0, -1).map((c) => c.close);
    const r4 = likelyRange(c4, 1, 500);
    ranges.unshift(r4 ? { id: '4h', ...r4, limitedHistoryBars: c4.length } : { id: '4h', unavailable: 'needs at least 500 four-hour candles' });
  }
  const sr = supportResistance(finished, { fibonacci, yearBars });
  const a = sr.atr ?? atrOf(finished);
  const vol = annualVol(closes, yearBars, 3, crypto);
  return {
    symbol: asset.symbol,
    currency: asset.currency,
    price,
    asOf: bars.length ? bars[bars.length - 1].date : null,
    ranges,
    atr: a,
    atrLevels: a && price ? [1, 2, 3].map((k) => ({ k, up: price + k * a, down: price - k * a })) : [],
    levels: sr.levels,
    nearest: price ? upsideDownside(sr.levels, price) : null,
    patterns: patternTargets(closes),
    volatility: vol,
    volatilityMethod: crypto ? 'EWMA (λ 0.94), annualized' : '3-year daily, annualized',
    lotSize: asset.group === 'idStock' ? 100 : 1,
    fibonacci,
    disclaimer: SENTIMENT_DISCLAIMER,
  };
}

async function getProjections(asset: Asset, fibonacci: boolean) {
  const key = `${asset.symbol}|${fibonacci ? 1 : 0}`;
  const cached = projectionsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const data = await computeProjections(asset, fibonacci);
  projectionsCache.set(key, { data, expiresAt: Date.now() + 10 * 60_000 });
  return data;
}


// ---- Validation of the sentiment scores (point-in-time back-tests, cache 24 h) -----------------

const validationCache = new Map<string, CacheEntry<unknown>>();
const validationRunning = new Set<string>();
/** When a run last found too little data (retry after 10 minutes). */
const validationNoData = new Map<string, number>();

function storeValidation(market: string, horizons: Partial<Record<Horizon, { meanIC: number | null; significant: boolean } | undefined>>): void {
  validationStore.set(
    market,
    Object.fromEntries(
      (Object.entries(horizons) as Array<[Horizon, { meanIC: number | null; significant: boolean } | undefined]>).map(([h, e]) => [
        h,
        e && e.meanIC !== null ? { ic: e.meanIC, significant: e.significant } : null,
      ])
    )
  );
}

/** Back-test of one market from the data in memory (also stores the IC per horizon); null = too little data. */
function computeValidation(market: 'idx' | 'us' | 'crypto'): unknown {
  let data: unknown = null;
  if (market === 'crypto') {
    const series = binanceUniverse()
      .map((p) => ({ symbol: p.symbol, closes: cachedClosedKlines(p.symbol, '1d').map((k) => k.close) }))
      .filter((s) => s.closes.length >= 300);
    const panel =
      series.length >= 20
        ? validatePanel(series, (c, h) =>
            scoreHorizon(h, { group: 'crypto', technicalShort: shortTechnical(c)?.score ?? null, tsMomentum: tsMomentumScore(c, 365), trend: trendScore(c) }).score
          )
        : null;
    if (panel) {
      storeValidation('crypto', panel);
      data = { market, generatedAt: Date.now(), pairs: series.length, horizons: panel, scope: ['Binance top-100 USDT pairs, closed daily candles (about 500 days); funding and news have no stored history.'] };
    }
  } else {
    const assets = market === 'idx' ? IDX_UNIVERSE_STOCKS() : US_UNIVERSE;
    const inputs = stockInputs(crossSections[market], assets, market);
    const lastMonth = new Date(new Date().setUTCDate(0)).toISOString().slice(0, 7);
    const v: MarketValidation | null = inputs.length >= 20 ? validateMarket(inputs, market, lastMonth) : null;
    if (v) {
      storeValidation(market, v.horizons);
      data = { ...v, stocks: inputs.length };
    }
  }
  return data;
}

function runValidation(market: 'idx' | 'us' | 'crypto'): void {
  // Serverless: the cron tick computes it from the saved scans (ensureCrossDerived reads it)
  if (SERVERLESS) return;
  if (validationRunning.has(market) || Date.now() - (validationNoData.get(market) ?? 0) < 10 * 60_000) return;
  validationRunning.add(market);
  setTimeout(() => {
    try {
      const data = computeValidation(market);
      if (data) validationCache.set(market, { data, expiresAt: Date.now() + 24 * 3600_000 });
      else validationNoData.set(market, Date.now());
    } catch (err) {
      console.warn(`[Validation] ${market} failed:`, err instanceof Error ? err.message : err);
    } finally {
      validationRunning.delete(market);
    }
  }, 50);
}

/** Ranking rows of a market for one horizon (stocks from the cross-section; crypto from Binance). */
function rankingsFor(market: 'idx' | 'us', h: Horizon) {
  const mp = currentPillars(market);
  if (!mp) return { rows: [], n: 0 };
  // Only the app's own stocks are listed; S&P 500 peers only shape the percentiles
  const rows = [...mp.stocks.values()].filter((sp) => getAssetBySymbol(sp.symbol)).map((sp) => {
    const asset = getAssetBySymbol(sp.symbol);
    const r = scoreHorizon(h, {
      group: asset?.group ?? 'idStock',
      pillars: sp.pillars,
      news: asset ? newsByHorizon(driverNewsFor(asset), asset.group, asset.symbol, Date.now()) : null,
      macroLinked: market === 'idx',
      macro: asset ? macroComponent(asset)?.score ?? null : null,
    });
    return {
      symbol: sp.symbol,
      code: asset?.code ?? sp.symbol,
      name: asset?.name ?? sp.symbol,
      industry: asset?.industry ?? null,
      score: r.score,
      label: r.label,
      confidence: r.confidence,
      coverage: r.coverage,
      pillars: { momentum: sp.pillars.momentum.score, health: sp.pillars.health.score, quality: sp.pillars.quality.score },
      distressWarning: sp.distressWarning,
    };
  });
  rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return { rows, n: mp.n };
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

everyMs(() => {
  const now = Date.now();
  if (now - calendarScan.lastDemandAt > 60 * 60_000) return;
  if (!calendarScan.running && now - calendarScan.finishedAt > CALENDAR_TTL_MS) runCalendarScan().catch(() => {});
}, 60_000);

// Serverless: the cron tick scans in steps and saves every stock's events; pages load them
const CALENDAR_STORE_KEY = 'calendar:idx';
let calendarLoadedAt = 0;

async function loadCalendarFromStore(force = false): Promise<void> {
  if (!force && Date.now() - calendarLoadedAt < 10 * 60_000) return;
  calendarLoadedAt = Date.now();
  try {
    const saved = await getPacked<Record<string, CacheEntry<CalendarEvent[]>>>(store, CALENDAR_STORE_KEY);
    for (const [sym, e] of Object.entries(saved ?? {})) {
      if (e && Array.isArray(e.data) && !((calendarCache.get(sym)?.expiresAt ?? 0) >= e.expiresAt)) calendarCache.set(sym, e);
    }
  } catch (err) {
    console.warn('[Calendar] could not load saved events:', err instanceof Error ? err.message : err);
  }
}

/** One serverless calendar step: stale stocks until the deadline, then everything is saved. */
async function calendarStep(until: number): Promise<{ fetched: number; pending: number }> {
  await loadCalendarFromStore(true);
  const stale = IDX_ALL.filter((a) => (calendarCache.get(a.symbol)?.expiresAt ?? 0) <= Date.now());
  let fetched = 0;
  await mapLimit(stale, 2, async (a) => {
    if (Date.now() >= until) return;
    await getCalendarFor(a).catch(() => []);
    fetched += 1;
    await new Promise((r) => setTimeout(r, 250));
  });
  if (fetched) {
    const out: Record<string, CacheEntry<CalendarEvent[]>> = {};
    for (const a of IDX_ALL) {
      const e = calendarCache.get(a.symbol);
      if (e) out[a.symbol] = e;
    }
    await setPacked(store, CALENDAR_STORE_KEY, out);
    calendarScan.finishedAt = Date.now();
  }
  return { fetched, pending: stale.length - fetched };
}

/** One serverless screener step (the scan itself stops at the deadline and saves its progress). */
async function screenerStep(until: number): Promise<{ pending: number }> {
  // Always the saved state first: another instance may have saved progress since
  screenerScan.loadedAt = 0;
  await loadScreenerFromStore();
  const stale = () => IDX_ALL.filter((a) => Date.now() - (screenerFund.get(a.symbol)?.fetchedAt ?? 0) > SCREENER_TTL_MS).length;
  if (stale() === 0) return { pending: 0 };
  screenerScan.lastDemandAt = Date.now();
  await runScreenerScan(until);
  return { pending: stale() };
}

/** Screener rows: prices from the IDX sweep + ratios from the statements scan. */
function idxScreenerRows(): ScreenerRow[] {
  return IDX_ALL.map((a) => {
    const t = idxSweep.ticks.get(a.symbol);
    const price = t && Number.isFinite(t.price) ? t.price : null;
    const fund = screenerFund.get(a.symbol);
    return {
      symbol: a.symbol,
      code: a.code.replace(/\.JK$/, ''),
      name: a.name,
      sector: a.sector ?? 'Other',
      board: a.board ?? 'Other',
      price,
      chg1d: t?.changePct24h ?? null,
      chg1w: t?.changePct7d ?? null,
      valueTraded: t?.valueTraded ?? null,
      marketCap: price !== null && a.supply ? price * a.supply : null,
      f: fund ? (fund.f ? rescaleForPrice(fund.f, fund.price, price) : null) : undefined,
      fetchedAt: fund?.fetchedAt ?? null,
    };
  });
}

// ---- IDX sector rotation (#/sectors): computed from the screener rows + macro drivers ----------

const SECTOR_TTL_MS = 10 * 60_000;
interface SectorRotationPayload extends SectorRotationResult {
  asOf: number;
  pricesAt: number | null;
  drivers: SectorDrivers;
  source: string;
}
const sectorCache: { entry: CacheEntry<SectorRotationPayload> | null } = { entry: null };

/** Live (1D/1W) and monthly drivers; each one is optional and missing data is simply left out. */
async function sectorDrivers(): Promise<SectorDrivers> {
  const drivers: SectorDrivers = { live: { d1: {}, w1: {} }, monthly: {} };
  const live: Array<[LiveDriver, string]> = [['oil', 'CL=F'], ['copper', 'HG=F'], ['natgas', 'NG=F'], ['usdIdr', 'USD/IDR'], ['nasdaq', '^NDX']];
  const ticks = await getYahooTicks().catch(() => ({}) as Record<string, PriceTick>);
  const put = (id: LiveDriver, t: PriceTick | undefined) => {
    if (!t || t.status === 'error') return;
    drivers.live.d1[id] = Number.isFinite(t.changePct24h) ? (t.changePct24h as number) : null;
    drivers.live.w1[id] = Number.isFinite(t.changePct7d) ? (t.changePct7d as number) : null;
  };
  for (const [id, sym] of live) put(id, ticks[sym]);
  const usdIdr = ticks['USD/IDR']?.price;
  put('gold', await getGoldTick(Number.isFinite(usdIdr) ? (usdIdr as number) : 0).catch(() => undefined));
  // Macro: the cached / saved result only — never wait long for a fresh computation
  const macro = await Promise.race([getIndonesiaMacro().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
  if (macro) {
    const series = (id: string) => macro.indicators?.find((x) => x.id === id)?.points ?? macro.series.find((x) => x.id === id)?.points;
    drivers.monthly = { coal: lastChangePct(series('coalAustralia')), nickel: lastChangePct(series('nickel')), palmOil: lastChangePct(series('palmOil')) };
    const bi = macro.biRate.length ? [...macro.biRate].sort((a, b) => a.date.localeCompare(b.date)) : [];
    // The latest decision that changed the rate (a hold keeps the earlier cut / hike as the news)
    const last = bi[bi.length - 1];
    let k = bi.length - 1;
    while (k > 0 && bi[k].value === bi[k - 1].value) k -= 1;
    if (last) drivers.biRate = { level: last.value, change: k > 0 ? Math.round((bi[k].value - bi[k - 1].value) * 100) / 100 : 0, date: bi[k].date.slice(0, 10) };
    const flow = series('foreignStockFlow');
    drivers.foreignStockFlow = flow?.length ? flow[flow.length - 1].value : null;
  }
  return drivers;
}

async function buildSectorRotation(): Promise<SectorRotationPayload> {
  const drivers = await sectorDrivers();
  const result = computeSectorRotation(idxScreenerRows(), drivers, wibDate(Date.now()));
  return { ...result, asOf: Date.now(), pricesAt: idxSweep.lastRunAt || null, drivers, source: 'Yahoo Finance (IDX prices); Bank Indonesia, World Bank (drivers)' };
}

// ---- IDX screener: slow scan of the statements of every listed stock (24 h) -----------------------

const SCREENER_TTL_MS = 24 * 3600_000;
const SCREENER_STORE_KEY = 'screener:fundamentals';
const screenerFund = new Map<string, { f: ScreenerFundamentals | null; fetchedAt: number; price: number | null }>();
const screenerScan = { running: null as Promise<void> | null, lastDemandAt: 0, startedAt: 0, finishedAt: 0, done: 0, loadedAt: 0 };

/** Ratios from the latest annual / trailing-12-month statements, valued at today's price. */
async function screenerFundamentalsFor(asset: Asset): Promise<{ f: ScreenerFundamentals | null; price: number | null }> {
  const raw = await rawStatementsFor(asset);
  const live = idxSweep.ticks.get(asset.symbol)?.price ?? yahooCache.get(asset.symbol)?.data.price;
  const price = typeof live === 'number' && live > 0 ? live : null;
  if (!raw) return { f: null, price };
  const fyEnd = fiscalYearEndMonth(raw.annual);
  const quarters = fillQuartersFromAnnual(raw.quarterly, raw.annual, fyEnd);
  const opts = { sameCurrency: !raw.currency || raw.currency === asset.currency, livePrice: price ?? undefined };
  const annual = buildStatementRows(fillMissingPeriods(fiscalYears(raw.annual, fyEnd)), fyEnd, opts);
  const quarterly = buildStatementRows(fillMissingPeriods(quarters), fyEnd, opts);
  const fund = await fundamentalsFor(asset).catch(() => null);
  const f = fund ? piotroski([...fund.years].sort((a, b) => a.fiscalYearEnd.localeCompare(b.fiscalYearEnd))) : null;
  return { f: fundamentalsFromRows(annual, quarterly, raw.currency || asset.currency, f), price };
}

async function loadScreenerFromStore(): Promise<void> {
  // Serverless: reloaded now and then, the cron tick keeps filling the saved data
  if (screenerScan.loadedAt && !(SERVERLESS && Date.now() - screenerScan.loadedAt > 10 * 60_000)) return;
  screenerScan.loadedAt = Date.now();
  try {
    const saved = await getPacked<Record<string, { f: ScreenerFundamentals | null; fetchedAt: number; price: number | null }>>(store, SCREENER_STORE_KEY);
    for (const [sym, v] of Object.entries(saved ?? {})) if (v && typeof v.fetchedAt === 'number') screenerFund.set(sym, v);
  } catch (err) {
    console.warn('[Screener] could not load saved data:', err instanceof Error ? err.message : err);
  }
}

/** Two stocks at a time with a pause; stocks fetched in the last 24 h are skipped; stops without viewers or at the deadline. */
function runScreenerScan(until = Number.POSITIVE_INFINITY): Promise<void> {
  if (screenerScan.running) return screenerScan.running;
  screenerScan.done = 0;
  screenerScan.startedAt = Date.now();
  screenerScan.running = (async () => {
    // A fresh price sweep first, so P/E and P/B use today's prices
    if (idxSweep.ticks.size === 0) await keepAlive(runIdxSweep()).catch(() => {});
    await mapLimit(IDX_ALL, 2, async (a) => {
      const prev = screenerFund.get(a.symbol);
      if (prev && Date.now() - prev.fetchedAt < SCREENER_TTL_MS) {
        screenerScan.done += 1;
        return;
      }
      if (Date.now() - screenerScan.lastDemandAt > 60 * 60_000 || Date.now() >= until) return; // nobody is looking any more
      try {
        const { f, price } = await screenerFundamentalsFor(a);
        // Nothing found may also be a failed request: try again after 2 hours instead of 24
        screenerFund.set(a.symbol, { f, price, fetchedAt: f ? Date.now() : Date.now() - SCREENER_TTL_MS + 2 * 3600_000 });
      } catch {
        // Left for the next scan
      }
      screenerScan.done += 1;
      // Save progress now and then so a restart does not start over
      if (screenerScan.done % 50 === 0) await setPacked(store, SCREENER_STORE_KEY, Object.fromEntries(screenerFund)).catch(() => {});
      await new Promise((r) => setTimeout(r, 300));
    });
    await setPacked(store, SCREENER_STORE_KEY, Object.fromEntries(screenerFund)).catch(() => {});
    screenerScan.finishedAt = Date.now();
  })().finally(() => {
    screenerScan.running = null;
  });
  return screenerScan.running;
}

everyMs(() => {
  const now = Date.now();
  if (now - screenerScan.lastDemandAt > 60 * 60_000 || screenerScan.running) return;
  const stale = IDX_ALL.some((a) => now - (screenerFund.get(a.symbol)?.fetchedAt ?? 0) > SCREENER_TTL_MS);
  if (stale) runScreenerScan().catch(() => {});
}, 5 * 60_000);

// ---- Indonesia macro (Bank Indonesia pages, FRED, World Bank) -----------------------------

const MACRO_TTL_MS = 6 * 3600_000;
const macroCache: { entry: CacheEntry<IndonesiaMacroPayload> | null; pending: Promise<IndonesiaMacroPayload> | null } = { entry: null, pending: null };

interface IndonesiaMacroPayload {
  series: MacroSeries[];
  /** Official BI-Rate decisions (latest first page of bi.go.id). */
  biRate: MacroPoint[];
  unavailable: Array<{ id?: string; label: string; reason: string }>;
  failed: string[];
  generatedAt: number;
  /** Stage 4: every indicator with category, direction, 10-year z-score and stale flag. */
  indicators: MacroIndicator[];
  pulse: PulseCategory[];
  /** Aggregate IDX valuation and breadth from the scanned cross-section (no history). */
  idxValuation: {
    medianPE: number | null;
    medianPB: number | null;
    earningsYield: number | null;
    eyMinusBiRate: number | null;
    advancers: number;
    decliners: number;
    unchanged: number;
    n: number;
  } | null;
  calendar: Array<{ type: 'fomc'; date: string }>;
  /** Whether the optional BPS key is configured (never its value). */
  bpsConfigured: boolean;
}

const FRED_URL = (id: string) => `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`;
const FRED_PAGE = (id: string) => `https://fred.stlouisfed.org/series/${id}`;

async function fetchText(url: string): Promise<string> {
  const res = await fetchWithTimeout(url, {}, 15_000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/**
 * FRED resets or stalls requests with a browser-like User-Agent (and with Node's default "node"),
 * but answers within about a second to a plain app User-Agent. Longer timeout and one retry,
 * because fredgraph.csv is sometimes slow from Cloud Run.
 */
const FRED_USER_AGENT = 'AssetRadar/1.0 (personal research; non-commercial)';
async function fetchFred(id: string): Promise<string> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(FRED_URL(id), { headers: { 'User-Agent': FRED_USER_AGENT, Accept: 'text/csv, */*' } }, 30_000);
      if (res.ok) return await res.text();
      lastError = new Error(`HTTP ${res.status}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw lastError instanceof Error ? lastError : new Error('FRED unavailable');
}

/**
 * OECD / BIS csv (the OECD answers 500 without an explicit Accept-Language). The OECD answers 429
 * to bursts, so its requests go one at a time with a pause, and a 429 waits and tries again.
 */
let statsQueue: Promise<unknown> = Promise.resolve();
async function fetchStatsCsv(url: string): Promise<string> {
  const once = async () => fetchWithTimeout(url, { headers: { 'User-Agent': FRED_USER_AGENT, Accept: 'text/csv', 'Accept-Language': 'en' } }, 25_000);
  const run = async (): Promise<string> => {
    let res = await once();
    for (let attempt = 0; res.status === 429 && attempt < 2; attempt++) {
      await new Promise((r) => setTimeout(r, 6000 * (attempt + 1)));
      res = await once();
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  };
  if (!url.startsWith('https://sdmx.oecd.org/')) return run();
  const job = statsQueue.then(run, run);
  statsQueue = job.then(
    () => new Promise((r) => setTimeout(r, 1200)),
    () => new Promise((r) => setTimeout(r, 1200))
  );
  return job;
}

/** World Bank Pink Sheet (monthly commodity prices; xlsx of ±600 KB, updated early each month). Cache 24 h. */
const pinkCache: { entry: CacheEntry<PinkSheet> | null } = { entry: null };
async function getPinkSheet(): Promise<PinkSheet> {
  if (pinkCache.entry && pinkCache.entry.expiresAt > Date.now()) return pinkCache.entry.data;
  const page = await fetchWithTimeout(PINK_SHEET_PAGE, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 15_000);
  if (!page.ok) throw new Error(`page HTTP ${page.status}`);
  const link = findPinkSheetLink(await page.text());
  if (!link) throw new Error('download link not found');
  const file = await fetchWithTimeout(link, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 30_000);
  if (!file.ok) throw new Error(`file HTTP ${file.status}`);
  const rows = readXlsxSheet(Buffer.from(await file.arrayBuffer()), 'Monthly Prices');
  if (!rows) throw new Error('"Monthly Prices" sheet not found');
  const data = parsePinkSheet(rows);
  if (!data.series.size) throw new Error('no commodity columns found');
  pinkCache.entry = { data, expiresAt: Date.now() + 24 * 3600_000 };
  return data;
}

/** Mining and plantation commodities shown monthly on the Radar (no free daily series exists). */
const RADAR_MONTHLY = ['nickel', 'tin', 'coalAustralia', 'palmOil', 'rubber'];
const MONTHLY_STORE_KEY = 'pink:radar';
let monthlyMemo: { data: { updated: string | null; rows: MonthlyCommodity[]; fetchedAt: number }; at: number } | null = null;

/** Latest Pink Sheet values for the Radar (memory, then the database, then the World Bank file; 24 h). */
async function getMonthlyCommodities(): Promise<{ updated: string | null; rows: MonthlyCommodity[]; fetchedAt: number }> {
  if (monthlyMemo && Date.now() - monthlyMemo.at < 3600_000) return monthlyMemo.data;
  const saved = await store.get<{ updated: string | null; rows: MonthlyCommodity[]; fetchedAt: number }>(MONTHLY_STORE_KEY).catch(() => null);
  if (saved?.rows?.length && Date.now() - saved.fetchedAt < 24 * 3600_000) {
    monthlyMemo = { data: saved, at: Date.now() };
    return saved;
  }
  try {
    const sheet = await getPinkSheet();
    const data = { updated: sheet.updated, rows: monthlyCommodities(sheet, RADAR_MONTHLY), fetchedAt: Date.now() };
    if (data.rows.length) await store.set(MONTHLY_STORE_KEY, data).catch(() => {});
    monthlyMemo = { data, at: Date.now() };
    return data;
  } catch (err) {
    // An older saved copy beats nothing (the file is monthly anyway)
    if (saved?.rows?.length) return saved;
    throw err;
  }
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
  const fred = (id: string) => get(id, async () => parseFredCsv(await fetchFred(id)), [] as MacroPoint[]);
  // FRED does not answer from Vercel's servers: the same data straight from the OECD / BIS, FRED only
  // as a fallback on hosts that reach it (never on serverless, where it only times out)
  const stats = (id: string, url: string, fredId?: string) =>
    get(
      id,
      async () => {
        try {
          const pts = parseOecdCsv(await fetchStatsCsv(url));
          if (pts.length) return pts;
          throw new Error('no observations');
        } catch (err) {
          if (!fredId || SERVERLESS) throw err;
          return parseFredCsv(await fetchFred(fredId));
        }
      },
      [] as MacroPoint[]
    );
  const oecd = (id: string, def: OecdSeriesDef, fredId?: string) => stats(id, oecdUrl(def, '2014-01'), fredId);
  const wb = (id: string) =>
    get(id, async () => parseWorldBank(JSON.parse(await fetchText(`https://api.worldbank.org/v2/country/IDN/indicator/${id}?format=json&per_page=60`))), [] as MacroPoint[]);
  const [biRate, biInflation, interbank, cpiYoy, cpiIndex, gdp, reserves, trade, usdIdr, wbInfl, wbGdp, wbReserves] = await Promise.all([
    get('bi-rate', async () => parseBiTable(await fetchText('https://www.bi.go.id/en/statistik/indikator/bi-rate.aspx')), [] as MacroPoint[]),
    get('bi-inflation', async () => parseBiTable(await fetchText('https://www.bi.go.id/en/statistik/indikator/data-inflasi.aspx')), [] as MacroPoint[]),
    oecd('oecd-interbank', OECD_SERIES.interbank, 'IRSTCI01IDM156N'),
    oecd('oecd-cpi-yoy', OECD_SERIES.cpiYoy, 'CPALTT01IDM659N'),
    oecd('oecd-cpi-index', OECD_SERIES.cpiIndex, 'IDNCPIALLMINMEI'),
    oecd('oecd-gdp', OECD_SERIES.gdpYoy, 'IDNGDPRQPSMEI'),
    // Monthly reserves are IMF data (FRED, IMF block Vercel): FRED where it answers, else annual World Bank
    SERVERLESS ? Promise.resolve([] as MacroPoint[]) : fred('TRESEGIDM052N'),
    oecd('oecd-trade', OECD_SERIES.tradeBalance, 'XTNTVA01IDM667S'),
    oecd('oecd-usdidr', OECD_SERIES.usdIdr, 'CCUSMA02IDM618N'),
    wb('FP.CPI.TOTL.ZG'),
    wb('NY.GDP.MKTP.KD.ZG'),
    wb('FI.RES.XGLD.CD'),
  ]);
  const since = (pts: MacroPoint[], from = '2014-01-01') => pts.filter((p) => p.date >= from);
  const series: MacroSeries[] = [
    {
      id: 'policyRate',
      label: 'Interbank overnight rate (follows the BI-Rate)',
      unit: '%',
      frequency: 'monthly',
      source: 'OECD',
      sourceUrl: OECD_EXPLORER,
      points: since(interbank),
      note: 'Monthly average of the overnight interbank rate, which tracks Bank Indonesia\'s policy rate.',
    },
    {
      id: 'inflationYoy',
      label: 'Inflation, CPI year-on-year',
      unit: '%',
      frequency: 'monthly',
      source: 'OECD; latest months from Bank Indonesia',
      sourceUrl: 'https://www.bi.go.id/en/statistik/indikator/data-inflasi.aspx',
      points: since(mergeSeries(cpiYoy, biInflation)),
      note: 'OECD monthly CPI, completed with the latest months listed on bi.go.id.',
    },
    {
      id: 'inflationMom',
      label: 'Inflation, CPI month-on-month',
      unit: '%',
      frequency: 'monthly',
      source: 'OECD',
      sourceUrl: OECD_EXPLORER,
      points: since(periodChange(cpiIndex)),
      note: 'Computed from the OECD CPI index.',
    },
    { id: 'gdpYoy', label: 'Real GDP growth, year-on-year', unit: '%', frequency: 'quarterly', source: 'OECD', sourceUrl: OECD_EXPLORER, points: since(gdp) },
    reserves.length
      ? {
          id: 'reserves',
          label: 'FX reserves (excluding gold)',
          unit: 'US$ bn',
          frequency: 'monthly',
          source: 'IMF via FRED',
          sourceUrl: FRED_PAGE('TRESEGIDM052N'),
          points: since(reserves.map((p) => ({ date: p.date, value: p.value / 1000 }))),
        }
      : {
          id: 'reserves',
          label: 'FX reserves (excluding gold), annual',
          unit: 'US$ bn',
          frequency: 'annual',
          source: 'World Bank',
          sourceUrl: 'https://data.worldbank.org/indicator/FI.RES.XGLD.CD?locations=ID',
          points: since(wbReserves.map((p) => ({ date: p.date, value: p.value / 1e9 })), '2000-01-01'),
        },
    {
      id: 'tradeBalance',
      label: 'Trade balance (seasonally adjusted)',
      unit: 'US$ bn',
      frequency: 'monthly',
      source: 'OECD',
      sourceUrl: OECD_EXPLORER,
      points: since(trade.map((p) => ({ date: p.date, value: p.value / 1e9 }))),
    },
    { id: 'usdIdr', label: 'USD/IDR (monthly average)', unit: 'Rp', frequency: 'monthly', source: 'OECD', sourceUrl: OECD_EXPLORER, points: since(usdIdr) },
    { id: 'inflationAnnual', label: 'Inflation, annual', unit: '%', frequency: 'annual', source: 'World Bank', sourceUrl: 'https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG?locations=ID', points: since(wbInfl, '2000-01-01') },
    { id: 'gdpAnnual', label: 'GDP growth, annual', unit: '%', frequency: 'annual', source: 'World Bank', sourceUrl: 'https://data.worldbank.org/indicator/NY.GDP.MKTP.KD.ZG?locations=ID', points: since(wbGdp, '2000-01-01') },
  ].filter((x) => x.points.length > 0) as MacroSeries[];
  // ---- Stage 4 additions: more FRED series, Yahoo monthly markets, optional BPS ----
  const ym = (sym: string) => get(sym, async () => monthlyPoints(await fetchYahooMonthly(sym)), [] as MacroPoint[]);
  const [fedFunds, exportsS, importsS, currentAccount, reer, govDebt, credit, house, confidence] = await Promise.all([
    // US overnight rate (effective fed funds, monthly) stands in for the target upper bound
    oecd('oecd-us-rate', OECD_SERIES.usCallRate, 'DFEDTARU'),
    oecd('oecd-exports', OECD_SERIES.exports, 'XTEXVA01IDM667S'),
    oecd('oecd-imports', OECD_SERIES.imports, 'XTIMVA01IDM667S'),
    oecd('oecd-current-account', OECD_SERIES.currentAccount, 'IDNB6BLTT02STSAQ'),
    oecd('oecd-reer', OECD_SERIES.reer, 'CCRETT01IDM661N'),
    SERVERLESS ? Promise.resolve([] as MacroPoint[]) : fred('GGGDTAIDA188N'),
    stats('bis-credit', bisUrl(BIS_SERIES.privateCredit, '2014'), 'CRDQIDAPABIS'),
    stats('bis-property', bisUrl(BIS_SERIES.housePrices, '2014'), 'QIDN628BIS'),
    oecd('oecd-confidence', OECD_SERIES.confidence, 'CSCICP03IDM665S'),
  ]);
  const pink = await get('pinksheet', getPinkSheet, { updated: null, series: new Map() } as PinkSheet);
  const yahooIds = ['MTF=F', 'HG=F', 'ALI=F', 'BZ=F', 'GC=F', '^VIX', '000001.SS', '^HSI', 'EIDO', '^JKLQ45', 'DX-Y.NYB', '^TNX', 'THBIDR=X', 'PHPIDR=X', 'INRIDR=X', 'MYRIDR=X', 'CNYIDR=X', 'SGDIDR=X'];
  const yahoo = new Map<string, MacroPoint[]>();
  for (let i = 0; i < yahooIds.length; i += 6) {
    const batch = yahooIds.slice(i, i + 6);
    const got = await Promise.all(batch.map(ym));
    batch.forEach((id, k) => yahoo.set(id, got[k]));
  }
  // Fed funds (daily) → last value per month
  const fedMonthly = monthlyPoints(new Map(fedFunds.map((p) => [p.date.slice(0, 7), p.value] as [string, number])));
  const biPath = biRate.length ? [...biRate].sort((x, y) => x.date.localeCompare(y.date)) : interbank;

  // BPS (optional key): core, administered and volatile-food inflation are not dynamic-table
  // variables but static table 908 (month-on-month since 2009); year-on-year is compounded from it.
  // The key is only sent to webapi.bps.go.id and never logged or returned.
  const bpsKey = process.env.BPS_API_KEY?.trim();
  const bpsTable = bpsKey
    ? await get(
        'bps-inflation-908',
        async () => {
          const res = JSON.parse(
            await fetchText(`https://webapi.bps.go.id/v1/api/view/domain/0000/model/statictable/lang/ind/id/${BPS_INFLATION_TABLE_ID}/key/${bpsKey}`)
          );
          const t = parseBpsInflationTable(String(res?.data?.table ?? ''));
          if (!t.core.length) throw new Error('table 908 has no rows');
          return t;
        },
        null
      )
    : null;
  const core = bpsTable ? yoyFromMonthly(bpsTable.core) : [];
  const administered = bpsTable ? yoyFromMonthly(bpsTable.administered) : [];
  const volatile = bpsTable ? yoyFromMonthly(bpsTable.volatile) : [];

  const today = new Date().toISOString().slice(0, 10);
  const ser = (id: string, label: string, unit: string, frequency: MacroSeries['frequency'], source: string, sourceUrl: string, points: MacroPoint[], note?: string): MacroSeries => ({
    id,
    label,
    unit,
    frequency,
    source,
    sourceUrl,
    points: since(points, '2014-01-01'),
    note,
  });
  const yUrl = (sym: string) => `https://finance.yahoo.com/quote/${encodeURIComponent(sym)}`;
  const byId = new Map(series.map((x) => [x.id, x]));
  const ind: MacroIndicator[] = [];
  const add = (x: MacroSeries | undefined, category: MacroCategory, higherIsBetter: boolean | null, requiresKey?: string) => {
    if (x && (x.points.length || requiresKey)) ind.push(toIndicator(x, category, higherIsBetter, today, requiresKey));
  };
  const BPS_URL = 'https://www.bps.go.id/id/statistics-table/1/OTA4/inflasi-umum--inti--harga-diatur-pemerintah--dan-bergejolak-nasional.html';
  // Monetary & rates
  if (biRate.length) add(ser('biRate', 'BI-Rate', '%', 'decision', 'Bank Indonesia', 'https://www.bi.go.id/en/statistik/indikator/bi-rate.aspx', biPath), 'monetary', false);
  add(byId.get('policyRate'), 'monetary', false);
  add(ser('biFedSpread', 'BI-Rate minus US overnight rate (effective fed funds)', 'pts', 'monthly', 'Bank Indonesia, OECD', OECD_EXPLORER, spreadSeries(biPath, fedMonthly)), 'monetary', true);
  // Inflation & prices
  add(byId.get('inflationYoy'), 'inflation', false);
  add(byId.get('inflationMom'), 'inflation', false);
  const bpsNote = 'Year-on-year, compounded from the BPS month-on-month figures (static table 908).';
  add(ser('coreInflation', 'Core inflation, year-on-year', '%', 'monthly', 'BPS', BPS_URL, core, bpsNote), 'inflation', false, bpsKey ? undefined : 'BPS_API_KEY');
  add(ser('administeredInflation', 'Administered-price inflation, year-on-year', '%', 'monthly', 'BPS', BPS_URL, administered, bpsNote), 'inflation', false, bpsKey ? undefined : 'BPS_API_KEY');
  add(ser('volatileFoodInflation', 'Volatile-food inflation, year-on-year', '%', 'monthly', 'BPS', BPS_URL, volatile, bpsNote), 'inflation', false, bpsKey ? undefined : 'BPS_API_KEY');
  // Growth & activity
  add(byId.get('gdpYoy'), 'growth', true);
  add(byId.get('gdpAnnual'), 'growth', true);
  add(ser('consumerConfidence', 'Consumer confidence (OECD)', 'index', 'monthly', 'OECD', OECD_EXPLORER, confidence), 'growth', true);
  // External
  add(byId.get('reserves'), 'external', true);
  add(byId.get('tradeBalance'), 'external', true);
  add(ser('exports', 'Exports (seasonally adjusted)', 'US$ bn', 'monthly', 'OECD', OECD_EXPLORER, exportsS.map((p) => ({ date: p.date, value: p.value / 1e9 }))), 'external', true);
  add(ser('imports', 'Imports (seasonally adjusted)', 'US$ bn', 'monthly', 'OECD', OECD_EXPLORER, importsS.map((p) => ({ date: p.date, value: p.value / 1e9 }))), 'external', null);
  add(ser('currentAccount', 'Current account, % of GDP', '%', 'quarterly', 'OECD', OECD_EXPLORER, currentAccount), 'external', true);
  add(ser('reer', 'Real effective exchange rate', 'index', 'monthly', 'OECD', OECD_EXPLORER, reer), 'external', null);
  add(byId.get('usdIdr'), 'external', false);
  for (const [sym, label] of [['THBIDR=X', 'THB/IDR'], ['PHPIDR=X', 'PHP/IDR'], ['INRIDR=X', 'INR/IDR'], ['MYRIDR=X', 'MYR/IDR'], ['CNYIDR=X', 'CNY/IDR'], ['SGDIDR=X', 'SGD/IDR']] as const) {
    add(ser(`fx-${label.slice(0, 3).toLowerCase()}`, `${label} (monthly)`, 'Rp', 'monthly', 'Yahoo Finance', yUrl(sym), yahoo.get(sym) ?? []), 'external', null);
  }
  add(ser('eido', 'iShares MSCI Indonesia ETF (EIDO), foreign-flow proxy', 'US$', 'monthly', 'Yahoo Finance', yUrl('EIDO'), yahoo.get('EIDO') ?? []), 'external', true);
  // Extra indicators: OECD leading indicator and business confidence (monthly), World Bank (annual)
  const wbUrl = (code: string) => `https://data.worldbank.org/indicator/${code}?locations=ID`;
  const [leading, business, wbGovDebt, ...wbExtra] = await Promise.all([
    oecd('oecd-leading', OECD_SERIES.leading),
    oecd('oecd-business', OECD_SERIES.business),
    govDebt.length ? Promise.resolve([] as MacroPoint[]) : wb(WB_GOV_DEBT),
    ...WB_EXTRA.map((x) => wb(x.code)),
  ]);
  add(ser('leadingIndicator', 'Composite leading indicator (OECD)', 'index', 'monthly', 'OECD', OECD_EXPLORER, leading), 'growth', true);
  add(ser('businessConfidence', 'Business confidence (OECD)', 'index', 'monthly', 'OECD', OECD_EXPLORER, business), 'growth', true);
  WB_EXTRA.forEach((x, i) => {
    const pts = wbExtra[i].map((p) => ({ date: p.date, value: x.scale ? p.value / x.scale : p.value }));
    add(ser(x.id, x.label, x.unit, 'annual', 'World Bank', wbUrl(x.code), pts), x.category, x.higherIsBetter);
  });
  // Foreign funds: Bank Indonesia SEKI tables (old .xls), one download per table
  const sekiTables = [...new Set(SEKI_FLOWS.map((x) => x.table))];
  const sekiRows = await Promise.all(
    sekiTables.map((table) =>
      get(
        `seki-${table}`,
        async () => {
          const res = await fetchWithTimeout(`https://www.bi.go.id/SEKI/tabel/${table}.xls`, { headers: { 'User-Agent': FRED_USER_AGENT } }, 30_000);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const sheet = readXls(Buffer.from(await res.arrayBuffer())).at(-1);
          if (!sheet) throw new Error('no sheet');
          return sheet.rows;
        },
        [] as Array<Array<string | number | null>>
      )
    )
  );
  for (const x of SEKI_FLOWS) {
    const rows = sekiRows[sekiTables.indexOf(x.table)];
    const pts = rows.length ? sekiSeries(rows, x.path, 0.001) : [];
    if (rows.length && !pts.length) failed.push(`seki-${x.id}`);
    const note = x.table === 'TABEL5_39' ? 'Value at the end of the quarter, US$ bn; it also moves with prices and the rupiah.' : 'Net amount in the quarter, US$ bn: above 0 = foreigners bought / brought money in, below 0 = sold / took money out.';
    add(ser(x.id, x.label, 'US$ bn', 'quarterly', 'Bank Indonesia (SEKI)', SEKI_URL, pts, note), 'flows', x.higherIsBetter);
  }
  // Fiscal
  if (govDebt.length) add(ser('govDebt', 'Government debt, % of GDP', '%', 'annual', 'IMF via FRED', FRED_PAGE('GGGDTAIDA188N'), govDebt), 'fiscal', false);
  else add(ser('govDebt', 'Central government debt, % of GDP', '%', 'annual', 'World Bank', wbUrl(WB_GOV_DEBT), wbGovDebt), 'fiscal', false);
  // Financial
  add(ser('privateCredit', 'Credit to the private non-financial sector, % of GDP', '%', 'quarterly', 'BIS', BIS_EXPLORER, credit), 'financial', true);
  add(ser('housePrices', 'Residential property prices (real)', 'index', 'quarterly', 'BIS', BIS_EXPLORER, house), 'financial', null);
  add(ser('lq45', 'LQ45 index', 'pts', 'monthly', 'Yahoo Finance', yUrl('^JKLQ45'), yahoo.get('^JKLQ45') ?? []), 'financial', true);
  // Commodities important for Indonesia (exporter of coal, copper, aluminium; net oil importer)
  add(ser('coal', 'Coal, API2 Rotterdam futures (proxy)', 'US$/t', 'monthly', 'Yahoo Finance', yUrl('MTF=F'), yahoo.get('MTF=F') ?? []), 'commodities', true);
  add(ser('copper', 'Copper futures', 'US$/lb', 'monthly', 'Yahoo Finance', yUrl('HG=F'), yahoo.get('HG=F') ?? []), 'commodities', true);
  add(ser('aluminium', 'Aluminium futures', 'US$/t', 'monthly', 'Yahoo Finance', yUrl('ALI=F'), yahoo.get('ALI=F') ?? []), 'commodities', true);
  add(ser('brent', 'Brent crude oil', 'US$/bbl', 'monthly', 'Yahoo Finance', yUrl('BZ=F'), yahoo.get('BZ=F') ?? []), 'commodities', false);
  add(ser('goldMonthly', 'Gold futures', 'US$/oz', 'monthly', 'Yahoo Finance', yUrl('GC=F'), yahoo.get('GC=F') ?? []), 'commodities', null);
  // World Bank Pink Sheet (monthly averages): CPO, Newcastle coal, nickel, tin, rubber, cocoa, coffee, rice
  for (const def of PINK_SERIES) {
    const pts = pink.series.get(def.id);
    if (pts?.length) {
      add(
        ser(def.id, def.label, def.unit, 'monthly', 'World Bank Pink Sheet', PINK_SHEET_PAGE, pts),
        'commodities',
        def.higherIsBetter
      );
    }
  }
  // Global
  add(ser('fedFunds', 'Fed funds target (upper bound)', '%', 'monthly', 'FRED', FRED_PAGE('DFEDTARU'), fedMonthly), 'global', false);
  add(ser('ust10', 'US 10-year Treasury yield', '%', 'monthly', 'Yahoo Finance', yUrl('^TNX'), yahoo.get('^TNX') ?? []), 'global', false);
  add(ser('dxy', 'US dollar index', 'pts', 'monthly', 'Yahoo Finance', yUrl('DX-Y.NYB'), yahoo.get('DX-Y.NYB') ?? []), 'global', false);
  add(ser('vix', 'VIX (US equity volatility)', 'pts', 'monthly', 'Yahoo Finance', yUrl('^VIX'), yahoo.get('^VIX') ?? []), 'global', false);
  add(ser('sse', 'China SSE Composite', 'pts', 'monthly', 'Yahoo Finance', yUrl('000001.SS'), yahoo.get('000001.SS') ?? []), 'global', true);
  add(ser('hsi', 'Hang Seng index', 'pts', 'monthly', 'Yahoo Finance', yUrl('^HSI'), yahoo.get('^HSI') ?? []), 'global', true);

  const fomc = nextMeeting(today);
  return {
    series,
    biRate,
    unavailable: [
      { id: 'sbn', label: '10-year government bond (SBN) yield', reason: 'No free daily yield source; the retail SBN series and their coupons are shown at the top of this page.' },
      { id: 'pmi', label: 'Manufacturing PMI', reason: 'PMI data is licensed (S&P Global) and not free.' },
      { id: 'indonia', label: 'IndONIA / JIBOR, JISDOR', reason: 'bi.go.id pages not yet parsed reliably; to be checked from the laptop.' },
      { id: 'food', label: 'Daily food prices (Badan Pangan)', reason: 'The official data endpoint could not be confirmed from the server.' },
      { id: 'debt', label: 'External debt, budget deficit, M2', reason: 'Only PDF/xls releases or series that stopped (FRED M2 ends 2018).' },
      { id: 'sales', label: 'Car, motorcycle and cement sales', reason: 'No free API (Gaikindo, AISI, ASI).' },
      { id: 'calendar', label: 'BI board meeting and BPS release calendar', reason: 'Published as documents, not data; the FOMC date is shown instead.' },
    ],
    failed,
    generatedAt: Date.now(),
    indicators: ind,
    pulse: macroPulse(ind),
    idxValuation: null,
    calendar: fomc ? [{ type: 'fomc', date: fomc }] : [],
    bpsConfigured: Boolean(bpsKey),
  };
}


/** P/E and P/B of every scanned IDX stock (latest annual statements, latest monthly close). */
function idxValuationLists(): { pe: number[]; pb: number[] } {
  const pe: number[] = [];
  const pb: number[] = [];
  for (const a of ALL_ASSETS) {
    if (a.group !== 'idStock') continue;
    const monthly = crossSections.idx.monthlyOf(a.symbol);
    const st = crossSections.idx.statementsOf(a.symbol);
    const last = st?.annual.filter((p) => p.months === 12).at(-1);
    const price = monthly?.at(-1)?.close;
    if (!last || !price) continue;
    const shares = last.values.shares ?? a.supply;
    const eps = last.values.eps ?? (last.values.netIncome !== undefined && shares ? last.values.netIncome / shares : undefined);
    if (eps !== undefined && eps > 0) pe.push(price / eps);
    if (last.values.equity !== undefined && shares && last.values.equity > 0) pb.push((price * shares) / last.values.equity);
  }
  return { pe, pb };
}

/** Median P/E and P/B of the scanned IDX stocks, earnings yield vs the BI-Rate, and today's breadth. */
function idxValuation(): IndonesiaMacroPayload['idxValuation'] {
  const { pe, pb } = SERVERLESS ? crossDerived.idx?.valuation ?? { pe: [], pb: [] } : idxValuationLists();
  let advancers = 0;
  let decliners = 0;
  let unchanged = 0;
  for (const t of idxSweep.ticks.values()) {
    const c = t.changePct24h;
    if (c === undefined || !Number.isFinite(c)) continue;
    if (c > 0) advancers++;
    else if (c < 0) decliners++;
    else unchanged++;
  }
  if (pe.length < 20 && advancers + decliners + unchanged === 0) return null;
  const med = (x: number[]) => {
    const v = [...x].sort((a, b) => a - b);
    return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null;
  };
  const mPE = pe.length >= 20 ? med(pe) : null;
  const bi = macroCache.entry?.data.biRate.at(-1)?.value ?? null;
  const ey = mPE ? 100 / mPE : null;
  return {
    medianPE: mPE,
    medianPB: pb.length >= 20 ? med(pb) : null,
    earningsYield: ey,
    eyMinusBiRate: ey !== null && bi !== null ? ey - bi : null,
    advancers,
    decliners,
    unchanged,
    n: pe.length,
  };
}

// Versioned: a new set of indicators must not be served from an older saved result
const MACRO_STORE_KEY = 'macro:indonesia:v3';

async function getIndonesiaMacro(): Promise<IndonesiaMacroPayload> {
  if (macroCache.entry && macroCache.entry.expiresAt > Date.now()) return macroCache.entry.data;
  if (!macroCache.entry && SERVERLESS) {
    // A cold serverless instance starts from the last saved result (the OECD limits request bursts)
    const saved = await getPacked<IndonesiaMacroPayload>(store, MACRO_STORE_KEY).catch(() => null);
    const ttl = saved?.failed?.length ? 30 * 60_000 : MACRO_TTL_MS;
    // A result saved before the BPS key was added (or removed) is recomputed
    const sameKeys = saved?.bpsConfigured === Boolean(process.env.BPS_API_KEY?.trim());
    if (saved?.generatedAt && Date.now() - saved.generatedAt < ttl && saved.series?.length && sameKeys) {
      macroCache.entry = { data: saved, expiresAt: saved.generatedAt + ttl };
      return saved;
    }
  }
  if (!macroCache.pending) {
    macroCache.pending = computeIndonesiaMacro()
      .then(async (data) => {
        macroCache.entry = { data, expiresAt: Date.now() + (data.failed.length ? 30 * 60_000 : MACRO_TTL_MS) };
        if (SERVERLESS && data.series.length) await setPacked(store, MACRO_STORE_KEY, data).catch(() => {});
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

  // The AI screen covers the assets flagged `ai` (major markets with long, clean daily data)
  const candidates = ASSETS.filter((a) => a.ai && (a.indodaxPair || a.yahooSymbol));
  const outlooks = await mapLimit(candidates, 6, async (asset): Promise<AssetOutlook | null> => {
    try {
      // The model is fitted and tested on the last 10 years (full history is used for charts,
      // Compare, Backtest and the stored daily snapshots; older data would make the walk-forward
      // retraining too slow for the server and mostly reflect other market regimes)
      const bars = withLiveBar(await dailyHistoryFor(asset), asset).slice(-AI_MODEL_MAX_BARS);
      const dates = bars.map((b) => b.date);
      const tbillAligned = alignByDate(dates, tbillBars);
      const macro = {
        tbill: tbillAligned,
        yield10y: alignByDate(dates, yieldBars),
        dollar: asset.code === 'DXY' ? dates.map(() => null) : alignByDate(dates, dollarBars),
        fedStance: fedStanceSeries(dates, meetings, tbillAligned),
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
  let cached = aiOutlookCache.get(horizon);
  if (!cached && SERVERLESS) {
    // A cold serverless instance answers with the last saved result (≤24 h) and refreshes it
    const saved = await getPacked<AiOutlookPayload>(store, `ai:outlook:${horizon}`).catch(() => null);
    // A result saved before the model arena existed is recomputed instead
    if (saved?.generatedAt && Date.now() - saved.generatedAt < 24 * 3600_000 && saved.assets?.some((a) => a.arena)) {
      cached = { data: saved, expiresAt: saved.generatedAt + AI_OUTLOOK_TTL_MS };
      aiOutlookCache.set(horizon, cached);
    }
  }
  const refresh = () => {
    if (!aiComputing.has(horizon)) {
      const job = computeAiOutlook(horizon)
        .then(async (data) => {
          aiOutlookCache.set(horizon, { data, expiresAt: Date.now() + AI_OUTLOOK_TTL_MS });
          if (SERVERLESS) await setPacked(store, `ai:outlook:${horizon}`, data).catch(() => {});
          return data;
        })
        .finally(() => aiComputing.delete(horizon));
      aiComputing.set(horizon, keepAlive(job));
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
    const response = await geminiGenerate({ tag: 'advisor', timeoutMs: 12_000, contents: prompt, config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } });
    const text = response?.text;
    const data = text ? { text, aiPowered: true } : fallback;
    aiSummaryCache.set(key, { data, expiresAt: Date.now() + AI_OUTLOOK_TTL_MS });
    return data;
  } catch (err) {
    console.warn('[AI] Gemini summary failed:', err instanceof Error ? err.message : err);
    return fallback;
  }
}

// ---- Durable storage, owner login and the daily server jobs -------------------------------------

const store = createStore();
const ownerAuth = createOwnerAuth();
const FORWARD_PREFIX = 'forward:';
/** Model arena: every model's daily prediction per horizon (arena:YYYY-MM, packed). */
const ARENA_PREFIX = 'arena:';
const FORWARD_TIME = '16:15'; // WIB, after the IDX close

/** Last run date (WIB) of each daily job; persisted so a restart does not repeat a job. */
const jobs = {
  state: { forward: null as string | null, brief: null as string | null } as Record<string, string | null>,
  loaded: false,
  running: new Map<string, Promise<unknown>>(),
  retryAfter: new Map<string, number>(),
};

async function loadJobState(): Promise<void> {
  // Serverless: another instance may have run a job since; the state is one small row
  if (jobs.loaded && !SERVERLESS) return;
  try {
    const saved = await store.get<Record<string, string | null>>('jobs:state');
    if (saved) Object.assign(jobs.state, saved);
    jobs.loaded = true;
  } catch (err) {
    console.warn('[Jobs] state load failed:', err instanceof Error ? err.message : err);
  }
}

async function markJobDone(name: string, date: string): Promise<void> {
  jobs.state[name] = date;
  await store.set('jobs:state', jobs.state).catch((err) => console.warn('[Jobs] state save failed:', err instanceof Error ? err.message : err));
}

/** Runs a job once at a time; failures wait 30 minutes before the next automatic attempt. */
function runJob<T>(name: string, job: () => Promise<T>): Promise<T> {
  const running = jobs.running.get(name) as Promise<T> | undefined;
  if (running) return running;
  const p = job()
    .catch((err) => {
      jobs.retryAfter.set(name, Date.now() + 30 * 60_000);
      console.warn(`[Jobs] ${name} failed:`, err instanceof Error ? err.message : err);
      throw err;
    })
    .finally(() => jobs.running.delete(name));
  jobs.running.set(name, p);
  return p;
}

async function loadArenaMonths(): Promise<Array<{ key: string; log: ArenaLog }>> {
  const keys = await store.keys(ARENA_PREFIX);
  const out: Array<{ key: string; log: ArenaLog }> = [];
  for (const key of keys) out.push({ key, log: parseArenaLog(await getPacked(store, key)) ?? emptyArenaLog() });
  return out;
}

/** Records today's prediction of every arena model and scores the ones that fell due. */
async function runArenaDay(date: string, history: Map<string, DailyClose[]>): Promise<{ saved: number; scored: number }> {
  const key = `${ARENA_PREFIX}${date.slice(0, 7)}`;
  let log = parseArenaLog(await getPacked(store, key)) ?? emptyArenaLog();
  const before = log.entries.length;
  for (const horizon of AI_HORIZONS) {
    let payload = await getAiOutlook(horizon);
    // An outlook from before the arena carries no model results: compute it again
    if (!payload.assets.some((a) => a.arena)) {
      aiOutlookCache.delete(horizon);
      payload = await getAiOutlook(horizon);
    }
    log = recordArenaDay(log, date, horizon, payload.assets);
  }
  const saved = log.entries.length - before;
  if (saved > 0) await setPacked(store, key, log);
  let scored = 0;
  for (const m of (await loadArenaMonths()).slice(-6)) {
    const pending = pendingArenaSymbols(m.log);
    if (!pending.length) continue;
    for (const sym of pending) {
      if (history.has(sym)) continue;
      const asset = getAssetBySymbol(sym);
      history.set(sym, asset ? await dailyHistoryFor(asset).catch(() => []) : []);
    }
    const next = evaluateArenaLog(m.log, history);
    if (next !== m.log) {
      scored += next.entries.filter((e) => e.outcome).length - m.log.entries.filter((e) => e.outcome).length;
      await setPacked(store, m.key, next);
    }
  }
  arenaLiveCache.clear();
  // Only a day with recorded predictions counts as done (arenaLog: the first state key was set
  // on 21 Oct 2026 by a run that found no arena results)
  if (log.entries.some((e) => e.date === date)) await markJobDone('arenaLog', date);
  return { saved, scored };
}

const arenaLiveCache = new Map<string, CacheEntry<unknown>>();

async function loadForwardMonths(): Promise<Array<{ key: string; log: ForwardLog }>> {
  const keys = await store.keys(FORWARD_PREFIX);
  const out: Array<{ key: string; log: ForwardLog }> = [];
  for (const key of keys) out.push({ key, log: parseForwardLog(await store.get(key)) ?? emptyLog() });
  return out;
}

/**
 * Server forward test: today's AI verdicts for both horizons and all three risk profiles
 * (stored per month), then scores every snapshot whose horizon has passed with real daily closes.
 */
async function runServerForwardTest(): Promise<{ date: string; saved: number; scored: number; arena: { saved: number; scored: number } | null }> {
  const date = wibDate(Date.now());
  const key = `${FORWARD_PREFIX}${date.slice(0, 7)}`;
  let log = parseForwardLog(await store.get(key)) ?? emptyLog();
  const before = log.snapshots.length;
  for (const horizon of AI_HORIZONS) {
    const payload = await getAiOutlook(horizon);
    if (payload.assets.length === 0) throw new Error('AI outlook unavailable (no market data)');
    for (const profile of Object.keys(RISK_PROFILES) as RiskProfile[]) {
      const ranked = rankOutlooks(payload.assets, profile, { geoAlertActive: payload.geoAlertActive });
      log = recordSnapshots(
        log,
        date,
        horizon,
        profile,
        ranked.map((o) => {
          const asset = getAssetBySymbol(o.symbol);
          return { symbol: o.symbol, verdict: o.verdict, chance: o.adjustedProbability, price: asset ? livePriceFor(asset)?.price : undefined };
        })
      );
    }
  }
  const saved = log.snapshots.length - before;
  if (saved > 0) await store.set(key, log);
  // Score due snapshots (the last 6 months cover the 60-day horizon with room to spare)
  let scored = 0;
  const months = (await loadForwardMonths()).slice(-6);
  const history = new Map<string, DailyClose[]>();
  for (const m of months) {
    const pending = pendingSymbols(m.log, date);
    if (pending.length === 0) continue;
    for (const sym of pending) {
      if (history.has(sym)) continue;
      const asset = getAssetBySymbol(sym);
      history.set(sym, asset ? await dailyHistoryFor(asset).catch(() => []) : []);
    }
    const next = evaluateSnapshots(m.log, history);
    if (next !== m.log) {
      scored += next.snapshots.filter((s) => s.outcome).length - m.log.snapshots.filter((s) => s.outcome).length;
      await store.set(m.key, next);
    }
  }
  forwardTrackCache.clear();
  // The model arena rides on the same daily job (same outlook, same price history)
  const arena = await runArenaDay(date, history).catch((err) => {
    console.warn('[Arena] failed:', err instanceof Error ? err.message : err);
    return null;
  });
  await markJobDone('forward', date);
  console.log(`[Forward] ${date}: ${saved} verdicts saved, ${scored} results scored; arena ${arena ? `${arena.saved} saved, ${arena.scored} scored` : 'failed'}`);
  return { date, saved, scored, arena };
}

const forwardTrackCache = new Map<string, CacheEntry<unknown>>();

// ---- Daily snapshot + AI analysis (every day ≥16:15 WIB; stored per day for later analysis) ------

const SNAP_PREFIX = 'snap:';
const ANALYSIS_PREFIX = 'analysis:';
const SENTCALLS_PREFIX = 'sentcalls:';
// ---- AI Fund Arena: ten simulated managers with US$100 each, rebalanced after the analyst job ----

const FUNDARENA_KEY = 'fundarena:state';

async function runFundArenaDay(): Promise<{ date: string; managers: Record<string, number> }> {
  const date = wibDate(Date.now());
  const snap = parseSnapshot(await store.get(`${SNAP_PREFIX}${date}`));
  if (!snap) throw new Error('no snapshot for today yet');
  const usdIdr = snap.assets['USD/IDR']?.p ?? 0;
  if (!(usdIdr > 0)) throw new Error('no USD/IDR price');
  const quotes: Record<string, FundQuote> = {};
  const sentRows: Record<'short' | 'medium' | 'long', Array<{ symbol: string; label: string; score: number }>> = { short: [], medium: [], long: [] };
  for (const [symbol, a] of Object.entries(snap.assets)) {
    const asset = getAssetBySymbol(symbol);
    // Currencies are the yardstick, not something a manager buys
    if (!asset || asset.group === 'forex' || !(a.p > 0)) continue;
    quotes[symbol] = { price: a.p, idr: asset.currency === 'IDR' || asset.id === 'jci' };
    for (const h of ['short', 'medium', 'long'] as const) {
      const v = a.s?.[h];
      if (v) sentRows[h].push({ symbol, label: v[0], score: v[1] });
    }
  }
  const picks: Partial<Record<FundManagerId, string[]>> = {
    sentShort: sentimentPicks(sentRows.short),
    sentMedium: sentimentPicks(sentRows.medium),
    sentLong: sentimentPicks(sentRows.long),
  };
  const payload = await getAiOutlook(20).catch(() => null);
  if (payload) {
    picks.advisor = rankOutlooks(payload.assets, 'moderate', { geoAlertActive: payload.geoAlertActive })
      .filter((o) => o.verdict === 'favorable')
      .map((o) => o.symbol);
    for (const id of FUND_MANAGERS) {
      const model = ARENA_MANAGER_MODEL[id];
      if (!model) continue;
      picks[id] = probabilityPicks(payload.assets.map((o) => ({ symbol: o.symbol, p: o.arena?.models.find((m) => m.id === model)?.pNow })));
    }
  }
  const before = parseFundArena(await store.get(FUNDARENA_KEY));
  const next = stepFundArena(before, { date, usdIdr, quotes, picks, benchmark: '^JKSE' });
  await store.set(FUNDARENA_KEY, next);
  fundArenaCache = null;
  await markJobDone('fundArena', date);
  return { date, managers: Object.fromEntries(FUND_MANAGERS.map((id) => [id, Math.round(next.managers[id].history.at(-1)![1] * 100) / 100])) };
}

let fundArenaCache: CacheEntry<unknown> | null = null;

const ANALYST_TIME = '16:15'; // WIB, after the IDX close; runs right after the forward test in the same call
const TRACE_HORIZONS: TraceHorizon[] = ['short', 'medium', 'long'];
const traceCache = new Map<string, CacheEntry<unknown>>();

async function loadSentimentMonths(): Promise<Array<{ key: string; log: SentimentLog }>> {
  const keys = (await store.keys(SENTCALLS_PREFIX)).sort();
  const out: Array<{ key: string; log: SentimentLog }> = [];
  for (const key of keys) out.push({ key, log: parseSentimentLog(await store.get(key)) ?? emptySentimentLog() });
  return out;
}

async function storedReport(date: string): Promise<AnalystReport | null> {
  return parseReport(await store.get<unknown>(`${ANALYSIS_PREFIX}${date}`).catch(() => null));
}

/**
 * The daily analysis: snapshot of every app asset (price, 24h change, sentiment per horizon),
 * sentiment calls saved for the recommendation trace and scored when due, facts and data checks,
 * and an optional Gemini narrative in English and Indonesian. Everything is stored per day.
 */
async function runDailyAnalyst(): Promise<{ date: string; assets: number; sentiment: number; scored: number; ai: boolean }> {
  const now = Date.now();
  const date = wibDate(now);
  const ticks = await collectAllTicks();
  const priced = ASSETS.filter((a) => Number.isFinite(ticks[a.symbol]?.price) && ticks[a.symbol].price > 0);
  const missing = ASSETS.filter((a) => !priced.includes(a)).map((a) => a.code);
  const stale = priced.filter((a) => now - (ticks[a.symbol].updatedAt ?? now) > 4 * 86_400_000).map((a) => a.code);
  const failed: string[] = [];
  const snapAssets: Record<string, SnapAsset> = {};
  await mapLimit(priced, 3, async (asset) => {
    const t = ticks[asset.symbol];
    const entry: SnapAsset = { p: t.price, c24: Number.isFinite(t.changePct24h) ? Math.round((t.changePct24h as number) * 100) / 100 : null };
    try {
      const sv = (await getSentimentV2(asset)) as { horizons?: Partial<Record<TraceHorizon, { label?: string; score?: number | null }>> };
      const s: SnapAsset['s'] = {};
      for (const h of TRACE_HORIZONS) {
        const v = sv.horizons?.[h];
        if (v && typeof v.score === 'number' && Number.isFinite(v.score) && typeof v.label === 'string') s[h] = [v.label as TraceLabel, Math.round(v.score)];
      }
      if (Object.keys(s).length) entry.s = s;
    } catch {
      failed.push(asset.code);
    }
    snapAssets[asset.symbol] = entry;
  });
  const snapshot: DailySnapshot = { version: 1, date, takenAt: now, assets: snapAssets };
  await store.set(`${SNAP_PREFIX}${date}`, snapshot);

  // Sentiment calls for the recommendation trace (one per asset, horizon and day)
  const callKey = `${SENTCALLS_PREFIX}${date.slice(0, 7)}`;
  const before = parseSentimentLog(await store.get(callKey)) ?? emptySentimentLog();
  const log = recordSentimentCalls(
    before,
    date,
    priced.map((a) => ({
      symbol: a.symbol,
      crypto: a.group === 'crypto',
      price: snapAssets[a.symbol]?.p,
      horizons: Object.fromEntries(
        TRACE_HORIZONS.map((h) => {
          const v = snapAssets[a.symbol]?.s?.[h];
          return [h, v ? { label: v[0], score: v[1] } : null];
        })
      ),
    }))
  );
  if (log !== before) await store.set(callKey, log);
  // Score due calls (14 months cover the long horizon)
  let scored = 0;
  const months = (await loadSentimentMonths()).slice(-14);
  const history = new Map<string, DailyClose[]>();
  for (const m of months) {
    const pending = pendingCallSymbols(m.log, date);
    if (!pending.length) continue;
    for (const sym of pending) {
      if (history.has(sym)) continue;
      const asset = getAssetBySymbol(sym);
      history.set(sym, asset ? await dailyHistoryFor(asset).catch(() => []) : []);
    }
    const next = evaluateSentimentCalls(m.log, history);
    if (next !== m.log) {
      scored += next.calls.filter((c) => c.outcome).length - m.log.calls.filter((c) => c.outcome).length;
      await store.set(m.key, next);
    }
  }

  const prevDate = datesFromKeys(await store.keys(SNAP_PREFIX), SNAP_PREFIX).find((d) => d < date) ?? null;
  const prev = prevDate ? parseSnapshot(await store.get(`${SNAP_PREFIX}${prevDate}`)) : null;
  const advisorFavorable: Record<string, string[]> = {};
  let advisorAssets = 0;
  for (const h of AI_HORIZONS) {
    const payload = await getAiOutlook(h).catch(() => null);
    if (!payload) continue;
    advisorAssets = Math.max(advisorAssets, payload.assets.length);
    advisorFavorable[String(h)] = rankOutlooks(payload.assets, 'moderate', { geoAlertActive: payload.geoAlertActive })
      .filter((o) => o.verdict === 'favorable')
      .map((o) => o.symbol);
  }
  const allCalls = (await loadSentimentMonths()).flatMap((m) => m.log.calls);
  const allVerdicts = (await loadForwardMonths()).flatMap((m) => m.log.snapshots);
  const sbn = await getSbnRetail(store).catch(() => null);
  const { strongest, weakest } = extremes(snapshot);
  const facts: AnalystFacts = {
    date,
    previousDate: prev?.date ?? null,
    assetsCovered: priced.length,
    sentimentCovered: Object.values(snapAssets).filter((a) => a.s).length,
    movers: topMovers(snapshot),
    sentimentChanges: sentimentChanges(prev, snapshot),
    strongest,
    weakest,
    advisorFavorable,
    methods: methodSummaries(allCalls, allVerdicts, 'moderate'),
    sbnOpen: (sbn?.current ?? []).filter((x) => sbnStatus(x, date) === 'open').map((x) => ({ code: x.code, couponPct: x.couponPct, offerEnd: x.offerEnd })),
    macro: { biRate: macroCache.entry?.data.biRate.at(-1)?.value ?? null, usdIdr: Number.isFinite(ticks['USD/IDR']?.price) ? ticks['USD/IDR'].price : null },
  };
  const probes = await diagnosticsProbes().catch(() => []);
  const gem = geminiStatus();
  const quality = qualityChecks({
    assetsTotal: ASSETS.length,
    pricesMissing: missing,
    pricesStale: stale,
    sentimentTried: priced.length,
    sentimentFailed: failed,
    sourcesProblem: probes.filter((p) => p.status !== 'ok' && p.id !== 'finnhub' && p.id !== 'telegram').map((p) => p.id),
    advisorAssets,
    advisorExpected: ASSETS.filter((a) => a.ai).length,
    forwardLastRun: jobs.state.forward ?? null,
    today: date,
    database: store.persistent,
    gemini: { configured: gem.configured, lastError: gem.lastError?.kind ?? null },
  });
  const existing = await storedReport(date);
  const report: AnalystReport = { version: 1, date, createdAt: Date.now(), facts, quality, ai: {}, notes: existing?.notes ?? [] };
  // Names of the assets the facts mention, so the narrative uses real names
  const mentioned = new Set<string>([
    ...facts.movers.up.map((m) => m.symbol),
    ...facts.movers.down.map((m) => m.symbol),
    ...facts.sentimentChanges.map((c) => c.symbol),
    ...TRACE_HORIZONS.flatMap((h) => [...strongest[h], ...weakest[h]].map((x) => x.symbol)),
    ...Object.values(advisorFavorable).flat(),
  ]);
  const names = Object.fromEntries([...mentioned].map((sym) => [sym, getAssetBySymbol(sym)?.name ?? sym]));
  for (const lang of ['en', 'id'] as const) {
    const res = await geminiGenerate({ tag: 'analyst', timeoutMs: 40_000, contents: analystPrompt(facts, quality, names, lang), config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } });
    if (res) {
      report.ai[lang] = res.text.slice(0, 6000);
      report.ai.model = res.model;
    }
  }
  await store.set(`${ANALYSIS_PREFIX}${date}`, report);
  traceCache.clear();
  await markJobDone('analyst', date);
  console.log(`[Analyst] ${date}: ${priced.length} assets, ${facts.sentimentCovered} with sentiment, ${scored} calls scored${report.ai.en || report.ai.id ? ', Gemini narrative' : ''}`);
  return { date, assets: priced.length, sentiment: facts.sentimentCovered, scored, ai: Boolean(report.ai.en || report.ai.id) };
}

// ---- Recommendation trace for every IDX stock (after the close, a batch per cron tick) ---------

const IDXTRACE_PREFIX = 'idxtrace:';
const IDXTRACE_STATS = 'idxtrace:stats';
const IDXTRACE_PROGRESS = 'idxtrace:progress';
const callId = (c: { date: string; horizon: string }) => `${c.date}|${c.horizon}`;

/** One stock: save today's calls (only when it traded that day) and score its calls that are due. */
async function recordIdxCalls(asset: Asset, date: string): Promise<{ saved: SentimentLog['calls']; scored: SentimentLog['calls'] }> {
  try {
    const bars = await recentHistoryFor(asset);
    const last = bars[bars.length - 1];
    const key = `${IDXTRACE_PREFIX}${asset.symbol}`;
    const before = parseSentimentLog(await store.get(key)) ?? emptySentimentLog();
    let log = before;
    if (last?.date === date) {
      const sv = (await getSentimentV2(asset)) as { horizons?: Partial<Record<TraceHorizon, { label?: string; score?: number | null }>> };
      const horizons = Object.fromEntries(
        TRACE_HORIZONS.map((h) => {
          const v = sv.horizons?.[h];
          return [h, v && typeof v.score === 'number' && typeof v.label === 'string' ? { label: v.label as TraceLabel, score: v.score } : null];
        })
      );
      log = recordSentimentCalls(log, date, [{ symbol: asset.symbol, crypto: false, price: last.close, horizons }]);
    }
    const had = new Set(before.calls.map(callId));
    const saved = log.calls.filter((c) => !had.has(callId(c)));
    const wasScored = new Set(log.calls.filter((c) => c.outcome).map(callId));
    const evaluated = evaluateSentimentCalls(log, new Map([[asset.symbol, bars]]));
    const scored = evaluated.calls.filter((c) => c.outcome && !wasScored.has(callId(c)));
    if (evaluated !== before) {
      await store.set(key, evaluated.calls.length > IDX_TRACE_MAX_CALLS ? { version: 1, calls: evaluated.calls.slice(-IDX_TRACE_MAX_CALLS) } : evaluated);
    }
    return { saved, scored };
  } finally {
    // ~960 ten-year histories would not fit in memory: drop each one once used
    if (asset.yahooSymbol) aiHistoryCache.delete(`y:${asset.yahooSymbol}`);
    sentimentCache.delete(asset.symbol);
  }
}

/** Cron tick step: works through the IDX universe (outside the core assets) for the last closed trading day. */
async function idxTraceStep(until: number): Promise<unknown> {
  const date = idxTraceDay(Date.now());
  if (!date) return 'market open';
  if (!store.persistent) return 'no database';
  const saved = await store.get<{ date: string; next: number; recorded: number }>(IDXTRACE_PROGRESS).catch(() => null);
  const p = saved?.date === date ? saved : { date, next: 0, recorded: 0 };
  const core = new Set(ASSETS.map((a) => a.symbol));
  const list = IDX_UNIVERSE_STOCKS()
    .filter((a) => !core.has(a.symbol))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
  if (p.next >= list.length) return { date, done: true, total: list.length, recorded: p.recorded };
  let stats = parseIdxStats(await store.get(IDXTRACE_STATS).catch(() => null));
  const start = p.next;
  let failed = 0;
  while (p.next < list.length && Date.now() < until - 15_000) {
    const batch = list.slice(p.next, p.next + 4);
    p.next += batch.length;
    const results = await Promise.all(batch.map((a) => recordIdxCalls(a, date).catch(() => null)));
    for (const r of results) {
      if (!r) {
        failed++;
        continue;
      }
      stats = addToIdxStats(stats, r.saved, r.scored);
      if (r.saved.length) p.recorded++;
    }
  }
  await store.set(IDXTRACE_STATS, stats);
  await store.set(IDXTRACE_PROGRESS, p);
  traceCache.clear();
  return { date, processed: p.next - start, next: p.next, total: list.length, recorded: p.recorded, failed };
}

type TraceData = { calls: SentimentLog['calls']; forward: Array<{ key: string; log: ForwardLog }> };

/** All saved calls (sentiment trace + advisor forward test), cached 10 minutes. */
async function traceData(): Promise<TraceData> {
  const hit = traceCache.get('all') as CacheEntry<TraceData> | undefined;
  if (hit && hit.expiresAt > Date.now()) return hit.data;
  const data: TraceData = { calls: (await loadSentimentMonths()).flatMap((m) => m.log.calls), forward: await loadForwardMonths() };
  traceCache.set('all', { data, expiresAt: Date.now() + 10 * 60_000 });
  return data;
}

// ---- Morning brief (±07:30 WIB; optional Telegram and web push) ----------------------------------

const BRIEF_PREFIX = 'brief:';
/** Both language versions of a day's brief (older saves hold only the English one). */
type BriefPair = { en: MorningBrief; id?: MorningBrief };
const briefMemo = new Map<string, BriefPair>();

function asBriefPair(saved: unknown): BriefPair | null {
  const v = saved as Partial<BriefPair> & Partial<MorningBrief>;
  if (!v || typeof v !== 'object') return null;
  if (v.en && typeof v.en === 'object') return v as BriefPair;
  if (Array.isArray(v.sections)) return { en: v as MorningBrief };
  return null;
}

const pickBrief = (pair: BriefPair, lang: AppLang): MorningBrief => (lang === 'id' && pair.id ? pair.id : pair.en);

function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim());
}

/** Sends a plain-text message to the owner's Telegram chat (the token is never logged). */
async function sendTelegram(text: string): Promise<boolean> {
  if (!telegramConfigured()) return false;
  try {
    const res = await fetchWithTimeout(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN?.trim()}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID?.trim(), text, disable_web_page_preview: true }),
      },
      10_000
    );
    if (!res.ok) console.warn(`[Telegram] send failed (HTTP ${res.status})`);
    return res.ok;
  } catch {
    console.warn('[Telegram] send failed (network)');
    return false;
  }
}

function briefQuote(asset: Asset | undefined, tick: PriceTick | undefined): BriefQuote | null {
  if (!asset || !tick || tick.status === 'error' || !Number.isFinite(tick.price)) return null;
  return {
    code: asset.code,
    name: asset.shortName,
    group: asset.group,
    price: tick.price,
    changePct: typeof tick.changePct24h === 'number' && Number.isFinite(tick.changePct24h) ? tick.changePct24h : null,
    display: formatAssetPrice(tick.price, asset),
  };
}

/** Builds the brief for a WIB date from the caches (prices, calendar, macro, news, forward test). */
async function generateBrief(date: string): Promise<BriefPair> {
  const now = Date.now();
  const [yahoo, indodax] = await Promise.all([getYahooTicks().catch(() => ({}) as Record<string, PriceTick>), getIndodaxPrices().catch(() => ({}) as Record<string, PriceTick>)]);
  const ticks: Record<string, PriceTick> = { ...yahoo, ...indodax };
  try {
    const usd = ticks['USD/IDR']?.price;
    ticks['XAU/USD'] = await getGoldTick(Number.isFinite(usd) ? usd : 0);
  } catch {
    // Gold left out
  }
  const q = (code: string) => {
    const asset = ASSETS.find((a) => a.code === code);
    return asset ? briefQuote(asset, ticks[asset.symbol]) : null;
  };
  const list = (codes: string[]) => codes.map(q).filter((x): x is BriefQuote => x !== null);
  /** The price lines, formatted in a number locale (synchronous, so the global locale is restored at once). */
  const quotes = (locale: NumberLocale = 'en-US') => {
    const before = getNumberLocale();
    setNumberLocale(locale);
    try {
      return {
        wallStreet: list(['SPX', 'NDX', 'DJI']),
        asia: list(['N225', 'HSI', 'KOSPI', 'SSE', 'STI']),
        ihsg: q('JCI'),
        movers: ASSETS.filter((a) => a.group !== 'index' && a.group !== 'forex').map((a) => briefQuote(a, ticks[a.symbol])).filter((x): x is BriefQuote => x !== null),
        rates: list(['USD', 'EUR', 'SGD', 'JPY', 'CNY']),
        gold: q('GOLD'),
      };
    } finally {
      setNumberLocale(before);
    }
  };

  // Watchlist + portfolio from synced data come first in the calendar
  let priority: string[] = [];
  if (syncStorageReady(store)) {
    const data = await loadSyncData(store);
    priority = [...new Set([...liveValues<boolean>(data, 'watchlist').map((x) => x.id), ...liveValues<{ symbol?: string }>(data, 'portfolio').map((x) => x.value.symbol ?? '')])].filter(Boolean);
  }
  for (const sym of priority.slice(0, 30)) {
    const a = getAssetBySymbol(sym);
    if (a?.yahooSymbol && STOCK_GROUPS.includes(a.group)) await getCalendarFor(a).catch(() => []);
  }
  const events: CalendarEvent[] = [];
  for (const [sym, entry] of calendarCache) {
    for (const e of entry.data) if (e.date === date && e.type !== 'dividend' && e.symbol === sym) events.push(e);
  }

  const macro: BriefInput['macro'] = [];
  try {
    const m = await Promise.race([getIndonesiaMacro(), new Promise<null>((r) => setTimeout(() => r(null), 8000))]);
    if (m) {
      const bi = m.biRate[0];
      if (bi) macro.push({ label: 'BI-Rate', value: `${bi.value.toFixed(2)}%`, date: bi.date });
      for (const sr of m.series.slice(0, 5)) {
        const lastPoint = sr.points[sr.points.length - 1];
        if (lastPoint) macro.push({ id: sr.id, label: sr.label, value: `${Number(lastPoint.value.toFixed(2)).toLocaleString('en-US')}${sr.unit === '%' ? '%' : ` ${sr.unit}`}`, date: lastPoint.date });
      }
    }
  } catch {
    // Macro left out
  }

  await ensureNewsFresh().catch(() => {});
  let forward: { saved: number; evaluated: number; lastRunDate: string | null } | null = null;
  try {
    const snaps = (await loadForwardMonths()).flatMap((m) => m.log.snapshots);
    forward = { saved: snaps.length, evaluated: snaps.filter((x) => x.outcome).length, lastRunDate: jobs.state.forward ?? null };
  } catch {
    forward = null;
  }

  const input: BriefInput = {
    date,
    generatedAt: now,
    ...quotes(),
    events,
    priority,
    codeOf: (sym) => getAssetBySymbol(sym)?.code.replace(/\.JK$/, '') ?? sym,
    macro,
    news: newsHub.items,
    forward,
  };
  const pair: BriefPair = { en: buildBrief({ ...input, lang: 'en' }), id: buildBrief({ ...input, ...quotes('id-ID'), lang: 'id' }) };
  for (const lang of ['en', 'id'] as const) await polishBrief(pair[lang] as MorningBrief, lang);
  return pair;
}

/** Optional: Gemini rewrites the overview from the same facts, in the brief's language. */
async function polishBrief(brief: MorningBrief, lang: AppLang): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (apiKey && apiKey !== 'MY_GEMINI_API_KEY' && brief.sections.length > 1) {
    try {
      const facts = brief.sections.filter((x) => x.id !== 'overview').map((x) => `${x.title}: ${x.lines.join('; ')}`).join('\n');
      const response = await geminiGenerate({
          tag: 'brief',
          timeoutMs: 15_000,
          contents: `Write 3-4 plain ${lang === 'id' ? 'Indonesian (Bahasa Indonesia)' : 'English'} sentences summarizing this morning's market mood for an Indonesian investor, using ONLY these facts. No predictions, no buy/sell advice.\n${facts}`,
          config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
        });
      const text = response?.text;
      if (text) {
        brief.sections[0] = { ...brief.sections[0], lines: [text] };
        brief.aiPolished = true;
      }
    } catch (err) {
      console.warn('[Brief] Gemini failed:', err instanceof Error ? err.message : err);
    }
  }
}

async function storedBrief(date: string): Promise<BriefPair | null> {
  const memo = briefMemo.get(date);
  if (memo) return memo;
  const saved = asBriefPair(await store.get<unknown>(`${BRIEF_PREFIX}${date}`).catch(() => null));
  if (saved) briefMemo.set(date, saved);
  return saved;
}

/** Telegram text and push for a brief, in the owner's language (that of the latest push device). */
async function deliverBrief(pair: BriefPair, date: string, tag: string): Promise<{ telegram: boolean; push: number }> {
  const lang = syncStorageReady(store) ? await pushLang(store).catch(() => 'en' as const) : 'en';
  const brief = pickBrief(pair, lang);
  const telegram = await sendTelegram(briefToText(brief, process.env.APP_URL?.startsWith('http') ? process.env.APP_URL : undefined));
  let push = 0;
  if (vapidConfigured() && syncStorageReady(store)) {
    const overview = brief.sections[0]?.lines[0] ?? '';
    push = (await sendPushToAll(store, { title: translate(lang, 'brief.title', { date }), body: overview.slice(0, 180), url: '#/brief', tag }).catch(() => ({ sent: 0 }))).sent;
  }
  return { telegram, push };
}

/** Today's brief: generate, store, and send to Telegram / web push when configured. */
async function runMorningBrief(): Promise<{ date: string; telegram: boolean; push: number }> {
  const { date } = briefDateFor(Date.now());
  const pair = await generateBrief(date);
  // Without any market data the brief is not worth sending; try again later
  if (!pair.en.sections.some((x) => x.id === 'global' || x.id === 'ihsg')) throw new Error('Market data unavailable for the brief');
  briefMemo.set(date, pair);
  await store.set(`${BRIEF_PREFIX}${date}`, pair).catch((err) => console.warn('[Brief] save failed:', err instanceof Error ? err.message : err));
  const { telegram, push } = await deliverBrief(pair, date, `brief-${date}`);
  await markJobDone('brief', date);
  console.log(`[Brief] ${date} ready (telegram: ${telegram ? 'sent' : 'off'}, push: ${push})`);
  return { date, telegram, push };
}

/** Runs the daily jobs that are due (called on API requests and by POST /api/cron/daily). */
async function runDueJobs(trigger: 'request' | 'cron' | 'tick'): Promise<Record<string, unknown>> {
  await loadJobState();
  const now = Date.now();
  const results: Record<string, unknown> = {};
  const allowed = (name: string) => trigger === 'cron' || (jobs.retryAfter.get(name) ?? 0) <= now;
  if (dailyJobDue(now, jobs.state.forward ?? null, FORWARD_TIME, true) && allowed('forward')) {
    const job = runJob('forward', runServerForwardTest);
    results.forward = trigger !== 'request' ? await job.catch((err) => ({ error: err instanceof Error ? err.message : 'failed' })) : 'started';
    if (trigger === 'request') keepAlive(job).catch(() => {});
  } else {
    results.forward = { skipped: jobs.state.forward === wibDate(now) ? 'already ran today' : `not due (weekdays after ${FORWARD_TIME} WIB)` };
  }
  if (dailyJobDue(now, jobs.state.analyst ?? null, ANALYST_TIME) && allowed('analyst')) {
    const job = runJob('analyst', runDailyAnalyst);
    results.analyst = trigger !== 'request' ? await job.catch((err) => ({ error: err instanceof Error ? err.message : 'failed' })) : 'started';
    if (trigger === 'request') keepAlive(job).catch(() => {});
  } else {
    results.analyst = { skipped: jobs.state.analyst === wibDate(now) ? 'already ran today' : `not due (after ${ANALYST_TIME} WIB)` };
  }
  // Fund arena: after today's analyst snapshot exists (needs its prices and sentiment)
  const today = wibDate(now);
  if (jobs.state.analyst === today && jobs.state.fundArena !== today && allowed('fundArena') && store.persistent) {
    const job = runJob('fundArena', runFundArenaDay);
    results.fundArena = trigger !== 'request' ? await job.catch((err) => ({ error: err instanceof Error ? err.message : 'failed' })) : 'started';
    if (trigger === 'request') keepAlive(job).catch(() => {});
  } else {
    results.fundArena = { skipped: jobs.state.fundArena === today ? 'already ran today' : 'waits for the analyst job' };
  }
  if (dailyJobDue(now, jobs.state.brief ?? null, BRIEF_TIME) && allowed('brief')) {
    const job = runJob('brief', runMorningBrief);
    results.brief = trigger !== 'request' ? await job.catch((err) => ({ error: err instanceof Error ? err.message : 'failed' })) : 'started';
    if (trigger === 'request') keepAlive(job).catch(() => {});
  } else {
    results.brief = { skipped: jobs.state.brief === wibDate(now) ? 'already ran today' : `not due (after ${BRIEF_TIME} WIB)` };
  }
  return results;
}

/** Every app price at once (Indodax, Yahoo, CoinGecko/Binance crypto, spot gold) with market caps. */
async function collectAllTicks(): Promise<Record<string, PriceTick>> {
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
  return ticks;
}

/** Live part of /api/diagnostics: Gemini model status and the daily jobs (no secrets). */
async function diagnosticsLive(): Promise<Record<string, unknown>> {
  await loadJobState();
  return {
    gemini: geminiStatus(),
    jobs: {
      database: store.persistent,
      lastRun: { ...jobs.state },
      running: [...jobs.running.keys()],
      retryAfter: Object.fromEntries([...jobs.retryAfter].filter(([, t]) => t > Date.now())),
    },
  };
}

let lastDueCheck = 0;
/** Cheap check on API traffic: the first request after the scheduled time starts the job. */
function checkDueJobsSoon(): void {
  const now = Date.now();
  if (now - lastDueCheck < 60_000) return;
  lastDueCheck = now;
  keepAlive(runDueJobs('request')).catch(() => {});
}

// ---- Server-side alerts (web push; needs a database, VAPID keys and the owner login) ------------

const serverAlerts = {
  active: false,
  alerts: [] as UserAlert[],
  settings: parseAlertSettings(null) as AlertSettings,
  holdings: [] as string[],
  states: {} as Record<string, AlertState>,
  statesLoaded: false,
  statesDirty: false,
  history: [] as AlertHistoryEntry[],
  sentAt: [] as number[],
  lastCheckAt: 0,
  lastSavedAt: 0,
};

function serverAlertsReady(): boolean {
  return vapidConfigured() && ownerAuth.configured && syncStorageReady(store);
}

/** Reloads the synced alert definitions every minute (alerts are edited on the devices). */
async function refreshServerAlerts(): Promise<void> {
  if (!serverAlertsReady()) {
    serverAlerts.active = false;
    priceStream.focus.delete('server-alerts');
    return;
  }
  try {
    const [data, subs] = await Promise.all([loadSyncData(store), loadSubscriptions(store)]);
    serverAlerts.alerts = parseAlerts(liveValues<UserAlert>(data, 'alerts').map((x) => x.value));
    serverAlerts.settings = parseAlertSettings(data.settings?.alertSettings?.v ?? null);
    serverAlerts.holdings = [
      ...new Set([
        ...liveValues<boolean>(data, 'watchlist').map((x) => x.id),
        ...liveValues<{ symbol?: string }>(data, 'portfolio').map((x) => x.value.symbol ?? ''),
      ]),
    ].filter((sym) => STOCK_GROUPS.includes(getAssetBySymbol(sym)?.group as AssetGroup));
    if (!serverAlerts.statesLoaded) {
      serverAlerts.states = (await store.get<Record<string, AlertState>>('alerts:state')) ?? {};
      serverAlerts.history = (await store.get<AlertHistoryEntry[]>('alerts:history')) ?? [];
      serverAlerts.statesLoaded = true;
    }
    const enabled = serverAlerts.alerts.filter((a) => a.active);
    serverAlerts.active = subs.length > 0 && (enabled.length > 0 || serverAlerts.settings.holdingsCalendar);
    const symbols = [...new Set(enabled.map((a) => a.symbol).filter((x): x is string => Boolean(x)))];
    if (serverAlerts.active && symbols.length) priceStream.focus.set('server-alerts', { symbols, at: Date.now() });
    else priceStream.focus.delete('server-alerts');
    // News and geopolitical alerts need the news hub running
    if (serverAlerts.active && enabled.some((a) => a.kind === 'news' || a.kind === 'geo')) {
      newsHub.lastDemandAt = Date.now();
      keepAlive(ensureNewsFresh()).catch(() => {});
    }
  } catch (err) {
    console.warn('[Alerts] refresh failed:', err instanceof Error ? err.message : err);
  }
}

everyMs(() => refreshServerAlerts().catch(() => {}), 60_000);
afterMs(() => refreshServerAlerts().catch(() => {}), 5_000);

const calendarCheckedAt = new Map<string, number>();
/** Corporate events for alert symbols, fetched at most once per hour per stock (12 h cache behind it). */
async function alertCalendar(symbols: string[]): Promise<CalendarEvent[]> {
  const out: CalendarEvent[] = [];
  for (const sym of symbols.slice(0, 60)) {
    const asset = getAssetBySymbol(sym);
    if (!asset?.yahooSymbol || !STOCK_GROUPS.includes(asset.group)) continue;
    const cached = calendarCache.get(sym)?.data;
    if (cached && Date.now() - (calendarCheckedAt.get(sym) ?? 0) < 3600_000) {
      out.push(...cached);
      continue;
    }
    calendarCheckedAt.set(sym, Date.now());
    out.push(...(await getCalendarFor(asset).catch(() => cached ?? [])));
  }
  return out;
}

async function deliverServerAlert(alert: UserAlert, fire: { title: string; body: string; url?: string }, now: number): Promise<void> {
  const quiet = inQuietHours(now, serverAlerts.settings.quiet);
  let delivery: AlertHistoryEntry['delivery'] = 'silenced';
  if (!quiet) {
    const t = throttle(serverAlerts.sentAt, now);
    serverAlerts.sentAt = t.sentAt;
    if (!t.allowed) delivery = 'throttled';
    else {
      const asset = alert.symbol ? getAssetBySymbol(alert.symbol) : undefined;
      const r = await sendPushToAll(store, { title: fire.title, body: fire.body, url: fire.url ?? (asset ? `#/asset/${asset.id}` : '#/alerts'), tag: alert.id });
      delivery = r.sent > 0 ? 'push' : 'failed';
    }
  }
  serverAlerts.history = addHistory(serverAlerts.history, {
    id: `${alert.id}-${now}`,
    alertId: alert.id,
    symbol: alert.symbol,
    title: fire.title,
    body: fire.body,
    at: now,
    delivery,
  });
  await store.set('alerts:history', serverAlerts.history).catch(() => {});
  // One-time alerts switch off for every device (stamped like an edit, so it syncs back)
  if (!alert.repeat && alert.id !== HOLDINGS_CALENDAR_ID) {
    await updateSyncData(store, (data, t) => {
      const item = data.alerts?.[alert.id];
      if (!item || item.v === null) return null;
      data.alerts = { ...data.alerts, [alert.id]: { v: afterFire(item.v as UserAlert), t, s: t } };
      return data;
    }).catch((err) => console.warn('[Alerts] could not switch off a one-time alert:', err instanceof Error ? err.message : err));
    serverAlerts.alerts = serverAlerts.alerts.map((a) => (a.id === alert.id ? afterFire(a) : a));
  }
}

/** Runs every price-loop round (at most every 15 s without viewers) against the loop's own prices. */
async function checkServerAlerts(ticks: Record<string, PriceTick>): Promise<void> {
  const now = Date.now();
  serverAlerts.lastCheckAt = now;
  const list: UserAlert[] = serverAlerts.alerts.filter((a) => a.active);
  if (serverAlerts.settings.holdingsCalendar && serverAlerts.holdings.length) {
    list.push({ id: HOLDINGS_CALENDAR_ID, kind: 'calendar', repeat: true, cooldownMin: 60, active: true, createdAt: 0 });
  }
  const calSymbols = [...new Set(list.filter((a) => a.kind === 'calendar').flatMap((a) => (a.symbol ? [a.symbol] : serverAlerts.holdings)))];
  const events = calSymbols.length ? await alertCalendar(calSymbols) : [];
  const lang = await pushLang(store).catch(() => 'en' as const);
  for (const alert of list) {
    const asset = alert.symbol ? getAssetBySymbol(alert.symbol) : undefined;
    const tick = alert.symbol ? ticks[alert.symbol] : undefined;
    const usable = tick && tick.status !== 'error' && Number.isFinite(tick.price);
    const { fire, state } = evaluateAlert(alert, serverAlerts.states[alert.id] ?? {}, {
      now,
      price: usable ? tick.price : undefined,
      changePct24h: usable && Number.isFinite(tick.changePct24h) ? tick.changePct24h : undefined,
      events: alert.symbol ? events.filter((e) => e.symbol === alert.symbol) : events,
      news: newsHub.items,
      code: asset?.code,
      name: alert.id === HOLDINGS_CALENDAR_ID ? translate(lang, 'alerts.yourStocks') : asset ? `${asset.shortName}` : undefined,
      formatPrice: asset ? (v) => formatAssetPrice(v, asset) : undefined,
      lang,
    });
    if (JSON.stringify(state) !== JSON.stringify(serverAlerts.states[alert.id] ?? {})) {
      serverAlerts.states[alert.id] = state;
      serverAlerts.statesDirty = true;
    }
    if (fire) await deliverServerAlert(alert, fire, now);
  }
  if (serverAlerts.statesDirty && now - serverAlerts.lastSavedAt > (SERVERLESS ? 0 : 30_000)) {
    serverAlerts.statesDirty = false;
    serverAlerts.lastSavedAt = now;
    await store.set('alerts:state', serverAlerts.states).catch(() => {});
  }
}

// ---- Cron tick (serverless): alerts, daily jobs and the long scans in deadline-bound steps ----------

/** Work time of one tick (the function may run up to 300 s). */
const TICK_BUDGET_MS = 240_000;
const crossPersist: CrossPersist = { get: (k) => getPacked(store, k), set: (k, v) => setPacked(store, k, v) };
const tickState = { running: null as Promise<Record<string, unknown>> | null };

async function saveCrossStatus(market: DerivedMarket, patch: Partial<SavedStatus>, addFetched = 0): Promise<void> {
  const prev = (await store.get<SavedStatus>(`xs:${market}:status`).catch(() => null)) ?? { status: null, derivedAt: 0, fetchedSince: 0 };
  const next: SavedStatus = { ...prev, ...patch, fetchedSince: (patch.fetchedSince ?? prev.fetchedSince ?? 0) + addFetched };
  await store.set(`xs:${market}:status`, next);
  crossStatusSaved[market] = next;
}

/** Recomputes a market's pillars, validation (and IDX valuation) from every saved shard when due. */
async function deriveIfDue(market: DerivedMarket, deadline: number): Promise<unknown> {
  const st = await store.get<SavedStatus>(`xs:${market}:status`).catch(() => null);
  const age = Date.now() - (st?.derivedAt ?? 0);
  // Every 6 hours, or one hour after new data arrived (the first days fill in step by step)
  if (!(age > 6 * 3600_000 || ((st?.fetchedSince ?? 0) > 0 && age > 3600_000))) return 'fresh';
  if (market === 'crypto') await scanBinanceUntil(deadline);
  else await crossSections[market].loadAll(crossPersist);
  const mp = market === 'crypto' ? null : computePillars(market);
  const validation = computeValidation(market);
  if (market === 'crypto' ? !validation : !mp) return 'waiting for data';
  const saved: SavedDerived = {
    at: Date.now(),
    // Only the app's own stocks are read back (US peers only shaped the percentiles)
    pillars: mp ? { ...mp, stocks: [...mp.stocks.entries()].filter(([sym]) => Boolean(getAssetBySymbol(sym))) } : null,
    valuation: market === 'idx' ? idxValuationLists() : null,
    validation,
  };
  await setPacked(store, `xs:${market}:derived`, saved);
  await saveCrossStatus(market, { status: market === 'crypto' ? null : crossSections[market].status(), derivedAt: saved.at, fetchedSince: 0 });
  applyDerived(market, saved);
  return { stocks: mp?.n ?? null, validation: Boolean(validation) };
}

/** One tick: alerts, due daily jobs, then each scan gets a fair share of the time left. */
async function runTick(): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  const deadline = startedAt + TICK_BUDGET_MS;
  const left = () => deadline - Date.now();
  const failed = (err: unknown) => ({ error: err instanceof Error ? err.message : String(err) });
  const out: Record<string, unknown> = { startedAt };
  try {
    await refreshServerAlerts();
    if (serverAlerts.active) {
      recomputePriority();
      await checkServerAlerts(await buildStreamTicks());
      out.alerts = 'checked';
    } else out.alerts = serverAlertsReady() ? 'no active alerts' : 'not configured';
  } catch (err) {
    out.alerts = failed(err);
  }
  out.jobs = await runDueJobs('tick').catch(failed);
  // The arena records on the forward-test day; catches up when it started after that day's job
  if (jobs.state.forward && jobs.state.arenaLog !== jobs.state.forward) out.arena = await runArenaDay(jobs.state.forward, new Map()).catch(failed);
  const crossStep = (market: CrossMarket) => async (until: number) => {
    const r = await crossSections[market].scanStep(crossPersist, until);
    await saveCrossStatus(market, { status: crossSections[market].status() }, r.fetched);
    return r;
  };
  const steps: Array<[string, (until: number) => Promise<unknown>]> = [
    ['scanIdx', crossStep('idx')],
    ['scanUs', crossStep('us')],
    ['screener', screenerStep],
    ['calendar', calendarStep],
    ['staples', (until) => staplesStep(store, until)],
    ['idxTrace', idxTraceStep],
  ];
  for (let i = 0; i < steps.length; i++) {
    // One share stays for the results below
    const share = left() / (steps.length - i + 1);
    out[steps[i][0]] = share < 10_000 ? 'no time left' : await steps[i][1](Date.now() + share).catch(failed);
  }
  for (const m of ['idx', 'us', 'crypto'] as const) {
    out[`results_${m}`] = left() > 40_000 ? await deriveIfDue(m, deadline - 20_000).catch(failed) : 'no time left';
  }
  out.finishedAt = Date.now();
  await store.set('tick:last', out).catch(() => {});
  return out;
}

/** The Express app with every route, without listening (the Vercel function imports this). */
export async function createApp(): Promise<express.Express> {
  const app = express();
  // Small JSON bodies everywhere; the sync endpoint parses its own (larger) body after the login check
  const smallJson = express.json();
  app.use((req, res, next) => (req.path === '/api/sync/merge' ? next() : smallJson(req, res, next)));
  app.use('/api', (_req, _res, next) => {
    checkDueJobsSoon();
    next();
  });

  registerSyncRoutes(app, store, ownerAuth);
  registerPushRoutes(app, store, ownerAuth, serverAlertsReady);
  registerDiagnosticsRoute(app, diagnosticsLive);
  registerSbnRoute(app, store);
  registerStaplesRoute(app, store);

  // Alerts the server checked and sent (owner only)
  app.get('/api/alerts/history', ownerAuth.requireOwner, async (_req, res) => {
    if (!serverAlerts.statesLoaded) await refreshServerAlerts();
    res.json({ history: serverAlerts.history, active: serverAlerts.active, ready: serverAlertsReady() });
  });

  // Serverless scheduler (Supabase pg_cron every 10 minutes): alerts, daily jobs and one step of the
  // long scans. Answers at once (202); the work goes on in the background up to the function's limit.
  app.post('/api/cron/tick', (req, res) => {
    if (!cronAuthorized(req, res)) return;
    if (tickState.running) {
      res.status(202).json({ ok: true, running: true });
      return;
    }
    tickState.running = runTick().finally(() => {
      tickState.running = null;
    });
    keepAlive(tickState.running).catch((err) => console.warn('[Tick] failed:', err instanceof Error ? err.message : err));
    res.status(202).json({ ok: true, started: Date.now() });
  });

  // What the last tick did (no secrets: counts, statuses and short error texts)
  app.get('/api/cron/tick/last', async (_req, res) => {
    res.json({ serverless: SERVERLESS, last: await store.get('tick:last').catch(() => null) });
  });

  // Daily jobs for an external scheduler (GitHub Actions, cron-job.org): Authorization: Bearer CRON_TOKEN
  app.post('/api/cron/daily', async (req, res) => {
    if (!cronAuthorized(req, res)) return;
    try {
      res.json({ ok: true, ranAt: Date.now(), results: await runDueJobs('cron') });
    } catch (err) {
      res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Job failed' });
    }
  });

  // Morning brief: today's from 07:30 WIB (made on the first request if the scheduler has not run),
  // before that yesterday's; ?date=YYYY-MM-DD for a stored one
  app.get('/api/brief', async (req, res) => {
    const lang = parseLang(req.query.lang);
    try {
      await loadJobState();
      const asked = String(req.query.date || '');
      if (asked) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(asked)) {
          res.status(400).json({ error: 'Invalid date' });
          return;
        }
        const b = await storedBrief(asked);
        if (!b) {
          res.status(404).json({ error: 'No brief saved for that date' });
          return;
        }
        res.json({ brief: pickBrief(b, lang), preview: false });
        return;
      }
      const { date, ready } = briefDateFor(Date.now());
      let brief = await storedBrief(date);
      if (!brief && ready) {
        await runJob('brief', runMorningBrief).catch(() => {});
        brief = await storedBrief(date);
      }
      if (brief) {
        res.json({ brief: pickBrief(brief, lang), preview: false, nextAt: `${BRIEF_TIME} WIB`, telegram: telegramConfigured(), persistent: store.persistent });
        return;
      }
      // Nothing saved yet (e.g. before 07:30 after a restart): a live preview, not stored
      res.json({ brief: pickBrief(await generateBrief(date), lang), preview: true, nextAt: `${BRIEF_TIME} WIB`, telegram: telegramConfigured(), persistent: store.persistent });
    } catch (err) {
      console.warn('[Brief] failed:', err instanceof Error ? err.message : err);
      res.status(502).json({ error: 'Brief unavailable' });
    }
  });

  app.get('/api/brief/dates', async (_req, res) => {
    const keys = await store.keys(BRIEF_PREFIX).catch(() => [] as string[]);
    res.json({ dates: keys.map((k) => k.slice(BRIEF_PREFIX.length)).sort().reverse().slice(0, 60) });
  });

  // Owner: send the current brief to Telegram / push now (to test the setup)
  app.post('/api/brief/send-test', ownerAuth.requireOwner, async (_req, res) => {
    if (!telegramConfigured() && !vapidConfigured()) {
      res.status(503).json({ error: 'Neither Telegram nor web push is configured on the server' });
      return;
    }
    const { date } = briefDateFor(Date.now());
    const pair = (await storedBrief(date)) ?? (await generateBrief(date));
    res.json(await deliverBrief(pair, date, 'brief-test'));
  });

  // Server forward test: track record of the daily AI verdict snapshots
  // ---- Daily AI analysis, stored data and the recommendation trace ----------------------------

  /** Bearer CRON_TOKEN check for the job / agent endpoints (the token is never echoed). */
  const cronAuthorized = (req: express.Request, res: express.Response): boolean => {
    const expected = process.env.CRON_TOKEN?.trim();
    if (!expected) {
      res.status(503).json({ error: 'CRON_TOKEN is not configured on the server' });
      return false;
    }
    if (!passphraseMatches(bearerToken(req.headers.authorization) ?? '', expected)) {
      res.status(401).json({ error: 'Invalid token' });
      return false;
    }
    return true;
  };
  const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

  // Latest stored daily analysis, or ?date=YYYY-MM-DD; with the list of stored dates
  app.get('/api/fund-arena', async (_req, res) => {
    try {
      if (!fundArenaCache || fundArenaCache.expiresAt < Date.now()) {
        fundArenaCache = { data: { state: parseFundArena(await store.get(FUNDARENA_KEY)), database: store.persistent, lastRun: jobs.state.fundArena ?? null }, expiresAt: Date.now() + 60_000 };
      }
      res.json(fundArenaCache?.data);
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'fund arena unavailable' });
    }
  });

  app.get('/api/analyst', async (req, res) => {
    try {
      const dates = datesFromKeys(await store.keys(ANALYSIS_PREFIX), ANALYSIS_PREFIX);
      const date = isDate(req.query.date) ? req.query.date : dates[0];
      const report = date ? await storedReport(date) : null;
      res.json({ report, dates: dates.slice(0, 180), schedule: `${ANALYST_TIME} WIB`, database: store.persistent, lastRun: jobs.state.analyst ?? null });
    } catch {
      res.status(502).json({ error: 'Analysis unavailable' });
    }
  });

  // Run the daily analysis now (Bearer CRON_TOKEN) — for testing or an agent
  app.post('/api/analyst/run', async (req, res) => {
    if (!cronAuthorized(req, res)) return;
    try {
      res.json({ ok: true, result: await runJob('analyst', runDailyAnalyst) });
    } catch (err) {
      res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'failed' });
    }
  });

  // An outside agent (e.g. Argon in Google AI Studio) adds its own note to a day's analysis
  app.post('/api/analyst/notes', express.json({ limit: '16kb' }), async (req, res) => {
    if (!cronAuthorized(req, res)) return;
    const body = (req.body ?? {}) as { date?: unknown; author?: unknown; text?: unknown };
    const date = isDate(body.date) ? body.date : wibDate(Date.now());
    const note = cleanNote(body.author, body.text);
    if (!note) {
      res.status(400).json({ error: 'text (3–4000 characters) is required' });
      return;
    }
    const report = await storedReport(date);
    if (!report) {
      res.status(404).json({ error: `No analysis stored for ${date}` });
      return;
    }
    report.notes = [...report.notes, note].slice(-20);
    await store.set(`${ANALYSIS_PREFIX}${date}`, report);
    res.json({ ok: true, date, notes: report.notes.length });
  });

  // Raw stored data for outside analysis: daily snapshots and reports, at most 31 days per call
  app.get('/api/analyst/export', async (req, res) => {
    try {
      const all = datesFromKeys(await store.keys(SNAP_PREFIX), SNAP_PREFIX);
      const to = isDate(req.query.to) ? req.query.to : all[0];
      const from = isDate(req.query.from) ? req.query.from : to ? new Date(Date.parse(to) - 30 * 86_400_000).toISOString().slice(0, 10) : undefined;
      if (!to || !from || Date.parse(to) - Date.parse(from) > 31 * 86_400_000 || from > to) {
        res.json({ from: from ?? null, to: to ?? null, snapshots: [], reports: [], available: all.slice(0, 400) });
        return;
      }
      const dates = all.filter((d) => d >= from && d <= to).sort();
      const snapshots: DailySnapshot[] = [];
      const reports: AnalystReport[] = [];
      for (const d of dates) {
        const snap = parseSnapshot(await store.get(`${SNAP_PREFIX}${d}`));
        if (snap) snapshots.push(snap);
        const rep = await storedReport(d);
        if (rep) reports.push(rep);
      }
      res.json({ from, to, snapshots, reports, available: all.slice(0, 400) });
    } catch {
      res.status(502).json({ error: 'Export unavailable' });
    }
  });

  // One asset's recommendation history: sentiment per horizon and AI Advisor verdicts, with results
  app.get('/api/track/asset', async (req, res) => {
    const asset = getAssetBySymbol(String(req.query.symbol || ''));
    if (!asset) {
      res.status(400).json({ error: 'Unknown symbol' });
      return;
    }
    const profile = ['conservative', 'moderate', 'aggressive'].includes(String(req.query.profile)) ? String(req.query.profile) : 'moderate';
    try {
      const data = await traceData();
      // IDX stocks outside the core assets keep their calls in their own record
      const idxLog =
        asset.group === 'idStock' && !ASSETS.some((a) => a.symbol === asset.symbol)
          ? parseSentimentLog(await store.get(`${IDXTRACE_PREFIX}${asset.symbol}`).catch(() => null))
          : null;
      const calls = idxLog ? [...data.calls, ...idxLog.calls] : data.calls;
      const live = livePriceFor(asset)?.price ?? null;
      const rows = assetTrace(asset.symbol, calls, data.forward.map((f) => f.log), live, profile);
      const mine = calls.filter((c) => c.symbol === asset.symbol);
      const verdicts = data.forward.flatMap((f) => f.log.snapshots).filter((s) => s.symbol === asset.symbol);
      res.json({ symbol: asset.symbol, profile, livePrice: live, database: store.persistent, rows: rows.slice(0, 600), summary: methodSummaries(mine, verdicts, profile) });
    } catch {
      res.status(502).json({ error: 'Trace unavailable' });
    }
  });

  // Accuracy of each method over all assets (sentiment per horizon, AI Advisor per horizon)
  app.get('/api/track/summary', async (req, res) => {
    const profile = ['conservative', 'moderate', 'aggressive'].includes(String(req.query.profile)) ? String(req.query.profile) : 'moderate';
    try {
      const data = await traceData();
      const [idxStats, idxProgress] = await Promise.all([store.get(IDXTRACE_STATS).catch(() => null), store.get(IDXTRACE_PROGRESS).catch(() => null)]);
      res.json({
        profile,
        database: store.persistent,
        methods: methodSummaries(data.calls, data.forward.flatMap((f) => f.log.snapshots), profile),
        // Every IDX stock outside the core assets (running totals)
        idx: { methods: idxStatsSummaries(parseIdxStats(idxStats)), progress: idxProgress },
      });
    } catch {
      res.status(502).json({ error: 'Summary unavailable' });
    }
  });

  // Model arena, live part: each model's recorded daily predictions scored when due
  app.get('/api/ai/arena-live', async (req, res) => {
    const horizon = Number(req.query.horizon) === 60 ? 60 : 20;
    try {
      const cached = arenaLiveCache.get(String(horizon));
      if (cached && cached.expiresAt > Date.now()) {
        res.json(cached.data);
        return;
      }
      const all: ArenaLog = { version: 1, entries: (await loadArenaMonths()).flatMap((m) => m.log.entries) };
      const data = { board: arenaLiveBoard(all, horizon), persistent: store.persistent, scheduleWib: `${FORWARD_TIME} on weekdays` };
      arenaLiveCache.set(String(horizon), { data, expiresAt: Date.now() + 10 * 60_000 });
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Arena unavailable' });
    }
  });

  app.get('/api/ai/forward-track', async (req, res) => {
    const horizon = Number(req.query.horizon) === 60 ? 60 : 20;
    const profileParam = String(req.query.profile || 'moderate');
    const profile: RiskProfile = profileParam in RISK_PROFILES ? (profileParam as RiskProfile) : 'moderate';
    const cacheKey = `${horizon}|${profile}`;
    try {
      await loadJobState();
      const cached = forwardTrackCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        res.json(cached.data);
        return;
      }
      const months = await loadForwardMonths();
      const all: ForwardLog = { version: 1, startedAt: null, snapshots: months.flatMap((m) => m.log.snapshots) };
      const data = {
        record: trackRecord(all, horizon, profile),
        lastRunDate: jobs.state.forward ?? null,
        scheduleWib: `${FORWARD_TIME} on weekdays`,
        persistent: store.persistent,
        database: store.provider,
        cronConfigured: Boolean(process.env.CRON_TOKEN?.trim()),
      };
      forwardTrackCache.set(cacheKey, { data, expiresAt: Date.now() + 10 * 60_000 });
      res.json(data);
    } catch (err) {
      console.warn('[Forward] track failed:', err instanceof Error ? err.message : err);
      res.status(502).json({ error: 'Forward-test record unavailable' });
    }
  });

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
      const response = await geminiGenerate({
          tag: 'translate',
          timeoutMs: 8000,
          contents: `Translate this news headline into ${to === 'id' ? 'Indonesian' : 'English'}. Reply with the translation only.\n${text}`,
          config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
        });
      const translated = response?.text.slice(0, 400);
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
    const now = Date.now();
    const ticks = await collectAllTicks();
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
        keepAlive(runIdxSweep()).catch(() => {});
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

  // 5g2. IDX screener: prices from the sweep + ratios from the slow statements scan
  app.get('/api/screener/idx', async (_req, res) => {
    screenerScan.lastDemandAt = Date.now();
    idxSweep.lastDemandAt = Date.now();
    try {
      await loadScreenerFromStore();
      if (idxSweep.ticks.size === 0) await keepAlive(runIdxSweep()).catch(() => {});
      else if (Date.now() - idxSweep.lastRunAt >= (isExchangeOpen('IDX', Date.now()) ? IDX_SWEEP_OPEN_MS : IDX_SWEEP_CLOSED_MS)) keepAlive(runIdxSweep()).catch(() => {});
      if (!SERVERLESS && !screenerScan.running && IDX_ALL.some((a) => Date.now() - (screenerFund.get(a.symbol)?.fetchedAt ?? 0) > SCREENER_TTL_MS)) {
        runScreenerScan().catch(() => {});
      }
      const rows = idxScreenerRows();
      res.json({
        rows,
        scan: {
          scanned: IDX_ALL.filter((a) => screenerFund.has(a.symbol)).length,
          withData: IDX_ALL.filter((a) => screenerFund.get(a.symbol)?.f).length,
          total: IDX_ALL.length,
          scanning: Boolean(screenerScan.running),
          finishedAt: screenerScan.finishedAt || null,
        },
        pricesAt: idxSweep.lastRunAt || null,
        source: 'Yahoo Finance (prices, financial statements)',
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Screener data unavailable' });
    }
  });

  // 5g3. IDX sector rotation: sector changes, breadth, movers and a one-line reason (cache 10 min)
  app.get('/api/sectors/idx', async (_req, res) => {
    idxSweep.lastDemandAt = Date.now();
    try {
      if (idxSweep.ticks.size === 0) await keepAlive(runIdxSweep()).catch(() => {});
      else if (Date.now() - idxSweep.lastRunAt >= (isExchangeOpen('IDX', Date.now()) ? IDX_SWEEP_OPEN_MS : IDX_SWEEP_CLOSED_MS)) keepAlive(runIdxSweep()).catch(() => {});
      if (sectorCache.entry && sectorCache.entry.expiresAt > Date.now() && sectorCache.entry.data.pricesAt === (idxSweep.lastRunAt || null)) {
        return res.json(sectorCache.entry.data);
      }
      if (idxSweep.ticks.size === 0) return res.status(502).json({ error: 'IDX prices unavailable' });
      const data = await buildSectorRotation();
      sectorCache.entry = { data, expiresAt: Date.now() + SECTOR_TTL_MS };
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Sector data unavailable' });
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
      if (SERVERLESS) await loadCalendarFromStore();
      else if (!calendarScan.running && Date.now() - calendarScan.finishedAt > CALENDAR_TTL_MS) runCalendarScan().catch(() => {});
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
      crossSections.idx.touch();
      await ensureCrossDerived('idx');
      res.json({ ...(await getIndonesiaMacro()), idxValuation: idxValuation() });
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

  // 6a. Market reaction since a news item was published (geopolitical alert banner)
  app.get('/api/market/reaction', async (req, res) => {
    const since = Number(req.query.since);
    const now = Date.now();
    const interval = Number.isFinite(since) ? reactionInterval(since, now) : null;
    if (!interval) {
      res.status(400).json({ error: 'since must be a time (ms) within the last 5 days' });
      return;
    }
    const symbols = String(req.query.symbols || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);
    const out = await Promise.all(
      symbols.map(async (symbol) => {
        const asset = getAssetBySymbol(symbol);
        if (!asset) return reactionSince(symbol, [], since, Number(interval));
        try {
          let r = reactionSince(symbol, await getHistoryCandles(asset, interval), since, Number(interval));
          // 1-minute bars only cover today's session; older news falls back to 5-minute bars
          if (r.status === 'noBase' && interval === '1') r = reactionSince(symbol, await getHistoryCandles(asset, '5'), since, 5);
          return r;
        } catch {
          return reactionSince(symbol, [], since, Number(interval));
        }
      })
    );
    res.json({ since, checkedAt: now, reactions: out });
  });

  // 6b. Full daily OHLC since the first trade (Compare, Backtest, portfolio performance)
  app.get('/api/market/daily', async (req, res) => {
    const asset = getAssetBySymbol(String(req.query.symbol || ''));
    if (!asset || (!asset.yahooSymbol && !asset.indodaxPair)) {
      res.status(400).json({ error: 'Unsupported symbol' });
      return;
    }
    try {
      const bars = await dailyOhlcFor(asset);
      if (bars.length === 0) {
        res.status(502).json({ error: 'History unavailable' });
        return;
      }
      res.json({
        symbol: asset.symbol,
        currency: asset.currency,
        source: asset.indodaxPair ? 'Indodax' : asset.symbol === 'XAU/USD' ? 'Yahoo Finance (gold futures GC=F)' : 'Yahoo Finance',
        bars,
      });
    } catch (err) {
      console.warn(`[Daily] ${asset.code} failed:`, err instanceof Error ? err.message : err);
      res.status(502).json({ error: 'History unavailable' });
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



  // Analyst consensus (next-year EPS, surprises) for one stock
  app.get('/api/fundamentals/analyst', async (req, res) => {
    const asset = getAssetBySymbol(String(req.query.symbol || ''));
    if (!asset || !['idStock', 'usStock', 'globalStock'].includes(asset.group)) {
      res.status(400).json({ error: 'Stocks only' });
      return;
    }
    try {
      res.json({ symbol: asset.symbol, analyst: await analystFor(asset), source: 'Yahoo Finance (earningsTrend, earningsHistory)' });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Analyst data unavailable' });
    }
  });

  // Progress of the cross-section scans (starts them when stale)
  app.get('/api/sentiment/scan-status', async (_req, res) => {
    await Promise.all([ensureCrossDerived('idx'), ensureCrossDerived('us')]);
    for (const cs of Object.values(crossSections)) cs.touch();
    res.json({ markets: (['idx', 'us'] as const).map(crossStatus), binance: binanceStatus(), serverTime: Date.now() });
  });


  // Multi-horizon investment sentiment of one asset (evidence summary, not a buy/sell signal)
  app.get('/api/sentiment/v2', async (req, res) => {
    const asset = getAssetBySymbol(String(req.query.symbol || ''));
    if (!asset) {
      res.status(400).json({ error: 'Unknown symbol' });
      return;
    }
    try {
      res.json(await getSentimentV2(asset, req.query.fresh === '1'));
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Sentiment unavailable' });
    }
  });

  // Sentiment leaders of a market for one horizon (cross-section of the scanned stocks)
  app.get('/api/sentiment/rankings', async (req, res) => {
    const m = String(req.query.market || 'idx');
    const h: Horizon = req.query.horizon === 'short' || req.query.horizon === 'long' ? req.query.horizon : 'medium';
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    if (m === 'crypto') {
      // Binance top 100: scores from closed daily candles and funding (see /api/crypto/binance)
      noteBinanceDemand();
      const rows = binanceUniverse()
        .map((p) => {
          const daily = cachedClosedKlines(p.symbol, '1d').map((k) => k.close);
          const f = fundingFor(`${p.baseAsset}USDT`) ?? fundingFor(`1000${p.baseAsset}USDT`);
          const r = scoreHorizon(h, { group: 'crypto', technicalShort: shortTechnical(daily)?.score ?? null, tsMomentum: tsMomentumScore(daily, 365), trend: trendScore(daily), derivatives: f ? derivativesScore({ fundingRate: f.lastFundingRate }) : null, binance: true });
          return { symbol: p.symbol, code: p.baseAsset, name: p.symbol, industry: null, score: r.score, label: r.label, confidence: r.confidence, coverage: r.coverage, pillars: { momentum: null, health: null, quality: null }, distressWarning: false };
        })
        .filter((r) => r.score !== null)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      res.json({ market: 'crypto', horizon: h, n: rows.length, top: rows.slice(0, limit), bottom: rows.slice(-limit).reverse(), binance: binanceStatus(), disclaimer: SENTIMENT_DISCLAIMER, serverTime: Date.now() });
      return;
    }
    const market = m === 'us' || m === 'usStock' ? 'us' : 'idx';
    await ensureCrossDerived(market);
    const sector = String(req.query.sector || '').toLowerCase();
    const all = rankingsFor(market, h);
    const n = all.n;
    // Decile of each scored stock in this ranking (10 = top), then the optional sector filter
    const scored = all.rows.filter((r) => r.score !== null);
    const rows = scored
      .map((r, i) => ({ ...r, decile: 10 - Math.floor((i * 10) / Math.max(1, scored.length)) }))
      .filter((r) => !sector || (getAssetBySymbol(r.symbol)?.sector ?? '').toLowerCase() === sector || (r.industry ?? '').toLowerCase() === sector);
    res.json({
      market,
      horizon: h,
      n,
      top: rows.filter((r) => r.score !== null).slice(0, limit),
      bottom: rows.filter((r) => r.score !== null).slice(-limit).reverse(),
      scans: crossStatus(market),
      note: 'Full-universe rankings use the pillars, news and macro; short-term technicals are added on each stock page.',
      disclaimer: SENTIMENT_DISCLAIMER,
      serverTime: Date.now(),
    });
  });


  // Statistical ranges, ATR, support/resistance, pattern targets (education, not forecasts)
  app.get('/api/projections', async (req, res) => {
    const asset = getAssetBySymbol(String(req.query.symbol || ''));
    if (!asset) {
      res.status(400).json({ error: 'Unknown symbol' });
      return;
    }
    try {
      res.json(await getProjections(asset, req.query.fib === '1'));
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Projections unavailable' });
    }
  });


  // Evidence: point-in-time back-test of the sentiment scores per market (IC, hit rate, spread)
  app.get('/api/sentiment/validation', async (req, res) => {
    const market = req.query.market === 'us' ? 'us' : req.query.market === 'crypto' ? 'crypto' : 'idx';
    await ensureCrossDerived(market);
    if (market === 'crypto') noteBinanceDemand();
    else crossSections[market].touch();
    const cached = validationCache.get(market);
    if (!cached || cached.expiresAt <= Date.now()) runValidation(market);
    res.json({
      market,
      status: cached ? 'ready' : SERVERLESS || (validationNoData.has(market) && !validationRunning.has(market)) ? 'waiting-for-data' : 'computing',
      result: cached?.data ?? null,
      scans: market === 'crypto' ? binanceStatus() : crossStatus(market),
      disclaimer: SENTIMENT_DISCLAIMER,
    });
  });

  // ---- Binance (public market data only; no API key) ----------------------------------------
  // Top-100 USDT pairs with live price, 1h/4h/24h/7d change, volume and funding
  app.get(['/api/crypto/binance', '/api/crypto/binance/overview'], async (_req, res) => {
    await warmBinance();
    const byPair = new Map(ASSETS.filter((a) => a.binanceSpot).map((a) => [a.binanceSpot as string, a]));
    const quotes = spotQuotes();
    const fundingOf = (base: string) => fundingFor(`${base}USDT`) ?? fundingFor(`1000${base}USDT`);
    const rows = binanceUniverse().map((p) => {
      const q = quotes.get(p.symbol);
      const w = windowChanges(cachedClosedKlines(p.symbol, '1h').concat(), q?.price ?? NaN);
      const f = fundingOf(p.baseAsset);
      const asset = byPair.get(p.symbol);
      // Short / Medium / Long scores from closed daily candles, funding and (linked coins) news
      const daily = cachedClosedKlines(p.symbol, '1d').map((k) => k.close);
      const news = asset ? newsByHorizon(driverNewsFor(asset), 'crypto', asset.symbol, Date.now()) : null;
      const input = {
        group: 'crypto' as const,
        technicalShort: shortTechnical(daily)?.score ?? null,
        tsMomentum: tsMomentumScore(daily, 365),
        trend: trendScore(daily),
        derivatives: f ? derivativesScore({ fundingRate: f.lastFundingRate }) : null,
        binance: true,
        news,
      };
      const scores = Object.fromEntries(HORIZONS.map((h) => [h, scoreHorizon(h, input)]).map(([h, r]) => [h, { score: (r as HorizonScore).score, label: (r as HorizonScore).label }]));
      return {
        scores,
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

  // One pair: candles of a timeframe plus funding (plan name /api/crypto/binance/pair)
  app.get('/api/crypto/binance/pair', async (req, res) => {
    const symbol = String(req.query.symbol || '');
    const tf = String(req.query.tf || '1d') as KlineInterval;
    if (!['1h', '4h', '1d', '1w'].includes(tf)) {
      res.status(400).json({ error: 'tf must be 1h, 4h, 1d or 1w' });
      return;
    }
    await warmBinance(2000);
    if (!isKnownSpotPair(symbol)) {
      res.status(404).json({ error: 'Unknown Binance pair', status: binanceStatus() });
      return;
    }
    try {
      const base = symbol.replace(/USDT$/, '');
      const klines = await getBinanceKlines(symbol, tf, 500);
      res.json({ symbol, tf, klines, quote: spotQuotes().get(symbol) ?? null, funding: fundingFor(`${base}USDT`) ?? fundingFor(`1000${base}USDT`) ?? null, status: binanceStatus() });
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
    // Serverless: no long-lived responses; 204 tells EventSource not to reconnect (the client polls)
    if (SERVERLESS) {
      res.status(204).end();
      return;
    }
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
    if (SERVERLESS) {
      res.status(204).end();
      return;
    }
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

  // Monthly mining / plantation commodities (World Bank Pink Sheet) for the Radar
  app.get('/api/commodities/monthly', async (_req, res) => {
    try {
      res.json({ ...(await getMonthlyCommodities()), source: 'World Bank Pink Sheet (monthly averages)' });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Monthly commodity prices unavailable' });
    }
  });

  // Health check for the host: answers without touching any data source
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, host: hostingFrom(process.env).host, serverless: SERVERLESS, uptimeSec: Math.round(process.uptime()) });
  });

  return app;
}

/** Always-on server: the app plus the front end (Vite middleware in development, dist in production). */
async function startServer() {
  const app = await createApp();
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
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
    console.log(`AssetRadar server listening on http://localhost:${PORT} (host: ${hostingFrom(process.env).host})`);
    // Warm up the AI outlook so the first visitor does not wait for 10 years of data
    setTimeout(() => getAiOutlook(20).catch((err) => console.warn('[AI] warm-up failed:', err)), 3000);
    // Always-on hosts (Railway) run the daily jobs from a timer; the cron endpoint stays as a backup
    if (internalSchedulerOn(process.env)) {
      console.log('[Jobs] internal scheduler on (checks every 5 minutes)');
      setInterval(() => checkDueJobsSoon(), 5 * 60_000);
      setTimeout(() => checkDueJobsSoon(), 60_000);
    }
  });
}

// On a serverless host the function imports createApp() instead (server/vercelEntry.ts)
if (!SERVERLESS) startServer();
