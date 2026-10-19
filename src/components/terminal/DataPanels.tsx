import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AssetConfig,
  CorrelationMatrix,
  MarketNewsItem,
  TIMEFRAME_OPTIONS,
  TimeframeInterval,
} from '../../config/assets.ts';
import { fetchCorrelation, fetchNewsFeed } from '../../services/marketDataService.ts';
import { PriceChart } from '../PriceChart.tsx';
import { NewsRow } from './IntelligencePanels.tsx';
import { PanelMessage, RetryButton, TerminalPanel, formatWibStamp } from './TerminalPanel.tsx';

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
      title="Chart"
      subtitle={`${asset.shortName.toUpperCase()} · ${asset.name}`}
      highlighted={highlighted}
      right={
        <div role="group" aria-label="Pemilih Timeframe Grafik" className="flex flex-wrap terminal-mono">
          {TIMEFRAME_OPTIONS.map((tf) => {
            const active = tf.interval === timeframe;
            return (
              <button
                key={tf.interval}
                type="button"
                aria-pressed={active}
                title={tf.title}
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

/** Widget resmi TradingView Economic Calendar (atribusi tetap terlihat). */
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
      locale: 'id',
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
      title="Kalender Ekonomi"
      subtitle="Indonesia & AS · sedang–tinggi"
      highlighted={highlighted}
      bodyClassName="flex flex-col"
    >
      {/* color-scheme harus sama dengan dokumen iframe; jika berbeda, browser memberi latar putih
          pada iframe transparan */}
      <div ref={containerRef} className="tradingview-widget-container h-96" style={{ colorScheme: 'light' }} />
      <a
        href="https://id.tradingview.com/economic-calendar/"
        target="_blank"
        rel="noopener nofollow noreferrer"
        className="px-2.5 py-1 text-[10px] hover:underline border-t"
        style={{ color: 'var(--t-amber)', borderColor: 'var(--t-line)' }}
      >
        Kalender ekonomi oleh TradingView
      </a>
    </TerminalPanel>
  );
}

/** Hijau untuk korelasi positif, merah untuk negatif; intensitas = |r|. */
function corrColor(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return 'transparent';
  const a = (0.1 + Math.abs(v) * 0.6).toFixed(2);
  return v >= 0 ? `rgba(34, 197, 94, ${a})` : `rgba(239, 68, 68, ${a})`;
}

const CORR_NUM = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
      title="Korelasi 30H"
      subtitle="return harian"
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
            Korelasi bukan hubungan sebab-akibat. Diperbarui {formatWibStamp(data.updatedAt)} WIB.
          </p>
        </div>
      )}
    </TerminalPanel>
  );
}

const NEWS_FEED_REFRESH_MS = 10 * 60_000;

export function NewsFeedPanel({ highlighted }: { highlighted?: boolean }) {
  const [items, setItems] = useState<MarketNewsItem[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(async (silent = false) => {
    if (!silent) setState('loading');
    try {
      setItems(await fetchNewsFeed());
      setState('ready');
    } catch {
      // Pembaruan berkala yang gagal: tetap tampilkan berita terakhir
      if (!silent) setState('error');
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => load(true), NEWS_FEED_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <TerminalPanel
      id="panel-top"
      title="Umpan Berita"
      subtitle="semua aset · terbaru"
      highlighted={highlighted}
      right={state === 'ready' && <RetryButton onClick={() => load()} label="Muat" />}
      bodyClassName="overflow-y-auto max-h-96"
    >
      {state === 'loading' ? (
        <PanelMessage kind="loading" />
      ) : state === 'error' ? (
        <PanelMessage kind="error" onRetry={() => load()} />
      ) : items.length === 0 ? (
        <PanelMessage kind="empty" text="Belum ada berita." />
      ) : (
        <ul>
          {items.map((item) => (
            <NewsRow key={item.id} item={item} showTags />
          ))}
        </ul>
      )}
    </TerminalPanel>
  );
}
