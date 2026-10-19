/**
 * IdxCalendarView.tsx — IDX corporate calendar page (#/calendar): earnings reports, ex-dividend
 * and dividend payment dates and stock splits for all Indonesian stocks, for this week, this
 * month, the next 90 days or the last 30 days, optionally only for watchlist or portfolio
 * stocks. The server checks every stock slowly in the background, so the page shows how many
 * stocks have been checked and refreshes while that runs.
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { getAssetBySymbol } from '../config/assets.ts';
import { fetchCorporateCalendar, type CalendarResponse } from '../services/marketDataService.ts';
import { EVENT_LABELS, addDays, type CalendarEventType } from '../utils/corporateCalendar.ts';
import { formatAssetPrice } from '../utils/format.ts';
import { getPortfolioTxs } from '../utils/storage.ts';
import { niceDate } from './CorporateCalendarPanel.tsx';

type Window = 'week' | 'month' | 'next90' | 'past30';
const WINDOWS: Array<{ key: Window; label: string }> = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'next90', label: 'Next 90 days' },
  { key: 'past30', label: 'Last 30 days' },
];
type Scope = 'all' | 'watchlist' | 'portfolio';
const TYPES: CalendarEventType[] = ['earnings', 'exDividend', 'dividendPayment', 'dividend', 'split'];

const WIB_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' });

function windowRange(w: Window, today: string): [string, string] {
  const d = new Date(`${today}T00:00:00Z`);
  if (w === 'week') {
    const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
    const monday = addDays(today, -dow);
    return [monday, addDays(monday, 6)];
  }
  if (w === 'month') {
    const first = `${today.slice(0, 7)}-01`;
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    return [first, addDays(next.toISOString().slice(0, 10), -1)];
  }
  if (w === 'next90') return [today, addDays(today, 90)];
  return [addDays(today, -30), addDays(today, -1)];
}

export function IdxCalendarView({ onSelectAsset, watchlist }: { onSelectAsset: (symbol: string) => void; watchlist: string[] }) {
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [error, setError] = useState(false);
  const [win, setWin] = useState<Window>('week');
  const [scope, setScope] = useState<Scope>('all');
  const [types, setTypes] = useState<Set<CalendarEventType>>(() => new Set(TYPES));
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = () =>
      fetchCorporateCalendar()
        .then((d) => {
          if (!alive) return;
          setData(d);
          setError(false);
          // Keep refreshing while the server is still checking stocks
          if (d.scanning) timer = setTimeout(load, 15_000);
        })
        .catch(() => alive && setError(true));
    load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [reload]);

  const today = WIB_DATE.format(new Date());
  const [from, to] = windowRange(win, today);
  const portfolio = useMemo(() => new Set(getPortfolioTxs<{ id: string; symbol: string }>().map((t) => t.symbol)), []);

  const events = (data?.events ?? []).filter(
    (e) =>
      e.date >= from &&
      e.date <= to &&
      types.has(e.type) &&
      (scope === 'all' || (scope === 'watchlist' ? watchlist.includes(e.symbol) : portfolio.has(e.symbol)))
  );
  const byDate = new Map<string, typeof events>();
  for (const e of events) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);

  const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
  const chip = (active: boolean) => ({
    backgroundColor: active ? 'var(--accent-radar-soft)' : 'var(--bg-surface-subtle)',
    borderColor: active ? 'var(--accent-radar)' : 'var(--border-subtle)',
    color: active ? 'var(--accent-radar)' : 'var(--text-secondary)',
  });

  return (
    <div className="space-y-6">
      <section className="p-5 md:p-6 rounded-xl border space-y-2" style={card}>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
          <CalendarDays className="w-5 h-5" style={{ color: 'var(--accent-radar)' }} /> IDX Corporate Calendar
        </h1>
        <p className="text-sm max-w-3xl" style={{ color: 'var(--text-secondary)' }}>
          Earnings reports, ex-dividend and payment dates and stock splits for Indonesian stocks (source: Yahoo Finance). Earnings
          dates marked "estimated" are the source's estimate. AGM (RUPS), cum and recording dates and rights issues are not
          available from free sources.
        </p>
        {data && (
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {data.scanning ? 'Checking stocks… ' : ''}
            {data.scanned} of {data.total} stocks checked{data.scanning ? ' (refreshes every 15 s)' : ''}.
          </p>
        )}
      </section>

      <section className="space-y-3" aria-label="Calendar filters">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Period">
          {WINDOWS.map((w) => (
            <button key={w.key} type="button" role="radio" aria-checked={win === w.key} onClick={() => setWin(w.key)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border" style={chip(win === w.key)}>
              {w.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Stocks">
          {(['all', 'watchlist', 'portfolio'] as Scope[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={scope === s} onClick={() => setScope(s)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border" style={chip(scope === s)}>
              {s === 'all' ? 'All IDX stocks' : s === 'watchlist' ? 'My watchlist' : 'My portfolio'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Event types">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={types.has(t)}
              onClick={() =>
                setTypes((prev) => {
                  const next = new Set(prev);
                  if (next.has(t)) next.delete(t);
                  else next.add(t);
                  return next;
                })
              }
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold border"
              style={chip(types.has(t))}
            >
              {EVENT_LABELS[t]}
            </button>
          ))}
        </div>
      </section>

      {error && !data ? (
        <div className="p-6 rounded-xl border text-sm space-y-3" style={card} role="alert">
          <p>Data unavailable</p>
          <button type="button" onClick={() => setReload((r) => r + 1)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--border-subtle)' }}>
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      ) : !data ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : byDate.size === 0 ? (
        <p className="p-6 rounded-xl border text-sm" style={{ ...card, color: 'var(--text-secondary)' }}>
          No events in this period{data.scanning ? ' among the stocks checked so far' : ''}.
        </p>
      ) : (
        <section className="space-y-3" aria-label="Events">
          {[...byDate.entries()].map(([date, list]) => (
            <div key={date} className="rounded-xl border overflow-hidden" style={card}>
              <h2 className="px-4 py-2 text-sm font-bold" style={{ backgroundColor: 'var(--bg-surface-subtle)', color: date === today ? 'var(--accent-radar)' : undefined }}>
                {niceDate(date)}
                {date === today ? ' · today' : ''}
              </h2>
              <ul>
                {list.map((e) => {
                  const asset = getAssetBySymbol(e.symbol);
                  return (
                    <li key={e.symbol + e.type} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                      <button type="button" onClick={() => onSelectAsset(e.symbol)} className="w-full px-4 py-2 flex items-center justify-between gap-3 text-left hover:bg-[var(--bg-surface-subtle)]">
                        <span className="min-w-0">
                          <span className="font-mono-num font-bold text-[13px]">{asset?.shortName ?? e.symbol}</span>
                          <span className="text-[11px] ml-2 truncate" style={{ color: 'var(--text-secondary)' }}>
                            {asset?.name}
                          </span>
                        </span>
                        <span className="text-xs text-right shrink-0">
                          {EVENT_LABELS[e.type]}
                          {e.estimate && <span style={{ color: 'var(--text-secondary)' }}> (estimated)</span>}
                          {e.amount !== undefined && asset && <span className="block font-mono-num">{formatAssetPrice(e.amount, asset)}/share</span>}
                          {e.ratio && <span className="block font-mono-num">{e.ratio}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
