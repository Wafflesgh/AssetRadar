/**
 * DividendsView.tsx — Dividend calendar & yield page (#/dividends) for Indonesian stocks: the
 * ex-dates and payment dates coming up in the next 60 days, and the highest trailing 12-month
 * yields among stocks that paid in most of the last five years. Data from /api/idx/dividends
 * (the saved corporate calendar + the IDX price sweep); a stock opens its Stock Story.
 */
import { useEffect, useMemo, useState } from 'react';
import { HandCoins, RefreshCw } from 'lucide-react';
import { getAssetBySymbol, type PriceTick } from '../config/assets.ts';
import { fetchIdxDividends, type IdxDividendsPayload } from '../services/marketDataService.ts';
import { dividendYieldPct, topYields, upcomingDividends, type DividendRow } from '../utils/dividendYield.ts';
import { dateLocale, useT } from '../i18n/index.ts';
import { assetName } from '../i18n/assetNames.ts';
import { formatNumber, formatRupiah } from '../utils/format.ts';

const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
const muted = { color: 'var(--text-secondary)' };
const MIN_YEARS = [1, 3, 5] as const;

interface DividendsViewProps {
  ticks: Record<string, PriceTick>;
  onOpenStory: (symbol: string) => void;
}

export function DividendsView({ ticks, onOpenStory }: DividendsViewProps) {
  const t = useT();
  const [data, setData] = useState<IdxDividendsPayload | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<'upcoming' | 'yield'>('upcoming');
  const [minYears, setMinYears] = useState<(typeof MIN_YEARS)[number]>(3);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    fetchIdxDividends()
      .then((d) => {
        if (!alive) return;
        setData(d);
        setStatus('ready');
      })
      .catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
    };
  }, [retry]);

  // Live prices (when the app has them) refresh the yield between server updates
  const rows = useMemo<DividendRow[]>(
    () =>
      (data?.rows ?? []).map((r) => {
        const live = ticks[r.symbol];
        const price = live && !live.fromSnapshot && live.price > 0 ? live.price : r.price;
        return { ...r, price, yieldPct: dividendYieldPct(r.ttm, price) };
      }),
    [data, ticks]
  );
  const today = data?.today ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  const list = view === 'upcoming' ? upcomingDividends(rows, today, 60) : topYields(rows, minYears, 60);
  const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <HandCoins className="w-5 h-5" style={{ color: 'var(--accent-radar)' }} /> {t('div.title')}
        </h2>
        <p className="text-sm max-w-3xl" style={muted}>
          {t('div.intro')}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex p-1 rounded-lg gap-1" style={{ backgroundColor: 'var(--bg-surface-subtle)' }} role="tablist" aria-label={t('div.viewLabel')}>
          {(['upcoming', 'yield'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className="px-3 py-1.5 rounded-md text-sm font-semibold"
              style={view === v ? { backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' } : muted}
            >
              {t(v === 'upcoming' ? 'div.upcoming' : 'div.topYield')}
            </button>
          ))}
        </div>
        {view === 'yield' && (
          <label className="text-xs flex items-center gap-2" style={muted}>
            {t('div.minYears')}
            <select
              value={minYears}
              onChange={(e) => setMinYears(Number(e.target.value) as (typeof MIN_YEARS)[number])}
              className="px-2 py-1 rounded-md border text-xs"
              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            >
              {MIN_YEARS.map((y) => (
                <option key={y} value={y}>
                  {t('div.yearsOf5', { n: y })}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {status === 'loading' && <div className="skeleton h-64 rounded-2xl" aria-busy="true" aria-label={t('common.loading')} />}
      {status === 'error' && (
        <div className="flex items-center gap-2 text-sm">
          <span style={muted}>{t('common.dataUnavailable')}</span>
          <button type="button" onClick={() => setRetry((n) => n + 1)} className="inline-flex items-center gap-1 px-2 py-1 rounded border font-semibold" style={card}>
            <RefreshCw className="w-3 h-3" /> {t('common.tryAgain')}
          </button>
        </div>
      )}
      {status === 'ready' && data && (
        <>
          {data.scanned < data.total && (
            <p className="text-xs" style={muted}>
              {t('div.scanning', { scanned: data.scanned, total: data.total })}
            </p>
          )}
          {list.length === 0 ? (
            <p className="text-sm rounded-xl border p-4" style={{ ...card, ...muted }}>
              {view === 'upcoming' ? t('div.noneUpcoming') : t('div.noneYield')}
            </p>
          ) : (
            <section className="rounded-2xl border overflow-hidden" style={card}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-left" style={{ ...muted, backgroundColor: 'var(--bg-surface-subtle)' }}>
                      <th className="px-4 py-2 font-semibold">{t('table.asset')}</th>
                      {view === 'upcoming' && <th className="px-3 py-2 font-semibold">{t('div.date')}</th>}
                      <th className="px-3 py-2 font-semibold text-right">{t('div.ttm')}</th>
                      <th className="px-3 py-2 font-semibold text-right hidden sm:table-cell">{t('table.price')}</th>
                      <th className="px-3 py-2 font-semibold text-right">{t('div.yield')}</th>
                      <th className="px-3 py-2 font-semibold hidden md:table-cell">{t('div.years')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => {
                      const a = getAssetBySymbol(r.symbol);
                      return (
                        <tr key={r.symbol} onClick={() => onOpenStory(r.symbol)} className="border-t cursor-pointer hover:bg-[var(--bg-surface-subtle)]" style={{ borderColor: 'var(--border-subtle)' }}>
                          <td className="px-4 py-2">
                            <span className="font-bold font-mono-num text-[13px] block">{(a?.code ?? r.symbol).replace(/\.JK$/, '')}</span>
                            <span className="text-[11px] block truncate max-w-[11rem]" style={muted}>
                              {a ? assetName(a) : ''}
                            </span>
                          </td>
                          {view === 'upcoming' && (
                            <td className="px-3 py-2 text-xs whitespace-nowrap">
                              <span className="font-semibold">{fmtDate(r.next!.date)}</span>
                              <span className="block text-[11px]" style={muted}>
                                {t(r.next!.type === 'exDividend' ? 'div.exDate' : 'div.payDate')}
                              </span>
                            </td>
                          )}
                          <td className="px-3 py-2 text-right font-mono-num text-xs">{r.ttm > 0 ? formatRupiah(r.ttm, r.ttm < 10 ? 2 : 0) : '—'}</td>
                          <td className="px-3 py-2 text-right font-mono-num text-xs hidden sm:table-cell">{r.price ? formatRupiah(r.price, 0) : '—'}</td>
                          <td className="px-3 py-2 text-right font-mono-num text-xs font-bold" style={{ color: r.yieldPct !== null ? 'var(--color-gold)' : undefined }}>
                            {r.yieldPct !== null ? `${formatNumber(r.yieldPct, 2)}%` : '—'}
                          </td>
                          <td className="px-3 py-2 hidden md:table-cell">
                            <YearDots paid={r.yearsPaid} label={t('div.yearsAria', { n: r.yearsPaid })} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <p className="text-xs" style={muted}>
            {t('div.note', { source: data.source })}
          </p>
        </>
      )}
    </div>
  );
}

/** Five dots: one filled per year (of the last five) with a dividend. */
function YearDots({ paid, label }: { paid: number; label: string }) {
  return (
    <span className="inline-flex gap-1" role="img" aria-label={label}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="w-2 h-2 rounded-full" style={{ backgroundColor: i < paid ? 'var(--color-gold)' : 'var(--border-strong)' }} />
      ))}
    </span>
  );
}
