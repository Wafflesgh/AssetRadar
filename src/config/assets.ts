/**
 * assets.ts — Shared types and the single source of truth for every tracked instrument.
 * Holds the price/news/chart data types used by both server and client, the list of the
 * six monitored assets (TradingView symbols, Yahoo/Indodax data sources, news queries),
 * asset groups shown on the Radar, and the chart timeframe options.
 */

export type AssetGroup = 'crypto' | 'stock' | 'gold' | 'forex';

export type PriceCurrency = 'IDR' | 'USD' | 'PTS';

export type PriceStatus = 'live' | 'delayed' | 'error';

export interface SparklinePoint {
  time: number; // unix timestamp in seconds (for lightweight-charts)
  value: number;
}

export type PriceTick = {
  symbol: string; // "BTC/IDR", "^JKSE", "XAU/USD", "USD/IDR"
  group: AssetGroup;
  price: number;
  changePct24h?: number;
  high24h?: number;
  low24h?: number;
  priceIdrPerGram?: number;
  isMarketOpen?: boolean;
  sparkline?: SparklinePoint[];
  currency: PriceCurrency;
  source: string;
  updatedAt: number; // epoch ms
  status: PriceStatus;
  errorMessage?: string;
  fromSnapshot?: boolean; // true when the tick comes from saved data (offline)
};

export type SentimentLabel = 'Bullish' | 'Neutral' | 'Bearish';

export interface MarketNewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  publishedAtMs?: number; // epoch ms (used to sort the news feed)
  assetTags?: string[]; // related asset codes, e.g. ["BTC"]
  sentiment: SentimentLabel;
}

export interface OhlcCandle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface CorrelationMatrix {
  labels: string[];
  symbols: string[];
  matrix: Array<Array<number | null>>;
  windowDays: number;
  updatedAt: number;
}

export interface AssetIntelligence {
  symbol: string;
  sentimentScore: number; // 0 - 100
  sentimentLabel: SentimentLabel;
  summary: string;
  keyFactors: string[];
  news: MarketNewsItem[];
  updatedAt: number;
  aiPowered: boolean;
}

export type TimeframeInterval = '1' | '5' | '15' | '30' | '60' | '240' | 'D' | 'W';

export interface TimeframeOption {
  label: string;
  interval: TimeframeInterval;
  title: string;
}

export const TIMEFRAME_OPTIONS: TimeframeOption[] = [
  { label: '1m', interval: '1', title: '1 Minute' },
  { label: '5m', interval: '5', title: '5 Minutes' },
  { label: '15m', interval: '15', title: '15 Minutes' },
  { label: '30m', interval: '30', title: '30 Minutes' },
  { label: '1H', interval: '60', title: '1 Hour' },
  { label: '4H', interval: '240', title: '4 Hours' },
  { label: '1D', interval: 'D', title: '1 Day' },
  { label: '1W', interval: 'W', title: '1 Week' },
];

export const DEFAULT_TIMEFRAME: TimeframeInterval = '15';

export interface AssetConfig {
  id: string;
  symbol: string;
  indodaxPair?: string; // e.g. "btcidr", "ethidr", "solidr"
  yahooSymbol?: string; // e.g. "^JKSE", "IDR=X", "GC=F"
  shortName: string;
  name: string;
  group: AssetGroup;
  currency: PriceCurrency;
  secondaryCurrency?: PriceCurrency;
  tvSymbol: string;
  tvFallbackSymbol?: string;
  usesBackupChartFallback?: boolean;
  /**
   * The TradingView widget rejects tvSymbol ("This symbol is not available"; INDODAX:*IDR,
   * checked 19 Oct 2026): the alternative chart is used automatically, and choosing
   * TradingView uses tvFallbackSymbol instead.
   */
  tvWidgetUnsupported?: boolean;
  sourceLabel: string;
  unitLabel: string;
  description: string;
  /** Google News query for the English edition. */
  newsQuery: string;
  /** Google News query for the Indonesian edition (articles keep their original language). */
  newsQueryId: string;
}

