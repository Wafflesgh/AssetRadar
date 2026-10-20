/**
 * PriceChart.tsx — Chooses and renders the chart source for an asset: the official
 * TradingView widget or the alternative lightweight-charts candles, with a manual toggle.
 */
import { useT } from '../i18n/index.ts';
import { useState } from 'react';
import { BarChart3, LineChart } from 'lucide-react';
import { AssetConfig, TimeframeInterval } from '../config/assets.ts';
import { TradingViewChart } from './TradingViewChart.tsx';
import { ChartTheme, FallbackChart } from './FallbackChart.tsx';

export type ChartSource = 'tradingview' | 'alternative';

export interface PriceChartProps {
  asset: AssetConfig;
  /** TradingView widget symbol; defaults to asset.tvSymbol (can be switched to the fallback). */
  tvSymbol?: string;
  interval: TimeframeInterval;
  /** 'terminal' = dark TradingView widget using the Terminal panel colors. */
  theme: ChartTheme;
  height?: number;
}

/**
 * Automatic source. Widget failures (cross-origin iframe) cannot be detected reliably, so:
 * - tvWidgetUnsupported (crypto INDODAX:*IDR rejected by the widget) → always the alternative chart;
 * - usesBackupChartFallback (IDX:COMPOSITE is D/W only) + intraday → the alternative chart;
 * - otherwise → TradingView.
 */
export function getAutoChartSource(asset: AssetConfig, interval: TimeframeInterval): ChartSource {
  if (asset.tvWidgetUnsupported) return 'alternative';
  const intraday = interval !== 'D' && interval !== 'W';
  return asset.usesBackupChartFallback && intraday ? 'alternative' : 'tradingview';
}

/** Default widget symbol: the fallback symbol when the primary one is rejected by the widget. */
export function getDefaultTvSymbol(asset: AssetConfig): string {
  return asset.tvWidgetUnsupported && asset.tvFallbackSymbol ? asset.tvFallbackSymbol : asset.tvSymbol;
}

export function PriceChart({ asset, tvSymbol, interval, theme, height }: PriceChartProps) {
  // A manual choice only applies to the asset it was made for (resets when switching assets)
  const [override, setOverride] = useState<{ symbol: string; source: ChartSource } | null>(null);
  const t = useT();

  const autoSource = getAutoChartSource(asset, interval);
  const source = override?.symbol === asset.symbol ? override.source : autoSource;
  // Rupiah crypto from Indodax (Yahoo has no BTC-IDR etc.), other assets from Yahoo Finance
  const altSourceLabel = asset.indodaxPair ? 'Indodax' : 'Yahoo Finance';
  const canUseAlternative = Boolean(asset.indodaxPair || asset.yahooSymbol);
  const showAlternative = source === 'alternative' && canUseAlternative;
  // Symbols the widget rejects with no fallback symbol can only use the alternative chart
  const tradingViewAvailable = !(asset.tvWidgetUnsupported && !asset.tvFallbackSymbol);
  const activeTvSymbol = tvSymbol ?? getDefaultTvSymbol(asset);

  const toggleSource = () =>
    setOverride({ symbol: asset.symbol, source: showAlternative ? 'tradingview' : 'alternative' });

  return (
    <div className="space-y-2">
      {canUseAlternative && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 text-xs"
          style={{ color: 'var(--text-secondary)' }}
        >
          <span>
            {t('chart.source')}{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {showAlternative ? t('chart.alternative', { source: altSourceLabel }) : `TradingView (${activeTvSymbol})`}
            </strong>
            {showAlternative && autoSource === 'alternative' && override?.symbol !== asset.symbol && (
              <>
                {' '}
                {t('chart.auto')}
                {asset.tvWidgetUnsupported ? ` ${t('chart.notInWidget')}` : ` ${t('chart.forTimeframe')}`}
              </>
            )}
            {!showAlternative && activeTvSymbol.endsWith('USDT') && <> {t('chart.usdt')}</>}
          </span>
          {tradingViewAvailable && (
          <button
            type="button"
            onClick={toggleSource}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors whitespace-nowrap"
            style={{
              backgroundColor: 'var(--bg-surface-subtle)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--accent-radar)',
            }}
          >
            {showAlternative ? (
              <LineChart className="w-3 h-3" />
            ) : (
              <BarChart3 className="w-3 h-3" />
            )}
            <span>{showAlternative ? t('chart.tryTv') : t('chart.useAlt')}</span>
          </button>
          )}
        </div>
      )}

      {showAlternative ? (
        <FallbackChart
          symbol={asset.symbol}
          interval={interval}
          theme={theme}
          height={height}
          sourceLabel={altSourceLabel}
        />
      ) : (
        <TradingViewChart
          symbol={activeTvSymbol}
          interval={interval}
          theme={theme === 'light' ? 'light' : 'dark'}
          height={height}
          backgroundColor={theme === 'terminal' ? '#0B0F14' : undefined}
          gridColor={theme === 'terminal' ? '#1F2937' : undefined}
        />
      )}
    </div>
  );
}
