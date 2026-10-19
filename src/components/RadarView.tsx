/**
 * RadarView.tsx — The Radar dashboard: market summary (assets up/down), price cards per
 * group with a 24h sparkline and price flash on change, and the sentiment + news section.
 */
import { useState, useEffect, useRef } from 'react';
import { ArrowUpRight, LineChart, Star, RefreshCw, AlertCircle } from 'lucide-react';
import {
  ASSETS,
  ASSET_GROUPS,
  AssetConfig,
  PriceTick,
} from '../config/assets.ts';
import {
  formatRupiah,
  formatUsdPerOz,
  formatPoints,
  formatPercent,
} from '../utils/format.ts';
import { formatRelativeTime } from '../utils/marketHours.ts';
import { SparklineChart } from './SparklineChart.tsx';
import { AssetIntelligencePanel } from './AssetIntelligencePanel.tsx';

interface RadarViewProps {
  ticks: Record<string, PriceTick>;
  onSelectAsset: (symbol: string) => void;
  onRetrySymbol: (symbol: string) => void;
  watchlist: string[];
  onToggleWatchlist: (symbol: string) => void;
}

export function RadarView({
  ticks,
  onSelectAsset,
  onRetrySymbol,
  watchlist,
  onToggleWatchlist,
}: RadarViewProps) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [selectedIntelSymbol, setSelectedIntelSymbol] = useState<string>('BTC/IDR');

  // Tick relative time every 1 second so "updated X seconds ago" stays fresh
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Calculate assets up vs down today
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

  const selectedIntelAsset =
    ASSETS.find((a) => a.symbol === selectedIntelSymbol) ?? ASSETS[0];

  return (
    <div className="space-y-8">
      {/* Summary Header Banner */}
      <section
        aria-label="Market radar summary"
        className="p-5 md:p-6 rounded-xl border"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div
              className="flex items-center gap-2 text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span>Live Instrument Radar</span>
              <span aria-hidden="true">·</span>
              <span>6 Assets Tracked</span>
              <span aria-hidden="true">·</span>
              <span>WIB Time Zone (Asia/Jakarta)</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">
              Track gold, stocks, and crypto on one radar.
            </h1>
            <p className="text-sm max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
              Crypto prices update in real time via Indodax, the JCI index &amp; USD/IDR rate come from
              Yahoo Finance, plus the XAU/USD spot gold price with its Rupiah-per-gram conversion.
            </p>
          </div>

          {/* Summary Metrics Strip: number of assets up vs down today */}
          <div
            className="grid grid-cols-3 gap-5 pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l lg:pl-6 shrink-0"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div>
              <span
                className="text-xs block"
                style={{ color: 'var(--text-secondary)' }}
              >
                Assets Up (24h)
              </span>
              <span
                data-testid="summary-up-count"
                className="text-xl font-mono-num font-bold tabular-nums mt-0.5 block"
                style={{ color: 'var(--color-up)' }}
              >
                ▲ {upCount}
              </span>
            </div>
            <div>
              <span
                className="text-xs block"
                style={{ color: 'var(--text-secondary)' }}
              >
                Assets Down (24h)
              </span>
              <span
                data-testid="summary-down-count"
                className="text-xl font-mono-num font-bold tabular-nums mt-0.5 block"
                style={{ color: 'var(--color-down)' }}
              >
                ▼ {downCount}
              </span>
            </div>
            <div>
              <span
                className="text-xs block"
                style={{ color: 'var(--text-secondary)' }}
              >
                Flat / Other
              </span>
              <span
                className="text-xl font-mono-num font-bold tabular-nums mt-0.5 block"
                style={{ color: 'var(--text-primary)' }}
              >
                {flatCount}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Chart Launcher Bar */}
        <div
          className="mt-5 pt-4 border-t flex flex-wrap items-center gap-2"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <span
            className="text-xs font-medium mr-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            Quick Chart &amp; Detail:
          </span>
          {ASSETS.map((asset) => (
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
                style={{
                  color:
                    asset.group === 'gold'
                      ? 'var(--color-gold)'
                      : 'var(--accent-radar)',
                }}
              />
              <span>{asset.shortName}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Asset Groups Sections */}
      {ASSET_GROUPS.map((groupMeta) => {
        const groupAssets = ASSETS.filter((a) => a.group === groupMeta.key);
        return (
          <section
            key={groupMeta.key}
            aria-labelledby={`group-heading-${groupMeta.key}`}
            className="space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
              <h2
                id={`group-heading-${groupMeta.key}`}
                className="text-base md:text-lg font-bold tracking-tight"
              >
                {groupMeta.title}
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {groupMeta.subtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupAssets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  tick={ticks[asset.symbol]}
                  nowMs={nowMs}
                  isWatchlisted={watchlist.includes(asset.symbol)}
                  onOpenDetail={() => onSelectAsset(asset.symbol)}
                  onRetry={() => onRetrySymbol(asset.symbol)}
                  onToggleWatchlist={() => onToggleWatchlist(asset.symbol)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* Sentiment Analysis & Market News Section on Radar */}
      <section aria-labelledby="radar-sentiment-heading" className="space-y-4 pt-2">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2
              id="radar-sentiment-heading"
              className="text-base md:text-lg font-bold tracking-tight"
            >
              Sentiment Analysis &amp; Market-Moving News
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Pick an instrument to see its market sentiment score and the latest news affecting
              its price moves.
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Choose an asset for sentiment and news"
            className="flex flex-wrap items-center gap-1.5"
          >
            {ASSETS.map((item) => {
              const active = item.symbol === selectedIntelSymbol;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedIntelSymbol(item.symbol)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap"
                  style={{
                    backgroundColor: active
                      ? 'var(--accent-radar-soft)'
                      : 'var(--bg-surface)',
                    borderColor: active
                      ? 'var(--accent-radar)'
                      : 'var(--border-subtle)',
                    color: active ? 'var(--accent-radar)' : 'var(--text-secondary)',
                  }}
                >
                  {item.shortName}
                </button>
              );
            })}
          </div>
        </div>

        <AssetIntelligencePanel
          symbol={selectedIntelAsset.symbol}
          assetName={selectedIntelAsset.name}
        />
      </section>
    </div>
  );
}

interface AssetCardProps {
  asset: AssetConfig;
  tick?: PriceTick;
  nowMs: number;
  isWatchlisted: boolean;
  onOpenDetail: () => void;
  onRetry: () => void;
  onToggleWatchlist: () => void;
}

function AssetCard({
  asset,
  tick,
  nowMs,
  isWatchlisted,
  onOpenDetail,
  onRetry,
  onToggleWatchlist,
}: AssetCardProps) {
  const prevPriceRef = useRef<number | undefined>(undefined);
  const [flashDirection, setFlashDirection] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    const currentPrice = tick?.price;
    if (
      currentPrice !== undefined &&
      Number.isFinite(currentPrice) &&
      prevPriceRef.current !== undefined &&
      prevPriceRef.current !== currentPrice
    ) {
      const dir = currentPrice > prevPriceRef.current ? 'up' : 'down';
      setFlashDirection(dir);
      const timer = setTimeout(() => setFlashDirection(null), 650);
      prevPriceRef.current = currentPrice;
      return () => clearTimeout(timer);
    }
    if (currentPrice !== undefined && Number.isFinite(currentPrice)) {
      prevPriceRef.current = currentPrice;
    }
  }, [tick?.price]);

  const isGold = asset.group === 'gold';
  const hasError = tick?.status === 'error';
  const isLoaded = tick !== undefined && !hasError && Number.isFinite(tick.price);
  const changePct = tick?.changePct24h;
  const isPositive = (changePct ?? 0) >= 0;

  // Format primary price
  let formattedPrimaryPrice = 'Loading...';
  if (isLoaded && tick) {
    if (asset.currency === 'IDR') {
      formattedPrimaryPrice = formatRupiah(tick.price, 0);
    } else if (asset.currency === 'PTS') {
      formattedPrimaryPrice = formatPoints(tick.price);
    } else if (asset.currency === 'USD') {
      formattedPrimaryPrice = formatUsdPerOz(tick.price);
    }
  }

  const formattedGoldIdr =
    isGold && isLoaded && tick?.priceIdrPerGram
      ? `${formatRupiah(tick.priceIdrPerGram, 0)}/gr`
      : '—';

  const statusText = !tick
    ? 'Loading...'
    : tick.fromSnapshot
      ? 'Offline – last data'
      : tick.status === 'error'
      ? 'Error'
      : asset.symbol === '^JKSE'
        ? tick.isMarketOpen
          ? 'Delayed · Market open'
          : 'Delayed · Market closed'
        : tick.status === 'live'
          ? 'Live'
          : 'Delayed';

  const flashBg =
    flashDirection === 'up'
      ? 'var(--color-up-soft)'
      : flashDirection === 'down'
        ? 'var(--color-down-soft)'
        : 'transparent';

  return (
    <article
      onClick={onOpenDetail}
      className="rounded-xl border p-5 flex flex-col justify-between transition-colors cursor-pointer hover:border-emerald-500/40"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div>
        {/* Card Header: Title, Symbol & Watchlist button */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div
              className="flex items-center gap-1.5 text-xs"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span className="font-mono-num font-medium">{asset.symbol}</span>
              <span aria-hidden="true">·</span>
              <span>{tick?.source || asset.sourceLabel}</span>
            </div>
            <h3 className="text-base font-bold mt-0.5">{asset.name}</h3>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleWatchlist();
            }}
            aria-label={
              isWatchlisted
                ? `Remove ${asset.name} from Watchlist`
                : `Add ${asset.name} to Watchlist`
            }
            className="p-2 rounded-lg border transition-colors shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface-subtle)',
              borderColor: 'var(--border-subtle)',
              color: isWatchlisted ? 'var(--color-gold)' : 'var(--text-secondary)',
            }}
          >
            <Star
              className="w-4 h-4"
              fill={isWatchlisted ? 'currentColor' : 'none'}
            />
          </button>
        </div>

        {/* Price & 24h Change or Error State */}
        <div
          className="mt-4 pt-3 border-t rounded-lg transition-colors duration-300"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: flashBg,
          }}
        >
          {hasError ? (
            <div
              onClick={(e) => e.stopPropagation()}
              className="py-4 flex flex-col items-start gap-2.5"
            >
              <div
                className="flex items-center gap-1.5 text-xs font-semibold"
                style={{ color: 'var(--color-down)' }}
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Data unavailable</span>
              </div>
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
                style={{
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Try again</span>
              </button>
            </div>
          ) : (
            <>
              {isGold ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span
                        className="text-[11px] block"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        World Spot (USD/oz)
                      </span>
                      <span
                        data-testid={`price-${asset.id}`}
                        className="text-lg font-mono-num font-bold tabular-nums block"
                        style={{ color: 'var(--color-gold)' }}
                      >
                        {formattedPrimaryPrice}
                      </span>
                    </div>
                    <div>
                      <span
                        className="text-[11px] block"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Converted (IDR/gram)
                      </span>
                      <span
                        data-testid="price-xau-idr"
                        className="text-lg font-mono-num font-bold tabular-nums block"
                      >
                        {formattedGoldIdr}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: 'var(--text-secondary)' }}>24h Change</span>
                    <ChangeText value={changePct} />
                  </div>
                  <p className="text-[10px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                    Price: spot XAU. 24h change &amp; mini chart: gold futures contract (GC=F).
                  </p>
                </div>
              ) : (
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <span
                      className="text-[11px] block"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Price ({asset.unitLabel})
                    </span>
                    <span
                      data-testid={`price-${asset.id}`}
                      className="text-xl font-mono-num font-bold tabular-nums block mt-0.5"
                    >
                      {formattedPrimaryPrice}
                    </span>
                  </div>
                  <div className="text-right">
                    <span
                      className="text-[11px] block"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      24h Change
                    </span>
                    <ChangeText value={changePct} />
                  </div>
                </div>
              )}

              {/* 24h Sparkline Area Chart */}
              <div className="mt-3">
                <SparklineChart
                  data={tick?.sparkline}
                  isPositive={isPositive}
                  height={48}
                />
              </div>
            </>
          )}

          {/* Metadata Footer inside Card: Relative Update Time & Status */}
          <div
            className="mt-3 flex items-center justify-between text-[11px]"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span>
              {tick?.updatedAt
                ? formatRelativeTime(tick.updatedAt, nowMs)
                : 'Loading data...'}
            </span>
            <span
              className="font-semibold"
              style={{
                color:
                  tick?.status === 'live'
                    ? 'var(--accent-radar)'
                    : tick?.status === 'error'
                      ? 'var(--color-down)'
                      : 'var(--text-secondary)',
              }}
            >
              {statusText}
            </span>
          </div>
        </div>
      </div>

      {/* Primary Action: Open Detail & Chart */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenDetail();
        }}
        className="mt-4 w-full py-2.5 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 border transition-colors whitespace-nowrap"
        style={{
          backgroundColor: 'var(--bg-surface-subtle)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-primary)',
        }}
      >
        <span>{asset.shortName} Detail, Chart &amp; Sentiment</span>
        <ArrowUpRight className="w-3.5 h-3.5" style={{ color: 'var(--accent-radar)' }} />
      </button>
    </article>
  );
}

function ChangeText({ value }: { value?: number }) {
  if (value === undefined || !Number.isFinite(value)) {
    return (
      <span
        className="text-sm font-mono-num font-medium tabular-nums"
        style={{ color: 'var(--text-secondary)' }}
      >
        —
      </span>
    );
  }
  const isUp = value > 0;
  const isDown = value < 0;
  const arrow = isUp ? '▲ ' : isDown ? '▼ ' : '';
  const color = isUp
    ? 'var(--color-up)'
    : isDown
      ? 'var(--color-down)'
      : 'var(--text-secondary)';

  return (
    <span
      className="text-sm font-mono-num font-bold tabular-nums"
      style={{ color }}
    >
      {arrow}
      {formatPercent(value)}
    </span>
  );
}
