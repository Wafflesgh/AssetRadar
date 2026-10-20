/**
 * NewsTape.tsx — Bloomberg-style running headline tape fed by the live news store: asset
 * tag, headline (original language), source and age, newest first. Pauses on hover/touch,
 * shows a static list with reduced motion, and highlights breaking headlines.
 */
import { useT } from '../i18n/index.ts';
import { useState } from 'react';
import { isBreaking, useLiveNews, useNow } from '../hooks/useLiveNews.ts';
import { formatAge } from '../utils/marketHours.ts';

interface NewsTapeProps {
  /** Number of latest headlines to run. */
  limit?: number;
  className?: string;
}

const SECONDS_PER_HEADLINE = 9;

export function NewsTape({ limit = 15, className = '' }: NewsTapeProps) {
  const news = useLiveNews();
  const t = useT();
  const now = useNow(10_000);
  const [paused, setPaused] = useState(false);
  const items = news.items.slice(0, limit);
  const live = news.status === 'live';

  const row = (copy: number) =>
    items.map((item) => {
      const breaking = isBreaking(news, item.id, now);
      return (
        <a
          key={`${copy}-${item.id}`}
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={copy === 0 ? 0 : -1}
          className="inline-flex items-baseline gap-1.5 px-4 text-[11px] whitespace-nowrap hover:underline"
          style={{ color: 'var(--text-primary)' }}
        >
          {breaking && (
            <span
              className="px-1 font-bold text-[10px]"
              style={{ backgroundColor: 'var(--accent-radar)', color: '#05070A', borderRadius: 2 }}
            >
              NEW
            </span>
          )}
          <span className="font-bold" style={{ color: 'var(--accent-radar)' }}>
            {(item.assetTags ?? []).slice(0, 2).join(' · ')}
          </span>
          <span>{item.title}</span>
          <span style={{ color: 'var(--text-secondary)' }}>
            — {item.source} · {formatAge(item.publishedAtMs, now)}
          </span>
        </a>
      );
    });

  return (
    <div
      className={`terminal-ticker flex items-center h-7 border-b overflow-hidden font-mono-num ${
        paused ? 'is-paused' : ''
      } ${className}`}
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      onTouchStart={() => setPaused((p) => !p)}
      aria-label={t('newsTape.label')}
    >
      <span
        className="shrink-0 h-full flex items-center gap-1.5 px-2.5 text-[10px] font-bold tracking-widest border-r z-10"
        style={{
          backgroundColor: 'var(--bg-surface-subtle)',
          borderColor: 'var(--border-subtle)',
          color: live ? 'var(--color-up)' : 'var(--text-secondary)',
        }}
        title={live ? t('newsTape.live') : t('newsTape.polling')}
      >
        <span
          aria-hidden="true"
          className={`inline-block w-1.5 h-1.5 rounded-full ${live ? 'news-live-dot' : ''}`}
          style={{ backgroundColor: 'currentColor' }}
        />
        {live ? t('newsTape.liveBadge') : t('newsTape.badge')}
      </span>
      <div className="flex-1 min-w-0 overflow-hidden">
        {items.length === 0 ? (
          <span className="px-3 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {news.status === 'offline' ? t('newsTape.offline') : t('newsTape.loading')}
          </span>
        ) : (
          <div
            className="terminal-ticker-track flex w-max"
            style={{ animationDuration: `${Math.max(30, items.length * SECONDS_PER_HEADLINE)}s` }}
          >
            <div className="flex">{row(0)}</div>
            <div className="terminal-ticker-dup flex" aria-hidden="true">
              {row(1)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
