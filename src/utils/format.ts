/**
 * format.ts — Number formatting helpers (English / en-US separators) for prices and
 * percentages, plus the XAU/USD → Rupiah-per-gram gold conversion.
 */

export const TROY_OUNCE_IN_GRAMS = 31.1034768;

const LOCALE = 'en-US';

const numberFormatterZero = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const numberFormatterTwo = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats a numeric value in Indonesian Rupiah: "Rp1,234,567" (or "Rp15,850.00").
 */
export function formatRupiah(value: number, fractionDigits: 0 | 2 = 0): string {
  if (!Number.isFinite(value)) return '—';
  const formatter = fractionDigits === 2 ? numberFormatterTwo : numberFormatterZero;
  const sign = value < 0 ? '-' : '';
  return `${sign}Rp${formatter.format(Math.abs(value))}`;
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
 * Formats a plain number with a fixed number of decimals: "1,234" / "1,234.50"
 */
export function formatNumber(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
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
