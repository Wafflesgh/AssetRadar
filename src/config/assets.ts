/**
 * assets.ts — Shared types and the single source of truth for every tracked instrument.
 * Holds the price/news/chart data types used by both server and client, the ~115 monitored
 * assets (commodities, crypto, Indonesian, US and world stocks, indices, currencies) with
 * their data sources (Yahoo/Indodax), TradingView symbols, exchange, Terminal code, news
 * keywords and supply (for live market cap), the Radar groups and the chart timeframes.
 */

export type AssetGroup = 'commodity' | 'crypto' | 'idStock' | 'usStock' | 'globalStock' | 'index' | 'forex';

/** Quote currency. PTS = index points; USX = US cents (some agricultural futures). */
export type PriceCurrency = 'IDR' | 'USD' | 'PTS' | 'USX' | 'SAR' | 'KRW' | 'HKD';

export type PriceStatus = 'live' | 'delayed' | 'error';

export interface SparklinePoint {
  time: number; // unix timestamp in seconds (for lightweight-charts)
  value: number;
}

export type PriceTick = {
  symbol: string; // "BTC/IDR", "^JKSE", "XAU/USD", "USD/IDR", "AAPL"...
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
  /** Live market capitalization in USD (price × supply, or CoinGecko for crypto). */
  marketCapUsd?: number;
  /** % change over the last hour / 7 days / 30 days (for the movers tables). */
  changePct1h?: number;
  changePct7d?: number;
  changePct30d?: number;
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
export type ExchangeId =
  | 'CRYPTO'
  | 'IDX'
  | 'NYSE'
  | 'TSE'
  | 'LSE'
  | 'XETRA'
  | 'EURONEXT'
  | 'HKEX'
  | 'SGX'
  | 'KRX'
  | 'SSE'
  | 'NSE'
  | 'ASX'
  | 'TADAWUL'
  | 'FX'
  | 'FUTURES';

export interface AssetConfig {
  id: string;
  symbol: string;
  /** Short uppercase code used by Terminal commands and news tags, e.g. "BTC", "SPX", "BBCA". */
  code: string;
  /** Extra Terminal command / search aliases, e.g. ["IHSG"] for JCI. */
  aliases?: string[];
  exchange: ExchangeId;
  indodaxPair?: string; // e.g. "btcidr"
  yahooSymbol?: string; // e.g. "^JKSE", "IDR=X", "GC=F", "BBCA.JK"
  shortName: string;
  name: string;
  group: AssetGroup;
  currency: PriceCurrency;
  secondaryCurrency?: PriceCurrency;
  /** Price unit suffix, e.g. "/oz", "/bbl". */
  unit?: string;
  tvSymbol: string;
  tvFallbackSymbol?: string;
  usesBackupChartFallback?: boolean;
  /**
   * The TradingView widget rejects tvSymbol ("This symbol is not available"): the alternative
   * chart is used automatically, and choosing TradingView uses tvFallbackSymbol instead.
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
  /** Whole-word headline keywords that tag news to this asset (lowercase). */
  keywords?: string[];
  /** Units outstanding so that market cap = price × supply (shares, troy oz...). */
  supply?: number;
  /** CoinGecko id, for live crypto market caps. */
  coingeckoId?: string;
  /** Shown in the Radar "Quick Chart & Detail" bar. */
  quick?: boolean;
  /** Included in the AI Advisor (5-year backtest). */
  ai?: boolean;
}

// ---------------------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------------------

function crypto(
  base: string,
  name: string,
  coingeckoId: string,
  keywords: string[],
  extra: Partial<AssetConfig> = {}
): AssetConfig {
  const code = base.toUpperCase();
  return {
    id: base,
    code,
    exchange: 'CRYPTO',
    symbol: `${code}/IDR`,
    indodaxPair: `${base}idr`,
    shortName: code,
    name,
    group: 'crypto',
    currency: 'IDR',
    tvSymbol: `INDODAX:${code}IDR`,
    tvFallbackSymbol: `BINANCE:${code}USDT`,
    tvWidgetUnsupported: true,
    sourceLabel: 'Indodax',
    unitLabel: 'Rupiah (IDR)',
    description: `${name} (${code}) traded against the Rupiah on Indodax.`,
    keywords,
    coingeckoId,
    ...extra,
  };
}

function usStock(
  ticker: string,
  name: string,
  supply: number,
  keywords: string[],
  extra: Partial<AssetConfig> = {}
): AssetConfig {
  const code = ticker.replace('-', '.');
  return {
    id: ticker.toLowerCase().replace(/[^a-z0-9]/g, ''),
    code: code.replace('.', ''),
    aliases: code.includes('.') ? [code] : undefined,
    exchange: 'NYSE',
    symbol: ticker,
    yahooSymbol: ticker,
    shortName: code,
    name,
    group: 'usStock',
    currency: 'USD',
    tvSymbol: code,
    sourceLabel: 'Yahoo Finance',
    unitLabel: 'US Dollar per share',
    description: `${name} (${code}), listed in the United States.`,
    keywords,
    supply,
    ...extra,
  };
}

function idStock(
  ticker: string,
  name: string,
  supply: number | undefined,
  keywords: string[],
  extra: Partial<AssetConfig> = {}
): AssetConfig {
  return {
    id: ticker.toLowerCase(),
    code: ticker,
    exchange: 'IDX',
    symbol: `${ticker}.JK`,
    yahooSymbol: `${ticker}.JK`,
    shortName: ticker,
    name,
    group: 'idStock',
    currency: 'IDR',
    tvSymbol: `IDX:${ticker}`,
    usesBackupChartFallback: true, // IDX widget symbols only offer daily/weekly data
    sourceLabel: 'Yahoo Finance',
    unitLabel: 'Rupiah per share',
    description: `${name} (${ticker}), listed on the Indonesia Stock Exchange. Hours: Mon–Fri 09:00–16:00 WIB.`,
    keywords: [ticker.toLowerCase(), ...keywords],
    supply,
    ...extra,
  };
}

function worldStock(
  id: string,
  code: string,
  yahooSymbol: string,
  name: string,
  exchange: ExchangeId,
  currency: PriceCurrency,
  supply: number,
  keywords: string[],
  extra: Partial<AssetConfig> = {}
): AssetConfig {
  return {
    id,
    code,
    exchange,
    symbol: yahooSymbol,
    yahooSymbol,
    shortName: code,
    name,
    group: 'globalStock',
    currency,
    tvSymbol: yahooSymbol,
    tvWidgetUnsupported: true,
    sourceLabel: 'Yahoo Finance',
    unitLabel: `${currency} per share`,
    description: `${name}, one of the largest listed companies outside the US.`,
    keywords,
    supply,
    ...extra,
  };
}

function commodity(
  id: string,
  code: string,
  yahooSymbol: string,
  name: string,
  unit: string,
  currency: PriceCurrency,
  tvSymbol: string | null,
  keywords: string[],
  extra: Partial<AssetConfig> = {}
): AssetConfig {
  return {
    id,
    code,
    exchange: 'FUTURES',
    symbol: yahooSymbol,
    yahooSymbol,
    shortName: name.replace(/ \(.*\)$/, ''),
    name,
    group: 'commodity',
    currency,
    unit,
    tvSymbol: tvSymbol ?? yahooSymbol,
    tvWidgetUnsupported: tvSymbol ? undefined : true,
    sourceLabel: 'Yahoo Finance (futures)',
    unitLabel: `${currency === 'USX' ? 'US cents' : 'US Dollar'} ${unit}`,
    description: `${name} front-month futures price.`,
    keywords,
    ...extra,
  };
}

function globalIndex(
  id: string,
  code: string,
  yahooSymbol: string,
  name: string,
  exchange: ExchangeId,
  tvSymbol: string | null,
  region: string,
  aliases: string[],
  description: string,
  extra: Partial<AssetConfig> = {}
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
    tvSymbol: tvSymbol ?? yahooSymbol,
    // Many index symbols are not embeddable ("only available on TradingView"); XETR:DAX is D/W only
    tvWidgetUnsupported: !tvSymbol || tvSymbol.startsWith('TVC:') ? true : undefined,
    usesBackupChartFallback: tvSymbol === 'XETR:DAX' ? true : undefined,
    sourceLabel: 'Yahoo Finance',
    unitLabel: `Index Points (${region})`,
    description,
    ...extra,
  };
}

