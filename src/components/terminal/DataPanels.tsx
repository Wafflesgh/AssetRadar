/**
 * DataPanels.tsx — Terminal panels for CHART (PriceChart + timeframes), ECONOMIC CALENDAR
 *  (TradingView widget), CORRELATION 30D (matrix) and the live NEWS FEED (all assets).
 */
import { t as tr, getLang, type TranslationKey } from '../../i18n/index.ts';
import { assetName } from '../../i18n/assetNames.ts';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AssetConfig,
  CorrelationMatrix,
  PriceTick,
  TIMEFRAME_OPTIONS,
  TimeframeInterval,
} from '../../config/assets.ts';
import { fetchCorrelation } from '../../services/marketDataService.ts';
import { filterNewsByCode, newsStore } from '../../services/newsStream.ts';
import { isBreaking, useLiveNews, useNow } from '../../hooks/useLiveNews.ts';
import { MACRO_TAG } from '../../utils/newsTags.ts';
import { PriceChart } from '../PriceChart.tsx';
import { LiveBadge, NewsRow } from './IntelligencePanels.tsx';
import { PanelMessage, TerminalPanel, formatWibStamp } from './TerminalPanel.tsx';

export function ChartPanel({
  asset,
  timeframe,
  onChangeTimeframe,
  highlighted,
  className,
}: {
  asset: AssetConfig;
  timeframe: TimeframeInterval;
  onChangeTimeframe: (tf: TimeframeInterval) => void;
  highlighted?: boolean;
  className?: string;
}) {
  return (
    <TerminalPanel
      id="panel-chart"
      className={className}
      title={tr('term.title.chart')}
      subtitle={`${asset.code} · ${assetName(asset)}`}
      highlighted={highlighted}
      right={
        <div role="group" aria-label={tr('term.tfPicker')} className="flex flex-wrap terminal-mono">
          {TIMEFRAME_OPTIONS.map((tf) => {
            const active = tf.interval === timeframe;
            return (
              <button
                key={tf.interval}
                type="button"
                aria-pressed={active}
                title={tr(`tf.${tf.interval}` as TranslationKey)}
                onClick={() => onChangeTimeframe(tf.interval)}
                className="px-1.5 h-5 text-[10px] font-bold"
                style={{
                  backgroundColor: active ? 'var(--t-amber)' : 'transparent',
                  color: active ? '#05070A' : 'var(--t-muted)',
                  borderRadius: 2,
                }}
              >
                {tf.label}
              </button>
            );
          })}
        </div>
      }
      bodyClassName="p-1.5"
    >
      <PriceChart asset={asset} interval={timeframe} theme="terminal" height={380} />
    </TerminalPanel>
  );
}

/** Official TradingView Economic Calendar widget (attribution stays visible). */
export function EconomicCalendarPanel({ highlighted }: { highlighted?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';

    const widget = document.createElement('div');
    widget.className = 'tradingview-widget-container__widget';
    widget.style.height = '100%';

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js';
    script.async = true;
    script.textContent = JSON.stringify({
      colorTheme: 'dark',
      isTransparent: true,
      width: '100%',
      height: '100%',
      locale: getLang() === 'id' ? 'id' : 'en',
      importanceFilter: '0,1',
      countryFilter: 'id,us',
    });

    container.appendChild(widget);
    container.appendChild(script);
    return () => {
      container.innerHTML = '';
    };
  }, []);

  return (
    <TerminalPanel
      id="panel-eco"
      title={tr('term.title.eco')}
      subtitle={tr('term.eco.sub')}
      highlighted={highlighted}
      bodyClassName="flex flex-col"
    >
      {/* color-scheme must match the iframe document; if it differs, the browser paints a white
          background behind the transparent iframe */}
      <div ref={containerRef} className="tradingview-widget-container h-96" style={{ colorScheme: 'light' }} />
      <a
        href="https://www.tradingview.com/economic-calendar/"
        target="_blank"
        rel="noopener nofollow noreferrer"
        className="px-2.5 py-1 text-[10px] hover:underline border-t"
        style={{ color: 'var(--t-amber)', borderColor: 'var(--t-line)' }}
      >
        {tr('term.eco.credit')}
      </a>
    </TerminalPanel>
  );
}

/** Green for positive correlation, red for negative; intensity = |r|. */
function corrColor(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return 'transparent';
  const a = (0.1 + Math.abs(v) * 0.6).toFixed(2);
  return v >= 0 ? `rgba(34, 197, 94, ${a})` : `rgba(239, 68, 68, ${a})`;
}

