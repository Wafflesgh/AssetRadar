/**
 * SbnRetailSection.tsx — Retail government securities (SBN Ritel) on the Indonesia macro page:
 * the series on the official DJPPR pages right now (ORI, SBR, Sukuk Ritel, Sukuk Tabungan,
 * Sukuk Wakaf) with coupon, fixed or floating-with-floor, tenor and maturity, offering period and
 * whether it is open today, minimum / maximum order, whether it can be sold before maturity,
 * and the official distribution partners (banks, securities firms, investment apps). Earlier
 * series this app has seen stay listed. Information only, not investment advice.
 */
import { useEffect, useState } from 'react';
import { ExternalLink, Landmark, RefreshCw } from 'lucide-react';
import { dateLocale, useLang, useT, type TranslationKey } from '../i18n/index.ts';
import { fetchSbnRetail, type SbnPayload } from '../services/marketDataService.ts';
import { formatDecimal, formatIdrCompact, formatRupiah } from '../utils/format.ts';
import { sbnStatus, type SbnSeries, type SbnStatus } from '../utils/sbnRetail.ts';
import { wibDate } from '../utils/sync.ts';

const STATUS_ORDER: Record<SbnStatus, number> = { open: 0, upcoming: 1, unknown: 2, closed: 3 };

export function SbnRetailSection() {
  const t = useT();
  const lang = useLang();
  const [data, setData] = useState<SbnPayload | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(false);
    fetchSbnRetail()
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [reload]);

  const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
  const day = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat(dateLocale(lang), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)) : '—';
  const today = wibDate(Date.now());
  const current = data
    ? [...data.current].sort((a, b) => STATUS_ORDER[sbnStatus(a, today)] - STATUS_ORDER[sbnStatus(b, today)] || (b.offerEnd ?? '').localeCompare(a.offerEnd ?? ''))
    : [];
  const partnersByType = new Map<string, string[]>();
  for (const s of data?.current ?? []) if (s.partners.length && !partnersByType.has(s.type)) partnersByType.set(s.type, s.partners);

  return (
    <section className="p-5 md:p-6 rounded-xl border space-y-4" style={card} aria-labelledby="sbn-heading">
      <div className="space-y-1">
        <h2 id="sbn-heading" className="text-base md:text-lg font-bold flex items-center gap-2">
          <Landmark className="w-4 h-4" style={{ color: 'var(--accent-radar)' }} /> {t('sbn.title')}
        </h2>
        <p className="text-xs max-w-3xl" style={{ color: 'var(--text-secondary)' }}>
          {t('sbn.intro')}
        </p>
      </div>

      {error && !data ? (
        <div className="text-sm space-y-2" role="alert">
          <p>{t('common.dataUnavailable')}</p>
          <button
            type="button"
            onClick={() => setReload((r) => r + 1)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <RefreshCw className="w-3.5 h-3.5" /> {t('common.tryAgain')}
          </button>
        </div>
      ) : !data ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('common.loading')}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {current.map((s) => (
              <SeriesCard key={s.code} s={s} status={sbnStatus(s, today)} day={day} />
            ))}
          </div>

          {partnersByType.size > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                {t('sbn.whereToBuy')}
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {t('sbn.whereNote')}
              </p>
              {[...partnersByType].map(([type, hosts]) => (
                <details key={type} className="text-xs">
                  <summary className="cursor-pointer font-semibold">
                    {t(`sbn.type.${type}` as TranslationKey)} — {t('sbn.partners', { n: hosts.length })}
                  </summary>
                  <p className="mt-1 leading-relaxed break-words font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                    {hosts.join(' · ')}
                  </p>
                </details>
              ))}
            </div>
          )}

          {data.earlier.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                {t('sbn.earlier')}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left" style={{ color: 'var(--text-secondary)' }}>
                      <th className="py-1 pr-2 font-semibold">{t('sbn.series')}</th>
                      <th className="py-1 pr-2 font-semibold text-right">{t('sbn.coupon')}</th>
                      <th className="py-1 pr-2 font-semibold">{t('sbn.offer')}</th>
                      <th className="py-1 font-semibold">{t('sbn.maturity')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.earlier.map((s) => (
                      <tr key={s.code} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                        <td className="py-1 pr-2 font-semibold">{s.code}</td>
                        <td className="py-1 pr-2 text-right font-mono-num">{s.couponPct === null ? '—' : `${formatDecimal(s.couponPct, 2)}%`}</td>
                        <td className="py-1 pr-2 font-mono-num">{s.offerStart ? `${day(s.offerStart)} – ${day(s.offerEnd)}` : '—'}</td>
                        <td className="py-1 font-mono-num">{day(s.maturity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.errors.length > 0 && (
            <p className="text-xs" style={{ color: 'var(--color-down)' }}>
              {t('sbn.someFailed', { list: data.errors.map((e) => t(`sbn.type.${e.type}` as TranslationKey)).join(', ') })}
            </p>
          )}
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {t('sbn.note')}{' '}
            <a href="https://djppr.kemenkeu.go.id/sbnritel" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5" style={{ color: 'var(--accent-radar)' }}>
              DJPPR Kemenkeu <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </>
      )}
    </section>
  );
}

function SeriesCard({ s, status, day }: { s: SbnSeries; status: SbnStatus; day: (iso: string | null) => string }) {
  const t = useT();
  const badge: Record<SbnStatus, { bg: string; fg: string }> = {
    open: { bg: 'var(--color-up)', fg: '#FFFFFF' },
    upcoming: { bg: 'var(--accent-radar)', fg: '#FFFFFF' },
    closed: { bg: 'var(--bg-canvas)', fg: 'var(--text-secondary)' },
    unknown: { bg: 'var(--bg-canvas)', fg: 'var(--text-secondary)' },
  };
  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-3">
      <dt style={{ color: 'var(--text-secondary)' }}>{label}</dt>
      <dd className="text-right font-mono-num">{value}</dd>
    </div>
  );
  return (
    <article className="p-4 rounded-lg border space-y-2 text-xs" style={{ borderColor: status === 'open' ? 'var(--color-up)' : 'var(--border-subtle)' }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base font-bold">{s.code}</p>
          <p style={{ color: 'var(--text-secondary)' }}>
            {t(`sbn.type.${s.type}` as TranslationKey)}
            {s.sharia ? ` · ${t('sbn.sharia')}` : ''}
          </p>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase whitespace-nowrap" style={{ backgroundColor: badge[status].bg, color: badge[status].fg }}>
          {t(`sbn.status.${status}` as TranslationKey)}
        </span>
      </div>
      <p className="text-2xl font-bold font-mono-num">
        {s.couponPct === null ? '—' : `${formatDecimal(s.couponPct, 2)}%`}
        <span className="text-xs font-normal" style={{ color: 'var(--text-secondary)' }}>
          {' '}
          {t('sbn.perYear')}
        </span>
      </p>
      {s.couponType && <p style={{ color: 'var(--text-secondary)' }}>{t(`sbn.ct.${s.couponType}` as TranslationKey)}</p>}
      <dl className="space-y-1">
        {row(t('sbn.tenor'), s.tenorYears ? t('sbn.years', { n: s.tenorYears }) : '—')}
        {row(t('sbn.maturity'), day(s.maturity))}
        {row(t('sbn.offer'), s.offerStart ? `${day(s.offerStart)} – ${day(s.offerEnd)}${s.closeTime ? ` (${s.closeTime})` : ''}` : '—')}
        {row(t('sbn.settlement'), day(s.settlement))}
        {row(t('sbn.min'), s.minOrder === null ? '—' : formatRupiah(s.minOrder, 0))}
        {row(t('sbn.max'), s.maxUnlimited ? t('sbn.unlimited') : s.maxOrder === null ? '—' : formatIdrCompact(s.maxOrder))}
        {row(t('sbn.tradable'), s.tradable === null ? '—' : s.tradable ? t('sbn.tradableYes') : s.earlyRedemption ? t('sbn.tradableNoEarly') : t('sbn.tradableNo'))}
      </dl>
      <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1" style={{ color: 'var(--accent-radar)' }}>
        {t('sbn.official')} <ExternalLink className="w-3 h-3" />
      </a>
    </article>
  );
}
