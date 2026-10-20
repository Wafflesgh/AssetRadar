/**
 * cryptoPricing.ts — One live price source per crypto asset (Indodax IDR → Binance spot USDT →
 * Binance futures USDT → CoinGecko USD) and the conversion of USDT/USD prices to Rupiah at the
 * live USD/IDR rate. Converted ticks are marked so the UI can say "converted".
 */
import type { AssetConfig, CryptoPriceSource, PriceTick } from '../config/assets.ts';

/** A USDT/USD quote before conversion. */
export interface UsdQuote {
  price: number;
  changePct24h?: number;
  high24h?: number;
  low24h?: number;
  /** 24h volume in the quote currency (USDT). */
  quoteVolume?: number;
  updatedAt: number;
  source: string;
}

/** USDT ≈ USD for conversion; NaN when the rate is unknown. */
export function usdtToIdr(usdt: number, usdIdr: number): number {
  return Number.isFinite(usdt) && Number.isFinite(usdIdr) && usdIdr > 0 ? usdt * usdIdr : NaN;
}

/** Effective source: Indodax whenever the asset has a Rupiah pair. */
export function priceSourceOf(asset: Pick<AssetConfig, 'indodaxPair' | 'priceSource' | 'binanceSpot' | 'binanceFutures'>): CryptoPriceSource {
  if (asset.indodaxPair) return 'indodax';
  if (asset.priceSource && asset.priceSource !== 'indodax') return asset.priceSource;
  if (asset.binanceSpot) return 'binance-spot';
  if (asset.binanceFutures) return 'binance-futures';
  return 'coingecko';
}

/** Price of one coin from a futures contract quoted per `multiplier` coins. */
export function perCoin(contractPrice: number, multiplier: number | undefined): number {
  return contractPrice / (multiplier && multiplier > 0 ? multiplier : 1);
}

/**
 * Picks the quote for a non-Indodax asset: its own source first, then the next one down the list
 * (spot → futures → CoinGecko), so a delisted spot pair still has a price.
 */
export function pickUsdQuote(
  asset: Pick<AssetConfig, 'indodaxPair' | 'priceSource' | 'binanceSpot' | 'binanceFutures' | 'futuresMultiplier' | 'coingeckoId'>,
  sources: { spot: Map<string, UsdQuote>; futures: Map<string, UsdQuote>; coingecko: Map<string, UsdQuote> }
): UsdQuote | null {
  const order: CryptoPriceSource[] = ['binance-spot', 'binance-futures', 'coingecko'];
  const start = Math.max(0, order.indexOf(priceSourceOf(asset)));
  for (const src of order.slice(start)) {
    if (src === 'binance-spot' && asset.binanceSpot) {
      const q = sources.spot.get(asset.binanceSpot);
      if (q && Number.isFinite(q.price)) return q;
    }
    if (src === 'binance-futures' && asset.binanceFutures) {
      const q = sources.futures.get(asset.binanceFutures);
      if (q && Number.isFinite(q.price)) {
        const m = asset.futuresMultiplier;
        return {
          ...q,
          price: perCoin(q.price, m),
          high24h: q.high24h === undefined ? undefined : perCoin(q.high24h, m),
          low24h: q.low24h === undefined ? undefined : perCoin(q.low24h, m),
        };
      }
    }
    if (src === 'coingecko' && asset.coingeckoId) {
      const q = sources.coingecko.get(asset.coingeckoId);
      if (q && Number.isFinite(q.price)) return q;
    }
  }
  return null;
}

/** A Rupiah tick from a USDT/USD quote; error tick when the quote or the USD/IDR rate is missing. */
export function convertedTick(asset: Pick<AssetConfig, 'symbol' | 'group'>, quote: UsdQuote | null, usdIdr: number, now: number): PriceTick {
  const price = quote ? usdtToIdr(quote.price, usdIdr) : NaN;
  if (!quote || !Number.isFinite(price)) {
    return {
      symbol: asset.symbol,
      group: asset.group,
      price: NaN,
      currency: 'IDR',
      source: quote?.source ?? 'Binance',
      updatedAt: now,
      status: 'error',
      errorMessage: quote ? 'USD/IDR rate unavailable for conversion' : 'Data unavailable',
    };
  }
  return {
    symbol: asset.symbol,
    group: asset.group,
    price,
    priceUsdt: quote.price,
    converted: true,
    changePct24h: quote.changePct24h,
    high24h: quote.high24h === undefined ? undefined : usdtToIdr(quote.high24h, usdIdr),
    low24h: quote.low24h === undefined ? undefined : usdtToIdr(quote.low24h, usdIdr),
    valueTraded: quote.quoteVolume === undefined ? undefined : usdtToIdr(quote.quoteVolume, usdIdr),
    currency: 'IDR',
    source: quote.source,
    updatedAt: quote.updatedAt,
    status: 'live',
  };
}