const CORR_NUM = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CorrelationPanel({ highlighted }: { highlighted?: boolean }) {
  const [data, setData] = useState<CorrelationMatrix | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(async () => {
    setState('loading');
    try {
      setData(await fetchCorrelation());
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <TerminalPanel
      id="panel-corr"
      title={tr('term.title.corr')}
      subtitle={tr('term.corr.sub')}
      highlighted={highlighted}
      bodyClassName="overflow-x-auto"
    >
      {state === 'loading' ? (
        <PanelMessage kind="loading" />
      ) : state === 'error' || !data ? (
        <PanelMessage kind="error" onRetry={load} />
      ) : (
        <div className="p-1.5 terminal-mono">
          <table className="w-full text-[10px] text-center border-collapse">
            <thead>
              <tr>
                <th />
                {data.labels.map((l) => (
                  <th key={l} className="px-0.5 py-1 font-bold" style={{ color: 'var(--t-amber)' }}>
                    {l.replace('USD/IDR', 'USD')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.matrix.map((row, i) => (
                <tr key={data.labels[i]}>
                  <th className="pr-1 py-1 text-left font-bold" style={{ color: 'var(--t-amber)' }}>
                    {data.labels[i].replace('USD/IDR', 'USD')}
                  </th>
                  {row.map((v, j) => (
                    <td
                      key={j}
                      className="px-0.5 py-1.5 border"
                      style={{ backgroundColor: corrColor(v), borderColor: 'var(--t-bg)', color: 'var(--t-text)' }}
                    >
                      {v === null || !Number.isFinite(v) ? '—' : CORR_NUM.format(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1.5 text-[10px]" style={{ color: 'var(--t-muted)' }}>
            {tr('term.corr.note', { time: formatWibStamp(data.updatedAt) })}
          </p>
        </div>
      )}
    </TerminalPanel>
  );
}

type FeedFilter = 'all' | 'asset' | 'macro';

/** Live market-moving headlines for all assets (stream-fed), filterable by the selected asset. */
export function NewsFeedPanel({
  asset,
  ticks,
  highlighted,
}: {
  asset: AssetConfig;
  ticks: Record<string, PriceTick>;
  highlighted?: boolean;
}) {
  const news = useLiveNews();
  const now = useNow();
  const [filter, setFilter] = useState<FeedFilter>('all');
  const code = asset.code;
  const items = (
    filter === 'asset'
      ? filterNewsByCode(news.items, code)
      : filter === 'macro'
        ? filterNewsByCode(news.items, MACRO_TAG)
        : news.items
  ).slice(0, 40);
  const breakingCount = news.items.filter((i) => isBreaking(news, i.id, now)).length;

  const filterButton = (value: FeedFilter, label: string) => (
    <button
      type="button"
      aria-pressed={filter === value}
      onClick={() => setFilter(value)}
      className="px-1.5 h-5 text-[10px] font-bold"
      style={{
        backgroundColor: filter === value ? 'var(--t-amber)' : 'transparent',
        color: filter === value ? '#05070A' : 'var(--t-muted)',
        borderRadius: 2,
      }}
    >
      {label}
    </button>
  );

  return (
    <TerminalPanel
      id="panel-top"
      title={tr('term.title.top')}
      subtitle={
        news.updatedAt
          ? `${breakingCount > 0 ? `${tr('term.feed.new', { n: breakingCount })} ` : ''}${tr('term.feed.updated', { time: formatWibStamp(news.updatedAt) })}`
          : tr('term.feed.all')
      }
      highlighted={highlighted}
      right={
        <div className="flex items-center gap-1.5 terminal-mono">
          <div role="group" aria-label={tr('term.feed.filter')} className="flex">
            {filterButton('all', tr('term.g.ALL'))}
            {filterButton('asset', code)}
            {filterButton('macro', MACRO_TAG)}
          </div>
          <LiveBadge />
        </div>
      }
      bodyClassName="overflow-y-auto max-h-96"
    >
      {news.items.length === 0 && news.status !== 'offline' ? (
        <PanelMessage kind="loading" />
      ) : news.items.length === 0 ? (
        <PanelMessage kind="error" onRetry={newsStore.refresh} />
      ) : items.length === 0 ? (
        <PanelMessage kind="empty" text={tr('term.feed.empty')} />
      ) : (
        <ul>
          {items.map((item) => (
            <NewsRow
              key={item.id}
              item={item}
              ticks={ticks}
              now={now}
              breaking={isBreaking(news, item.id, now)}
              showTags
            />
          ))}
        </ul>
      )}
    </TerminalPanel>
  );
}
