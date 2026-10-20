/**
 * PortfolioAnalytics.tsx — Portfolio analytics under the holdings (lazy-loaded): Performance
 * (daily value from price history and the time-weighted return against the IHSG over the same
 * period, with the method explained), Risk (annualized volatility, maximum drawdown, correlation
 * between holdings; the allocation versus the risk profile is shown above), Dividends (record cash
 * dividends; suggestions from the dividend history × shares held before the ex-date, confirmed by
 * the user) and Calendar (ex-dates, payments and earnings of the stocks you hold). Education only.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getAssetBySymbol, type PriceTick } from '../config/assets.ts';
import { fetchCorporateCalendar, fetchDailyHistory, type DailyHistory } from '../services/marketDataService.ts';
import { onSyncApplied } from '../services/syncService.ts';
import { type CalendarEvent } from '../utils/corporateCalendar.ts';
import { formatRupiah, getNumberLocale } from '../utils/format.ts';
import { useT, type TranslationKey } from '../i18n/index.ts';
import { Rich } from '../i18n/Rich.tsx';
import { assetShortName } from '../i18n/assetNames.ts';
import { tradeUnitOf, type PortfolioTx } from '../utils/portfolio.ts';
import {
  annualized,
  annualizedVolatility,
  closeOn,
  dailyValues,
  holdingCorrelations,
  maxDrawdown,
  parseDividends,
  rebaseBenchmark,
  returnsOf,
  sharesBefore,
  suggestDividends,
  type DividendRecord,
} from '../utils/portfolioAnalytics.ts';
import { getDismissedDividends, getDividendsRaw, saveDismissedDividends, saveDividends } from '../utils/storage.ts';

const GRAMS_PER_TROY_OUNCE = 31.1034768;
const BENCHMARK = '^JKSE';
const STOCKS = new Set(['idStock', 'usStock', 'globalStock']);
const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
const muted = { color: 'var(--text-secondary)' };
const inputStyle = { backgroundColor: 'var(--bg-surface-subtle)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' };
const pct = (v: number | null | undefined, digits = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`);
const todayWib = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
const num = (v: number, max?: number) => v.toLocaleString(getNumberLocale(), max === undefined ? undefined : { maximumFractionDigits: max });
const nameOf = (sym: string) => {
  const a = getAssetBySymbol(sym);
  return a ? assetShortName(a) : sym;
};

type Tab = 'performance' | 'risk' | 'dividends' | 'calendar';

/** Rupiah price per base unit for a holding from daily closes (null when it cannot be converted). */
function idrSeriesFn(symbol: string, hist: Record<string, DailyHistory>): ((date: string) => number | undefined) | null {
  const asset = getAssetBySymbol(symbol);
  const h = hist[symbol];
  if (!asset || !h) return null;
  const bars = h.bars;
  const usd = hist['USD/IDR']?.bars;
  if (symbol === 'XAU/USD') {
    if (!usd) return null;
    return (d) => {
      const c = closeOn(bars, d);
      const fx = closeOn(usd, d);
      return c !== undefined && fx !== undefined ? (c * fx) / GRAMS_PER_TROY_OUNCE : undefined;
    };
  }
  if (asset.currency === 'IDR') return (d) => closeOn(bars, d);
  const cur = asset.currency === 'USX' ? 'USD' : asset.currency;
  const fxBars = hist[`${cur}/IDR`]?.bars;
  if (!fxBars) return null;
  const div = asset.currency === 'USX' ? 100 : 1;
  return (d) => {
    const c = closeOn(bars, d);
    const fx = closeOn(fxBars, d);
    return c !== undefined && fx !== undefined ? (c / div) * fx : undefined;
  };
}

