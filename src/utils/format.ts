/**
 * format.ts — Number formatting helpers for prices and percentages, plus the XAU/USD →
 * Rupiah-per-gram gold conversion. Separators follow the number locale set with
 * setNumberLocale: en-US ("Rp1,234,567", "+1.25%", the default) or id-ID ("Rp1.234.567", "+1,25%").
 * Crypto prices are kept in Rupiah internally and shown in the quote chosen with setCryptoQuote:
 * USD (the default: the Binance USDT price when the tick has one, else Rupiah ÷ the live USD/IDR
 * rate from setUsdIdrRate) or IDR.
 */

export const TROY_OUNCE_IN_GRAMS = 31.1034768;

export type NumberLocale = 'en-US' | 'id-ID';

let LOCALE: NumberLocale = 'en-US';
let numberFormatterTwo = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Switches every formatter in this module to another locale (called by the language setting). */
export function setNumberLocale(locale: NumberLocale): void {
  if (locale === LOCALE) return;
  LOCALE = locale;
  numberFormatterTwo = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  formatterCache.clear();
}

export function getNumberLocale(): NumberLocale {
  return LOCALE;
}

export type CryptoQuote = 'USD' | 'IDR';
let CRYPTO_QUOTE: CryptoQuote = 'USD';
let USD_IDR: number | null = null;

/** Currency crypto prices are shown in (called by the setting in i18n/index.ts). */
export function setCryptoQuote(quote: CryptoQuote): void {
  CRYPTO_QUOTE = quote;
}

export function getCryptoQuote(): CryptoQuote {
  return CRYPTO_QUOTE;
}

/** Live USD/IDR rate used to show Rupiah crypto values in USD (ignored when not a positive number). */
export function setUsdIdrRate(rate: number | undefined | null): void {
  if (typeof rate === 'number' && Number.isFinite(rate) && rate > 1000) USD_IDR = rate;
}

interface QuotedAsset {
  currency: string;
  unit?: string;
  group?: string;
}

/** True when this asset's Rupiah prices are shown in USD right now. */
export function showsCryptoInUsd(asset: QuotedAsset): boolean {
  return asset.group === 'crypto' && asset.currency === 'IDR' && CRYPTO_QUOTE === 'USD' && USD_IDR !== null;
}

/** Currency an asset's prices are shown in (USD for crypto in USD mode, else its own). */
export function displayCurrency(asset: QuotedAsset): string {
  return showsCryptoInUsd(asset) ? 'USD' : asset.currency;
}

/** A value in the asset's own currency converted to the shown currency (crypto Rupiah → USD). */
export function displayValue(value: number, asset: QuotedAsset): number {
  return showsCryptoInUsd(asset) ? value / (USD_IDR as number) : value;
}

/** The shown value of a live tick: the exact Binance USDT price for crypto in USD mode when known. */
export function tickDisplayValue(tick: { price: number; priceUsdt?: number }, asset: QuotedAsset): number {
  if (showsCryptoInUsd(asset) && typeof tick.priceUsdt === 'number' && tick.priceUsdt > 0) return tick.priceUsdt;
  return displayValue(tick.price, asset);
}

/** Decimal number with up to `max` decimals in the current locale (for free-form values). */
export function formatDecimal(value: number, max = 2): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString(LOCALE, { maximumFractionDigits: max });
}

/**
 * Formats a numeric value in Indonesian Rupiah: "Rp1,234,567" (or "Rp15,850.00"). Without
 * fractionDigits, small rates such as JPY/IDR (under 1,000) get 2 decimals: "Rp114.03".
 */
export function formatRupiah(value: number, fractionDigits?: 0 | 2 | 4 | 6): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  // Meme coins such as PEPE trade below Rp1, so tiny prices keep more decimals
  const digits = fractionDigits ?? (abs >= 1000 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6);
  const sign = value < 0 ? '-' : '';
  return `${sign}Rp${formatNumber(abs, digits)}`;
}

/**
 * Formats USD per troy ounce: "US$2,745.50/oz"
 */
export function formatUsdPerOz(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `US$${numberFormatterTwo.format(value)}/oz`;
}

/**
 * Formats index points: "7,234.56"
 */
export function formatPoints(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return numberFormatterTwo.format(value);
}

/**
 * Formats a price in its quote currency with an optional unit:
 * IDR "Rp1,234", USD "US$2,745.50/oz", USX (US cents) "305.55¢/lb", PTS "7,234.56",
 * others "KRW 85,300" / "SAR 27.40". Very small USD prices (crypto) keep more decimals.
 */
