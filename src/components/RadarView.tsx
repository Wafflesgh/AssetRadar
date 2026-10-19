/**
 * RadarView.tsx — The Radar dashboard, ranked like companiesmarketcap.com: a search box over
 * every tracked asset, quick chart shortcuts, the biggest movers (live 5m / 1h / 24h / 7d),
 * the top 20 assets by live market cap, one table per market (commodities, crypto,
 * Indonesian / US / world stocks, indices, forex), the live headline tape, and the sentiment
 * + news section with its own asset search.
 */
import { useMemo, useState } from 'react';
import { LineChart } from 'lucide-react';
import { ASSETS, ASSET_GROUPS, AssetConfig, AssetGroup, PriceTick, getAssetBySymbol } from '../config/assets.ts';
import { usePriceFlash } from '../hooks/usePriceFlash.ts';
import { AssetIntelligencePanel } from './AssetIntelligencePanel.tsx';
import { AssetSearch } from './AssetSearch.tsx';
import { MarketTable } from './MarketTable.tsx';
import { MoversPanel } from './MoversPanel.tsx';
import { NewsTape } from './NewsTape.tsx';
import { InstallAppBanner } from './InstallApp.tsx';

interface RadarViewProps {
  ticks: Record<string, PriceTick>;
  onSelectAsset: (symbol: string) => void;
  onRetrySymbol: (symbol: string) => void;
  watchlist: string[];
  onToggleWatchlist: (symbol: string) => void;
}

/** Rows shown per market table before "Show all". */
const GROUP_PREVIEW_ROWS = 8;

/** Groups without a market cap (indices, currencies) keep their configured order. */
const NO_MARKET_CAP: AssetGroup[] = ['index', 'forex'];

function byMarketCap(ticks: Record<string, PriceTick>) {
  return (a: AssetConfig, b: AssetConfig) =>
    (ticks[b.symbol]?.marketCapUsd ?? -1) - (ticks[a.symbol]?.marketCapUsd ?? -1);
}

