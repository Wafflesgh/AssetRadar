/**
 * TradingViewChart.tsx — Embeds the official TradingView Advanced Chart widget (WIB time
 * zone, English locale) with a visible TradingView attribution link.
 */
import { useEffect, useRef } from 'react';
import { TimeframeInterval } from '../config/assets.ts';

export interface TradingViewChartProps {
  symbol: string;
  interval: TimeframeInterval;
  theme: 'light' | 'dark';
  /** Fixed height in pixels (e.g. Terminal panel); without it the standard Detail page height is used. */
  height?: number;
  /** Widget background & grid colors (official widget options), used by Terminal mode. */
  backgroundColor?: string;
  gridColor?: string;
}

export function TradingViewChart({
  symbol,
  interval,
  theme,
  height,
  backgroundColor,
  gridColor,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear the container whenever symbol, interval or theme changes
    container.innerHTML = '';

    const widgetWrapper = document.createElement('div');
    widgetWrapper.className = 'tradingview-widget-container';
    widgetWrapper.style.height = '100%';
    widgetWrapper.style.width = '100%';

    const widgetInner = document.createElement('div');
    widgetInner.className = 'tradingview-widget-container__widget';
    widgetInner.style.height = 'calc(100% - 32px)';
    widgetInner.style.width = '100%';

    const copyrightDiv = document.createElement('div');
    copyrightDiv.className = 'tradingview-widget-copyright text-xs py-1.5 px-3 flex items-center justify-between';
    copyrightDiv.style.color = 'var(--text-secondary)';

    const attributionLink = document.createElement('a');
    attributionLink.href = `https://www.tradingview.com/symbols/${encodeURIComponent(symbol.replace(':', '-'))}/`;
    attributionLink.rel = 'noopener nofollow noreferrer';
    attributionLink.target = '_blank';
    attributionLink.className = 'hover:underline font-medium';
    attributionLink.style.color = 'var(--accent-radar)';
    attributionLink.textContent = `${symbol} chart by TradingView`;

    const symbolInfoSpan = document.createElement('span');
    symbolInfoSpan.className = 'font-mono-num text-[11px]';
    symbolInfoSpan.textContent = `${symbol} · Interval ${interval} · WIB`;

    copyrightDiv.appendChild(attributionLink);
    copyrightDiv.appendChild(symbolInfoSpan);

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;

    const widgetConfig = {
      autosize: true,
      symbol,
      interval,
      timezone: 'Asia/Jakarta',
      theme,
      style: '1',
      locale: 'en',
      allow_symbol_change: false,
      hide_side_toolbar: false,
      withdateranges: true,
      save_image: false,
      calendar: false,
      support_host: 'https://www.tradingview.com',
      ...(backgroundColor ? { backgroundColor } : {}),
      ...(gridColor ? { gridColor } : {}),
    };

    script.textContent = JSON.stringify(widgetConfig);

    widgetWrapper.appendChild(widgetInner);
    widgetWrapper.appendChild(copyrightDiv);
    widgetWrapper.appendChild(script);
    container.appendChild(widgetWrapper);

    return () => {
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [symbol, interval, theme, backgroundColor, gridColor]);

  return (
    <div
      ref={containerRef}
      data-testid="tradingview-chart-container"
      data-symbol={symbol}
      data-interval={interval}
      data-theme={theme}
      className={`w-full rounded-xl overflow-hidden border ${
        height ? '' : 'h-[60vh] min-h-[420px] md:h-[560px]'
      }`}
      style={{
        height: height ? `${height}px` : undefined,
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    />
  );
}
