/**
 * assetNames.ts — Indonesian display names for assets whose English name is a common word
 * (commodities, a few indices, currency pairs) and the translated asset-group titles. Company
 * names, tickers and codes are never translated.
 */
import type { AssetConfig, AssetGroup } from '../config/assets.ts';
import { getLang, t, type TranslationKey } from './index.ts';

const ID_NAMES: Record<string, { name: string; short?: string }> = {
  'XAU/USD': { name: 'Emas Spot (XAU)', short: 'Emas' },
  'SI=F': { name: 'Perak', short: 'Perak' },
  'CL=F': { name: 'Minyak Mentah (WTI)', short: 'Minyak Mentah' },
  'BZ=F': { name: 'Minyak Mentah Brent', short: 'Minyak Brent' },
  'NG=F': { name: 'Gas Alam', short: 'Gas Alam' },
  'HG=F': { name: 'Tembaga', short: 'Tembaga' },
  'PL=F': { name: 'Platinum', short: 'Platinum' },
  'KC=F': { name: 'Kopi (Arabika)', short: 'Kopi' },
  'ZW=F': { name: 'Gandum', short: 'Gandum' },
  '^JKSE': { name: 'IHSG — Indeks Harga Saham Gabungan' },
  '^VIX': { name: 'Indeks Volatilitas CBOE' },
  '^HSI': { name: 'Indeks Hang Seng' },
  '000001.SS': { name: 'Indeks Komposit Shanghai' },
  '^STI': { name: 'Indeks Straits Times' },
  'USD/IDR': { name: 'Dolar AS ke Rupiah' },
  DXY: { name: 'Indeks Dolar AS' },
  'EUR/IDR': { name: 'Euro ke Rupiah' },
  'SGD/IDR': { name: 'Dolar Singapura ke Rupiah' },
  'JPY/IDR': { name: 'Yen Jepang ke Rupiah' },
  'GBP/IDR': { name: 'Pound Inggris ke Rupiah' },
  'CNY/IDR': { name: 'Yuan Tiongkok ke Rupiah' },
  'AUD/IDR': { name: 'Dolar Australia ke Rupiah' },
  'MYR/IDR': { name: 'Ringgit Malaysia ke Rupiah' },
  'SAR/IDR': { name: 'Riyal Saudi ke Rupiah' },
};

/** Full display name in the current language. */
export function assetName(asset: Pick<AssetConfig, 'symbol' | 'name'>): string {
  return getLang() === 'id' ? (ID_NAMES[asset.symbol]?.name ?? asset.name) : asset.name;
}

/** Short display name in the current language (codes stay as they are). */
export function assetShortName(asset: Pick<AssetConfig, 'symbol' | 'shortName'>): string {
  return getLang() === 'id' ? (ID_NAMES[asset.symbol]?.short ?? asset.shortName) : asset.shortName;
}

export function groupTitle(group: AssetGroup): string {
  return t(`group.${group}.title` as TranslationKey);
}

export function groupSubtitle(group: AssetGroup): string {
  return t(`group.${group}.subtitle` as TranslationKey);
}
