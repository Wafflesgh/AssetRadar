/**
 * IntelligencePanels.tsx — Terminal SENTIMENT and NEWS panels for the selected asset, the
 * shared useAssetIntelligence hook (re-scores silently when breaking news for the asset
 * arrives) and the live NewsRow used by both news panels.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ASSETS, AssetConfig, AssetIntelligence, MarketNewsItem, PriceTick } from '../../config/assets.ts';
import { fetchAssetIntelligence } from '../../services/marketDataService.ts';
import { filterNewsByCode, newsStore } from '../../services/newsStream.ts';
import { isBreaking, useLiveNews, useNow } from '../../hooks/useLiveNews.ts';
import { formatAge } from '../../utils/marketHours.ts';
import {
  PanelMessage,
  RetryButton,
  TerminalPanel,
  changeColor,
  formatTerminalPct,
  formatWibStamp,
  isTickUsable,
  toneColor,
} from './TerminalPanel.tsx';

export interface IntelligenceState {
  data: AssetIntelligence | null;
  loading: boolean;
  error: boolean;
  /** epoch ms of the last silent re-score triggered by breaking news */
  rescoredAt: number | null;
  reload: () => void;
}

/**
 * Sentiment + news for one asset. If not AI-enhanced yet, refetches once after 8 seconds.
 * When `newsKey` changes (a new headline about the asset arrived) it re-scores silently.
 */
export function useAssetIntelligence(symbol: string, newsKey = ''): IntelligenceState {
  const [data, setData] = useState<AssetIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [rescoredAt, setRescoredAt] = useState<number | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNewsKey = useRef(newsKey);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setData(null);
    setRescoredAt(null);

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

  // Breaking news for this asset: re-score in the background (debounced), keep old data visible
  useEffect(() => {
    if (!newsKey || newsKey === lastNewsKey.current) return;
    lastNewsKey.current = newsKey;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetchAssetIntelligence(symbol);
        if (!cancelled) {
          setData(res);
          setRescoredAt(Date.now());
        }
      } catch {
        // Keep the previous score on screen
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [symbol, newsKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  return { data, loading, error, rescoredAt, reload };
}

interface SentimentPanelProps {
  asset: AssetConfig;
  intel: IntelligenceState;
  highlighted?: boolean;
}

export function SentimentPanel({ asset, intel, highlighted }: SentimentPanelProps) {
  const { data, loading, error, rescoredAt, reload } = intel;
  return (
    <TerminalPanel
      id="panel-sentiment"
      title="Sentiment"
      subtitle={`${asset.code}${data?.aiPowered ? ' · AI-enhanced' : ''}`}
      highlighted={highlighted}
      right={!loading && <RetryButton onClick={reload} label="Reload" />}
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
              className="h-full transition-all duration-700"
              style={{
                width: `${Math.max(0, Math.min(100, data.sentimentScore))}%`,
                backgroundColor: toneColor(data.sentimentLabel),
              }}
            />
          </div>
          {rescoredAt && (
            <p className="text-[10px]" style={{ color: 'var(--t-amber)' }}>
              ↻ Re-scored on breaking news at {formatWibStamp(rescoredAt)} WIB
            </p>
          )}
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
            A summary of the news mood, not a buy/sell signal.
          </p>
        </div>
      )}
    </TerminalPanel>
  );
}

/** 24h change of the asset behind a news tag, for showing how that asset is moving now. */
export function tagChange(ticks: Record<string, PriceTick>, tag: string): number | undefined {
  const asset = ASSETS.find((a) => a.code === tag);
  const tick = asset ? ticks[asset.symbol] : undefined;
  return isTickUsable(tick) ? tick.changePct24h : undefined;
}

interface NewsRowProps {
  item: MarketNewsItem;
  ticks: Record<string, PriceTick>;
  now: number;
  breaking: boolean;
  showTags?: boolean;
}

/** One Terminal news row: age, NEW badge, asset tags with their 24h move, headline, source, tone. */
export function NewsRow({ item, ticks, now, breaking, showTags }: NewsRowProps) {
  const ms = item.publishedAtMs ?? Date.parse(item.publishedAt);
  const published = Number.isFinite(ms) ? ms : undefined;
  return (
    <li
      className={`px-2.5 py-1.5 border-t text-[11px] ${breaking ? 'news-breaking' : ''}`}
      style={{ borderColor: 'var(--t-line)' }}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 terminal-mono" style={{ color: 'var(--t-muted)' }}>
        {breaking && (
          <span
            className="px-1 font-bold"
            style={{ backgroundColor: 'var(--t-amber)', color: '#05070A', borderRadius: 2 }}
          >
            NEW
          </span>
        )}
        <span style={{ color: 'var(--t-text)' }} title={`${formatWibStamp(published)} WIB`}>
          {formatAge(published, now)}
        </span>
        {showTags &&
          item.assetTags?.map((tag) => {
            const pct = tagChange(ticks, tag);
            return (
              <span
                key={tag}
                className="px-1 font-bold"
                style={{ backgroundColor: 'var(--t-amber-soft)', color: 'var(--t-amber)', borderRadius: 2 }}
              >
                {tag}
                {pct !== undefined && (
                  <span style={{ color: changeColor(pct) }}> {formatTerminalPct(pct)}</span>
                )}
              </span>
            );
          })}
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

/** Live status label shared by the news panels. */
export function LiveBadge() {
  const news = useLiveNews();
  const live = news.status === 'live';
  return (
    <span
      className="flex items-center gap-1 text-[10px] font-bold tracking-wider terminal-mono"
      style={{ color: live ? 'var(--t-up)' : 'var(--t-muted)' }}
      title={live ? 'Live stream connected' : 'Updating every 60 seconds'}
    >
      <span
        aria-hidden="true"
        className={`inline-block w-1.5 h-1.5 rounded-full ${live ? 'news-live-dot' : ''}`}
        style={{ backgroundColor: 'currentColor' }}
      />
      {live ? 'LIVE' : news.status === 'offline' ? 'OFFLINE' : news.status === 'polling' ? '60S' : '...'}
    </span>
  );
}

export function AssetNewsPanel({
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
  const items = filterNewsByCode(news.items, asset.code).slice(0, 15);
  return (
    <TerminalPanel
      id="panel-news"
      title="News"
      subtitle={`${asset.code} · original language`}
      highlighted={highlighted}
      right={<LiveBadge />}
      bodyClassName="overflow-y-auto max-h-80"
    >
      {news.items.length === 0 && news.status !== 'offline' ? (
        <PanelMessage kind="loading" />
      ) : news.items.length === 0 ? (
        <PanelMessage kind="error" onRetry={newsStore.refresh} />
      ) : items.length === 0 ? (
        <PanelMessage kind="empty" text="No recent news for this asset yet." />
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
