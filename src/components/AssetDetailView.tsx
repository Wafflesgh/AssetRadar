/**
 * AssetDetailView.tsx — Asset detail page: asset switcher, large price with 24h change and
 * range (gold also in Rupiah/gram), watchlist toggle, timeframe buttons, the price chart
 * (TradingView or alternative) and the sentiment + news panel.
 */
import { useState, useEffect, lazy, Suspense } from 'react';
import { useT, type TranslationKey } from '../i18n/index.ts';
import { Rich } from '../i18n/Rich.tsx';
import { assetDescription, assetName, assetShortName, assetUnitLabel, groupTitle } from '../i18n/assetNames.ts';
import { ArrowLeft, Star, Info, RefreshCw, Bell, GitCompare } from 'lucide-react';
import { AlertDialog } from './AlertEditor.tsx';
import { AntamGoldCard } from './AntamGoldCard.tsx';
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
  formatAssetPrice,
  formatPercent,
  formatDecimal,
} from '../utils/format.ts';
import { formatRelativeTime } from '../utils/marketHours.ts';
import { PriceChart } from './PriceChart.tsx';
import { LiveIndication } from './LiveIndication.tsx';
import { AssetIntelligencePanel } from './AssetIntelligencePanel.tsx';
import { AssetSearch } from './AssetSearch.tsx';
import { CorporateCalendarPanel } from './CorporateCalendarPanel.tsx';
import type { ChartLine } from './sentiment/TechnicalLevelsPanel.tsx';

const FinancialStatementsPanel = lazy(() => import('./FinancialStatementsPanel.tsx').then((m) => ({ default: m.FinancialStatementsPanel })));
const InvestmentSentimentPanel = lazy(() => import('./sentiment/InvestmentSentimentPanel.tsx').then((m) => ({ default: m.InvestmentSentimentPanel })));
const TechnicalLevelsPanel = lazy(() => import('./sentiment/TechnicalLevelsPanel.tsx').then((m) => ({ default: m.TechnicalLevelsPanel })));
const RecommendationHistory = lazy(() => import('./RecommendationHistory.tsx').then((m) => ({ default: m.RecommendationHistory })));