function rupiahPair(id: string, code: string, currencyName: string, keywords: string[], extra: Partial<AssetConfig> = {}): AssetConfig {
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
    keywords,
    ai: true,
    ...extra,
  };
}

// ---------------------------------------------------------------------------------------
// The asset list. Supplies (shares / troy oz) were derived from companiesmarketcap.com market
// caps on 19 Oct 2026 divided by the price at that time; market caps are approximate.
// ---------------------------------------------------------------------------------------

export const ASSETS: AssetConfig[] = [
  // ---- Commodities ----
  {
    id: 'xau',
    code: 'GOLD',
    aliases: ['XAU', 'EMAS'],
    exchange: 'FX',
    symbol: 'XAU/USD',
    yahooSymbol: 'GC=F',
    shortName: 'Gold',
    name: 'Spot Gold (XAU)',
    group: 'commodity',
    currency: 'USD',
    secondaryCurrency: 'IDR',
    unit: '/oz',
    tvSymbol: 'OANDA:XAUUSD',
    sourceLabel: 'Spot XAU',
    unitLabel: 'USD/oz & IDR/gram',
    description:
      'The world spot price of pure gold per troy ounce (31.1034768 grams), with a direct conversion to Rupiah per gram.',
    newsQuery: 'gold price XAU spot',
    newsQueryId: 'Harga emas dunia XAU Antam logam mulia',
    supply: 7.0e9, // ≈ 218,000 tonnes of above-ground gold
    quick: true,
    ai: true,
  },
  commodity('xag', 'SILVER', 'SI=F', 'Silver', '/oz', 'USD', 'OANDA:XAGUSD', ['silver', 'perak'], {
    aliases: ['XAG', 'PERAK'],
    supply: 5.62e10,
    ai: true,
  }),
  commodity('wti', 'OIL', 'CL=F', 'Crude Oil (WTI)', '/bbl', 'USD', 'OANDA:WTICOUSD', ['crude oil', 'wti', 'oil prices', 'minyak mentah', 'harga minyak', 'opec'], {
    aliases: ['WTI', 'CRUDE', 'MINYAK'],
    quick: true,
    ai: true,
  }),
  commodity('brent', 'BRENT', 'BZ=F', 'Brent Crude Oil', '/bbl', 'USD', 'OANDA:BCOUSD', ['brent'], { ai: true }),
  commodity('natgas', 'NATGAS', 'NG=F', 'Natural Gas', '/MMBtu', 'USD', 'OANDA:NATGASUSD', ['natural gas', 'gas alam', 'lng'], {
    aliases: ['GAS', 'NG'],
    ai: true,
  }),
  commodity('copper', 'COPPER', 'HG=F', 'Copper', '/lb', 'USD', 'OANDA:XCUUSD', ['copper', 'tembaga'], { aliases: ['HG'], ai: true }),
  commodity('platinum', 'PLAT', 'PL=F', 'Platinum', '/oz', 'USD', 'OANDA:XPTUSD', ['platinum'], { aliases: ['PLATINUM', 'XPT'], ai: true }),
  commodity('coffee', 'COFFEE', 'KC=F', 'Coffee (Arabica)', '/lb', 'USX', null, ['coffee', 'kopi'], { aliases: ['KOPI'] }),
  commodity('wheat', 'WHEAT', 'ZW=F', 'Wheat', '/bu', 'USX', 'OANDA:WHEATUSD', ['wheat', 'gandum'], { aliases: ['GANDUM'] }),

  // ---- Crypto (Indodax, Rupiah) ----
  crypto('btc', 'Bitcoin', 'bitcoin', ['bitcoin', 'btc'], {
    newsQuery: 'Bitcoin BTC price crypto market',
    newsQueryId: 'Bitcoin BTC harga crypto pasar',
    description:
      'The largest crypto asset by market capitalization, traded directly against the Rupiah on the Indodax exchange.',
    quick: true,
    ai: true,
  }),
  crypto('eth', 'Ethereum', 'ethereum', ['ethereum', 'ether', 'eth'], {
    newsQuery: 'Ethereum ETH crypto blockchain',
    newsQueryId: 'Ethereum ETH kripto blockchain',
    description: 'The leading smart-contract network of the blockchain ecosystem, priced in Rupiah.',
    quick: true,
    ai: true,
  }),
  crypto('xrp', 'XRP', 'ripple', ['xrp', 'ripple'], { ai: true }),
  crypto('bnb', 'BNB', 'binancecoin', ['bnb', 'binance coin'], { ai: true }),
  crypto('sol', 'Solana', 'solana', ['solana', 'sol'], {
    newsQuery: 'Solana SOL crypto market',
    newsQueryId: 'Solana SOL crypto pasar',
    description: 'A high-speed, low-fee blockchain infrastructure, priced in Rupiah.',
    ai: true,
  }),
  crypto('doge', 'Dogecoin', 'dogecoin', ['dogecoin', 'doge'], { ai: true }),
  crypto('trx', 'TRON', 'tron', ['tron', 'trx']),
  crypto('ada', 'Cardano', 'cardano', ['cardano']), // "ada" is a common Indonesian word
  crypto('ton', 'Toncoin', 'the-open-network', ['toncoin']),
  crypto('link', 'Chainlink', 'chainlink', ['chainlink']),
  crypto('avax', 'Avalanche', 'avalanche-2', ['avalanche', 'avax']),
  crypto('xlm', 'Stellar', 'stellar', ['stellar', 'xlm']),
  crypto('sui', 'Sui', 'sui', ['sui network', 'sui blockchain']),
  crypto('bch', 'Bitcoin Cash', 'bitcoin-cash', ['bitcoin cash', 'bch']),
  crypto('ltc', 'Litecoin', 'litecoin', ['litecoin', 'ltc']),
  crypto('shib', 'Shiba Inu', 'shiba-inu', ['shiba inu', 'shib']),
  crypto('dot', 'Polkadot', 'polkadot', ['polkadot']),
  crypto('near', 'NEAR Protocol', 'near', ['near protocol']),
  crypto('uni', 'Uniswap', 'uniswap', ['uniswap']),
  crypto('pepe', 'Pepe', 'pepe', ['pepe coin', 'pepecoin', 'memecoin pepe']),

  // ---- Indonesian stocks (IDX, delayed) ----
  idStock('BBCA', 'Bank Central Asia', 1.229e11, ['bank central asia', 'bca'], { ai: true }),
  idStock('BBRI', 'Bank Rakyat Indonesia', 1.483e11, ['bank rakyat indonesia', 'bri'], { ai: true }),
  idStock('BMRI', 'Bank Mandiri', 9.228e10, ['bank mandiri'], { ai: true }),
  idStock('BBNI', 'Bank Negara Indonesia', 3.674e10, ['bank negara indonesia', 'bni'], { ai: true }),
  idStock('TLKM', 'Telkom Indonesia', 1.109e11, ['telkom indonesia', 'telkom'], { ai: true }),
  idStock('ASII', 'Astra International', 3.956e10, ['astra international'], { ai: true }),
  idStock('AMMN', 'Amman Mineral Internasional', 7.245e10, ['amman mineral']),
  idStock('BYAN', 'Bayan Resources', 3.335e10, ['bayan resources']),
  idStock('DCII', 'DCI Indonesia', 2.385e9, ['dci indonesia']),
  idStock('BRPT', 'Barito Pacific', 9.215e10, ['barito pacific']),
  idStock('TPIA', 'Chandra Asri Pacific', 8.651e10, ['chandra asri']),
  idStock('UNTR', 'United Tractors', 3.471e9, ['united tractors']),
  idStock('HMSP', 'HM Sampoerna', 1.164e11, ['sampoerna']),
  idStock('ICBP', 'Indofood CBP', 1.167e10, ['indofood cbp']),
  idStock('ADRO', 'AlamTri Resources (Adaro)', 2.869e10, ['adaro', 'alamtri']),
  idStock('INDF', 'Indofood Sukses Makmur', 8.751e9, ['indofood']),
  idStock('MDKA', 'Merdeka Copper Gold', 2.443e10, ['merdeka copper']),
  idStock('ISAT', 'Indosat Ooredoo Hutchison', 3.227e10, ['indosat']),
  idStock('UNVR', 'Unilever Indonesia', 3.771e10, ['unilever indonesia']),
  idStock('AMRT', 'Sumber Alfaria Trijaya (Alfamart)', 4.111e10, ['alfamart']),
  idStock('CPIN', 'Charoen Pokphand Indonesia', 1.634e10, ['charoen pokphand']),
  idStock('INCO', 'Vale Indonesia', 1.019e10, ['vale indonesia']),
  idStock('GOTO', 'GoTo Gojek Tokopedia', 1.067e12, ['gojek', 'tokopedia', 'goto']),
  idStock('ANTM', 'Aneka Tambang (Antam)', 24.03e9, ['aneka tambang', 'antam']),
  idStock('PTBA', 'Bukit Asam', 11.52e9, ['bukit asam']),
  idStock('AADI', 'Adaro Andalan Indonesia', 7.787e9, ['adaro andalan']),

  // ---- US stocks (delayed) ----
  usStock('NVDA', 'NVIDIA', 2.415e10, ['nvidia'], { ai: true }),
  usStock('AAPL', 'Apple', 1.459e10, ['apple inc', 'iphone', 'apple'], { ai: true }),
  usStock('GOOG', 'Alphabet (Google)', 1.223e10, ['alphabet', 'google'], { aliases: ['GOOGLE', 'GOOGL'], ai: true }),
  usStock('MSFT', 'Microsoft', 7.426e9, ['microsoft'], { ai: true }),
  usStock('AMZN', 'Amazon', 1.079e10, ['amazon'], { ai: true }),
  usStock('META', 'Meta Platforms', 2.548e9, ['meta platforms', 'facebook', 'instagram'], { ai: true }),
  usStock('AVGO', 'Broadcom', 4.774e9, ['broadcom'], { ai: true }),
  usStock('TSLA', 'Tesla', 3.95e9, ['tesla'], { ai: true }),
  usStock('SPCX', 'SpaceX', 1.317e10, ['spacex'], { aliases: ['SPACEX'] }),
  usStock('BRK-B', 'Berkshire Hathaway', 2.141e9, ['berkshire', 'buffett'], { aliases: ['BRK.B', 'BERKSHIRE'] }),
  usStock('LLY', 'Eli Lilly', 8.914e8, ['eli lilly'], { ai: true }),
  usStock('MU', 'Micron Technology', 1.131e9, ['micron']),
  usStock('WMT', 'Walmart', 7.934e9, ['walmart']),
  usStock('JPM', 'JPMorgan Chase', 2.656e9, ['jpmorgan', 'jp morgan'], { ai: true }),
  usStock('AMD', 'AMD', 1.632e9, ['amd', 'advanced micro devices']),
  usStock('V', 'Visa', 1.877e9, ['visa inc']),
  usStock('XOM', 'Exxon Mobil', 4.112e9, ['exxon']),
  usStock('JNJ', 'Johnson & Johnson', 2.41e9, ['johnson & johnson']),
  usStock('MA', 'Mastercard', 8.76e8, ['mastercard']),
  usStock('ABBV', 'AbbVie', 1.767e9, ['abbvie']),
  usStock('INTC', 'Intel', 5.286e9, ['intel']),
  usStock('PLTR', 'Palantir', 2.403e9, ['palantir']),
  usStock('CVX', 'Chevron', 1.962e9, ['chevron']),
  usStock('NFLX', 'Netflix', 4.164e9, ['netflix']),
  usStock('ORCL', 'Oracle', 3.032e9, ['oracle']),
  usStock('COST', 'Costco', 4.431e8, ['costco']),
  usStock('KO', 'Coca-Cola', 4.303e9, ['coca-cola', 'coca cola']),
  usStock('BAC', 'Bank of America', 6.993e9, ['bank of america']),
  usStock('UNH', 'UnitedHealth', 8.976e8, ['unitedhealth']),

  // ---- World stocks ----
  worldStock('tsm', 'TSM', 'TSM', 'TSMC', 'NYSE', 'USD', 5.186e9, ['tsmc', 'taiwan semiconductor'], {
    tvSymbol: 'TSM',
    tvWidgetUnsupported: undefined,
    aliases: ['TSMC'],
    ai: true,
  }),
  worldStock('aramco', 'ARAMCO', '2222.SR', 'Saudi Aramco', 'TADAWUL', 'SAR', 2.416e11, ['aramco']),
  worldStock('samsung', 'SAMSUNG', '005930.KS', 'Samsung Electronics', 'KRX', 'KRW', 6.519e9, ['samsung']),
  worldStock('hynix', 'HYNIX', '000660.KS', 'SK Hynix', 'KRX', 'KRW', 7.296e8, ['sk hynix', 'hynix']),
  worldStock('tencent', 'TENCENT', '0700.HK', 'Tencent', 'HKEX', 'HKD', 9.0e9, ['tencent']),
  worldStock('asml', 'ASML', 'ASML', 'ASML Holding', 'NYSE', 'USD', 3.854e8, ['asml'], {
    tvSymbol: 'ASML',
    tvWidgetUnsupported: undefined,
  }),

  // ---- Indices ----
  {
    id: 'jci',
    code: 'JCI',
    aliases: ['IHSG', 'JKSE'],
    exchange: 'IDX',
    symbol: '^JKSE',
    yahooSymbol: '^JKSE',
    shortName: 'JCI',
    name: 'Jakarta Composite Index',
    group: 'index',
    currency: 'PTS',
    tvSymbol: 'IDX:COMPOSITE',
    usesBackupChartFallback: true,
    sourceLabel: 'Yahoo Finance',
    unitLabel: 'Index Points',
    description:
      'The main benchmark index of all stocks listed on the Indonesia Stock Exchange (IDX). Trading hours: Mon–Fri 09:00–16:00 WIB.',
    newsQuery: 'Jakarta Composite Index IHSG Indonesia stock exchange',
    newsQueryId: 'IHSG saham Bursa Efek Indonesia BEI',
    quick: true,
    ai: true,
  },
  globalIndex('spx', 'SPX', '^GSPC', 'S&P 500', 'NYSE', 'FOREXCOM:SPXUSD', 'US', ['SP500', 'S&P'],
    'The 500 largest listed US companies, the main benchmark for the US stock market. NYSE/Nasdaq hours: 09:30–16:00 New York time.',
    { quick: true, ai: true }),
  globalIndex('ndx', 'NDX', '^NDX', 'Nasdaq 100', 'NYSE', 'FOREXCOM:NSXUSD', 'US', ['NASDAQ', 'NAS100'],
    'The 100 largest non-financial companies on the Nasdaq, dominated by technology stocks.', { quick: true, ai: true }),
  globalIndex('dji', 'DJI', '^DJI', 'Dow Jones Industrial Average', 'NYSE', 'FOREXCOM:DJI', 'US', ['DOW'],
    'A price-weighted index of 30 large US blue-chip companies.', { ai: true }),
  globalIndex('rut', 'RUT', '^RUT', 'Russell 2000', 'NYSE', null, 'US', ['RUSSELL'],
    'The 2,000 smaller US listed companies, a gauge of US small caps.', { ai: true }),
  globalIndex('vix', 'VIX', '^VIX', 'CBOE Volatility Index', 'NYSE', null, 'US', ['FEAR'],
    'Expected 30-day volatility of the S&P 500 ("fear gauge"); it rises when markets are stressed.'),
  globalIndex('n225', 'N225', '^N225', 'Nikkei 225', 'TSE', 'TVC:NI225', 'Japan', ['NIKKEI', 'JAPAN'],
    'The main Tokyo Stock Exchange index of 225 Japanese companies. Hours: 09:00–15:30 Tokyo time.', { ai: true }),
  globalIndex('ftse', 'FTSE', '^FTSE', 'FTSE 100', 'LSE', 'FOREXCOM:UKXGBP', 'UK', ['LONDON', 'UK100'],
    'The 100 largest companies on the London Stock Exchange. Hours: 08:00–16:30 London time.', { ai: true }),
  globalIndex('dax', 'DAX', '^GDAXI', 'DAX 40', 'XETRA', 'XETR:DAX', 'Germany', ['GERMANY'],
    'The 40 largest German companies on the Frankfurt exchange (Xetra), the eurozone benchmark.', { ai: true }),
  globalIndex('cac', 'CAC', '^FCHI', 'CAC 40', 'EURONEXT', null, 'France', ['PARIS', 'FRANCE'],
    'The 40 largest companies on Euronext Paris.', { ai: true }),
  globalIndex('stoxx', 'STOXX', '^STOXX50E', 'Euro Stoxx 50', 'XETRA', null, 'Eurozone', ['SX5E', 'EUROPE'],
    'Blue-chip index of 50 leading eurozone companies.', { ai: true }),
  globalIndex('hsi', 'HSI', '^HSI', 'Hang Seng Index', 'HKEX', 'TVC:HSI', 'Hong Kong', ['HANGSENG'],
    'The main Hong Kong stock index, a gauge of Chinese and Hong Kong large caps.', { ai: true }),
  globalIndex('sse', 'SSE', '000001.SS', 'Shanghai Composite', 'SSE', null, 'China', ['SHANGHAI', 'CHINA'],
    'All stocks traded on the Shanghai Stock Exchange.', { ai: true }),
  globalIndex('kospi', 'KOSPI', '^KS11', 'KOSPI', 'KRX', null, 'South Korea', ['KOREA'],
    'The Korea Composite Stock Price Index of the Korea Exchange.', { ai: true }),
  globalIndex('nifty', 'NIFTY', '^NSEI', 'Nifty 50', 'NSE', null, 'India', ['INDIA', 'NIFTY50'],
    "50 of the largest companies on India's National Stock Exchange.", { ai: true }),
  globalIndex('asx', 'ASX', '^AXJO', 'S&P/ASX 200', 'ASX', null, 'Australia', ['AUSTRALIA', 'XJO'],
    'The 200 largest companies on the Australian Securities Exchange.', { ai: true }),
  globalIndex('sti', 'STI', '^STI', 'Straits Times Index', 'SGX', 'TVC:STI', 'Singapore', ['SINGAPORE'],
    'The benchmark index of the 30 largest companies on the Singapore Exchange.', { ai: true }),

  // ---- Forex ----
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
    quick: true,
    ai: true,
  },
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
    ai: true,
  },
  rupiahPair('eur', 'EUR', 'Euro', ['euro', 'ecb']),
  rupiahPair('sgd', 'SGD', 'Singapore Dollar', ['singapore dollar']),
  rupiahPair('jpy', 'JPY', 'Japanese Yen', ['yen', 'boj', 'bank of japan']),
  rupiahPair('gbp', 'GBP', 'British Pound', ['sterling', 'bank of england']),
  rupiahPair('cny', 'CNY', 'Chinese Yuan', ['yuan', 'renminbi', 'pboc'], { ai: undefined }), // no Yahoo history
  rupiahPair('aud', 'AUD', 'Australian Dollar', ['australian dollar', 'aussie dollar', 'rba']),
  rupiahPair('myr', 'MYR', 'Malaysian Ringgit', ['ringgit']),
  rupiahPair('sar', 'SAR', 'Saudi Riyal', ['riyal']),
];

