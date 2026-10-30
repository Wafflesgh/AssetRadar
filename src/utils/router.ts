/**
 * router.ts — Library-free hash routing: converts between the URL hash and the active tab.
 * Routes: #/radar, #/asset/<id>, #/watchlist, #/risk, #/settings, #/terminal, #/advisor, #/quant,
 * #/idx, #/portfolio, #/calendar, #/macro, #/crypto (Binance), #/crypto/<PAIR>, #/alerts, #/screener,
 * #/compare?s=BBCA,BBRI, #/brief, #/backtest, #/analyst, #/kitchen (staple food prices),
 * #/sectors (IDX sector rotation), #/fund-arena (AI Fund Arena).
 * The old Indonesian hashes (#/aset/<id>, #/risiko, #/pengaturan) are still accepted so
 * previously shared links keep working.
 */
import { ALL_ASSETS, ASSETS, getAssetBySymbol } from '../config/assets.ts';
import { buildCompareParam, parseCompareParam } from './compare.ts';

export type RouteTab =
  | 'radar' | 'detail' | 'watchlist' | 'risk' | 'settings' | 'terminal' | 'advisor' | 'quant' | 'idx' | 'portfolio'
  | 'calendar' | 'macro' | 'crypto' | 'alerts' | 'screener' | 'compare' | 'brief' | 'backtest' | 'analyst' | 'kitchen' | 'sectors' | 'fundArena';

export interface ParsedRoute {
  tab: RouteTab;
  assetSymbol?: string;
  /** Binance pair on #/crypto/<PAIR> (may contain non-Latin characters). */
  pair?: string;
  /** Compare page: asset symbols from ?s= (2–4). */
  compare?: string[];
}

// Legacy asset ids from before the English rename
const LEGACY_ASSET_IDS: Record<string, string> = { ihsg: '^JKSE' };

/**
 * Parses a URL hash string (e.g. "#/radar", "#/asset/btc", "#/settings")
 * into a structured route state.
 */
export function parseHashRoute(hash: string): ParsedRoute {
  const cleaned = hash.trim().replace(/^#\/?/, '').toLowerCase();
  const [path, query = ''] = cleaned.split('?');
  if (path === 'compare' || path === 'bandingkan') {
    return { tab: 'compare', compare: parseCompareParam(new URLSearchParams(query).get('s')) };
  }
  if (path === 'screener') {
    return { tab: 'screener' };
  }
  if (path === 'brief' || path === 'ringkasan') {
    return { tab: 'brief' };
  }
  if (path === 'backtest') {
    return { tab: 'backtest' };
  }
  if (path === 'fund-arena' || path === 'arena-dana') {
    return { tab: 'fundArena' };
  }
  if (path === 'analyst' || path === 'analisis') {
    return { tab: 'analyst' };
  }
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
  if (cleaned === 'portfolio' || cleaned === 'portofolio') {
    return { tab: 'portfolio' };
  }
  if (cleaned === 'calendar' || cleaned === 'kalender') {
    return { tab: 'calendar' };
  }
  if (cleaned === 'macro' || cleaned === 'makro') {
    return { tab: 'macro' };
  }
  if (cleaned === 'sectors' || cleaned === 'sektor' || cleaned === 'rotation') {
    return { tab: 'sectors' };
  }
  if (cleaned === 'kitchen' || cleaned === 'dapur' || cleaned === 'staples' || cleaned === 'pangan') {
    return { tab: 'kitchen' };
  }
  if (cleaned === 'crypto' || cleaned === 'binance' || cleaned === 'kripto') {
    return { tab: 'crypto' };
  }
  if (cleaned.startsWith('crypto/')) {
    const raw = hash.trim().replace(/^#\/?/, '').slice('crypto/'.length);
    let pair = raw;
    try {
      pair = decodeURIComponent(raw);
    } catch {
      // keep the raw text
    }
    return pair ? { tab: 'crypto', pair: pair.toUpperCase() } : { tab: 'crypto' };
  }
  if (cleaned === 'alerts' || cleaned === 'alert') {
    return { tab: 'alerts' };
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
export function buildHashRoute(tab: RouteTab, assetSymbolOrId?: string, compare?: string[]): string {
  switch (tab) {
    case 'screener':
      return '#/screener';
    case 'brief':
      return '#/brief';
    case 'backtest':
      return '#/backtest';
    case 'analyst':
      return '#/analyst';
    case 'fundArena':
      return '#/fund-arena';
    case 'compare':
      return compare && compare.length ? `#/compare?s=${buildCompareParam(compare)}` : '#/compare';
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
    case 'portfolio':
      return '#/portfolio';
    case 'calendar':
      return '#/calendar';
    case 'macro':
      return '#/macro';
    case 'kitchen':
      return '#/kitchen';
    case 'sectors':
      return '#/sectors';
    case 'crypto':
      return assetSymbolOrId ? `#/crypto/${encodeURIComponent(assetSymbolOrId)}` : '#/crypto';
    case 'alerts':
      return '#/alerts';
    case 'detail': {
      const asset =
        (assetSymbolOrId ? getAssetBySymbol(assetSymbolOrId) : undefined) ?? ASSETS[0];
      return `#/asset/${asset.id}`;
    }
  }
}
