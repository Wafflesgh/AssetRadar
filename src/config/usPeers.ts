/**
 * usPeers.ts — The US peer group for the sentiment percentiles and deciles: the S&P 500
 * constituents from sp500.json (rebuilt by scripts/update-sp500.mjs) with their GICS sector and
 * sub-industry. The app's own US stocks are ranked against this group; the other constituents are
 * only scanned in the background (prices, statements, analyst data) and are not app assets.
 */
import sp500 from './sp500.json' with { type: 'json' };
import type { AssetConfig } from './assets.ts';

type Row = [ticker: string, name: string, sector: string, subIndustry: string, cik: number];

export const SP500_UPDATED: string = sp500.generatedAt;
const ROWS = sp500.stocks as Row[];

/** GICS sector and sub-industry by Yahoo ticker (e.g. "BRK-B"). */
export const SP500_GICS: ReadonlyMap<string, { sector: string; subIndustry: string }> = new Map(
  ROWS.map(([ticker, , sector, subIndustry]) => [ticker, { sector, subIndustry }])
);

/**
 * Peer assets for the US cross-section: every constituent that is not already one of the app's
 * US stocks (matched by Yahoo ticker). Minimal configs — never added to the asset list or search.
 */
export function usPeerAssets(core: ReadonlyArray<Pick<AssetConfig, 'yahooSymbol'>>): AssetConfig[] {
  const known = new Set(core.map((a) => a.yahooSymbol));
  return ROWS.filter(([ticker]) => !known.has(ticker)).map(([ticker, name, sector, subIndustry]) => ({
    id: `peer-${ticker.toLowerCase()}`,
    code: ticker.replace('-', ''),
    exchange: 'NYSE',
    symbol: `peer:${ticker}`,
    yahooSymbol: ticker,
    shortName: ticker,
    name,
    group: 'usStock',
    currency: 'USD',
    tvSymbol: ticker,
    sourceLabel: 'Yahoo Finance',
    unitLabel: 'US Dollar per share',
    description: `${name}, S&P 500 constituent (peer group only).`,
    keywords: [],
    sector,
    industry: subIndustry,
  }));
}
