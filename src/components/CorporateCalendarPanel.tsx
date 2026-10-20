/**
 * CorporateCalendarPanel.tsx — Corporate calendar on a stock's detail page: upcoming earnings
 * report (flagged when the date is only an estimate), ex-dividend and payment dates, and the
 * last 5 years of dividends per share and stock splits. Dates that free sources do not publish
 * (AGM/RUPS, cum and recording dates, rights issues) are named as not available.
 */
import { getLang, useT, type TranslationKey } from '../i18n/index.ts';
import { useEffect, useState } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import type { AssetConfig } from '../config/assets.ts';
import { fetchCorporateCalendar } from '../services/marketDataService.ts';
import { type CalendarEvent } from '../utils/corporateCalendar.ts';
import { formatAssetPrice } from '../utils/format.ts';

const WIB_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' });
export function niceDate(d: string): string {
  return new Intl.DateTimeFormat(getLang() === 'id' ? 'id-ID' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
}

export function CorporateCalendarPanel({ asset }: { asset: AssetConfig }) {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const t = useT();
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setEvents(null);
    setError(false);
    fetchCorporateCalendar(asset.symbol)
      .then((r) => alive && setEvents(r.events))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [asset.symbol, reload]);

  const today = WIB_DATE.format(new Date());
  const upcoming = (events ?? []).filter((e) => e.date >= today && (e.type === 'earnings' || e.type === 'exDividend' || e.type === 'dividendPayment'));
  const dividends = (events ?? []).filter((e) => e.type === 'dividend').sort((a, b) => b.date.localeCompare(a.date));
  const splits = (events ?? []).filter((e) => e.type === 'split');
  const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };

  return (
    <section aria-labelledby="corp-cal-heading" className="p-5 md:p-6 rounded-xl border space-y-4" style={card}>
      <div>
        <h3 id="corp-cal-heading" className="text-base font-bold flex items-center gap-2">
          <CalendarDays className="w-4 h-4" style={{ color: 'var(--accent-radar)' }} /> {t('cal.title')}
        </h3>
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {t('cal.sourceNote')}
        </p>
      </div>
      {error ? (
        <div className="text-sm space-y-2">
          <p>{t('common.dataUnavailable')}</p>
          <button type="button" onClick={() => setReload((r) => r + 1)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--border-subtle)' }}>
            <RefreshCw className="w-3.5 h-3.5" /> {t('common.tryAgain')}
          </button>
        </div>
      ) : !events ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary)' }}>{t('cal.upcoming')}</h4>
            {upcoming.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('cal.noUpcoming')}</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {upcoming.map((e) => (
                  <li key={e.type + e.date} className="flex justify-between gap-2">
                    <span>
                      {t(`event.${e.type}` as TranslationKey)}
                      {e.estimate && <span className="text-[11px] ml-1" style={{ color: 'var(--text-secondary)' }}>{t('cal.estimated')}</span>}
                      {e.amount !== undefined && <span className="ml-1 font-mono-num">{t('cal.perShare', { amount: formatAssetPrice(e.amount, asset) })}</span>}
                    </span>
                    <span className="font-mono-num whitespace-nowrap">{niceDate(e.date)}</span>
                  </li>
                ))}
              </ul>
            )}
            {splits.length > 0 && (
              <>
                <h4 className="text-xs font-bold uppercase tracking-wide mt-4 mb-2" style={{ color: 'var(--text-secondary)' }}>{t('cal.splits')}</h4>
                <ul className="space-y-1 text-sm">
                  {splits.map((e) => (
                    <li key={e.date} className="flex justify-between">
                      <span>{t('cal.split', { ratio: e.ratio ?? '' })}</span>
                      <span className="font-mono-num">{niceDate(e.date)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary)' }}>{t('cal.dividends')}</h4>
            {dividends.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('cal.noDividends')}</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left" style={{ color: 'var(--text-secondary)' }}>
                    <th className="py-1 font-semibold">{t('cal.exDate')}</th>
                    <th className="py-1 font-semibold text-right">{t('cal.perShareHead')}</th>
                  </tr>
                </thead>
                <tbody>
                  {dividends.slice(0, 12).map((e) => (
                    <tr key={e.date} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                      <td className="py-1 font-mono-num">{niceDate(e.date)}</td>
                      <td className="py-1 text-right font-mono-num">{e.amount !== undefined ? formatAssetPrice(e.amount, asset) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
