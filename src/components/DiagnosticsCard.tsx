/**
 * DiagnosticsCard.tsx — Settings card "Server diagnostics": runs GET /api/diagnostics on request
 * and shows, for the server the app is published on, which data sources it can reach (OK,
 * blocked in this region, rate-limited, down) with the features each one feeds, the Cloud Run
 * region, and which optional features are switched on (secret names only, never values).
 */
import { useState } from 'react';
import { Activity, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { fetchDiagnostics, type DiagnosticsReport } from '../services/marketDataService.ts';
import { dateLocale, useLang, useT, type TranslationKey } from '../i18n/index.ts';
import type { ProbeStatus } from '../utils/diagnostics.ts';

const STATUS_COLOR: Record<ProbeStatus, string> = {
  ok: 'var(--color-up)',
  blocked: 'var(--color-down)',
  limited: 'var(--color-gold)',
  auth: 'var(--color-gold)',
  down: 'var(--color-down)',
};

export function DiagnosticsCard() {
  const t = useT();
  const lang = useLang();
  const [data, setData] = useState<DiagnosticsReport | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const muted = { color: 'var(--text-secondary)' };

  const run = (refresh: boolean) => {
    setState('loading');
    fetchDiagnostics(refresh)
      .then((d) => {
        setData(d);
        setState('idle');
      })
      .catch(() => setState('error'));
  };

  const problems = data?.probes.filter((p) => p.status !== 'ok') ?? [];

  return (
    <section
      aria-labelledby="settings-diag-heading"
      className="p-5 md:p-6 rounded-xl border space-y-4"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
    >
      <div className="flex items-start gap-2.5">
        <Activity className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--accent-radar)' }} />
        <div className="min-w-0">
          <h2 id="settings-diag-heading" className="text-base font-bold">
            {t('diag.title')}
          </h2>
          <p className="text-xs mt-0.5" style={muted}>
            {t('diag.intro')}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => run(Boolean(data))}
        disabled={state === 'loading'}
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border disabled:opacity-60"
        style={{ borderColor: 'var(--accent-radar)', color: 'var(--accent-radar)' }}
      >
        <RefreshCw className={`w-3.5 h-3.5 ${state === 'loading' ? 'motion-safe:animate-spin' : ''}`} />
        {state === 'loading' ? t('diag.running') : data ? t('diag.rerun') : t('diag.run')}
      </button>

      {state === 'error' && (
        <p className="text-xs font-semibold" role="alert" style={{ color: 'var(--color-down)' }}>
          {t('common.dataUnavailable')}
        </p>
      )}

      {data && (
        <div className="space-y-4 text-xs">
          <p style={muted}>
            {t('diag.checked', { time: new Intl.DateTimeFormat(dateLocale(lang), { timeStyle: 'short', dateStyle: 'medium' }).format(data.checkedAt) })}
            {' · '}
            {data.region ? t('diag.region', { region: data.region }) : data.runtime.cloudRun ? t('diag.regionUnknown') : t('diag.local')}
          </p>
          <p className="font-semibold" style={{ color: problems.length ? 'var(--color-gold)' : 'var(--color-up)' }}>
            {problems.length ? t('diag.someProblems', { n: problems.length, total: data.probes.length }) : t('diag.allOk', { total: data.probes.length })}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <caption className="sr-only">{t('diag.title')}</caption>
              <thead>
                <tr className="text-left" style={muted}>
                  <th className="py-1 pr-2 font-semibold">{t('diag.source')}</th>
                  <th className="py-1 pr-2 font-semibold">{t('diag.status')}</th>
                  <th className="py-1 font-semibold">{t('diag.usedFor')}</th>
                </tr>
              </thead>
              <tbody>
                {data.probes.map((p) => (
                  <tr key={p.id} className="border-t align-top" style={{ borderColor: 'var(--border-subtle)' }}>
                    <td className="py-1.5 pr-2 font-semibold">{p.name}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap" style={{ color: STATUS_COLOR[p.status] }} title={p.detail}>
                      {t(`diag.st.${p.status}` as TranslationKey)}
                      {p.status !== 'ok' && <span className="block text-[10px]" style={muted}>{p.detail}</span>}
                      {p.status === 'ok' && p.ms !== null && <span className="block text-[10px] font-mono-num" style={muted}>{p.ms} ms</span>}
                    </td>
                    <td className="py-1.5" style={muted}>
                      {p.features.map((f) => t(`diag.feat.${f}` as TranslationKey)).join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {problems.some((p) => p.status === 'blocked') && <p style={muted}>{t('diag.blockedNote')}</p>}

          <div className="space-y-1.5">
            <h3 className="text-sm font-bold">{t('diag.setupTitle')}</h3>
            <ul className="space-y-1">
              {data.setup.map((s) => (
                <li key={s.id} className="flex items-start gap-2">
                  {s.configured ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--color-up)' }} aria-label={t('diag.on')} />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={muted} aria-label={t('diag.off')} />
                  )}
                  <span>
                    <span className="font-semibold">{t(`diag.setup.${s.id}` as TranslationKey)}</span>
                    {!s.configured && (
                      <span style={muted}>
                        {' — '}
                        {t('diag.needs')} {s.secrets.map((k) => <code key={k} className="mx-0.5">{k}</code>)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p style={muted}>{t('diag.setupNote')}</p>
          </div>
        </div>
      )}
    </section>
  );
}