export const ASSETS: AssetConfig[] = [
  {
    id: 'btc',
    symbol: 'BTC/IDR',
    indodaxPair: 'btcidr',
    yahooSymbol: 'BTC-IDR',
    shortName: 'BTC',
    name: 'Bitcoin',
    group: 'crypto',
    currency: 'IDR',
    tvSymbol: 'INDODAX:BTCIDR',
    tvFallbackSymbol: 'BINANCE:BTCUSDT',
    tvWidgetUnsupported: true,
    sourceLabel: 'Indodax',
    unitLabel: 'Rupiah (IDR)',
    description:
      'The largest crypto asset by market capitalization, traded directly against the Rupiah on the Indodax exchange.',
    newsQuery: 'Bitcoin BTC price crypto market',
    newsQueryId: 'Bitcoin BTC harga crypto pasar',
  },
  {
    id: 'eth',
    symbol: 'ETH/IDR',
    indodaxPair: 'ethidr',
    yahooSymbol: 'ETH-IDR',
    shortName: 'ETH',
    name: 'Ethereum',
    group: 'crypto',
    currency: 'IDR',
    tvSymbol: 'INDODAX:ETHIDR',
    tvFallbackSymbol: 'BINANCE:ETHUSDT',
    tvWidgetUnsupported: true,
    sourceLabel: 'Indodax',
    unitLabel: 'Rupiah (IDR)',
    description: 'The leading smart-contract network of the blockchain ecosystem, priced in Rupiah.',
    newsQuery: 'Ethereum ETH crypto blockchain',
    newsQueryId: 'Ethereum ETH kripto blockchain',
  },
  {
    id: 'sol',
    symbol: 'SOL/IDR',
    indodaxPair: 'solidr',
    yahooSymbol: 'SOL-IDR',
    shortName: 'SOL',
    name: 'Solana',
    group: 'crypto',
    currency: 'IDR',
    tvSymbol: 'INDODAX:SOLIDR',
    tvFallbackSymbol: 'BINANCE:SOLUSDT',
    tvWidgetUnsupported: true,
    sourceLabel: 'Indodax',
    unitLabel: 'Rupiah (IDR)',
    description: 'A high-speed, low-fee blockchain infrastructure, priced in Rupiah.',
    newsQuery: 'Solana SOL crypto market',
    newsQueryId: 'Solana SOL crypto pasar',
  },
  {
    id: 'jci',
    symbol: '^JKSE',
    yahooSymbol: '^JKSE',
    shortName: 'JCI',
    name: 'Jakarta Composite Index',
    group: 'stock',
    currency: 'PTS',
    tvSymbol: 'IDX:COMPOSITE',
    usesBackupChartFallback: true,
    sourceLabel: 'Yahoo Finance',
    unitLabel: 'Index Points',
    description:
      'The main benchmark index of all stocks listed on the Indonesia Stock Exchange (IDX). Trading hours: Mon–Fri 09:00–16:00 WIB.',
    newsQuery: 'Jakarta Composite Index IHSG Indonesia stock exchange',
    newsQueryId: 'IHSG saham Bursa Efek Indonesia BEI',
  },
  {
    id: 'xau',
    symbol: 'XAU/USD',
    yahooSymbol: 'GC=F',
    shortName: 'Gold',
    name: 'Spot Gold (XAU)',
    group: 'gold',
    currency: 'USD',
    secondaryCurrency: 'IDR',
    tvSymbol: 'OANDA:XAUUSD',
    sourceLabel: 'Spot XAU',
    unitLabel: 'USD/oz & IDR/gram',
    description:
      'The world spot price of pure gold per troy ounce (31.1034768 grams), with a direct conversion to Rupiah per gram.',
    newsQuery: 'gold price XAU spot',
    newsQueryId: 'Harga emas dunia XAU Antam logam mulia',
  },
  {
    id: 'usdidr',
    symbol: 'USD/IDR',
    yahooSymbol: 'IDR=X',
    shortName: 'USD/IDR',
    name: 'US Dollar to Indonesian Rupiah',
    group: 'forex',
    currency: 'IDR',
    tvSymbol: 'FX_IDC:USDIDR',
    sourceLabel: 'Yahoo Finance',
    unitLabel: 'Rupiah per 1 USD',
    description:
      'The US Dollar to Indonesian Rupiah exchange rate, the reference for converting global asset prices.',
    newsQuery: 'Rupiah USD IDR exchange rate Bank Indonesia',
    newsQueryId: 'Kurs Rupiah USD IDR Bank Indonesia Dolar',
  },
];

export interface AssetGroupMeta {
  key: AssetGroup;
  title: string;
  subtitle: string;
}

export const ASSET_GROUPS: AssetGroupMeta[] = [
  {
    key: 'crypto',
    title: 'Crypto',
    subtitle: '24/7 digital asset market in Rupiah (Indodax Live)',
  },
  {
    key: 'stock',
    title: 'Stocks',
    subtitle: 'Indonesia Stock Exchange index (Mon–Fri 09:00–16:00 WIB)',
  },
  {
    key: 'gold',
    title: 'Gold',
    subtitle: 'Spot XAU/USD precious metal with Rupiah-per-gram conversion',
  },
  {
    key: 'forex',
    title: 'Forex',
    subtitle: 'Reference USD to Rupiah exchange rate',
  },
];

export function getAssetBySymbol(symbol: string): AssetConfig | undefined {
  return ASSETS.find((item) => item.symbol === symbol || item.id === symbol);
}

export function isValidTimeframe(val: string): val is TimeframeInterval {
  return TIMEFRAME_OPTIONS.some((opt) => opt.interval === val);
}
