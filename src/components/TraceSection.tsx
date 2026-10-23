/**
 * TraceSection.tsx — On the AI Advisor page: how each method has scored on real prices over all
 * assets (server record), the same for every IDX-listed stock (recorded each evening after the
 * close), and a search to open any asset's recommendation history ("was it ever recommended, and
 * did it rise?").
 */
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useT } from '../i18n/index.ts';
import { getAssetBySymbol, type PriceTick } from '../config/assets.ts';
import { fetchTrackSummary } from '../services/marketDataService.ts';
import type { MethodSummary } from '../ai/recommendationTrace.ts';
import { AssetSearch } from './AssetSearch.tsx';
import { MethodAccuracy } from './MethodAccuracy.tsx';
import { RecommendationHistory } from './RecommendationHistory.tsx';

export function TraceSection({ ticks, profile }: { ticks: Record<string, PriceTick>; profile: string }) {
  const t = useT();
  const [methods, setMethods] = useState<MethodSummary[] | null>(null);
  const [idx, setIdx] = useState<{ methods: MethodSummary[]; progress: { date: string; next: number; recorded: number } | null } | null>(null);
  const [symbol, setSymbol] = useState<string | null>(null);
  const asset = symbol ? getAssetBySymbol(symbol) : undefined;

  useEffect(() => {
    let alive = true;
    fetchTrackSummary(profile)
      .then((d) => {
        if (!alive) return;
        setMethods(d.methods);
        setIdx(d.idx ?? null);
      })
      .catch(() => alive && setMethods([]));
    return () => {
      alive = false;
    };
  }, [profile]);

  return (
    <section className="p-5 rounded-xl border space-y-3" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }} aria-labelledby="trace-all-heading">
      <h2 id="trace-all-heading" className="text-base font-bold">
        {t('trace.allTitle')}
      </h2>
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        {t('trace.allIntro')}
      </p>
      {methods === null ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('common.loading')}
        </p>
      ) : methods.some((m) => m.saved > 0) ? (
        <MethodAccuracy methods={methods} />
      ) : (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('trace.noneYet')}
        </p>
      )}
      <div className="space-y-2 pt-2">
        <h3 className="text-sm font-bold">{t('trace.idxTitle')}</h3>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {t('trace.idxIntro')}
        </p>
        {idx?.progress && (
          <p className="text-xs font-mono-num" style={{ color: 'var(--text-secondary)' }}>
            {t('trace.idxProgress', { date: idx.progress.date, recorded: idx.progress.recorded })}
          </p>
        )}
        {idx && idx.methods.some((m) => m.saved > 0) ? (
          <MethodAccuracy methods={idx.methods} />
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {t('trace.idxNone')}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-bold flex items-center gap-1.5">
          <Search className="w-3.5 h-3.5" /> {t('trace.lookup')}
        </h3>
        <AssetSearch onSelect={(a) => setSymbol(a.symbol)} ticks={ticks} label={t('trace.lookupLabel')} placeholder={t('trace.lookupPh')} limit={8} />
      </div>
      {asset && <RecommendationHistory key={asset.symbol} asset={asset} compact />}
    </section>
  );
}