interface AssetDetailViewProps {
  asset: AssetConfig;
  tick?: PriceTick;
  onSelectAsset: (symbol: string) => void;
  onBackToRadar: () => void;
  timeframe: TimeframeInterval;
  onChangeTimeframe: (interval: TimeframeInterval) => void;
  effectiveTheme: 'light' | 'dark';
  isWatchlisted: boolean;
  /** All live ticks (for the alert form's asset picker). */
  ticks?: Record<string, PriceTick>;
  /** Adds this asset to the Compare page and opens it. */
  onCompare?: (symbol: string) => void;
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
  ticks = {},
  onCompare,
  onToggleWatchlist,
}: AssetDetailViewProps) {
  // A primary symbol rejected by the TradingView widget switches straight to the fallback symbol
  const [useFallbackSymbol, setUseFallbackSymbol] = useState(Boolean(asset.tvWidgetUnsupported));
  // Support/resistance lines from the Technical ranges card (empty = none)
  const [chartLines, setChartLines] = useState<ChartLine[]>([]);
  useEffect(() => setChartLines([]), [asset.symbol]);
  const t = useT();
  const [alertOpen, setAlertOpen] = useState(false);

  // Reset fallback toggle when switching assets
  useEffect(() => {
    setUseFallbackSymbol(Boolean(asset.tvWidgetUnsupported));
  }, [asset.symbol, asset.tvWidgetUnsupported]);

  const activeTvSymbol =
    useFallbackSymbol && asset.tvFallbackSymbol
      ? asset.tvFallbackSymbol
      : asset.tvSymbol;

  const isGold = asset.symbol === 'XAU/USD';
  const isStock = asset.group === 'idStock' || asset.group === 'usStock' || asset.group === 'globalStock';
  const isLoaded = tick !== undefined && tick.status !== 'error' && Number.isFinite(tick.price);

  const formatVal = (val: number | undefined) => {
    if (val === undefined || !Number.isFinite(val)) return '—';
    return formatAssetPrice(val, asset);
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
          <span>{t('detail.back')}</span>
        </button>

        {/* Asset switcher: search any asset, plus the quick-chart shortcuts */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 lg:max-w-3xl w-full lg:justify-end">
          <div
            role="tablist"
            aria-label={t('detail.quick')}
            className="flex flex-wrap items-center gap-1.5"
          >
            {ASSETS.filter((item) => item.quick || item.symbol === asset.symbol).map((item) => {
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
                    backgroundColor: selected ? 'var(--accent-radar-soft)' : 'var(--bg-surface)',
                    borderColor: selected ? 'var(--accent-radar)' : 'var(--border-subtle)',
                    color: selected ? 'var(--accent-radar)' : 'var(--text-secondary)',
                  }}
                >
                  {assetShortName(item)}
                </button>
              );
            })}
          </div>
          <AssetSearch
            className="w-full sm:w-72 shrink-0"
            onSelect={(a) => onSelectAsset(a.symbol)}
            label={t('detail.searchAnother')}
            placeholder={t('detail.searchAnotherPh')}
          />
        </div>
      </div>

      {/* Asset Header & Live Price Summary Box */}
      <section
        aria-label={t('detail.info', { name: assetName(asset) })}
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
                {groupTitle(asset.group)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num">{asset.symbol}</span>
              <span aria-hidden="true">·</span>
              <span>{t('detail.source', { source: tick?.source || asset.sourceLabel })}</span>
              {tick?.updatedAt && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{formatRelativeTime(tick.updatedAt)}</span>
                </>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              {assetName(asset)}
            </h1>
            <p className="text-sm max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
              {assetDescription(asset)}
            </p>
          </div>

          {/* Watchlist, alert */}
          <div className="flex flex-wrap gap-2 shrink-0 self-start">
          <button
            type="button"
            onClick={() => onToggleWatchlist(asset.symbol)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0"
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
              {isWatchlisted ? t('detail.saved') : t('detail.add')}
            </span>
          </button>
            <button
              type="button"
              onClick={() => setAlertOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap"
              style={{ backgroundColor: 'var(--bg-surface-subtle)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            >
              <Bell className="w-4 h-4" />
              <span>{t('detail.alert')}</span>
            </button>
            {onCompare && (
              <button
                type="button"
                onClick={() => onCompare(asset.symbol)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap"
                style={{ backgroundColor: 'var(--bg-surface-subtle)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              >
                <GitCompare className="w-4 h-4" />
                <span>{t('cmp.title')}</span>
              </button>
            )}
          </div>
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
                  {t('detail.goldSpot')}
                </span>
                <span
                  data-testid="detail-price-primary"
                  className="text-2xl font-mono-num font-bold tabular-nums mt-0.5 block"
                  style={{ color: 'var(--color-gold)' }}
                >
                  {isLoaded && tick ? formatUsdPerOz(tick.price) : t('common.loading')}
                </span>
                <span
                  className="text-[11px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t('detail.troyOz')}
                </span>
              </div>
              <div>
                <span
                  className="text-xs block"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t('detail.goldIdr')}
                </span>
                <span
                  data-testid="detail-price-secondary"
                  className="text-2xl font-mono-num font-bold tabular-nums mt-0.5 block"
                >
                  {isLoaded && tick?.priceIdrPerGram
                    ? `${formatRupiah(tick.priceIdrPerGram, 0)}/gr`
                    : t('common.loading')}
                </span>
                <span
                  className="text-[11px]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t('detail.goldFormula')}
                </span>
              </div>
              <p
                className="sm:col-span-2 lg:col-span-4 text-[11px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('detail.goldNote')}
              </p>
            </>
          ) : (
            <div>
              <span
                className="text-xs block"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('detail.latest', { unit: assetUnitLabel(asset) })}
              </span>
              <span
                data-testid="detail-price-primary"
                className="text-2xl md:text-3xl font-mono-num font-bold tabular-nums mt-0.5 block"
              >
                {isLoaded && tick ? formatVal(tick.price) : t('common.loading')}
              </span>
              {isLoaded && tick?.converted && tick.priceUsdt !== undefined && (
                <span className="text-[11px] block font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                  {t('detail.converted', { usdt: formatDecimal(tick.priceUsdt, tick.priceUsdt >= 1 ? 4 : 8) })}
                </span>
              )}
              {isLoaded && <LiveIndication code={asset.code} officialUsd={asset.currency === 'USD' && tick && Number.isFinite(tick.price) ? tick.price : null} />}
              <span
                className="text-[11px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                {tick?.isMarketOpen === false
                  ? t('detail.lastClosed')
                  : tick?.status === 'delayed'
                    ? t('detail.delayedOpen')
                    : t('detail.latestData')}
              </span>
            </div>
          )}

          <div>
            <span
              className="text-xs block"
              style={{ color: 'var(--text-secondary)' }}
            >
              {t('detail.change24')}
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
              {t('detail.range24')}
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
      <section aria-label={t('detail.chartLabel')} className="space-y-3">
        <div
          className="p-3.5 rounded-xl border flex flex-col md:flex-row md:items-center md:justify-between gap-3"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {/* Timeframe Buttons (1m, 5m, 15m, 30m, 1H, 4H, 1D, 1W) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="text-xs font-medium mr-1.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              {t('detail.timeframe')}
            </span>
            <div
              role="group"
              aria-label={t('detail.tfPicker')}
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
                    title={t('detail.tfTitle', { title: t(`tf.${tf.interval}` as TranslationKey), interval: tf.interval })}
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
              {t('detail.widgetSymbol')}{' '}
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
                    ? t('detail.usePrimary', { symbol: asset.tvSymbol })
                    : t('detail.useFallback', { symbol: asset.tvFallbackSymbol })}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Notice for widget symbols that only offer daily/weekly data (JCI, DAX) */}
        {asset.usesBackupChartFallback && (
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
                  {t('detail.chartNoteTitle', { name: assetShortName(asset) })}
                </strong>{' '}
                <Rich text={t('detail.chartNote', { symbol: asset.tvSymbol })} />
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
                {t('detail.showTv1d')}
              </button>
            )}
          </div>
        )}

        {/* Official TradingView widget or the alternative chart (Indodax / Yahoo Finance) */}
        <PriceChart
          asset={asset}
          tvSymbol={activeTvSymbol}
          interval={timeframe}
          theme={effectiveTheme}
          priceLines={chartLines}
        />
      </section>

      <Suspense fallback={null}>
        <InvestmentSentimentPanel asset={asset} />
        <TechnicalLevelsPanel asset={asset} onChartLines={setChartLines} />
        <RecommendationHistory asset={asset} />
      </Suspense>

      {isStock && (
        <Suspense fallback={null}>
          <FinancialStatementsPanel asset={asset} />
        </Suspense>
      )}

      {isStock && <CorporateCalendarPanel asset={asset} />}

      {asset.symbol === 'XAU/USD' && <AntamGoldCard tick={tick} />}

      {/* Sentiment Analysis & Market News Panel for Selected Asset */}
      <AssetIntelligencePanel
        symbol={asset.symbol}
        assetName={assetName(asset)}
      />
      {alertOpen && <AlertDialog asset={asset} ticks={{ ...ticks, ...(tick ? { [asset.symbol]: tick } : {}) }} onClose={() => setAlertOpen(false)} />}
    </div>
  );
}
