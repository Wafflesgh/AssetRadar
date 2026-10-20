/**
 * IndonesiaMacroView.tsx — "Indonesia Macro" page (#/macro): BI-Rate decisions and the policy-
 * rate path, inflation (year-on-year and month-on-month), GDP growth, FX reserves, trade balance
 * and USD/IDR, each with its latest value, change, frequency, last data date and source, and a
 * 10-year chart. Indicators without a free source are listed as not available. Free macro data is
 * often published with a delay — every card shows how recent its data is.
 */
import { getLang, useT, type TranslationKey } from '../i18n/index.ts';
import { useEffect, useState } from 'react';
import { ExternalLink, Landmark, RefreshCw } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchIndonesiaMacro, type IndonesiaMacro } from '../services/marketDataService.ts';
import { formatNumber } from '../utils/format.ts';
import { latest, type MacroSeries } from '../utils/macro.ts';

const MONTH = { format: (d: Date) => new Intl.DateTimeFormat(getLang() === 'id' ? 'id-ID' : 'en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d) };
const DAY = { format: (d: Date) => new Intl.DateTimeFormat(getLang() === 'id' ? 'id-ID' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d) };

function periodLabel(date: string, frequency: MacroSeries['frequency']): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (frequency === 'annual') return String(d.getUTCFullYear());
  if (frequency === 'quarterly') return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
  if (frequency === 'decision') return DAY.format(d);
  return MONTH.format(d);
}

function fmt(value: number, unit: string): string {
  if (unit === 'Rp') return `Rp${formatNumber(value, 0)}`;
  if (unit === 'US$ bn') return `US$${formatNumber(value, 1)} bn`;
  return `${formatNumber(value, 2)}${unit}`;
}

export function IndonesiaMacroView() {
  const [data, setData] = useState<IndonesiaMacro | null>(null);
  const t = useT();
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(false);
    fetchIndonesiaMacro()
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [reload]);

  const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
  const bi = data?.biRate ?? [];
  const biNow = bi[bi.length - 1];
  const biPrev = [...bi].reverse().find((p) => p.value !== biNow?.value);

  return (
    <div className="space-y-6">
      <section className="p-5 md:p-6 rounded-xl border space-y-2" style={card}>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
          <Landmark className="w-5 h-5" style={{ color: 'var(--accent-radar)' }} /> {t('macro.title')}
        </h1>
        <p className="text-sm max-w-3xl" style={{ color: 'var(--text-secondary)' }}>
          {t('macro.intro')}
        </p>
      </section>

      {error && !data ? (
        <div className="p-6 rounded-xl border text-sm space-y-3" style={card} role="alert">
          <p>{t('common.dataUnavailable')}</p>
          <button type="button" onClick={() => setReload((r) => r + 1)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--border-subtle)' }}>
            <RefreshCw className="w-3.5 h-3.5" /> {t('common.tryAgain')}
          </button>
        </div>
      ) : !data ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</p>
      ) : (
        <>
          {biNow && (
            <section className="p-5 rounded-xl border grid grid-cols-1 md:grid-cols-3 gap-4" style={card} aria-labelledby="bi-rate-heading">
              <div>
                <h2 id="bi-rate-heading" className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  {t('macro.biOfficial')}
                </h2>
                <p className="text-3xl font-bold font-mono-num mt-1">{formatNumber(biNow.value, 2)}%</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {t('macro.decided', { date: DAY.format(new Date(`${biNow.date}T00:00:00Z`)) })}
                  {biPrev ? t('macro.previous', { value: formatNumber(biPrev.value, 2) }) : ''}
                </p>
                <a href="https://www.bi.go.id/en/statistik/indikator/bi-rate.aspx" target="_blank" rel="noopener noreferrer" className="text-[11px] inline-flex items-center gap-1 mt-1" style={{ color: 'var(--accent-radar)' }}>
                  Bank Indonesia <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="md:col-span-2 overflow-x-auto">
                <table className="w-full text-xs">
                  <caption className="sr-only">{t('macro.biCaption')}</caption>
                  <thead>
                    <tr className="text-left" style={{ color: 'var(--text-secondary)' }}>
                      <th className="py-1 font-semibold">{t('macro.meeting')}</th>
                      <th className="py-1 font-semibold text-right">BI-Rate</th>
                      <th className="py-1 font-semibold text-right">{t('macro.change')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...bi].reverse().map((p, i, arr) => {
                      const prev = arr[i + 1];
                      const ch = prev ? p.value - prev.value : null;
                      return (
                        <tr key={p.date} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                          <td className="py-1 font-mono-num">{DAY.format(new Date(`${p.date}T00:00:00Z`))}</td>
                          <td className="py-1 text-right font-mono-num">{formatNumber(p.value, 2)}%</td>
                          <td className="py-1 text-right font-mono-num" style={{ color: ch ? (ch > 0 ? 'var(--color-down)' : 'var(--color-up)') : 'var(--text-secondary)' }}>
                            {ch === null ? '—' : ch === 0 ? t('macro.hold') : t('macro.bp', { v: `${ch > 0 ? '+' : ''}${(ch * 100).toFixed(0)}` })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4" aria-label={t('macro.indicators')}>
            {data.series.map((s) => (
              <SeriesCard key={s.id} s={s} />
            ))}
          </section>

          <section className="p-4 rounded-xl border text-xs space-y-1" style={{ ...card, color: 'var(--text-secondary)' }}>
            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('macro.notAvailable')}</p>
            {data.unavailable.map((u) => (
              <p key={u.label}>
                {u.label}: {u.reason}
              </p>
            ))}
            {data.failed.length > 0 && <p style={{ color: 'var(--color-down)' }}>{t('macro.failed', { list: data.failed.join(', ') })}</p>}
          </section>
        </>
      )}
    </div>
  );
}

function SeriesCard({ s }: { s: MacroSeries }) {
  const t = useT();
  const l = latest(s.points);
  const chart = s.points.slice(s.frequency === 'annual' ? -26 : s.frequency === 'quarterly' ? -40 : -120);
  return (
    <article className="p-4 rounded-xl border space-y-2" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold">{s.label}</h3>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {t(`macro.freq.${s.frequency}` as TranslationKey)} · {s.source}
          </p>
        </div>
        {l && (
          <div className="text-right shrink-0">
            <p className="text-lg font-bold font-mono-num">{fmt(l.value, s.unit)}</p>
            <p className="text-[11px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
              {periodLabel(l.date, s.frequency)}
              {l.change !== null && ` · ${l.change >= 0 ? '+' : ''}${formatNumber(l.change, s.unit === 'Rp' ? 0 : 2)}${s.unit === '%' ? t('macro.pts') : ''}`}
            </p>
          </div>
        )}
      </div>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart.map((p) => ({ x: periodLabel(p.date, s.frequency), v: Number(p.value.toFixed(3)) }))} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" />
            <XAxis dataKey="x" tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} minTickGap={40} />
            <YAxis tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} domain={['auto', 'auto']} />
            <Tooltip contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', fontSize: 11 }} formatter={(v) => (typeof v === 'number' ? fmt(v, s.unit) : String(v))} />
            <Line type="monotone" dataKey="v" stroke="var(--accent-radar)" strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {s.note && (
        <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
          {s.note}
        </p>
      )}
      <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] inline-flex items-center gap-1" style={{ color: 'var(--accent-radar)' }}>
        {t('common.source')} <ExternalLink className="w-3 h-3" />
      </a>
    </article>
  );
}
