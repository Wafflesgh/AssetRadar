/**
 * SentimentLeaders.tsx — Radar card with the strongest and weakest investment sentiment of the
 * scanned IDX or US cross-section for a chosen horizon (from /api/sentiment/rankings), with scan
 * progress while the background scan is still collecting data. Not a buy/sell list.
 */
import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { useT, type TranslationKey } from '../../i18n/index.ts';
import type { Horizon } from '../../sentiment/newsHorizon.ts';
import { fetchSentimentRankings, type RankingRow, type RankingsResponse } from '../../services/sentimentService.ts';
import { scanText, scoreColor } from './InvestmentSentimentPanel.tsx';

const REFRESH_MS = 5 * 60_000;

export function SentimentLeaders({ onSelectAsset }: { onSelectAsset: (symbol: string) => void }) {
  const t = useT();
  const [market, setMarket] = useState<'idx' | 'us'>('idx');
  const [horizon, setHorizon] = useState<Horizon>('medium');
  const [data, setData] = useState<RankingsResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchSentimentRankings(market, horizon, 5)
        .then((d) => {
          if (!alive) return;
          setData(d);
          setError(false);
        })
        .catch(() => alive && setError(true));
    setData(null);
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [market, horizon]);

  const chip = (active: boolean) => ({
    backgroundColor: active ? 'var(--accent-radar-soft)' : 'var(--bg-surface-subtle)',
    borderColor: active ? 'var(--accent-radar)' : 'var(--border-subtle)',
    color: active ? 'var(--accent-radar)' : 'var(--text-secondary)',
  });
  const list = (rows: RankingRow[], title: string) => (
    <div className="min-w-0">
      <h3 className="text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
        {title}
      </h3>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.symbol}>
            <button
              type="button"
              onClick={() => onSelectAsset(r.symbol)}
              className="w-full flex items-center justify-between gap-2 text-xs hover:underline text-left"
            >
              <span className="min-w-0 truncate">
                <span className="font-bold font-mono-num">{r.code}</span> <span style={{ color: 'var(--text-secondary)' }}>{r.name}</span>
              </span>
              <span className="shrink-0 font-mono-num font-bold" style={{ color: scoreColor(r.score) }}>
                {r.score === null ? '—' : Math.round(r.score)} {r.label ? t(`sent.label.${r.label}` as TranslationKey) : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  const scan = data ? scanText(t, data.scans) : null;
  return (
    <section
      aria-labelledby="leaders-heading"
      className="p-5 rounded-xl border space-y-3"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div className="flex items-start gap-2">
          <Trophy className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--accent-radar)' }} />
          <div>
            <h2 id="leaders-heading" className="text-base font-bold">
              {t('lead.title')}
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {t('lead.subtitle')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <div role="group" aria-label={t('lead.marketPick')} className="flex gap-1">
            {(['idx', 'us'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={market === m}
                onClick={() => setMarket(m)}
                className="px-2 py-1 rounded-md border text-[11px] font-semibold"
                style={chip(market === m)}
              >
                {t(`sent.market.${m}` as TranslationKey)}
              </button>
            ))}
          </div>
          <div role="group" aria-label={t('lead.horizonPick')} className="flex gap-1">
            {(['short', 'medium', 'long'] as const).map((h) => (
              <button
                key={h}
                type="button"
                aria-pressed={horizon === h}
                onClick={() => setHorizon(h)}
                className="px-2 py-1 rounded-md border text-[11px] font-semibold"
                style={chip(horizon === h)}
              >
                {t(`sent.h.${h}` as TranslationKey)}
              </button>
            ))}
          </div>
        </div>
      </div>
      {!data ? (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {error ? t('common.dataUnavailable') : t('common.loading')}
        </p>
      ) : data.top.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {t('lead.empty')}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {list(data.top, t('lead.top'))}
          {list(data.bottom, t('lead.bottom'))}
        </div>
      )}
      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        {data && data.n > 0 ? `${t('lead.n', { n: data.n })} · ` : ''}
        {scan ? `${scan} · ` : ''}
        {t('sent.disclaimer')}
      </p>
    </section>
  );
}
