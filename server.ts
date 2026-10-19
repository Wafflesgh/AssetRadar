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
import { isIdxMarketOpen } from './src/utils/marketHours.ts';
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
const newsCache = new Map<string, CacheEntry<MarketNewsItem[]>>();
const historyCache = new Map<string, CacheEntry<OhlcCandle[]>>();
const correlationCache: { entry: CacheEntry<CorrelationMatrix> | null } = { entry: null };
const newsFeedCache: { entry: CacheEntry<MarketNewsItem[]> | null } = { entry: null };

const NEWS_CACHE_MS = 10 * 60_000;

/** Ambil berita Google News Indonesia untuk satu aset (cache 10 menit). */
async function fetchNewsForAsset(asset: (typeof ASSETS)[number]): Promise<MarketNewsItem[]> {
  const now = Date.now();
  const cached = newsCache.get(asset.symbol);
  if (cached && cached.expiresAt > now) return cached.data;
  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
      asset.newsQuery
    )}&hl=id&gl=ID&ceid=ID:id`;
    const rssRes = await fetchWithTimeout(rssUrl, {}, 5000);
    if (!rssRes.ok) return cached?.data ?? [];
    const xml = await rssRes.text();
    const items = parseRssItems(xml, 8).map((item) => ({
      ...item,
      id: `${asset.id}-${item.id}`,
      assetTags: [asset.shortName.toUpperCase()],
    }));
    newsCache.set(asset.symbol, { data: items, expiresAt: now + NEWS_CACHE_MS });
    return items;
  } catch (err) {
    console.warn(`[Berita] Gagal memuat RSS untuk ${asset.symbol}:`, err);
    return cached?.data ?? [];
  }
}

// Pemetaan timeframe aplikasi -> parameter Yahoo Finance & Indodax (rangeSec ≈ range Yahoo)
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
  if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status} untuk ${yahooSymbol}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Data Yahoo Finance kosong untuk ${yahooSymbol}`);
  return result;
}

