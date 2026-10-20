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

const ID_DESCRIPTIONS: Record<string, string> = {
  'XAU/USD': 'Harga spot emas murni dunia per troy ounce (31,1034768 gram), langsung dikonversi ke Rupiah per gram.',
  'BTC/IDR': 'Aset kripto terbesar menurut kapitalisasi pasar, diperdagangkan langsung terhadap Rupiah di bursa Indodax.',
  'ETH/IDR': 'Jaringan smart contract terdepan di ekosistem blockchain, dihargai dalam Rupiah.',
  'SOL/IDR': 'Infrastruktur blockchain cepat dengan biaya rendah, dihargai dalam Rupiah.',
  '^JKSE': 'Indeks acuan utama seluruh saham yang tercatat di Bursa Efek Indonesia (BEI). Jam perdagangan: Sen–Jum 09.00–16.00 WIB.',
  'USD/IDR': 'Kurs Dolar AS terhadap Rupiah, acuan untuk mengonversi harga aset global.',
};

/** Description in the current language (Indonesian built from the asset's group). */
export function assetDescription(asset: AssetConfig): string {
  if (getLang() !== 'id') return asset.description;
  const custom = ID_DESCRIPTIONS[asset.symbol];
  if (custom) return custom;
  const name = assetName(asset);
  switch (asset.group) {
    case 'crypto':
      return `${name} (${asset.code}) yang diperdagangkan terhadap Rupiah di Indodax.`;
    case 'usStock':
      return `${name} (${asset.code}), tercatat di Amerika Serikat.`;
    case 'idStock':
      return asset.board
        ? `${name} (${asset.code.replace(/\.JK$/, '')}), tercatat di Bursa Efek Indonesia (papan ${asset.board}; ${asset.sector} — ${asset.industry}). Jam perdagangan: Sen–Jum 09.00–16.00 WIB.`
        : `${name} (${asset.code}), tercatat di Bursa Efek Indonesia. Jam perdagangan: Sen–Jum 09.00–16.00 WIB.`;
    case 'globalStock':
      return `${name}, salah satu perusahaan tercatat terbesar di luar AS.`;
    case 'commodity':
      return `Harga kontrak futures terdekat ${name.toLowerCase()}.`;
    case 'index':
      return `${name}, indeks acuan pasar saham.`;
    case 'forex':
      return `Kurs ${asset.code} terhadap Rupiah.`;
  }
  return asset.description;
}

/** Price unit label in the current language, e.g. "Rupiah per share" → "Rupiah per saham". */
export function assetUnitLabel(asset: AssetConfig): string {
  if (getLang() !== 'id') return asset.unitLabel;
  return asset.unitLabel
    .replace('US Dollar per share', 'Dolar AS per saham')
    .replace('Rupiah per share', 'Rupiah per saham')
    .replace(/ per share$/, ' per saham')
    .replace('US cents', 'sen AS')
    .replace('US Dollar', 'Dolar AS')
    .replace('Index Points', 'Poin indeks');
}

export function groupTitle(group: AssetGroup): string {
  return t(`group.${group}.title` as TranslationKey);
}

export function groupSubtitle(group: AssetGroup): string {
  return t(`group.${group}.subtitle` as TranslationKey);
}
