import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  UTCTimestamp,
  IChartApi,
  ISeriesApi,
} from 'lightweight-charts';
import { RefreshCw } from 'lucide-react';
import { TimeframeInterval } from '../config/assets.ts';
import { fetchHistory } from '../services/marketDataService.ts';
import { toWibChartData } from '../utils/candles.ts';

export interface FallbackChartProps {
  /** Simbol aplikasi, contoh "^JKSE" atau "BTC/IDR". */
  symbol: string;
  interval: TimeframeInterval;
  theme: 'light' | 'dark';
  /** Tinggi tetap dalam piksel; tanpa ini memakai tinggi standar halaman Detail. */
  height?: number;
  /** Nama sumber candle untuk keterangan, contoh "Yahoo Finance" atau "Indodax". */
  sourceLabel?: string;
}

// Canvas tidak bisa membaca var(--...), jadi warna disalin dari token di index.css
const CHART_COLORS = {
  light: {
    background: '#FFFFFF',
    text: '#64748B',
    grid: '#E2E8F0',
    up: '#16A34A',
    down: '#DC2626',
    volumeUp: 'rgba(22, 163, 74, 0.35)',
    volumeDown: 'rgba(220, 38, 38, 0.35)',
  },
  dark: {
    background: '#131C2E',
    text: '#94A3B8',
    grid: '#1E293B',
    up: '#22C55E',
    down: '#F87171',
    volumeUp: 'rgba(34, 197, 94, 0.35)',
    volumeDown: 'rgba(248, 113, 113, 0.35)',
  },
} as const;

const INTRADAY_REFRESH_MS = 60_000;

function isIntraday(interval: TimeframeInterval): boolean {
  return interval !== 'D' && interval !== 'W';
}

function formatChartPrice(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(value) < 10 ? 4 : 2,
  }).format(value);
}

type LoadState = 'loading' | 'ready' | 'empty' | 'error';

export function FallbackChart({
  symbol,
  interval,
  theme,
  height,
  sourceLabel = 'Yahoo Finance',
}: FallbackChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Buat grafik sekali saat komponen dipasang
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.dark.background },
        textColor: CHART_COLORS.dark.text,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: 11,
      },
      localization: { locale: 'id-ID', priceFormatter: formatChartPrice },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, secondsVisible: false },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      borderVisible: false,
    });
    candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.25 } });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: 'volume',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // Ikuti tema terang/gelap
  useEffect(() => {
    const colors = CHART_COLORS[theme];
    chartRef.current?.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
    });
    candleSeriesRef.current?.applyOptions({
      upColor: colors.up,
      downColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
    });
  }, [theme]);

  // Muat candle; untuk intraday diperbarui tiap 60 detik
  useEffect(() => {
    let cancelled = false;
    let firstLoad = true;
    setLoadState('loading');
    setRefreshFailed(false);
    chartRef.current?.applyOptions({ timeScale: { timeVisible: isIntraday(interval) } });

    const load = async () => {
      try {
        const candles = await fetchHistory(symbol, interval);
        if (cancelled) return;
        const data = toWibChartData(candles);
        const colors = CHART_COLORS[theme];
        candleSeriesRef.current?.setData(
          data.candles.map((c) => ({ ...c, time: c.time as UTCTimestamp }))
        );
        volumeSeriesRef.current?.setData(
          data.volumes.map((v) => ({
            time: v.time as UTCTimestamp,
            value: v.value,
            color: v.up ? colors.volumeUp : colors.volumeDown,
          }))
        );
        if (firstLoad) chartRef.current?.timeScale().fitContent();
        firstLoad = false;
        setRefreshFailed(false);
        setLoadState(data.candles.length > 0 ? 'ready' : 'empty');
      } catch {
        if (cancelled) return;
        // Gagal saat pembaruan berkala: grafik lama tetap tampil
        if (firstLoad) setLoadState('error');
        else setRefreshFailed(true);
      }
    };

    load();
    const timer = isIntraday(interval)
      ? setInterval(() => {
          if (typeof document === 'undefined' || document.visibilityState !== 'hidden') load();
        }, INTRADAY_REFRESH_MS)
      : null;

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
    // theme sengaja tidak masuk dependensi: warna volume diperbarui pada muatan berikutnya
  },[symbol, interval, reloadKey]);

  const handleRetry = useCallback(() => setReloadKey((k) => k + 1), []);

  return (
    <div
      data-testid="fallback-chart-container"
      data-symbol={symbol}
      data-interval={interval}
      className={`w-full rounded-xl overflow-hidden border flex flex-col ${
        height ? '' : 'h-[60vh] min-h-[420px] md:h-[560px]'
      }`}
      style={{
        height: height ? `${height}px` : undefined,
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="absolute inset-0" aria-label={`Grafik candlestick ${symbol}`} />

        {loadState !== 'ready' && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-center px-4"
            style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)' }}
            role={loadState === 'error' ? 'alert' : 'status'}
          >
            {loadState === 'loading' && <span>Memuat grafik alternatif...</span>}
            {loadState === 'empty' && (
              <span>Belum ada data candle untuk timeframe ini. Coba timeframe lain.</span>
            )}
            {loadState === 'error' && (
              <>
                <span>Data tidak tersedia</span>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold"
                  style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--accent-radar)',
                  }}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Coba lagi
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div
        className="text-xs py-1.5 px-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
        style={{ color: 'var(--text-secondary)' }}
      >
        <span>Grafik alternatif, data tertunda ({sourceLabel}).</span>
        <span className="font-mono-num text-[11px]">
          {refreshFailed ? 'Gagal memperbarui · data terakhir' : `Interval ${interval} · WIB`}
        </span>
      </div>
    </div>
  );
}
