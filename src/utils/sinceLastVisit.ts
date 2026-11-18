/** sinceLastVisit.ts — Device-local visit snapshots and factual changes since a visit. */
import { getAssetBySymbol, type MarketNewsItem, type PriceTick } from '../config/assets.ts';
export interface LastVisit { at: number; prices: Record<string, number> }
export function parseLastVisit(value: unknown): LastVisit | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as LastVisit;
  if (!Number.isFinite(v.at) || v.at <= 0 || !v.prices || typeof v.prices !== 'object' || Array.isArray(v.prices)) return null;
  return { at: v.at, prices: Object.fromEntries(Object.entries(v.prices).filter(([, p]) => typeof p === 'number' && Number.isFinite(p) && p > 0)) };
}
export function visitSnapshot(symbols: string[], ticks: Record<string, PriceTick>, at: number): LastVisit {
  return { at, prices: Object.fromEntries(symbols.flatMap(s => {
    const tick = ticks[s];
    return tick && !tick.fromSnapshot && tick.status !== 'error' && Number.isFinite(tick.price) && tick.price > 0 ? [[s, tick.price]] : [];
  })) };
}
export function sinceLastVisit(previous: LastVisit | null, now: number, symbols: string[], ticks: Record<string, PriceTick>, news: MarketNewsItem[]) {
  if (!previous || now - previous.at < 3600_000) return null;
  const current = visitSnapshot(symbols, ticks, now);
  const changes = [...new Set(symbols)].map(symbol => ({ symbol,
    change: current.prices[symbol] && previous.prices[symbol] ? (current.prices[symbol] / previous.prices[symbol] - 1) * 100 : null,
  })).sort((a, b) => (b.change === null ? -1 : Math.abs(b.change)) - (a.change === null ? -1 : Math.abs(a.change))).slice(0, 8);
  const codes = new Set(symbols.map(s => getAssetBySymbol(s)?.code).filter(Boolean));
  const time = (n: MarketNewsItem) => n.publishedAtMs ?? Date.parse(n.publishedAt);
  return { changes, news: news.filter(n => time(n) >= previous.at && n.assetTags?.some(tag => codes.has(tag)))
    .sort((a, b) => time(b) - time(a)).slice(0, 5) };
}
