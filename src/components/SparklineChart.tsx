/** SparklineChart.tsx — 24-hour mini area chart (lightweight-charts) shown on price cards. */
import { useEffect, useRef } from 'react';
import {
  createChart,
  AreaSeries,
  ColorType,
  UTCTimestamp,
  IChartApi,
  ISeriesApi,
} from 'lightweight-charts';
import { SparklinePoint } from '../config/assets.ts';

interface SparklineChartProps {
  data?: SparklinePoint[];
  isPositive?: boolean;
  height?: number;
}

export function SparklineChart({
  data,
  isPositive = true,
  height = 52,
}: SparklineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  const hasData = Boolean(data && data.length >= 2);

  // Initialize chart instance once when data container mounts
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !hasData) return;

    container.innerHTML = '';

    const chart = createChart(container, {
      width: container.clientWidth || 220,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'transparent',
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      rightPriceScale: {
        visible: false,
        borderVisible: false,
      },
      leftPriceScale: {
        visible: false,
        borderVisible: false,
      },
      timeScale: {
        visible: false,
        borderVisible: false,
      },
      crosshair: {
        vertLine: { visible: false },
        horzLine: { visible: false },
      },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addSeries(AreaSeries, {
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver((entries) => {
            for (const entry of entries) {
              const width = Math.floor(entry.contentRect.width);
              if (width > 0 && chartRef.current) {
                chartRef.current.applyOptions({ width });
                chartRef.current.timeScale().fitContent();
              }
            }
          })
        : null;

    if (resizeObserver) {
      resizeObserver.observe(container);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [hasData, height]);

  // Update series data and colors in-place when tick updates arrive
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !data || data.length < 2) return;

    const lineColor = isPositive ? '#22C55E' : '#F87171';
    const topColor = isPositive
      ? 'rgba(34, 197, 94, 0.28)'
      : 'rgba(248, 113, 113, 0.28)';
    const bottomColor = isPositive
      ? 'rgba(34, 197, 94, 0.0)'
      : 'rgba(248, 113, 113, 0.0)';

    series.applyOptions({
      lineColor,
      topColor,
      bottomColor,
    });

    const formatted = data.map((pt) => ({
      time: pt.time as UTCTimestamp,
      value: pt.value,
    }));

    series.setData(formatted);
    chart.timeScale().fitContent();
  }, [data, isPositive, height]);

  if (!hasData) {
    return (
      <div
        className="w-full flex items-center justify-center rounded-lg text-[11px]"
        style={{
          height: `${height}px`,
          backgroundColor: 'var(--bg-surface-subtle)',
          color: 'var(--text-secondary)',
        }}
      >
        Loading 24h mini chart...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="sparkline-chart"
      className="w-full overflow-hidden"
      style={{ height: `${height}px` }}
      aria-label="24-hour price trend chart"
    />
  );
}
