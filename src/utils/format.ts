/**
 * format.ts — Number formatting helpers (English / en-US separators) for prices and
 * percentages, plus the XAU/USD → Rupiah-per-gram gold conversion.
 */

export const TROY_OUNCE_IN_GRAMS = 31.1034768;

const LOCALE = 'en-US';

const numberFormatterTwo = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

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
      return `US$${formatNumber(value, Math.abs(value) < 1 ? 4 : 2)}${unit}`;
    case 'KRW':
      return `KRW ${formatNumber(value, 0)}${unit}`;
    default:
      return `${currency} ${formatNumber(value, 2)}${unit}`;
  }
}

/** Price of an asset in its own quote currency and unit (see formatPrice). */
export function formatAssetPrice(value: number | undefined, asset: { currency: string; unit?: string }): string {
  if (value === undefined) return '—';
  return formatPrice(value, asset.currency, asset.unit ?? '');
}

/** Compact Rupiah amount: "Rp588.2T", "Rp3.45T", "Rp845.3B", "Rp12.1M". */
export function formatIdrCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `Rp${(value / 1e12).toFixed(abs >= 1e14 ? 1 : 2)}T`;
  if (abs >= 1e9) return `Rp${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `Rp${(value / 1e6).toFixed(1)}M`;
  return formatRupiah(value, 0);
}

/** Compact USD amount for market caps: "$29.24T", "$845.3B", "$12.1M". */
export function formatUsdCompact(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
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
  return `0.00%`;
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
