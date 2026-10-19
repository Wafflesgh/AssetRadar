import { useState } from 'react';
import { BarChart3, LineChart } from 'lucide-react';
import { AssetConfig, TimeframeInterval } from '../config/assets.ts';
import { TradingViewChart } from './TradingViewChart.tsx';
import { ChartTheme, FallbackChart } from './FallbackChart.tsx';

export type ChartSource = 'tradingview' | 'alternatif';

export interface PriceChartProps {
  asset: AssetConfig;
  /** Simbol widget TradingView; default asset.tvSymbol (bisa diganti ke simbol cadangan). */
  tvSymbol?: string;
  interval: TimeframeInterval;
  /** 'terminal' = widget TradingView gelap dengan warna panel Terminal. */
  theme: ChartTheme;
  height?: number;
}

/**
 * Sumber otomatis. Kegagalan widget (iframe lintas origin) tidak bisa dideteksi andal, jadi:
 * - tvWidgetUnsupported (crypto INDODAX:*IDR ditolak widget) → selalu grafik alternatif;
 * - usesBackupChartFallback (IDX:COMPOSITE hanya D/W) + intraday → grafik alternatif;
 * - selain itu → TradingView.
 */
export function getAutoChartSource(asset: AssetConfig, interval: TimeframeInterval): ChartSource {
  if (asset.tvWidgetUnsupported) return 'alternatif';
  const intraday = interval !== 'D' && interval !== 'W';
  return asset.usesBackupChartFallback && intraday ? 'alternatif' : 'tradingview';
}

/** Simbol widget default: simbol cadangan jika simbol utama ditolak widget. */
export function getDefaultTvSymbol(asset: AssetConfig): string {
  return asset.tvWidgetUnsupported && asset.tvFallbackSymbol ? asset.tvFallbackSymbol : asset.tvSymbol;
}

export function PriceChart({ asset, tvSymbol, interval, theme, height }: PriceChartProps) {
  // Pilihan manual hanya berlaku untuk aset tempat pilihan itu dibuat (reset saat ganti aset)
  const [override, setOverride] = useState<{ symbol: string; source: ChartSource } | null>(null);

  const autoSource = getAutoChartSource(asset, interval);
  const source = override?.symbol === asset.symbol ? override.source : autoSource;
  // Crypto Rupiah dari Indodax (Yahoo tidak punya BTC-IDR dkk.), aset lain dari Yahoo Finance
  const altSourceLabel = asset.indodaxPair ? 'Indodax' : 'Yahoo Finance';
  const canUseAlternative = Boolean(asset.indodaxPair || asset.yahooSymbol);
  const showAlternative = source === 'alternatif' && canUseAlternative;
  const activeTvSymbol = tvSymbol ?? getDefaultTvSymbol(asset);

  const toggleSource = () =>
    setOverride({ symbol: asset.symbol, source: showAlternative ? 'tradingview' : 'alternatif' });

  return (
    <div className="space-y-2">
      {canUseAlternative && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 text-xs"
          style={{ color: 'var(--text-secondary)' }}
        >
          <span>
            Sumber grafik:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {showAlternative ? `Alternatif (${altSourceLabel})` : `TradingView (${activeTvSymbol})`}
            </strong>
            {showAlternative && autoSource === 'alternatif' && override?.symbol !== asset.symbol && (
              <>
                {' '}
                · dipilih otomatis
                {asset.tvWidgetUnsupported ? ' (simbol Rupiah tidak tersedia di widget TradingView)' : ' untuk timeframe ini'}
              </>
            )}
            {!showAlternative && activeTvSymbol.endsWith('USDT') && <> · harga dalam USDT</>}
          </span>
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
            <span>{showAlternative ? 'Coba grafik TradingView' : 'Pakai grafik alternatif'}</span>
          </button>
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