export function PortfolioAnalytics({ txs, ticks, onSelectAsset }: { txs: PortfolioTx[]; ticks: Record<string, PriceTick>; onSelectAsset: (s: string) => void }) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('performance');
  const [hist, setHist] = useState<Record<string, DailyHistory>>({});
  const [failed, setFailed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [dividends, setDividends] = useState<DividendRecord[]>(() => parseDividends(getDividendsRaw()));
  const [dismissed, setDismissed] = useState<string[]>(() => getDismissedDividends());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventsState, setEventsState] = useState<'loading' | 'ready'>('loading');

  useEffect(() => onSyncApplied(['dividends'], () => setDividends(parseDividends(getDividendsRaw()))), []);

  const symbols = useMemo(() => [...new Set(txs.map((t) => t.symbol))].sort(), [txs]);
  const stockSymbols = symbols.filter((s) => STOCKS.has(getAssetBySymbol(s)?.group ?? ''));
  const needed = useMemo(() => {
    const fx = new Set<string>();
    for (const s of symbols) {
      const a = getAssetBySymbol(s);
      if (!a) continue;
      if (s === 'XAU/USD') fx.add('USD/IDR');
      else if (a.currency !== 'IDR') fx.add(`${a.currency === 'USX' ? 'USD' : a.currency}/IDR`);
    }
    return [...new Set([...symbols, BENCHMARK, ...[...fx].filter((x) => getAssetBySymbol(x))])];
  }, [symbols.join(',')]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.allSettled(needed.map((s) => fetchDailyHistory(s))).then((results) => {
      if (!alive) return;
      const next: Record<string, DailyHistory> = {};
      const bad: string[] = [];
      results.forEach((r, i) => (r.status === 'fulfilled' ? (next[needed[i]] = r.value) : bad.push(needed[i])));
      setHist(next);
      setFailed(bad);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [needed.join(','), retry]);

  useEffect(() => {
    let alive = true;
    setEventsState('loading');
    Promise.allSettled(stockSymbols.map((s) => fetchCorporateCalendar(s))).then((results) => {
      if (!alive) return;
      setEvents(results.flatMap((r) => (r.status === 'fulfilled' ? r.value.events : [])));
      setEventsState('ready');
    });
    return () => {
      alive = false;
    };
  }, [stockSymbols.join(','), retry]);

  // ---- Performance ----
  const perf = useMemo(() => {
    const fns = new Map<string, (d: string) => number | undefined>();
    const unpriced: string[] = [];
    for (const s of symbols) {
      const fn = idrSeriesFn(s, hist);
      if (fn) fns.set(s, fn);
      else unpriced.push(s);
    }
    const dates = [...new Set(symbols.flatMap((s) => hist[s]?.bars.map((b) => b.date) ?? []))];
    const fxFor = (cur: string, d: string) => {
      if (cur === 'IDR') return 1;
      const bars = hist[`${cur}/IDR`]?.bars;
      return bars ? closeOn(bars, d) : undefined;
    };
    const currencyOf = (s: string) => {
      const a = getAssetBySymbol(s);
      return a ? tradeUnitOf(a).currency : 'IDR';
    };
    const points = dailyValues(txs, dividends, dates, (s, d) => fns.get(s)?.(d), fxFor, currencyOf);
    const bench = hist[BENCHMARK] ? rebaseBenchmark(hist[BENCHMARK].bars, points.map((p) => p.date)) : points.map(() => null);
    return { points, bench, unpriced };
  }, [txs, dividends, hist]);

  const last = perf.points[perf.points.length - 1];
  const first = perf.points[0];
  const days = first && last ? (Date.parse(last.date) - Date.parse(first.date)) / 86_400_000 : 0;
  const benchLast = perf.bench[perf.bench.length - 1];
  const twrReturns = returnsOf(perf.points.map((p) => p.twr));
  const benchReturns = returnsOf(perf.bench);
  const chartData = perf.points.map((p, i) => ({ date: p.date, portfolio: Number(p.twr.toFixed(2)), ihsg: perf.bench[i] === null ? null : Number((perf.bench[i] as number).toFixed(2)) }));
  const ddPort = maxDrawdown(perf.points.map((p) => ({ date: p.date, v: p.twr })));
  const ddBench = maxDrawdown(perf.points.map((p, i) => ({ date: p.date, v: perf.bench[i] })));
  const estimatedDays = perf.points.filter((p) => p.estimated).length;

  // ---- Risk: correlation between current holdings ----
  const openSymbols = symbols.filter((s) => sharesBefore(txs, s, '9999-12-31') > 0);
  const corr = useMemo(
    () => holdingCorrelations(openSymbols.filter((s) => hist[s]).map((s) => ({ symbol: s, bars: hist[s].bars }))).sort((a, b) => Math.abs(b.r ?? 0) - Math.abs(a.r ?? 0)),
    [openSymbols.join(','), hist]
  );

  // ---- Dividends ----
  const suggestions = useMemo(() => suggestDividends(events, txs, dividends, new Set(dismissed), todayWib()), [events, txs, dividends, dismissed]);
  const persistDividends = (list: DividendRecord[]) => {
    saveDividends(list);
    setDividends(list);
  };
  const dismiss = (key: string) => {
    const next = [...dismissed, key];
    saveDismissedDividends(next);
    setDismissed(next);
  };
  const divTotalIdr = dividends.reduce((s, d) => {
    const rate = d.currency === 'IDR' ? 1 : ticks[`${d.currency}/IDR`]?.price;
    return s + (rate ? d.amount * rate : 0);
  }, 0);

  // ---- Calendar ----
  const today = todayWib();
  const upcoming = events
    .filter((e) => (e.type === 'exDividend' || e.type === 'dividendPayment' || e.type === 'earnings') && e.date >= today && openSymbols.includes(e.symbol))
    .sort((a, b) => a.date.localeCompare(b.date));

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'performance', label: t('pfa.tab.performance') },
    { id: 'risk', label: t('pfa.tab.risk') },
    { id: 'dividends', label: t('pfa.tab.dividends') + (suggestions.length ? ` (${suggestions.length})` : '') },
    { id: 'calendar', label: t('pfa.tab.calendar') },
  ];

  return (
    <section className="p-4 md:p-5 rounded-xl border space-y-4" style={card} aria-labelledby="pf-analytics">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 id="pf-analytics" className="text-base font-bold">
          {t('pfa.title')}
        </h2>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label={t('pfa.title')}>
          {tabs.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: tab === x.id ? 'var(--accent-radar)' : 'var(--border-subtle)', color: tab === x.id ? 'var(--accent-radar)' : 'var(--text-primary)', backgroundColor: tab === x.id ? 'var(--accent-radar-soft)' : 'transparent' }}>
              {x.label}
            </button>
          ))}
        </div>
      </div>

      {failed.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span style={{ color: 'var(--color-down)' }}>{t('pfa.histUnavailable', { names: failed.map(nameOf).join(', ') })}</span>
          <button type="button" onClick={() => setRetry((n) => n + 1)} className="inline-flex items-center gap-1 px-2 py-1 rounded border font-semibold" style={{ borderColor: 'var(--border-subtle)' }}>
            <RefreshCw className="w-3 h-3" /> {t('common.tryAgain')}
          </button>
        </div>
      )}

      {tab === 'performance' && (
        <div className="space-y-3">
          {loading && perf.points.length === 0 ? (
            <p className="text-sm" style={muted}>{t('cmp.loadingHistory')}</p>
          ) : perf.points.length < 2 ? (
            <p className="text-sm" style={muted}>{t('pfa.notEnough')}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <Metric label={t('pfa.twr', { date: first.date })} value={pct(last.twr / 100 - 1)} />
                <Metric label={t('pfa.ihsgSame')} value={benchLast === null || benchLast === undefined ? '—' : pct(benchLast / 100 - 1)} />
                <Metric label={t('pfa.perYear')} value={days >= 365 ? pct(annualized(last.twr, days)) : t('pfa.underYear')} />
                <Metric label={t('pfa.valueLast')} value={formatRupiah(last.value)} />
              </div>
              <div className="h-60 md:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 8, bottom: 0, left: -10 }}>
                    <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} minTickGap={40} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} domain={['auto', 'auto']} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="portfolio" name={t('nav.portfolio')} dot={false} strokeWidth={2} stroke="#38BDF8" isAnimationActive={false} />
                    <Line type="monotone" dataKey="ihsg" name="IHSG" dot={false} strokeWidth={1.5} stroke="#F59E0B" isAnimationActive={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
          <details className="text-xs" style={muted}>
            <summary className="cursor-pointer font-semibold">{t('pfa.howTitle')}</summary>
            <p className="mt-1.5">
              <Rich text={t('pfa.how')} />
              {estimatedDays > 0 && ` ${t('pfa.estimatedDays', { n: estimatedDays })}`}
            </p>
          </details>
          {perf.unpriced.length > 0 && (
            <p className="text-xs" style={muted}>
              {t('pfa.notIncluded', { names: perf.unpriced.map(nameOf).join(', ') })}
            </p>
          )}
        </div>
      )}

      {tab === 'risk' && (
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Metric label={t('pfa.volPort')} value={pct(annualizedVolatility(twrReturns), 1).replace('+', '')} />
            <Metric label={t('pfa.volIhsg')} value={pct(annualizedVolatility(benchReturns), 1).replace('+', '')} />
            <Metric label={t('pfa.ddPort')} value={ddPort ? pct(ddPort.drawdown) : '—'} sub={ddPort && ddPort.drawdown < 0 ? `${ddPort.peak} → ${ddPort.trough}` : undefined} />
            <Metric label={t('pfa.ddIhsg')} value={ddBench ? pct(ddBench.drawdown) : '—'} sub={ddBench && ddBench.drawdown < 0 ? `${ddBench.peak} → ${ddBench.trough}` : undefined} />
          </div>
          <p style={muted}>
            {t('pfa.riskNote')}
          </p>
          <h3 className="font-bold text-sm pt-1">{t('pfa.corrTitle')}</h3>
          {corr.length === 0 ? (
            <p style={muted}>{t('pfa.corrNeeds')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap">
                <tbody>
                  {corr.slice(0, 15).map((c) => (
                    <tr key={`${c.a}|${c.b}`} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                      <td className="py-1.5 pr-2">
                        {nameOf(c.a)} ↔ {nameOf(c.b)}
                      </td>
                      <td className="py-1.5 pr-2 text-right font-mono-num" style={{ color: c.r === null ? undefined : c.r > 0.6 ? 'var(--color-down)' : c.r < 0.2 ? 'var(--color-up)' : undefined }}>
                        {c.r === null ? '—' : c.r.toFixed(2)}
                      </td>
                      <td className="py-1.5 text-right" style={muted}>
                        {t('pfa.days', { n: c.days })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1.5" style={muted}>
                {t('pfa.corrNote')}
              </p>
            </div>
          )}
        </div>
      )}

      {tab === 'dividends' && (
        <div className="space-y-3 text-xs">
          <p>
            <Rich text={t('pfa.divRecorded', { n: dividends.length, total: formatRupiah(divTotalIdr) })} />
          </p>
          {suggestions.length > 0 && (
            <div className="space-y-2 p-3 rounded-lg border" style={{ borderColor: 'var(--accent-radar)' }}>
              <p className="font-semibold">{t('pfa.suggestTitle')}</p>
              <ul className="space-y-1.5">
                {suggestions.map((s) => {
                  const asset = getAssetBySymbol(s.symbol);
                  const currency = asset ? tradeUnitOf(asset).currency : 'IDR';
                  return (
                    <li key={s.key} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <strong>{asset ? assetShortName(asset) : s.symbol}</strong> {t('pfa.suggestLine', { date: s.exDate, shares: num(s.shares), perShare: num(s.perShare) })}{' '}
                        <span className="font-mono-num">{currency === 'IDR' ? formatRupiah(s.amount) : `${num(s.amount, 2)} ${currency}`}</span> {t('pfa.gross')}
                      </span>
                      <span className="flex gap-1.5">
                        <button type="button" onClick={() => persistDividends([...dividends, { id: `dv-${Date.now().toString(36)}-${s.key.length}`, symbol: s.symbol, exDate: s.exDate, perShare: s.perShare, shares: s.shares, amount: s.amount, currency, source: 'suggested' }])} className="px-2.5 py-1 rounded-lg font-semibold" style={{ backgroundColor: 'var(--accent-radar)', color: '#0B1220' }}>
                          {t('pfa.confirm')}
                        </button>
                        <button type="button" onClick={() => dismiss(s.key)} className="px-2.5 py-1 rounded-lg border font-semibold" style={{ borderColor: 'var(--border-subtle)' }}>
                          {t('pfa.dismiss')}
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {eventsState === 'loading' && stockSymbols.length > 0 && <p style={muted}>{t('pfa.checkingDiv')}</p>}
          <DividendForm symbols={symbols} txs={txs} onAdd={(d) => persistDividends([...dividends, d])} />
          {dividends.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap">
                <thead>
                  <tr style={muted}>
                    <th className="py-1.5 pr-2 text-left font-semibold">{t('scr.stock')}</th>
                    <th className="py-1.5 pr-2 text-left font-semibold">{t('pfa.exDate')}</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">{t('pfa.perShare')}</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">{t('pfa.shares')}</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">{t('pfa.received')}</th>
                    <th className="py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {[...dividends].sort((a, b) => b.exDate.localeCompare(a.exDate)).map((d) => (
                    <tr key={d.id} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                      <td className="py-1.5 pr-2 font-semibold">
                        <button type="button" className="hover:underline" onClick={() => onSelectAsset(d.symbol)}>
                          {nameOf(d.symbol)}
                        </button>
                      </td>
                      <td className="py-1.5 pr-2 font-mono-num">{d.exDate}</td>
                      <td className="py-1.5 pr-2 text-right font-mono-num">{num(d.perShare)}</td>
                      <td className="py-1.5 pr-2 text-right font-mono-num">{num(d.shares)}</td>
                      <td className="py-1.5 pr-2 text-right font-mono-num">{d.currency === 'IDR' ? formatRupiah(d.amount) : `${d.amount.toFixed(2)} ${d.currency}`}</td>
                      <td className="py-1.5 text-right">
                        <button type="button" onClick={() => persistDividends(dividends.filter((x) => x.id !== d.id))} className="underline" style={{ color: 'var(--color-down)' }}>
                          {t('common.delete')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={muted}>{t('pfa.tax')}</p>
        </div>
      )}

      {tab === 'calendar' && (
        <div className="space-y-2 text-xs">
          {stockSymbols.length === 0 ? (
            <p style={muted}>{t('pfa.noStocks')}</p>
          ) : eventsState === 'loading' ? (
            <p style={muted}>{t('pfa.loadingCal')}</p>
          ) : upcoming.length === 0 ? (
            <p style={muted}>{t('pfa.noUpcoming')}</p>
          ) : (
            <ul className="space-y-1.5">
              {upcoming.map((e, i) => (
                <li key={`${e.symbol}-${e.type}-${e.date}-${i}`} className="flex flex-wrap justify-between gap-2 border-t pt-1.5" style={{ borderColor: 'var(--border-subtle)' }}>
                  <span>
                    <span className="font-mono-num font-semibold">{e.date}</span> ·{' '}
                    <button type="button" className="font-semibold hover:underline" onClick={() => onSelectAsset(e.symbol)}>
                      {nameOf(e.symbol)}
                    </button>{' '}
                    · {t(`event.${e.type}` as TranslationKey)}
                    {e.estimate ? ` ${t('alerts.fire.estimated')}` : ''}
                  </span>
                  {e.amount ? <span className="font-mono-num">{t('pfa.amountPerShare', { amount: num(e.amount) })}</span> : null}
                </li>
              ))}
            </ul>
          )}
          <p style={muted}>{t('pfa.calNote')}</p>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-2.5 rounded-lg border" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface-subtle)' }}>
      <div style={muted}>{label}</div>
      <div className="text-base font-bold font-mono-num">{value}</div>
      {sub && <div className="text-[10px]" style={muted}>{sub}</div>}
    </div>
  );
}

function DividendForm({ symbols, txs, onAdd }: { symbols: string[]; txs: PortfolioTx[]; onAdd: (d: DividendRecord) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState(symbols[0] ?? '');
  const [exDate, setExDate] = useState('');
  const [payDate, setPayDate] = useState('');
  const [perShare, setPerShare] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const shares = symbol && exDate ? sharesBefore(txs, symbol, exDate) : 0;
  const ps = Number(perShare);
  const suggested = Number.isFinite(ps) && ps > 0 ? ps * shares : 0;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="px-3 py-1.5 rounded-lg border font-semibold" style={{ borderColor: 'var(--border-subtle)' }}>
        + {t('pfa.record')}
      </button>
    );
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const amt = amount.trim() ? Number(amount) : suggested;
    if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(exDate) || !(ps > 0) || !(amt > 0)) {
      setError(t('pfa.formErr'));
      return;
    }
    const asset = getAssetBySymbol(symbol);
    onAdd({
      id: `dv-${Date.now().toString(36)}`,
      symbol,
      exDate,
      payDate: payDate || undefined,
      perShare: ps,
      shares,
      amount: amt,
      currency: asset ? tradeUnitOf(asset).currency : 'IDR',
      source: 'manual',
    });
    setOpen(false);
    setPerShare('');
    setAmount('');
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 rounded-lg border" style={{ borderColor: 'var(--border-subtle)' }}>
      <label className="space-y-1">
        <span style={muted}>{t('scr.stock')}</span>
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="w-full px-2 py-1.5 rounded border" style={inputStyle}>
          {symbols.map((s) => (
            <option key={s} value={s}>
              {nameOf(s)}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span style={muted}>{t('pfa.exDivDate')}</span>
        <input type="date" value={exDate} onChange={(e) => setExDate(e.target.value)} className="w-full px-2 py-1.5 rounded border" style={inputStyle} />
      </label>
      <label className="space-y-1">
        <span style={muted}>{t('pfa.payDate')}</span>
        <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="w-full px-2 py-1.5 rounded border" style={inputStyle} />
      </label>
      <label className="space-y-1">
        <span style={muted}>{t('pfa.divPerShare')}</span>
        <input inputMode="decimal" value={perShare} onChange={(e) => setPerShare(e.target.value)} className="w-full px-2 py-1.5 rounded border font-mono-num" style={inputStyle} />
      </label>
      <label className="space-y-1">
        <span style={muted}>{t('pfa.amountRecv', { blank: suggested ? num(suggested) : t('pfa.perShareTimes') })}</span>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-2 py-1.5 rounded border font-mono-num" style={inputStyle} />
      </label>
      <div className="space-y-1">
        <span style={muted}>{t('pfa.sharesBefore')}</span>
        <p className="font-mono-num font-semibold py-1.5">{exDate ? num(shares) : '—'}</p>
      </div>
      {error && (
        <p className="sm:col-span-3 font-semibold" role="alert" style={{ color: 'var(--color-down)' }}>
          {error}
        </p>
      )}
      <div className="sm:col-span-3 flex gap-2">
        <button type="submit" className="px-3 py-1.5 rounded-lg font-semibold" style={{ backgroundColor: 'var(--accent-radar)', color: '#0B1220' }}>
          {t('pfa.saveDiv')}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg border font-semibold" style={{ borderColor: 'var(--border-subtle)' }}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