export interface AssetGroupMeta {
  key: AssetGroup;
  title: string;
  subtitle: string;
}

/** Radar sections, in display order. */
export const ASSET_GROUPS: AssetGroupMeta[] = [
  { key: 'commodity', title: 'Commodities', subtitle: 'Gold (spot), silver, oil, gas, metals and softs — futures, near real time' },
  { key: 'crypto', title: 'Crypto', subtitle: '24/7 digital assets in Rupiah (Indodax live)' },
  { key: 'idStock', title: 'Indonesian Stocks', subtitle: 'Largest IDX companies (Mon–Fri 09:00–16:00 WIB, delayed)' },
  { key: 'usStock', title: 'US Stocks', subtitle: 'Largest US companies (09:30–16:00 New York, delayed)' },
  { key: 'globalStock', title: 'World Stocks', subtitle: 'Mega caps listed in Taiwan, Saudi Arabia, Korea, Hong Kong and Europe' },
  { key: 'index', title: 'Indices', subtitle: 'JCI, US, Europe and Asia benchmarks (delayed)' },
  { key: 'forex', title: 'Forex', subtitle: 'Major currencies against the Rupiah, plus the US Dollar Index' },
];

export function getAssetBySymbol(symbol: string): AssetConfig | undefined {
  return ASSETS.find((item) => item.symbol === symbol || item.id === symbol);
}

