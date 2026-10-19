/**
 * assets.ts — Shared types and the single source of truth for every tracked instrument.
 * Holds the price/news/chart data types used by both server and client, the list of the
 * monitored assets (crypto, JCI, global indices, gold, major currencies; TradingView
 * symbols, Yahoo/Indodax data sources, exchange, Terminal code, news queries),
 * asset groups shown on the Radar, and the chart timeframe options.
 */

export type AssetGroup = 'crypto' | 'stock' | 'index' | 'gold' | 'forex';

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
  assetTags?: string[]; // related asset codes, e.g. ["BTC"], or "MACRO" for market-wide news
  firstSeenAt?: number; // epoch ms when the server's news hub first saw the story
  geoAlert?: 'high' | 'elevated'; // war/attack headline: "high" = new war or major escalation
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

/** Trading venue, used for open/closed status (see utils/marketHours.ts). */
export type ExchangeId = 'CRYPTO' | 'IDX' | 'NYSE' | 'TSE' | 'LSE' | 'XETRA' | 'HKEX' | 'SGX' | 'FX';

export interface AssetConfig {
  id: string;
  symbol: string;
  /** Short uppercase code used by Terminal commands and news tags, e.g. "BTC", "SPX", "EUR". */
  code: string;
  /** Extra Terminal command aliases, e.g. ["IHSG"] for JCI. */
  aliases?: string[];
  exchange: ExchangeId;
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
  /**
   * Google News queries (English / Indonesian edition). Only the core assets have them, to keep
   * Google request volume low; other assets get news via keyword tagging of publisher feeds.
   */
  newsQuery?: string;
  newsQueryId?: string;
}

