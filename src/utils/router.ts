import { ASSETS, getAssetBySymbol } from '../config/assets.ts';

export type RouteTab = 'radar' | 'detail' | 'watchlist' | 'risiko' | 'pengaturan' | 'terminal';

export interface ParsedRoute {
  tab: RouteTab;
  assetSymbol?: string;
}

/**
 * Parses URL hash string (e.g. "#/radar", "#/aset/btc", "#/watchlist", "#/risiko", "#/pengaturan", "#/terminal")
 * into a structured route state.
 */
export function parseHashRoute(hash: string): ParsedRoute {
  const cleaned = hash.trim().replace(/^#\/?/, '').toLowerCase();
  if (!cleaned || cleaned === 'radar') {
    return { tab: 'radar' };
  }
  if (cleaned === 'watchlist') {
    return { tab: 'watchlist' };
  }
  if (cleaned === 'risiko') {
    return { tab: 'risiko' };
  }
  if (cleaned === 'pengaturan') {
    return { tab: 'pengaturan' };
  }
  if (cleaned === 'terminal') {
    return { tab: 'terminal' };
  }
  if (cleaned.startsWith('aset/')) {
    const rawId = decodeURIComponent(cleaned.slice('aset/'.length)).trim();
    const matched =
      ASSETS.find(
        (a) =>
          a.id.toLowerCase() === rawId ||
          a.symbol.toLowerCase() === rawId ||
          a.shortName.toLowerCase() === rawId
      ) ?? ASSETS[0];
    return {
      tab: 'detail',
      assetSymbol: matched.symbol,
    };
  }
  return { tab: 'radar' };
}

/**
 * Builds canonical URL hash string for a given tab and asset symbol/id.
 */
export function buildHashRoute(tab: RouteTab, assetSymbolOrId?: string): string {
  switch (tab) {
    case 'radar':
      return '#/radar';
    case 'watchlist':
      return '#/watchlist';
    case 'risiko':
      return '#/risiko';
    case 'pengaturan':
      return '#/pengaturan';
    case 'terminal':
      return '#/terminal';
    case 'detail': {
      const asset =
        (assetSymbolOrId ? getAssetBySymbol(assetSymbolOrId) : undefined) ?? ASSETS[0];
      return `#/aset/${asset.id}`;
    }
  }
}