/** Finds an asset by its code or an alias (case-insensitive), e.g. "spx", "IHSG", "EUR". */
export function getAssetByCode(code: string): AssetConfig | undefined {
  const c = code.trim().toUpperCase();
  return ASSETS.find((a) => a.code === c || a.aliases?.includes(c));
}

/** Free-text search over code, aliases, name and symbol (for the search boxes). */
export function searchAssets(query: string, limit = 50): AssetConfig[] {
  const q = query.trim().toLowerCase();
  if (!q) return ASSETS.slice(0, limit);
  const score = (a: AssetConfig) => {
    const code = a.code.toLowerCase();
    if (code === q || a.aliases?.some((x) => x.toLowerCase() === q)) return 0;
    if (code.startsWith(q)) return 1;
    if (a.name.toLowerCase().startsWith(q)) return 2;
    if (a.name.toLowerCase().includes(q) || a.symbol.toLowerCase().includes(q)) return 3;
    if (a.keywords?.some((k) => k.includes(q))) return 4;
    return 9;
  };
  return ASSETS.map((a) => ({ a, s: score(a) }))
    .filter((x) => x.s < 9)
    .sort((x, y) => x.s - y.s)
    .slice(0, limit)
    .map((x) => x.a);
}

export function isValidTimeframe(val: string): val is TimeframeInterval {
  return TIMEFRAME_OPTIONS.some((opt) => opt.interval === val);
}
