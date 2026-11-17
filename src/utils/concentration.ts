/** concentration.ts — Value-weighted portfolio concentration using configured classifications. */
import type { AssetConfig, ExchangeId } from '../config/assets.ts';
import idx from '../config/idxStocks.json' with { type: 'json' };
import us from '../config/sp500.json' with { type: 'json' };
import { assetClassOf, type ValuedPosition } from './portfolio.ts';

export const DIMENSIONS = ['asset', 'sector', 'currency', 'country', 'assetClass'] as const;
export type Dimension = typeof DIMENSIONS[number];
export interface ConcentrationPosition { asset: AssetConfig; v: ValuedPosition }
export interface ConcentrationBucket { key: string; label: string; weight: number }
export interface ConcentrationDimension {
  items: ConcentrationBucket[];
  hhi: number | null;
  effectiveN: number | null;
  level: 'diversified' | 'moderate' | 'concentrated' | null;
  top: ConcentrationBucket | null;
}
const idxSectors = new Map(idx.stocks.map((row) => [String(row[0]), String(row[4] ?? '')]));
const usSectors = new Map(us.stocks.map((row) => [String(row[0]), String(row[2] ?? '')]));
const countries: Partial<Record<ExchangeId, string>> = {
  IDX: 'ID', NYSE: 'US', TSE: 'JP', LSE: 'GB', XETRA: 'DE', HKEX: 'HK', SGX: 'SG',
  KRX: 'KR', SSE: 'CN', NSE: 'IN', ASX: 'AU', TADAWUL: 'SA', TSX: 'CA', B3: 'BR', BMV: 'MX',
  TWSE: 'TW', BURSA: 'MY', SETX: 'TH', PSE: 'PH', SIX: 'CH', BME: 'ES', BIT: 'IT', NZX: 'NZ',
};

export function concentration(positions: ConcentrationPosition[]) {
  let unpriced = 0;
  const maps = Object.fromEntries(DIMENSIONS.map((d) => [d, new Map<string, { label: string; value: number }>()])) as Record<Dimension, Map<string, { label: string; value: number }>>;
  let total = 0;
  for (const { asset, v } of positions) {
    if (!(v.quantity > 0)) continue;
    const value = v.marketValueIdr;
    if (value === undefined || !Number.isFinite(value) || value < 0) { unpriced++; continue; }
    if (value === 0) continue;
    total += value;
    const sector = asset.group === 'idStock' ? idxSectors.get(asset.code)
      : asset.group === 'usStock' ? usSectors.get(asset.yahooSymbol ?? asset.symbol) : asset.group;
    const keys: Record<Dimension, string> = {
      asset: asset.symbol, sector: sector || 'unclassified', currency: asset.currency || 'unclassified',
      country: asset.group === 'crypto' ? 'global' : countries[asset.exchange] ?? 'unclassified',
      assetClass: assetClassOf(asset),
    };
    for (const dim of DIMENSIONS) {
      const key = keys[dim];
      const entry = maps[dim].get(key) ?? { label: dim === 'asset' ? asset.code : key, value: 0 };
      entry.value += value;
      maps[dim].set(key, entry);
    }
  }
  const dimensions = Object.fromEntries(DIMENSIONS.map((dim) => {
    const items = [...maps[dim]].map(([key, entry]) => ({ key, label: entry.label, weight: entry.value / total }))
      .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));
    const hhi = items.length ? items.reduce((sum, item) => sum + item.weight ** 2, 0) : null;
    return [dim, { items, hhi, effectiveN: hhi === null ? null : 1 / hhi,
      level: hhi === null ? null : hhi < 0.15 ? 'diversified' : hhi <= 0.25 ? 'moderate' : 'concentrated', top: items[0] ?? null }];
  })) as Record<Dimension, ConcentrationDimension>;
  return { ...dimensions, unpriced };
}
