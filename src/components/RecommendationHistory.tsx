/**
 * RecommendationHistory.tsx — One asset's trace: every day the app saved its investment
 * sentiment (short / medium / long) and the AI Advisor verdict (20 / 60 trading days, chosen
 * risk profile) with the price; this lists them newest first with the change since then and,
 * once the horizon has passed, whether the call was right. Repeated days with the same call can
 * be collapsed into one "since" row. Answers "was this ever recommended, and did it rise?".
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, History, RefreshCw, XCircle } from 'lucide-react';
import { dateLocale, useLang, useT, type TranslationKey } from '../i18n/index.ts';
import type { AssetConfig } from '../config/assets.ts';
import { collapseTrace, type TraceRow } from '../ai/recommendationTrace.ts';
import { fetchAssetTrace, type AssetTracePayload } from '../services/marketDataService.ts';
import { formatAssetPrice, formatDecimal } from '../utils/format.ts';
import { MethodAccuracy } from './MethodAccuracy.tsx';

const PROFILES = ['conservative', 'moderate', 'aggressive'] as const;

export function RecommendationHistory({ asset, compact = false }: { asset: AssetConfig; compact?: boolean }) {
  const t = useT();
  const lang = useLang();
  const [profile, setProfile] = useState<(typeof PROFILES)[number]>('moderate');
  const [method, setMethod] = useState<'all' | 'sentiment' | 'advisor'>('all');
  const [grouped, setGrouped] = useState(true);
  const [data, setData] = useState<AssetTracePayload | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(false);
    fetchAssetTrace(asset.symbol, profile)
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [asset.symbol, profile, reload]);

  const day = (iso: string) => new Intl.DateTimeFormat(dateLocale(lang), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${formatDecimal(v * 100, 1)}%`);
  const callText = (r: TraceRow) => (r.method === 'sentiment' ? t(`sent.label.${r.call}` as TranslationKey) : t(`verdict.${r.call}` as TranslationKey));
  const horizonText = (r: TraceRow) =>
    r.method === 'sentiment' ? t('trace.h.sentiment', { h: t(`sent.h.${r.horizon}` as TranslationKey) }) : t('trace.h.advisor', { days: r.horizon.replace('d', '') });
  const callColor = (r: TraceRow) => {
    const s = r.method === 'sentiment' ? r.call : r.call === 'favorable' ? 'Bullish' : r.call === 'unfavorable' ? 'Bearish' : 'Neutral';
    return /Bullish/.test(s) ? 'var(--color-up)' : /Bearish/.test(s) ? 'var(--color-down)' : 'var(--text-secondary)';
  };

  const rows = (data?.rows ?? []).filter((r) => method === 'all' || r.method === method);
  const shown = grouped ? collapseTrace(rows) : rows.map((r) => ({ ...r, firstDate: r.date, days: 1 }));
  const btn = (active: boolean) => ({
    borderColor: active ? 'var(--accent-radar)' : 'var(--border-subtle)',
    color: active ? 'var(--accent-radar)' : 'var(--text-primary)',
  });

  return (
    <section className="p-5 rounded-xl border space-y-3" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }} aria-labelledby={`trace-${asset.id}`}>
      <div className="space-y-1">
        <h2 id={`trace-${asset.id}`} className="text-base font-bold flex items-center gap-2">
          <History className="w-4 h-4" style={{ color: 'var(--accent-radar)' }} /> {t('trace.title')}
        </h2>
        {!compact && (
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {t('trace.intro')}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {(['all', 'sentiment', 'advisor'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)} className="px-2.5 py-1 rounded-md border font-semibold" style={btn(method === m)}>
            {t(`trace.filter.${m}` as TranslationKey)}
          </button>
        ))}
        <label className="inline-flex items-center gap-1.5">
          <span style={{ color: 'var(--text-secondary)' }}>{t('trace.profile')}</span>
          <select value={profile} onChange={(e) => setProfile(e.target.value as (typeof PROFILES)[number])} className="rounded-md border px-1.5 py-1 bg-transparent" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}>
            {PROFILES.map((p) => (
              <option key={p} value={p}>
                {t(`trace.prof.${p}` as TranslationKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
          {t('trace.group')}
        </label>
      </div>

      {error && !data ? (
        <div className="text-sm space-y-2" role="alert">
          <p>{t('common.dataUnavailable')}</p>
          <button type="button" onClick={() => setReload((r) => r + 1)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--border-subtle)' }}>
            <RefreshCw className="w-3.5 h-3.5" /> {t('common.tryAgain')}
          </button>
        </div>
      ) : !data ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('common.loading')}
        </p>
      ) : shown.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('trace.empty')}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left" style={{ color: 'var(--text-secondary)' }}>
                <th className="py-1.5 pr-2 font-semibold">{t('trace.date')}</th>
                <th className="py-1.5 pr-2 font-semibold">{t('trace.horizon')}</th>
                <th className="py-1.5 pr-2 font-semibold">{t('trace.call')}</th>
                <th className="py-1.5 pr-2 font-semibold text-right">{t('trace.priceThen')}</th>
                <th className="py-1.5 pr-2 font-semibold text-right">{t('trace.sinceThen')}</th>
                <th className="py-1.5 font-semibold">{t('trace.result')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, compact ? 30 : 200).map((r) => (
                <tr key={`${r.method}-${r.horizon}-${r.firstDate}-${r.date}`} className="border-t align-top" style={{ borderColor: 'var(--border-subtle)' }}>
                  <td className="py-1.5 pr-2 font-mono-num whitespace-nowrap">
                    {r.days > 1 ? t('trace.range', { from: day(r.firstDate), to: day(r.date), n: r.days }) : day(r.date)}
                  </td>
                  <td className="py-1.5 pr-2">{horizonText(r)}</td>
                  <td className="py-1.5 pr-2 font-semibold" style={{ color: callColor(r) }}>
                    {callText(r)}
                    {r.score !== null && <span className="font-normal font-mono-num" style={{ color: 'var(--text-secondary)' }}> · {r.score}</span>}
                    {r.chance !== null && <span className="font-normal font-mono-num" style={{ color: 'var(--text-secondary)' }}> · {t('trace.chance', { p: formatDecimal(r.chance * 100, 0) })}</span>}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono-num">{formatAssetPrice(r.price, asset)}</td>
                  <td className="py-1.5 pr-2 text-right font-mono-num" style={{ color: r.sinceNow === null ? undefined : r.sinceNow > 0 ? 'var(--color-up)' : r.sinceNow < 0 ? 'var(--color-down)' : undefined }}>
                    {pct(r.sinceNow)}
                  </td>
                  <td className="py-1.5">
                    {r.outcome ? (
                      <span className="inline-flex items-center gap-1">
                        {r.outcome.hit === true ? (
                          <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--color-up)' }} aria-hidden="true" />
                        ) : r.outcome.hit === false ? (
                          <XCircle className="w-3.5 h-3.5" style={{ color: 'var(--color-down)' }} aria-hidden="true" />
                        ) : null}
                        <span>
                          {r.outcome.hit === true ? t('trace.right') : r.outcome.hit === false ? t('trace.wrong') : t('trace.neutral')} ({pct(r.outcome.ret)} {t('trace.by', { date: day(r.outcome.dueDate) })})
                        </span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                        <Clock className="w-3.5 h-3.5" aria-hidden="true" /> {t('trace.pending', { n: r.dueBars })}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.summary.some((m) => m.saved > 0) && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold">{t('trace.thisAsset')}</summary>
          <div className="mt-2">
            <MethodAccuracy methods={data.summary.filter((m) => m.saved > 0)} />
          </div>
        </details>
      )}
      {data && !data.database && (
        <p className="text-[11px]" style={{ color: 'var(--color-gold)' }}>
          {t('trace.noDb')}
        </p>
      )}
      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        {t('trace.note')}
      </p>
    </section>
  );
}