export const ASSETS: AssetConfig[] = [
  {
    id: 'btc',
    code: 'BTC',
    exchange: 'CRYPTO',
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
    code: 'ETH',
    exchange: 'CRYPTO',
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
    code: 'SOL',
    exchange: 'CRYPTO',
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
    code: 'JCI',
    aliases: ['IHSG', 'JKSE'],
    exchange: 'IDX',
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
    code: 'GOLD',
    aliases: ['XAU', 'EMAS'],
    exchange: 'FX',
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
    code: 'USD',
    aliases: ['USDIDR'],
    exchange: 'FX',
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
  // ---- Global stock indices (Yahoo Finance, delayed) ----
  globalIndex('spx', 'SPX', '^GSPC', 'S&P 500', 'NYSE', 'FOREXCOM:SPXUSD', 'US', ['SP500', 'S&P'],
    'The 500 largest listed US companies, the main benchmark for the US stock market. NYSE/Nasdaq hours: 09:30–16:00 New York time.'),
  globalIndex('ndx', 'NDX', '^NDX', 'Nasdaq 100', 'NYSE', 'FOREXCOM:NSXUSD', 'US', ['NASDAQ', 'NAS100'],
    'The 100 largest non-financial companies on the Nasdaq, dominated by technology stocks.'),
  globalIndex('dji', 'DJI', '^DJI', 'Dow Jones Industrial Average', 'NYSE', 'FOREXCOM:DJI', 'US', ['DOW'],
    'A price-weighted index of 30 large US blue-chip companies.'),
  globalIndex('n225', 'N225', '^N225', 'Nikkei 225', 'TSE', 'TVC:NI225', 'Japan', ['NIKKEI', 'JAPAN'],
    'The main Tokyo Stock Exchange index of 225 Japanese companies. Hours: 09:00–15:30 Tokyo time.'),
  globalIndex('ftse', 'FTSE', '^FTSE', 'FTSE 100', 'LSE', 'FOREXCOM:UKXGBP', 'UK', ['LONDON', 'UK100'],
    'The 100 largest companies on the London Stock Exchange. Hours: 08:00–16:30 London time.'),
  globalIndex('dax', 'DAX', '^GDAXI', 'DAX 40', 'XETRA', 'XETR:DAX', 'Germany', ['GERMANY'],
    'The 40 largest German companies on the Frankfurt exchange (Xetra), the eurozone benchmark.'),
  globalIndex('hsi', 'HSI', '^HSI', 'Hang Seng Index', 'HKEX', 'TVC:HSI', 'Hong Kong', ['HANGSENG'],
    'The main Hong Kong stock index, a gauge of Chinese and Hong Kong large caps.'),
  globalIndex('sti', 'STI', '^STI', 'Straits Times Index', 'SGX', 'TVC:STI', 'Singapore', ['SINGAPORE'],
    'The benchmark index of the 30 largest companies on the Singapore Exchange.'),
  {
    id: 'dxy',
    code: 'DXY',
    aliases: ['DOLLARINDEX'],
    exchange: 'FX',
    symbol: 'DXY',
    yahooSymbol: 'DX-Y.NYB',
    shortName: 'DXY',
    name: 'US Dollar Index',
    group: 'forex',
    currency: 'PTS',
    tvSymbol: 'TVC:DXY',
    tvWidgetUnsupported: true, // TVC:* symbols are "only available on TradingView" in the widget
    sourceLabel: 'Yahoo Finance',
    unitLabel: 'Index Points',
    description:
      'The value of the US dollar against a basket of six major currencies (EUR, JPY, GBP, CAD, SEK, CHF).',
  },
  // ---- Major currencies against the Rupiah ----
  rupiahPair('eur', 'EUR', 'Euro'),
  rupiahPair('sgd', 'SGD', 'Singapore Dollar'),
  rupiahPair('jpy', 'JPY', 'Japanese Yen'),
  rupiahPair('gbp', 'GBP', 'British Pound'),
  rupiahPair('cny', 'CNY', 'Chinese Yuan'),
  rupiahPair('aud', 'AUD', 'Australian Dollar'),
];

function globalIndex(
  id: string,
  code: string,
  yahooSymbol: string,
  name: string,
  exchange: ExchangeId,
  tvSymbol: string,
  region: string,
  aliases: string[],
  description: string
): AssetConfig {
  return {
    id,
    code,
    aliases,
    exchange,
    symbol: yahooSymbol,
    yahooSymbol,
    shortName: code,
    name,
    group: 'index',
    currency: 'PTS',
    tvSymbol,
    // TVC:* indices are not embeddable ("only available on TradingView"); XETR:DAX is D/W only
    tvWidgetUnsupported: tvSymbol.startsWith('TVC:') ? true : undefined,
    usesBackupChartFallback: tvSymbol === 'XETR:DAX' ? true : undefined,
    sourceLabel: 'Yahoo Finance',
    unitLabel: `Index Points (${region})`,
    description,
  };
}

function rupiahPair(id: string, code: string, currencyName: string): AssetConfig {
  return {
    id: `${id}idr`,
    code,
    aliases: [`${code}IDR`],
    exchange: 'FX',
    symbol: `${code}/IDR`,
    yahooSymbol: `${code}IDR=X`,
    shortName: `${code}/IDR`,
    name: `${currencyName} to Indonesian Rupiah`,
    group: 'forex',
    currency: 'IDR',
    tvSymbol: `FX_IDC:${code}IDR`,
    sourceLabel: 'Yahoo Finance',
    unitLabel: `Rupiah per 1 ${code}`,
    description: `The ${currencyName} (${code}) exchange rate against the Indonesian Rupiah.`,
  };
}

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
    key: 'index',
    title: 'Global Indices',
    subtitle: 'US, Japan, London, Germany, Hong Kong and Singapore benchmarks (delayed)',
  },
  {
    key: 'gold',
    title: 'Gold',
    subtitle: 'Spot XAU/USD precious metal with Rupiah-per-gram conversion',
  },
  {
    key: 'forex',
    title: 'Forex',
    subtitle: 'Major currencies against the Rupiah, plus the US Dollar Index',
  },
];

export function getAssetBySymbol(symbol: string): AssetConfig | undefined {
  return ASSETS.find((item) => item.symbol === symbol || item.id === symbol);
}

/** Finds an asset by its code or an alias (case-insensitive), e.g. "spx", "IHSG", "EUR". */
export function getAssetByCode(code: string): AssetConfig | undefined {
  const c = code.trim().toUpperCase();
  return ASSETS.find((a) => a.code === c || a.aliases?.includes(c));
}

export function isValidTimeframe(val: string): val is TimeframeInterval {
  return TIMEFRAME_OPTIONS.some((opt) => opt.interval === val);
}
