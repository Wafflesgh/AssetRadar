export type AssetGroup = 'crypto' | 'saham' | 'emas' | 'kurs';

export type PriceCurrency = 'IDR' | 'USD' | 'PTS';

export type PriceStatus = 'live' | 'tertunda' | 'error';

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
  fromSnapshot?: boolean; // true jika berasal dari data tersimpan (offline)
};

export type SentimentLabel = 'Bullish' | 'Netral' | 'Bearish';

export interface MarketNewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  publishedAtMs?: number; // epoch ms (untuk pengurutan umpan berita)
  assetTags?: string[]; // kode aset terkait, contoh ["BTC"]
  sentiment: SentimentLabel;
}

export interface OhlcCandle {
  time: number; // unix detik
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
  { label: '1m', interval: '1', title: '1 Menit' },
  { label: '5m', interval: '5', title: '5 Menit' },
  { label: '15m', interval: '15', title: '15 Menit' },
  { label: '30m', interval: '30', title: '30 Menit' },
  { label: '1J', interval: '60', title: '1 Jam' },
  { label: '4J', interval: '240', title: '4 Jam' },
  { label: '1H', interval: 'D', title: '1 Hari' },
  { label: '1M', interval: 'W', title: '1 Minggu' },
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
  sourceLabel: string;
  unitLabel: string;
  description: string;
  newsQuery: string;
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
    sourceLabel: 'Indodax',
    unitLabel: 'Rupiah (IDR)',
    description:
      'Aset kripto dengan kapitalisasi pasar terbesar, diperdagangkan langsung dalam pasangan Rupiah di bursa Indodax.',
    newsQuery: 'Bitcoin BTC harga crypto pasar',
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
    sourceLabel: 'Indodax',
    unitLabel: 'Rupiah (IDR)',
    description:
      'Jaringan kontrak pintar utama di ekosistem blockchain global dalam pasangan Rupiah.',
    newsQuery: 'Ethereum ETH kripto blockchain',
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
    sourceLabel: 'Indodax',
    unitLabel: 'Rupiah (IDR)',
    description:
      'Infrastruktur blockchain berkecepatan tinggi dengan biaya transaksi rendah dalam pasangan Rupiah.',
    newsQuery: 'Solana SOL crypto pasar',
  },
  {
    id: 'ihsg',
    symbol: '^JKSE',
    yahooSymbol: '^JKSE',
    shortName: 'IHSG',
    name: 'Indeks Harga Saham Gabungan',
    group: 'saham',
    currency: 'PTS',
    tvSymbol: 'IDX:COMPOSITE',
    usesBackupChartFallback: true,
    sourceLabel: 'Yahoo Finance',
    unitLabel: 'Poin Indeks',
    description:
      'Indeks acuan utama kinerja seluruh saham yang tercatat di Bursa Efek Indonesia (BEI). Jam perdagangan Senin–Jumat 09:00–16:00 WIB.',
    newsQuery: 'IHSG saham Bursa Efek Indonesia BEI',
  },
  {
    id: 'xau',
    symbol: 'XAU/USD',
    yahooSymbol: 'GC=F',
    shortName: 'Emas',
    name: 'Emas Spot (XAU)',
    group: 'emas',
    currency: 'USD',
    secondaryCurrency: 'IDR',
    tvSymbol: 'OANDA:XAUUSD',
    sourceLabel: 'Spot XAU',
    unitLabel: 'USD/oz & IDR/gram',
    description:
      'Harga emas murni pasar spot dunia per troy ounce (31,1034768 gram) beserta konversi langsung ke Rupiah per gram.',
    newsQuery: 'Harga emas dunia XAU Antam logam mulia',
  },
  {
    id: 'usdidr',
    symbol: 'USD/IDR',
    yahooSymbol: 'IDR=X',
    shortName: 'USD/IDR',
    name: 'Nilai Tukar Dolar AS ke Rupiah',
    group: 'kurs',
    currency: 'IDR',
    tvSymbol: 'FX_IDC:USDIDR',
    sourceLabel: 'Yahoo Finance',
    unitLabel: 'Rupiah per 1 USD',
    description:
      'Kurs nilai tukar mata uang Dolar Amerika Serikat terhadap Rupiah Indonesia sebagai acuan konversi aset global.',
    newsQuery: 'Kurs Rupiah USD IDR Bank Indonesia Dolar',
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
    subtitle: 'Pasar aset digital 24/7 dalam Rupiah (Indodax Live)',
  },
  {
    key: 'saham',
    title: 'Saham',
    subtitle: 'Indeks pasar modal Bursa Efek Indonesia (Senin–Jumat 09:00–16:00 WIB)',
  },
  {
    key: 'emas',
    title: 'Emas',
    subtitle: 'Logam mulia spot XAU/USD dan konversi Rupiah per gram',
  },
  {
    key: 'kurs',
    title: 'Kurs',
    subtitle: 'Nilai tukar valuta asing acuan USD terhadap Rupiah',
  },
];

export function getAssetBySymbol(symbol: string): AssetConfig | undefined {
  return ASSETS.find((item) => item.symbol === symbol || item.id === symbol);
}

export function isValidTimeframe(val: string): val is TimeframeInterval {
  return TIMEFRAME_OPTIONS.some((opt) => opt.interval === val);
}
