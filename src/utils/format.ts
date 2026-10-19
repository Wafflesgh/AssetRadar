export const TROY_OUNCE_IN_GRAMS = 31.1034768;

const idrFormatterZero = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const idrFormatterTwo = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatterTwo = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats a numeric value in Indonesian Rupiah without space after Rp: "Rp1.234.567"
 */
export function formatRupiah(value: number, fractionDigits: 0 | 2 = 0): string {
  if (!Number.isFinite(value)) return '—';
  const formatted =
    fractionDigits === 2 ? idrFormatterTwo.format(value) : idrFormatterZero.format(value);
  return formatted.replace(/\s+/g, '');
}

/**
 * Formats USD per troy ounce in Indonesian locale: "US$2.745,50"
 */
export function formatUsdPerOz(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `US$${numberFormatterTwo.format(value)}/oz`;
}

/**
 * Formats index points in Indonesian locale: "7.234,56"
 */
export function formatPoints(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return numberFormatterTwo.format(value);
}

/**
 * Formats percentage with sign and 2 decimal places: "+1,25%" or "-0,80%"
 */
export function formatPercent(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  const absFormatted = numberFormatterTwo.format(Math.abs(value));
  if (value > 0) return `+${absFormatted}%`;
  if (value < 0) return `-${absFormatted}%`;
  return `0,00%`;
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