export function formatPrice(value: number, currency: string, unit = ''): string {
  if (!Number.isFinite(value)) return '—';
  switch (currency) {
    case 'IDR':
      return formatRupiah(value) + unit;
    case 'PTS':
      return formatPoints(value);
    case 'USX':
      return `${numberFormatterTwo.format(value)}¢${unit}`;
    case 'USD':
      return `US$${formatNumber(value, usdDecimals(value))}${unit}`;
    case 'KRW':
      return `KRW ${formatNumber(value, 0)}${unit}`;
    default:
      return `${currency} ${formatNumber(value, 2)}${unit}`;
  }
}

/** Decimals for a USD price: 2 from $1, 4 under $1, more for very small coins (≈4 significant digits). */
function usdDecimals(value: number): number {
  const abs = Math.abs(value);
  if (abs >= 1 || abs === 0) return 2;
  if (abs >= 0.01) return 4;
  return Math.min(10, Math.ceil(-Math.log10(abs)) + 3);
}

/**
 * Price of an asset in its shown currency and unit (see formatPrice): crypto Rupiah values are
 * converted to USD in USD mode unless `native` (alert thresholds and portfolio amounts stay in Rupiah).
 */
export function formatAssetPrice(value: number | undefined, asset: QuotedAsset, opts?: { native?: boolean }): string {
  if (value === undefined) return '—';
  if (!opts?.native && showsCryptoInUsd(asset)) return formatPrice(displayValue(value, asset), 'USD', asset.unit ?? '');
  return formatPrice(value, asset.currency, asset.unit ?? '');
}

/** The live price of a tick in the shown currency (exact Binance USDT price for crypto in USD mode). */
export function formatTickPrice(tick: { price: number; priceUsdt?: number }, asset: QuotedAsset): string {
  if (!Number.isFinite(tick.price)) return '—';
  if (showsCryptoInUsd(asset)) return formatPrice(tickDisplayValue(tick, asset), 'USD', asset.unit ?? '');
  return formatPrice(tick.price, asset.currency, asset.unit ?? '');
}

/** Compact Rupiah amount: "Rp588.2T", "Rp3.45T", "Rp845.3B", "Rp12.1M". */
export function formatIdrCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  // Indonesian: T = triliun, M = miliar, Jt = juta
  const id = LOCALE === 'id-ID';
  if (abs >= 1e12) return `Rp${formatNumber(value / 1e12, abs >= 1e14 ? 1 : 2)}T`;
  if (abs >= 1e9) return `Rp${formatNumber(value / 1e9, 1)}${id ? 'M' : 'B'}`;
  if (abs >= 1e6) return `Rp${formatNumber(value / 1e6, 1)}${id ? 'Jt' : 'M'}`;
  return formatRupiah(value, 0);
}

/** Compact USD amount for market caps: "$29.24T", "$845.3B", "$12.1M". */
export function formatUsdCompact(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${formatNumber(value / 1e12, 2)}T`;
  if (abs >= 1e9) return `$${formatNumber(value / 1e9, 1)}B`;
  if (abs >= 1e6) return `$${formatNumber(value / 1e6, 1)}M`;
  return `$${formatNumber(value, 0)}`;
}

/**
 * Formats a plain number with a fixed number of decimals: "1,234" / "1,234.50"
 */
const formatterCache = new Map<number, Intl.NumberFormat>();

export function formatNumber(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) return '—';
  let formatter = formatterCache.get(fractionDigits);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    formatterCache.set(fractionDigits, formatter);
  }
  return formatter.format(value);
}

/**
 * Formats percentage with sign and 2 decimal places: "+1.25%" or "-0.80%"
 */
export function formatPercent(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  const absFormatted = numberFormatterTwo.format(Math.abs(value));
  if (value > 0) return `+${absFormatted}%`;
  if (value < 0) return `-${absFormatted}%`;
  return `${numberFormatterTwo.format(0)}%`;
}

/**
 * Converts Spot Gold XAU/USD (per troy ounce) to IDR per gram:
 * Rupiah per gram = (XAU_USD / 31.1034768) * USD_IDR
 */
export function convertXauUsdToIdrPerGram(xauUsd: number, usdIdr: number): number {
  if (!Number.isFinite(xauUsd) || !Number.isFinite(usdIdr) || xauUsd <= 0 || usdIdr <= 0) {
    return 0;
  }
  return (xauUsd / TROY_OUNCE_IN_GRAMS) * usdIdr;
}