export function RadarView({ ticks, onSelectAsset, onRetrySymbol, watchlist, onToggleWatchlist }: RadarViewProps) {
  const [selectedIntelSymbol, setSelectedIntelSymbol] = useState<string>('BTC/IDR');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const flash = usePriceFlash(ticks);

  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  for (const asset of ASSETS) {
    const t = ticks[asset.symbol];
    if (t && t.status !== 'error' && t.changePct24h !== undefined && Number.isFinite(t.changePct24h)) {
      if (t.changePct24h > 0) upCount += 1;
      else if (t.changePct24h < 0) downCount += 1;
      else flatCount += 1;
    }
  }

  // Re-rank whenever market caps move (prices tick, so ranks can change live)
  const top20 = useMemo(
    () =>
      ASSETS.filter((a) => (ticks[a.symbol]?.marketCapUsd ?? 0) > 0)
        .sort(byMarketCap(ticks))
        .slice(0, 20),
    [ticks]
  );

  const quickAssets = ASSETS.filter((a) => a.quick);
  const selectedIntelAsset = getAssetBySymbol(selectedIntelSymbol) ?? ASSETS[0];
  const pickIntel = (asset: AssetConfig) => setSelectedIntelSymbol(asset.symbol);

  return (
    <div className="space-y-8">
      <NewsTape className="rounded-xl border" />
      <InstallAppBanner />

      {/* Summary, search and quick charts */}
      <section
        aria-label="Market radar summary"
        className="p-5 md:p-6 rounded-xl border"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              <span>Live Instrument Radar</span>
              <span aria-hidden="true">·</span>
              <span>{ASSETS.length} Assets Tracked</span>
              <span aria-hidden="true">·</span>
              <span>WIB (Asia/Jakarta)</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">
              The world's largest assets, Indonesian stocks, crypto and markets on one radar.
            </h1>
            <p className="text-sm max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
              Crypto is live from Indodax; stocks, indices, commodities and currencies come from Yahoo
              Finance (refreshed every 10–15 seconds while markets are open, exchange quotes may be delayed).
            </p>
          </div>

          <div
            className="grid grid-cols-3 gap-5 pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l lg:pl-6 shrink-0"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <SummaryStat label="Up (24h)" value={`▲ ${upCount}`} color="var(--color-up)" />
            <SummaryStat label="Down (24h)" value={`▼ ${downCount}`} color="var(--color-down)" />
            <SummaryStat label="Flat / Other" value={String(flatCount)} color="var(--text-primary)" />
          </div>
        </div>

        <div className="mt-5 pt-4 border-t space-y-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <AssetSearch
            ticks={ticks}
            onSelect={(a) => onSelectAsset(a.symbol)}
            label="Search all assets and open the chart"
            placeholder={`Search ${ASSETS.length} assets: BBCA, Nvidia, gold, crude oil, Nikkei, EUR…`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium mr-1" style={{ color: 'var(--text-secondary)' }}>
              Quick Chart &amp; Detail:
            </span>
            {quickAssets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => onSelectAsset(asset.symbol)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <LineChart
                  className="w-3.5 h-3.5"
                  style={{ color: asset.group === 'commodity' ? 'var(--color-gold)' : 'var(--accent-radar)' }}
                />
                <span>{asset.shortName}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <MoversPanel ticks={ticks} onSelect={onSelectAsset} />

      {/* Top 20 by market cap */}
      <section aria-labelledby="top20-heading" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
          <h2 id="top20-heading" className="text-base md:text-lg font-bold tracking-tight">
            Top 20 Assets by Market Cap
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Live price × shares or supply outstanding, in US Dollars (crypto from CoinGecko). Ranks update as prices move.
          </p>
        </div>
        {top20.length === 0 ? (
          <p
            className="p-5 rounded-xl border text-sm"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            Loading market caps…
          </p>
        ) : (
          <MarketTable
            caption="Top 20 assets by market capitalization"
            assets={top20}
            ticks={ticks}
            flash={flash}
            watchlist={watchlist}
            onSelect={onSelectAsset}
            onToggleWatchlist={onToggleWatchlist}
            onRetry={onRetrySymbol}
          />
        )}
      </section>

      {/* Markets by type */}
      <nav aria-label="Jump to a market" className="flex flex-wrap gap-1.5">
        {ASSET_GROUPS.map((g) => (
          <a
            key={g.key}
            href={`#group-${g.key}`}
            onClick={(e) => {
              // Plain anchors would replace the hash route, so scroll instead
              e.preventDefault();
              document.getElementById(`group-${g.key}`)?.scrollIntoView({ block: 'start' });
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            {g.title}
          </a>
        ))}
      </nav>

      {ASSET_GROUPS.map((groupMeta) => {
        const hasCap = !NO_MARKET_CAP.includes(groupMeta.key);
        const all = ASSETS.filter((a) => a.group === groupMeta.key);
        const sorted = hasCap ? [...all].sort(byMarketCap(ticks)) : all;
        const isOpen = expanded[groupMeta.key] ?? false;
        const rows = isOpen ? sorted : sorted.slice(0, GROUP_PREVIEW_ROWS);
        return (
          <section
            key={groupMeta.key}
            id={`group-${groupMeta.key}`}
            aria-labelledby={`group-heading-${groupMeta.key}`}
            className="space-y-3 scroll-mt-20"
          >
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
              <h2 id={`group-heading-${groupMeta.key}`} className="text-base md:text-lg font-bold tracking-tight">
                {groupMeta.title}
                <span className="ml-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {all.length}
                </span>
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {groupMeta.subtitle}
              </p>
            </div>
            <MarketTable
              caption={groupMeta.title}
              assets={rows}
              ticks={ticks}
              flash={flash}
              watchlist={watchlist}
              onSelect={onSelectAsset}
              onToggleWatchlist={onToggleWatchlist}
              onRetry={onRetrySymbol}
              showMarketCap={hasCap}
            />
            {all.length > GROUP_PREVIEW_ROWS && (
              <button
                type="button"
                onClick={() => setExpanded((e) => ({ ...e, [groupMeta.key]: !isOpen }))}
                aria-expanded={isOpen}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', color: 'var(--accent-radar)' }}
              >
                {isOpen ? 'Show fewer' : `Show all ${all.length} ${groupMeta.title.toLowerCase()}`}
              </button>
            )}
          </section>
        );
      })}

      {/* Sentiment Analysis & Market-Moving News */}
      <section aria-labelledby="radar-sentiment-heading" className="space-y-4 pt-2">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 id="radar-sentiment-heading" className="text-base md:text-lg font-bold tracking-tight">
              Sentiment Analysis &amp; Market-Moving News
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Search any instrument to see its technical picture, sentiment evidence and the latest news behind its moves.
            </p>
          </div>
          <AssetSearch
            className="w-full md:w-96"
            ticks={ticks}
            selected={selectedIntelAsset}
            onSelect={pickIntel}
            label="Choose an asset for sentiment and news"
          />
        </div>

        <AssetIntelligencePanel symbol={selectedIntelAsset.symbol} assetName={selectedIntelAsset.name} />
      </section>
    </div>
  );
}

function SummaryStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <span className="text-xs block" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
      <span className="text-xl font-mono-num font-bold tabular-nums mt-0.5 block" style={{ color }}>
        {value}
      </span>
    </div>
  );
}
