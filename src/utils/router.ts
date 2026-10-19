/**
 * router.ts — Library-free hash routing: converts between the URL hash and the active tab.
 * Routes: #/radar, #/asset/<id>, #/watchlist, #/risk, #/settings, #/terminal, #/advisor, #/quant, #/idx.
 * The old Indonesian hashes (#/aset/<id>, #/risiko, #/pengaturan) are still accepted so
 * previously shared links keep working.
 */
import { ALL_ASSETS, ASSETS, getAssetBySymbol } from '../config/assets.ts';

export type RouteTab = 'radar' | 'detail' | 'watchlist' | 'risk' | 'settings' | 'terminal' | 'advisor' | 'quant' | 'idx';

export interface ParsedRoute {
  tab: RouteTab;
  assetSymbol?: string;
}

// Legacy asset ids from before the English rename
const LEGACY_ASSET_IDS: Record<string, string> = { ihsg: '^JKSE' };

/**
 * Parses a URL hash string (e.g. "#/radar", "#/asset/btc", "#/settings")
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
  if (cleaned === 'risk' || cleaned === 'risiko') {
    return { tab: 'risk' };
  }
  if (cleaned === 'settings' || cleaned === 'pengaturan') {
    return { tab: 'settings' };
  }
  if (cleaned === 'advisor' || cleaned === 'ai') {
    return { tab: 'advisor' };
  }
  if (cleaned === 'terminal') {
    return { tab: 'terminal' };
  }
  if (cleaned === 'quant' || cleaned === 'lab' || cleaned === 'simulator') {
    return { tab: 'quant' };
  }
  if (cleaned === 'idx' || cleaned === 'saham' || cleaned === 'stocks') {
    return { tab: 'idx' };
  }
  const assetPrefix = ['asset/', 'aset/'].find((p) => cleaned.startsWith(p));
  if (assetPrefix) {
    const rawId = decodeURIComponent(cleaned.slice(assetPrefix.length)).trim();
    const matched =
      ALL_ASSETS.find(
        (a) =>
          a.id.toLowerCase() === rawId ||
          a.symbol.toLowerCase() === rawId ||
          a.shortName.toLowerCase() === rawId
      ) ??
      getAssetBySymbol(LEGACY_ASSET_IDS[rawId] ?? '') ??
      ASSETS[0];
    return {
      tab: 'detail',
      assetSymbol: matched.symbol,
    };
  }
  return { tab: 'radar' };
}

/**
 * Builds the canonical URL hash string for a given tab and asset symbol/id.
 */
export function buildHashRoute(tab: RouteTab, assetSymbolOrId?: string): string {
  switch (tab) {
    case 'radar':
      return '#/radar';
    case 'watchlist':
      return '#/watchlist';
    case 'risk':
      return '#/risk';
    case 'settings':
      return '#/settings';
    case 'advisor':
      return '#/advisor';
    case 'terminal':
      return '#/terminal';
    case 'quant':
      return '#/quant';
    case 'idx':
      return '#/idx';
    case 'detail': {
      const asset =
        (assetSymbolOrId ? getAssetBySymbol(assetSymbolOrId) : undefined) ?? ASSETS[0];
      return `#/asset/${asset.id}`;
    }
  }
}
