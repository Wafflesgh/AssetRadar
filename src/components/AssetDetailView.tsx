import { useState, useEffect } from 'react';
import { ArrowLeft, Star, Info, RefreshCw } from 'lucide-react';
import {
  ASSETS,
  AssetConfig,
  PriceTick,
  TIMEFRAME_OPTIONS,
  TimeframeInterval,
} from '../config/assets.ts';
import {
  formatRupiah,
  formatUsdPerOz,
  formatPoints,
  formatPercent,
} from '../utils/format.ts';
import { formatRelativeTimeId } from '../utils/marketHours.ts';
import { PriceChart } from './PriceChart.tsx';
import { AssetIntelligencePanel } from './AssetIntelligencePanel.tsx';

interface AssetDetailViewProps {
  asset: AssetConfig;
  tick?: PriceTick;
  onSelectAsset: (symbol: string) => void;
  onBackToRadar: () => void;
  timeframe: TimeframeInterval;
  onChangeTimeframe: (interval: TimeframeInterval) => void;
  effectiveTheme: 'light' | 'dark';
  isWatchlisted: boolean;
  onToggleWatchlist: (symbol: string) => void;
}

export function AssetDetailView({
  asset,
  tick,
  onSelectAsset,
  onBackToRadar,
  timeframe,
  onChangeTimeframe,
  effectiveTheme,
  isWatchlisted,
  onToggleWatchlist,
}: AssetDetailViewProps) {
  // Simbol utama yang ditolak widget TradingView langsung memakai simbol cadangan
  const [useFallbackSymbol, setUseFallbackSymbol] = useState(Boolean(asset.tvWidgetUnsupported));

  // Reset fallback toggle when switching assets
  useEffect(() => {
    setUseFallbackSymbol(Boolean(asset.tvWidgetUnsupported));
  }, [asset.symbol, asset.tvWidgetUnsupported]);

  const activeTvSymbol =
    useFallbackSymbol && asset.tvFallbackSymbol
      ? asset.tvFallbackSymbol
      : asset.tvSymbol;

  const isGold = asset.group === 'emas';
  const isIhsg = asset.symbol === '^JKSE';
  const isLoaded = tick !== undefined && tick.status !== 'error' && Number.isFinite(tick.price);

  const formatVal = (val: number | undefined) => {
    if (val === undefined || !Number.isFinite(val)) return '—';
    if (asset.currency === 'IDR') return formatRupiah(val, 0);
    if (asset.currency === 'PTS') return formatPoints(val);
    return formatUsdPerOz(val);
  };

  const changePct = tick?.changePct24h;
  const changeColor =
    changePct !== undefined && changePct > 0
      ? 'var(--color-up)'
      : changePct !== undefined && changePct < 0
        ? 'var(--color-down)'
        : 'var(--text-secondary)';
  const changePrefix =
    changePct !== undefined && changePct > 0
      ? '▲ '
      : changePct !== undefined && changePct < 0
        ? '▼ '
        : '';

  return (
    <div className="space-y-6">
      {/* Top Navigation & Quick Asset Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <button
          type="button"
          onClick={onBackToRadar}
          className="inline-flex items-center gap-2 text-sm font-medium w-fit px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Radar</span>
        </button>

        {/* Quick Asset Switcher Tabs */}
        <div
          role="tablist"
          aria-label="Pilih Instrumen Aset"
          className="flex flex-wrap items-center gap-1.5"
        >
          {ASSETS.map((item) => {
            const selected = item.symbol === asset.symbol;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onSelectAsset(item.symbol)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0"
                style={{
                  backgroundColor: selected
                    ? 'var(--accent-radar-soft)'
                    : 'var(--bg-surface)',
                  borderColor: selected
                    ? 'var(--accent-radar)'
                    : 'var(--border-subtle)',
                  color: selected
                    ? 'var(--accent-radar)'
                    : 'var(--text-secondary)',
                }}
              >
                {item.shortName}
              </button>
            );
          })}
        </div>
      </div>

      {/* Asset Header & Live Price Summary Box */}
      <section
        aria-label={`Informasi ${asset.name}`}
        className="p-5 md:p-6 rounded-xl border space-y-5"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-1">
            <div
              className="flex flex-wrap items-center gap-2 text-xs"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span className="uppercase font-semibold tracking-wider">
                {asset.group}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num">{asset.symbol}</span>
              <span aria-hidden="true">·</span>
              <span>Sumber: {tick?.source || asset.sourceLabel}</span>
              {tick?.updatedAt && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{formatRelativeTimeId(tick.updatedAt)}</span>
                </>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              {asset.name}
            </h1>
            <p className="text-sm max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
              {asset.description}
            </p>
          </div>

          {/* Watchlist Toggle Button */}
          <button
            type="button"
            onClick={() => onToggleWatchlist(asset.symbol)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 self-start"
            style={{
              backgroundColor: isWatchlisted
                ? 'var(--color-gold-soft)'
                : 'var(--bg-surface-subtle)',
              borderColor: isWatchlisted
                ? 'var(--color-gold)'
                : 'var(--border-subtle)',
              color: isWatchlisted ? 'var(--color-gold)' : 'var(--text-primary)',
            }}
          >
            <Star
              className="w-4 h-4"
              fill={isWatchlisted ? 'currentColor' : 'none'}
            />
            <span>
              {isWatchlisted ? 'Tersimpan di Watchlist' : 'Tambah ke Watchlist'}
            </span>
          </button>
        </div>

        {/* Live Price Metrics Row */}
        <div
          className="pt-4 border-t grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {isGold ? (
            <>
              <div>
                <span
                  className="text-xs block"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Harga Spot Dunia (USD/oz)
                </span>
                <span
                  data-testid="detail-price-primary"
                  className="text-2xl font-mono-num font-bold tabular-nums mt-0.5 block"
                  style={{ color: 'var(--color-gold)' }}
                >
                  {isLoaded && tick ? formatUsdPerOz(tick.price) : 'Memuat...'}
                </span>
                <span
                  className="text-[11px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  1 troy oz = 31,1034768 gram
                </span>
              </div>
              <div>
                <span
                  className="text-xs block"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Harga Konversi (Rupiah/gram)
                </span>
                <span
                  data-testid="detail-price-secondary"
                  className="text-2xl font-mono-num font-bold tabular-nums mt-0.5 block"
                >
                  {isLoaded && tick?.priceIdrPerGram
                    ? `${formatRupiah(tick.priceIdrPerGram, 0)}/gr`
                    : 'Memuat...'}
                </span>
                <span
                  className="text-[11px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Rumus: (XAU_USD / 31,1034768) × USD_IDR
                </span>
              </div>
              <p
                className="sm:col-span-2 lg:col-span-4 text-[11px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                Harga: spot XAU. Perubahan 24j &amp; grafik mini: kontrak futures emas (GC=F).
              </p>
            </>
          ) : (
            <div>
              <span
                className="text-xs block"
                style={{ color: 'var(--text-secondary)' }}
              >
                Harga Terkini ({asset.unitLabel})
              </span>
              <span
                data-testid="detail-price-primary"
                className="text-2xl md:text-3xl font-mono-num font-bold tabular-nums mt-0.5 block"
              >
                {isLoaded && tick ? formatVal(tick.price) : 'Memuat...'}
              </span>
              <span
                className="text-[11px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                {isIhsg
                  ? tick?.isMarketOpen
                    ? 'Data tertunda · Bursa buka'
                    : 'Harga penutupan terakhir · Pasar tutup'
                  : 'Data pasar terkini'}
              </span>
            </div>
          )}

          <div>
            <span
              className="text-xs block"
              style={{ color: 'var(--text-secondary)' }}
            >
              Perubahan 24 Jam
            </span>
            <span
              className="text-lg font-mono-num font-bold tabular-nums mt-1 block"
              style={{ color: changeColor }}
            >
              {changePct !== undefined
                ? `${changePrefix}${formatPercent(changePct)}`
                : '—'}
            </span>
          </div>

          <div>
            <span
              className="text-xs block"
              style={{ color: 'var(--text-secondary)' }}
            >
              Rentang 24 Jam (Tertinggi / Terendah)
            </span>
            <span
              className="text-xs md:text-sm font-mono-num font-semibold tabular-nums mt-1.5 block"
              style={{ color: 'var(--text-primary)' }}
            >
              {tick?.high24h && tick?.low24h
                ? `${formatVal(tick.high24h)} / ${formatVal(tick.low24h)}`
                : '— / —'}
            </span>
          </div>
        </div>
      </section>

      {/* Chart Controls: Timeframe Selector & Symbol Selector */}
      <section aria-label="Grafik Pergerakan Harga" className="space-y-3">
        <div
          className="p-3.5 rounded-xl border flex flex-col md:flex-row md:items-center md:justify-between gap-3"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {/* Timeframe Buttons (1m, 5m, 15m, 30m, 1J, 4J, 1H, 1M) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="text-xs font-medium mr-1.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              Timeframe:
            </span>
            <div
              role="group"
              aria-label="Pemilih Timeframe Grafik"
              className="flex flex-wrap items-center gap-1"
            >
              {TIMEFRAME_OPTIONS.map((tf) => {
                const isActive = timeframe === tf.interval;
                return (
                  <button
                    key={tf.interval}
                    type="button"
                    onClick={() => onChangeTimeframe(tf.interval)}
                    aria-pressed={isActive}
                    title={`Timeframe ${tf.title} (interval: ${tf.interval})`}
                    className="px-3 py-1.5 rounded-lg text-xs font-mono-num font-semibold transition-colors whitespace-nowrap"
                    style={{
                      backgroundColor: isActive
                        ? 'var(--accent-radar)'
                        : 'var(--bg-surface-subtle)',
                      color: isActive ? '#0B1220' : 'var(--text-primary)',
                    }}
                  >
                    {tf.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Symbol & Fallback Switcher */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className="font-mono-num"
              style={{ color: 'var(--text-secondary)' }}
            >
              Simbol Widget:{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {activeTvSymbol}
              </strong>
            </span>

            {asset.tvFallbackSymbol && (
              <button
                type="button"
                onClick={() => setUseFallbackSymbol((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--accent-radar)',
                }}
              >
                <RefreshCw className="w-3 h-3" />
                <span>
                  {useFallbackSymbol
                    ? `Gunakan Utama (${asset.tvSymbol})`
                    : `Gunakan Cadangan (${asset.tvFallbackSymbol})`}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Notice for IDX:COMPOSITE on IHSG */}
        {isIhsg && (
          <div
            className="p-3.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 leading-relaxed"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <div className="flex items-start gap-2.5">
              <Info
                className="w-4 h-4 shrink-0 mt-0.5"
                style={{ color: 'var(--color-gold)' }}
              />
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>
                  Catatan grafik IHSG:
                </strong>{' '}
                Widget TradingView (<code className="font-mono-num">IDX:COMPOSITE</code>) hanya
                menyediakan timeframe <strong>1H (Harian)</strong> dan <strong>1M (Mingguan)</strong>.
                Untuk timeframe lain, grafik alternatif dari Yahoo Finance (data tertunda) dipakai
                otomatis.
              </div>
            </div>
            {timeframe !== 'D' && timeframe !== 'W' && (
              <button
                type="button"
                onClick={() => onChangeTimeframe('D')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 whitespace-nowrap self-start sm:self-center"
                style={{
                  backgroundColor: 'var(--accent-radar)',
                  color: '#0B1220',
                }}
              >
                Tampilkan TradingView 1H
              </button>
            )}
          </div>
        )}

        {/* Widget resmi TradingView atau grafik alternatif (Yahoo Finance) */}
        <PriceChart
          asset={asset}
          tvSymbol={activeTvSymbol}
          interval={timeframe}
          theme={effectiveTheme}
        />
      </section>

      {/* Sentiment Analysis & Market News Panel for Selected Asset */}
      <AssetIntelligencePanel
        symbol={asset.symbol}
        assetName={asset.name}
      />
    </div>
  );
}
