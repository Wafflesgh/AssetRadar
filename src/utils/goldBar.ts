/**
 * goldBar.ts — Physical gold bars (Antam / Logam Mulia, Pegadaian): standard bar sizes, price
 * per gram ↔ per bar conversion, the buyback prices the owner types in from the official pages
 * (no scraping — there is no official feed the server may use), choosing the price that values the
 * portfolio's physical gold (latest buyback within 30 days, otherwise spot with a label), and the
 * gap between the buyback price and spot.
 */

import { translate, type AppLang, type TranslationKey } from '../i18n/core.ts';

export const ANTAM_SIZES = [0.5, 1, 2, 3, 5, 10, 25, 50, 100, 250, 500, 1000] as const;

export const OFFICIAL_SOURCES = [
  { id: 'antam', label: 'Logam Mulia (Antam) — today’s gold price', url: 'https://www.logammulia.com/id/harga-emas-hari-ini' },
  { id: 'pegadaian', label: 'Pegadaian — gold price', url: 'https://www.pegadaian.co.id/' },
] as const;

export type GoldSource = 'antam' | 'pegadaian' | 'other';

export interface GoldPriceEntry {
  id: string;
  /** Date of the official price (YYYY-MM-DD). */
  date: string;
  source: GoldSource;
  /** Buyback (price the dealer pays you) per gram, Rupiah. */
  buybackPerGram: number;
  /** Selling price of a 1 g bar (what you pay), Rupiah — optional. */
  sellPerGram?: number;
  note?: string;
}

export const BUYBACK_MAX_AGE_DAYS = 30;

export function perGram(barPrice: number, sizeGrams: number): number {
  return sizeGrams > 0 ? barPrice / sizeGrams : NaN;
}

export function perBar(pricePerGram: number, sizeGrams: number): number {
  return pricePerGram * sizeGrams;
}

export function validateGoldEntry(e: Partial<GoldPriceEntry>, today: string, lang: AppLang = 'en'): string[] {
  const errors: string[] = [];
  const tx = (key: string) => translate(lang, key as TranslationKey);
  if (!e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) errors.push(tx('gold.err.date'));
  else if (e.date > today) errors.push(tx('gold.err.future'));
  if (!(typeof e.buybackPerGram === 'number' && e.buybackPerGram > 0)) errors.push(tx('gold.err.buyback'));
  // Gold has cost between Rp100,000 and Rp20,000,000 per gram in any plausible period
  else if (e.buybackPerGram < 100_000 || e.buybackPerGram > 20_000_000) errors.push(tx('gold.err.range'));
  if (e.sellPerGram !== undefined && !(e.sellPerGram > 0)) errors.push(tx('gold.err.sell'));
  return errors;
}

/** Newest entry (by date) or null. */
export function latestEntry(entries: GoldPriceEntry[]): GoldPriceEntry | null {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0] ?? null;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export interface GoldValuation {
  perGram: number | null;
  basis: 'buyback' | 'spot' | 'none';
  entry: GoldPriceEntry | null;
  /** Age of the buyback price in days (when basis = buyback). */
  ageDays: number | null;
}

/**
 * Price per gram for physical gold in the portfolio: the latest buyback entry not older than
 * `maxAgeDays`, otherwise the live spot price per gram (labelled as spot), otherwise none.
 */
export function goldValuation(entries: GoldPriceEntry[], spotPerGram: number | undefined, today: string, maxAgeDays = BUYBACK_MAX_AGE_DAYS): GoldValuation {
  const latest = latestEntry(entries);
  if (latest) {
    const age = daysBetween(latest.date, today);
    if (age >= 0 && age <= maxAgeDays) return { perGram: latest.buybackPerGram, basis: 'buyback', entry: latest, ageDays: age };
  }
  if (spotPerGram !== undefined && Number.isFinite(spotPerGram) && spotPerGram > 0) return { perGram: spotPerGram, basis: 'spot', entry: latest, ageDays: null };
  return { perGram: null, basis: 'none', entry: latest, ageDays: null };
}

/** How far the buyback price is from spot (negative = below spot), as a fraction. */
export function buybackVsSpot(buybackPerGram: number, spotPerGram: number | undefined): number | null {
  return spotPerGram && spotPerGram > 0 ? buybackPerGram / spotPerGram - 1 : null;
}

export function parseGoldEntries(raw: unknown): GoldPriceEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is GoldPriceEntry => Boolean(e) && typeof e.id === 'string' && typeof e.date === 'string' && typeof e.buybackPerGram === 'number' && e.buybackPerGram > 0
  );
}
