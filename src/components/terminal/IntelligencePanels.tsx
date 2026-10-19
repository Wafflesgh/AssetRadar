import { useCallback, useEffect, useRef, useState } from 'react';
import { AssetConfig, AssetIntelligence, MarketNewsItem } from '../../config/assets.ts';
import { fetchAssetIntelligence } from '../../services/marketDataService.ts';
import { PanelMessage, RetryButton, TerminalPanel, formatWibStamp, toneColor } from './TerminalPanel.tsx';

export interface IntelligenceState {
  data: AssetIntelligence | null;
  loading: boolean;
  error: boolean;
  reload: () => void;
}

/** Sentimen + berita satu aset; jika belum diperkaya AI, ambil ulang sekali setelah 8 detik. */
export function useAssetIntelligence(symbol: string): IntelligenceState {
  const [data, setData] = useState<AssetIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setData(null);

    const load = async (allowAiRetry: boolean) => {
      try {
        const res = await fetchAssetIntelligence(symbol);
        if (cancelled) return;
        setData(res);
        setError(false);
        if (!res.aiPowered && allowAiRetry) {
          retryTimer.current = setTimeout(() => load(false), 8000);
        }
      } catch {
        if (!cancelled && allowAiRetry) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load(true);

    return () => {
      cancelled = true;
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [symbol, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  return { data, loading, error, reload };
}

interface PanelProps {
  asset: AssetConfig;
  intel: IntelligenceState;
  highlighted?: boolean;
}

export function SentimentPanel({ asset, intel, highlighted }: PanelProps) {
  const { data, loading, error, reload } = intel;
  return (
    <TerminalPanel
      id="panel-sentimen"
      title="Sentimen"
      subtitle={`${asset.shortName.toUpperCase()}${data?.aiPowered ? ' · diperkaya AI' : ''}`}
      highlighted={highlighted}
      right={!loading && <RetryButton onClick={reload} label="Muat" />}
    >
      {loading ? (
        <PanelMessage kind="loading" />
      ) : error || !data ? (
        <PanelMessage kind="error" onRetry={reload} />
      ) : (
        <div className="p-2.5 space-y-2.5 terminal-mono text-[11px]">
          <div className="flex items-end justify-between gap-2">
            <span className="text-base font-bold" style={{ color: toneColor(data.sentimentLabel) }}>
              {data.sentimentLabel.toUpperCase()}
            </span>
            <span style={{ color: 'var(--t-text)' }}>
              <span className="text-xl font-bold">{Math.round(data.sentimentScore)}</span>
              <span style={{ color: 'var(--t-muted)' }}>/100</span>
            </span>
          </div>
          <div className="h-1.5 w-full" style={{ backgroundColor: 'var(--t-line)' }}>
            <div
              className="h-full"
              style={{
                width: `${Math.max(0, Math.min(100, data.sentimentScore))}%`,
                backgroundColor: toneColor(data.sentimentLabel),
              }}
            />
          </div>
          <p className="leading-relaxed" style={{ color: 'var(--t-text)' }}>
            {data.summary}
          </p>
          {data.keyFactors.length > 0 && (
            <ul className="space-y-1">
              {data.keyFactors.map((f) => (
                <li key={f} className="flex gap-1.5" style={{ color: 'var(--t-muted)' }}>
                  <span style={{ color: 'var(--t-amber)' }}>›</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px]" style={{ color: 'var(--t-muted)' }}>
            Ringkasan suasana berita, bukan sinyal beli/jual.
          </p>
        </div>
      )}
    </TerminalPanel>
  );
}

/** Satu baris berita gaya Terminal: jam WIB, label kode, judul, sumber, nada. */
export function NewsRow({ item, showTags }: { item: MarketNewsItem; showTags?: boolean }) {
  const ms = item.publishedAtMs ?? Date.parse(item.publishedAt);
  return (
    <li className="px-2.5 py-1.5 border-t text-[11px]" style={{ borderColor: 'var(--t-line)' }}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 terminal-mono" style={{ color: 'var(--t-muted)' }}>
        <span style={{ color: 'var(--t-text)' }}>{formatWibStamp(Number.isFinite(ms) ? ms : undefined)}</span>
        {showTags &&
          item.assetTags?.map((tag) => (
            <span
              key={tag}
              className="px-1 font-bold"
              style={{ backgroundColor: 'var(--t-amber-soft)', color: 'var(--t-amber)', borderRadius: 2 }}
            >
              {tag}
            </span>
          ))}
        <span className="truncate max-w-[45%]">{item.source}</span>
        <span className="ml-auto font-bold" style={{ color: toneColor(item.sentiment) }}>
          {item.sentiment.toUpperCase()}
        </span>
      </div>
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="block mt-0.5 leading-snug hover:underline"
        style={{ color: 'var(--t-text)' }}
      >
        {item.title}
      </a>
    </li>
  );
}

export function AssetNewsPanel({ asset, intel, highlighted }: PanelProps) {
  const { data, loading, error, reload } = intel;
  return (
    <TerminalPanel
      id="panel-berita"
      title="Berita"
      subtitle={`${asset.shortName.toUpperCase()} · Google News`}
      highlighted={highlighted}
      bodyClassName="overflow-y-auto max-h-80"
    >
      {loading ? (
        <PanelMessage kind="loading" />
      ) : error || !data ? (
        <PanelMessage kind="error" onRetry={reload} />
      ) : data.news.length === 0 ? (
        <PanelMessage kind="empty" text="Belum ada berita terbaru untuk aset ini." />
      ) : (
        <ul>
          {data.news.map((item) => (
            <NewsRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </TerminalPanel>
  );
}