/** Candle OHLC dari Indodax (crypto Rupiah; Yahoo tidak punya pasangan BTC-IDR dkk.). */
async function fetchIndodaxCandles(indodaxPair: string, interval: string): Promise<OhlcCandle[]> {
  const cfg = HISTORY_INTERVALS[interval];
  if (!cfg) throw new Error(`Interval tidak dikenal: ${interval}`);
  const nowSec = Math.floor(Date.now() / 1000);
  const url = `https://indodax.com/tradingview/history_v2?symbol=${encodeURIComponent(
    indodaxPair.toUpperCase()
  )}&tf=${cfg.indodaxTf}&from=${nowSec - cfg.rangeSec}&to=${nowSec}`;
  const res = await fetchWithTimeout(url, {}, 8000);
  if (!res.ok) throw new Error(`Indodax HTTP ${res.status} untuk ${indodaxPair}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error(`Data candle Indodax kosong untuk ${indodaxPair}`);
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

/** Candle OHLC untuk grafik alternatif: crypto dari Indodax, aset lain dari Yahoo Finance. */
async function getHistoryCandles(
  asset: (typeof ASSETS)[number],
  interval: string
): Promise<OhlcCandle[]> {
  const cfg = HISTORY_INTERVALS[interval];
  if (!cfg) throw new Error(`Interval tidak dikenal: ${interval}`);
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
  if (!yahooSymbol) throw new Error(`Tidak ada sumber grafik untuk ${asset.symbol}`);
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
  { yahoo: 'SOL-USD', label: 'SOL' },
  { yahoo: '^JKSE', label: 'IHSG' },
  { yahoo: 'GC=F', label: 'EMAS' },
  { yahoo: 'IDR=X', label: 'USD/IDR' },
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
        console.warn(`[Korelasi] Gagal memuat ${yahoo}:`, err);
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

async function getNewsFeed(): Promise<MarketNewsItem[]> {
  const now = Date.now();
  if (newsFeedCache.entry && newsFeedCache.entry.expiresAt > now) return newsFeedCache.entry.data;
  const lists = await Promise.all(ASSETS.map((a) => fetchNewsForAsset(a)));
  const byKey = new Map<string, MarketNewsItem>();
  for (const item of lists.flat()) {
    const key = item.link || item.title;
    const existing = byKey.get(key);
    if (existing) {
      const tags = new Set([...(existing.assetTags ?? []), ...(item.assetTags ?? [])]);
      byKey.set(key, { ...existing, assetTags: [...tags] });
    } else {
      byKey.set(key, item);
    }
  }
  const feed = [...byKey.values()]
    .sort((a, b) => (b.publishedAtMs ?? 0) - (a.publishedAtMs ?? 0))
    .slice(0, 20);
  newsFeedCache.entry = { data: feed, expiresAt: now + NEWS_CACHE_MS };
  return feed;
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
    // Cache sparkline selama 5 menit (300_000 ms) per pair
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

async function getYahooQuote(
  yahooSymbol: string,
  appSymbol: string,
  group: 'saham' | 'kurs' | 'emas',
  currency: 'PTS' | 'IDR' | 'USD',
  cacheMs: number = 60_000
): Promise<PriceTick> {
  const now = Date.now();
  const cached = yahooCache.get(appSymbol);
  if (cached && cached.expiresAt > now) {
    return {
      ...cached.data,
      isMarketOpen: appSymbol === '^JKSE' ? isIdxMarketOpen(now) : undefined,
    };
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooSymbol
  )}?interval=15m&range=2d`;
  const res = await fetchWithTimeout(url, {}, 8000);
  if (!res.ok) {
    throw new Error(`Yahoo Finance HTTP ${res.status} untuk ${yahooSymbol}`);
  }

  const json = await res.json();
  const chartResult = json?.chart?.result?.[0];
  if (!chartResult || !chartResult.meta) {
    throw new Error(`Data Yahoo Finance kosong untuk ${yahooSymbol}`);
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
    isMarketOpen: appSymbol === '^JKSE' ? isIdxMarketOpen(now) : undefined,
    currency,
    source: 'Yahoo Finance',
    updatedAt: meta.regularMarketTime ? Number(meta.regularMarketTime) * 1000 : now,
    status: appSymbol === '^JKSE' ? 'tertunda' : 'live',
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
    yahooGold = await getYahooQuote('GC=F', 'XAU/USD', 'emas', 'USD', 300_000);
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
    throw new Error('Harga spot emas XAU/USD tidak tersedia saat ini');
  }

  const priceIdrPerGram =
    usdIdrRate > 0 ? convertXauUsdToIdrPerGram(spotPriceUsd, usdIdrRate) : undefined;

  const goldTick: PriceTick = {
    symbol: 'XAU/USD',
    group: 'emas',
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

  // Berita nyata dari Google News Indonesia (cache 10 menit)
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
            : 'Tidak ada berita spesifik hari ini.';

        const prompt = `Analisis sentimen pasar saat ini dalam Bahasa Indonesia untuk aset ${asset.name} (${asset.symbol}).
Data harga saat ini: ${tick?.price ?? 'N/A'} (${asset.currency}), perubahan 24 jam: ${
          tick?.changePct24h !== undefined ? tick.changePct24h.toFixed(2) + '%' : 'N/A'
        }.
Berita terbaru:
${headlinesList}

Berikan skor sentimen (0-100), label ("Bullish", "Netral", atau "Bearish"), ringkasan 2 kalimat yang objektif dan edukatif (bukan saran jual/beli), serta 3 faktor penggerak utama.`;

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
              parsed.sentimentLabel === 'Netral' ||
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
        console.warn(`[Gemini Sentiment Error untuk ${asset.symbol}]:`, err);
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

  // 1. All market snapshot endpoint (Indodax + Yahoo IHSG & USD/IDR + Gold XAU/USD)
  app.get('/api/market/snapshot', async (_req, res) => {
    const ticks: Record<string, PriceTick> = {};
    const now = Date.now();

    const [indodaxResult, ihsgResult, usdIdrResult] = await Promise.allSettled([
      getIndodaxPrices(),
      getYahooQuote('^JKSE', '^JKSE', 'saham', 'PTS', 60_000),
      getYahooQuote('IDR=X', 'USD/IDR', 'kurs', 'IDR', 60_000),
    ]);

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
          errorMessage: 'Data Indodax tidak tersedia',
        };
      }
    }

    if (ihsgResult.status === 'fulfilled') {
      ticks['^JKSE'] = ihsgResult.value;
    } else {
      ticks['^JKSE'] = {
        symbol: '^JKSE',
        group: 'saham',
        price: NaN,
        currency: 'PTS',
        source: 'Yahoo Finance',
        updatedAt: now,
        status: 'error',
        errorMessage: 'Data IHSG tidak tersedia',
      };
    }

    let usdIdrRate = 0;
    if (usdIdrResult.status === 'fulfilled') {
      ticks['USD/IDR'] = usdIdrResult.value;
      usdIdrRate = usdIdrResult.value.price;
    } else {
      ticks['USD/IDR'] = {
        symbol: 'USD/IDR',
        group: 'kurs',
        price: NaN,
        currency: 'IDR',
        source: 'Yahoo Finance',
        updatedAt: now,
        status: 'error',
        errorMessage: 'Data kurs USD/IDR tidak tersedia',
      };
    }

    try {
      const goldTick = await getGoldTick(usdIdrRate);
      ticks['XAU/USD'] = goldTick;
    } catch {
      ticks['XAU/USD'] = {
        symbol: 'XAU/USD',
        group: 'emas',
        price: NaN,
        currency: 'USD',
        source: 'Spot XAU',
        updatedAt: now,
        status: 'error',
        errorMessage: 'Data emas tidak tersedia',
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
        error: err instanceof Error ? err.message : 'Gagal mengambil data Indodax',
      });
    }
  });

  // 3. Yahoo Finance endpoint (for 60s IHSG & USD/IDR polling)
  app.get('/api/market/yahoo', async (_req, res) => {
    const now = Date.now();
    const [ihsgResult, usdIdrResult] = await Promise.allSettled([
      getYahooQuote('^JKSE', '^JKSE', 'saham', 'PTS', 60_000),
      getYahooQuote('IDR=X', 'USD/IDR', 'kurs', 'IDR', 60_000),
    ]);

    const ticks: Record<string, PriceTick> = {};
    if (ihsgResult.status === 'fulfilled') {
      ticks['^JKSE'] = ihsgResult.value;
    }
    if (usdIdrResult.status === 'fulfilled') {
      ticks['USD/IDR'] = usdIdrResult.value;
    }
    res.json({ ticks, serverTime: now, idxMarketOpen: isIdxMarketOpen(now) });
  });

  // 4. Gold endpoint (cached 5 mins)
  app.get('/api/market/gold', async (_req, res) => {
    try {
      let usdIdrRate = yahooCache.get('USD/IDR')?.data?.price ?? 0;
      if (!usdIdrRate) {
        try {
          const usdTick = await getYahooQuote('IDR=X', 'USD/IDR', 'kurs', 'IDR', 60_000);
          usdIdrRate = usdTick.price;
        } catch {
          usdIdrRate = 0;
        }
      }
      const tick = await getGoldTick(usdIdrRate);
      res.json({ tick, serverTime: Date.now() });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Gagal mengambil harga emas',
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
        error: err instanceof Error ? err.message : 'Gagal memuat analisis sentimen dan berita',
      });
    }
  });

  // 6. Candle OHLC untuk grafik alternatif (Yahoo Finance)
  app.get('/api/market/history', async (req, res) => {
    const symbol = String(req.query.symbol || '');
    const interval = String(req.query.interval || '15');
    const asset = getAssetBySymbol(symbol);
    if (!asset || (!asset.yahooSymbol && !asset.indodaxPair)) {
      res.status(400).json({ error: 'Simbol tidak didukung' });
      return;
    }
    if (!HISTORY_INTERVALS[interval]) {
      res.status(400).json({ error: 'Interval tidak didukung' });
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
        error: err instanceof Error ? err.message : 'Gagal memuat data grafik',
      });
    }
  });

  // 7. Matriks korelasi 30 hari (cache 6 jam)
  app.get('/api/market/correlation', async (_req, res) => {
    try {
      res.json(await getCorrelationMatrix());
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Gagal menghitung korelasi',
      });
    }
  });

  // 8. Umpan berita gabungan semua aset (cache 10 menit)
  app.get('/api/market/news-feed', async (_req, res) => {
    try {
      res.json({ items: await getNewsFeed(), updatedAt: Date.now() });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Gagal memuat umpan berita',
      });
    }
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
