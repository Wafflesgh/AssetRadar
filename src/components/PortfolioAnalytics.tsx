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
import { EVENT_LABELS, type CalendarEvent } from '../utils/corporateCalendar.ts';
import { formatRupiah } from '../utils/format.ts';
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
  const chartData = perf.points.map((p, i) => ({ date: p.date, Portfolio: Number(p.twr.toFixed(2)), IHSG: perf.bench[i] === null ? null : Number((perf.bench[i] as number).toFixed(2)) }));
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
    { id: 'performance', label: 'Performance' },
    { id: 'risk', label: 'Risk' },
    { id: 'dividends', label: `Dividends${suggestions.length ? ` (${suggestions.length})` : ''}` },
    { id: 'calendar', label: 'Calendar' },
  ];

  return (
    <section className="p-4 md:p-5 rounded-xl border space-y-4" style={card} aria-labelledby="pf-analytics">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 id="pf-analytics" className="text-base font-bold">
          Portfolio analytics
        </h2>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Analytics">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: tab === t.id ? 'var(--accent-radar)' : 'var(--border-subtle)', color: tab === t.id ? 'var(--accent-radar)' : 'var(--text-primary)', backgroundColor: tab === t.id ? 'var(--accent-radar-soft)' : 'transparent' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {failed.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span style={{ color: 'var(--color-down)' }}>Price history unavailable for {failed.map((s) => getAssetBySymbol(s)?.shortName ?? s).join(', ')}.</span>
          <button type="button" onClick={() => setRetry((n) => n + 1)} className="inline-flex items-center gap-1 px-2 py-1 rounded border font-semibold" style={{ borderColor: 'var(--border-subtle)' }}>
            <RefreshCw className="w-3 h-3" /> Try again
          </button>
        </div>
      )}

      {tab === 'performance' && (
        <div className="space-y-3">
          {loading && perf.points.length === 0 ? (
            <p className="text-sm" style={muted}>Loading price history…</p>
          ) : perf.points.length < 2 ? (
            <p className="text-sm" style={muted}>Not enough price history yet to chart the performance.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <Metric label={`Time-weighted return (since ${first.date})`} value={pct(last.twr / 100 - 1)} />
                <Metric label="IHSG, same period" value={benchLast === null || benchLast === undefined ? '—' : pct(benchLast / 100 - 1)} />
                <Metric label="Per year (TWR)" value={days >= 365 ? pct(annualized(last.twr, days)) : 'Under 1 year'} />
                <Metric label="Value at last close" value={formatRupiah(last.value)} />
              </div>
              <div className="h-60 md:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 8, bottom: 0, left: -10 }}>
                    <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} minTickGap={40} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} domain={['auto', 'auto']} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="Portfolio" dot={false} strokeWidth={2} stroke="#38BDF8" isAnimationActive={false} />
                    <Line type="monotone" dataKey="IHSG" dot={false} strokeWidth={1.5} stroke="#F59E0B" isAnimationActive={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
          <details className="text-xs" style={muted}>
            <summary className="cursor-pointer font-semibold">How is this calculated?</summary>
            <p className="mt-1.5">
              The portfolio is valued in Rupiah at each daily close (foreign prices converted with that day's exchange rate; gold from gold
              futures in grams). The <strong>time-weighted return</strong> links the daily returns, where each day's return is (value +
              dividends received − money added) ÷ the previous day's value − 1. Buying and selling are treated as deposits and withdrawals, so
              the result shows how your picks performed regardless of when and how much money you added — the same method fund managers
              report, which makes it comparable with the IHSG over the same days. Recorded dividends count on their payment date. Fees lower
              the return.
              {estimatedDays > 0 && ` On ${estimatedDays} day(s) a holding had no close yet, so its last trade price was used.`}
            </p>
          </details>
          {perf.unpriced.length > 0 && (
            <p className="text-xs" style={muted}>
              Not included (no Rupiah price history): {perf.unpriced.map((s) => getAssetBySymbol(s)?.shortName ?? s).join(', ')}.
            </p>
          )}
        </div>
      )}

      {tab === 'risk' && (
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Metric label="Volatility per year (portfolio)" value={pct(annualizedVolatility(twrReturns), 1).replace('+', '')} />
            <Metric label="Volatility per year (IHSG)" value={pct(annualizedVolatility(benchReturns), 1).replace('+', '')} />
            <Metric label="Max drawdown (portfolio)" value={ddPort ? pct(ddPort.drawdown) : '—'} sub={ddPort && ddPort.drawdown < 0 ? `${ddPort.peak} → ${ddPort.trough}` : undefined} />
            <Metric label="Max drawdown (IHSG)" value={ddBench ? pct(ddBench.drawdown) : '—'} sub={ddBench && ddBench.drawdown < 0 ? `${ddBench.peak} → ${ddBench.trough}` : undefined} />
          </div>
          <p style={muted}>
            Volatility = how much the daily return swings, scaled to a year (√252). Max drawdown = the deepest fall from a previous high. Both
            describe the past; they can be larger in the future. The split by asset class versus your risk profile's sample allocation is shown
            in the allocation section above.
          </p>
          <h3 className="font-bold text-sm pt-1">Correlation between your holdings (daily returns, last ~12 months)</h3>
          {corr.length === 0 ? (
            <p style={muted}>Needs at least two holdings with price history.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap">
                <tbody>
                  {corr.slice(0, 15).map((c) => (
                    <tr key={`${c.a}|${c.b}`} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                      <td className="py-1.5 pr-2">
                        {getAssetBySymbol(c.a)?.shortName} ↔ {getAssetBySymbol(c.b)?.shortName}
                      </td>
                      <td className="py-1.5 pr-2 text-right font-mono-num" style={{ color: c.r === null ? undefined : c.r > 0.6 ? 'var(--color-down)' : c.r < 0.2 ? 'var(--color-up)' : undefined }}>
                        {c.r === null ? '—' : c.r.toFixed(2)}
                      </td>
                      <td className="py-1.5 text-right" style={muted}>
                        {c.days} days
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1.5" style={muted}>
                Close to 1 = they usually move together (less diversification); near 0 or negative = they move more independently.
                Correlation is not causation and changes over time.
              </p>
            </div>
          )}
        </div>
      )}

      {tab === 'dividends' && (
        <div className="space-y-3 text-xs">
          <p>
            Cash dividends recorded: <strong className="font-mono-num">{dividends.length}</strong> · total{' '}
            <strong className="font-mono-num">{formatRupiah(divTotalIdr)}</strong>
          </p>
          {suggestions.length > 0 && (
            <div className="space-y-2 p-3 rounded-lg border" style={{ borderColor: 'var(--accent-radar)' }}>
              <p className="font-semibold">Dividends you were probably entitled to (from the dividend history × shares you held before the ex-date). Confirm to record them — nothing is added automatically.</p>
              <ul className="space-y-1.5">
                {suggestions.map((s) => {
                  const asset = getAssetBySymbol(s.symbol);
                  const currency = asset ? tradeUnitOf(asset).currency : 'IDR';
                  return (
                    <li key={s.key} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <strong>{asset?.shortName ?? s.symbol}</strong> ex-date {s.exDate}: {s.shares.toLocaleString('en-US')} shares × {s.perShare.toLocaleString('en-US')} ={' '}
                        <span className="font-mono-num">{currency === 'IDR' ? formatRupiah(s.amount) : `${s.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`}</span> (gross, before tax)
                      </span>
                      <span className="flex gap-1.5">
                        <button type="button" onClick={() => persistDividends([...dividends, { id: `dv-${Date.now().toString(36)}-${s.key.length}`, symbol: s.symbol, exDate: s.exDate, perShare: s.perShare, shares: s.shares, amount: s.amount, currency, source: 'suggested' }])} className="px-2.5 py-1 rounded-lg font-semibold" style={{ backgroundColor: 'var(--accent-radar)', color: '#0B1220' }}>
                          Confirm
                        </button>
                        <button type="button" onClick={() => dismiss(s.key)} className="px-2.5 py-1 rounded-lg border font-semibold" style={{ borderColor: 'var(--border-subtle)' }}>
                          Dismiss
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {eventsState === 'loading' && stockSymbols.length > 0 && <p style={muted}>Checking the dividend history…</p>}
          <DividendForm symbols={symbols} txs={txs} onAdd={(d) => persistDividends([...dividends, d])} />
          {dividends.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap">
                <thead>
                  <tr style={muted}>
                    <th className="py-1.5 pr-2 text-left font-semibold">Stock</th>
                    <th className="py-1.5 pr-2 text-left font-semibold">Ex-date</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Per share</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Shares</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Received</th>
                    <th className="py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {[...dividends].sort((a, b) => b.exDate.localeCompare(a.exDate)).map((d) => (
                    <tr key={d.id} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                      <td className="py-1.5 pr-2 font-semibold">
                        <button type="button" className="hover:underline" onClick={() => onSelectAsset(d.symbol)}>
                          {getAssetBySymbol(d.symbol)?.shortName ?? d.symbol}
                        </button>
                      </td>
                      <td className="py-1.5 pr-2 font-mono-num">{d.exDate}</td>
                      <td className="py-1.5 pr-2 text-right font-mono-num">{d.perShare.toLocaleString('en-US')}</td>
                      <td className="py-1.5 pr-2 text-right font-mono-num">{d.shares.toLocaleString('en-US')}</td>
                      <td className="py-1.5 pr-2 text-right font-mono-num">{d.currency === 'IDR' ? formatRupiah(d.amount) : `${d.amount.toFixed(2)} ${d.currency}`}</td>
                      <td className="py-1.5 text-right">
                        <button type="button" onClick={() => persistDividends(dividends.filter((x) => x.id !== d.id))} className="underline" style={{ color: 'var(--color-down)' }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={muted}>Indonesian cash dividends are usually taxed 10% for individuals — enter the amount you actually received.</p>
        </div>
      )}

      {tab === 'calendar' && (
        <div className="space-y-2 text-xs">
          {stockSymbols.length === 0 ? (
            <p style={muted}>No stocks in the portfolio.</p>
          ) : eventsState === 'loading' ? (
            <p style={muted}>Loading the calendar…</p>
          ) : upcoming.length === 0 ? (
            <p style={muted}>No upcoming ex-dates, dividend payments or earnings reports published for the stocks you hold.</p>
          ) : (
            <ul className="space-y-1.5">
              {upcoming.map((e, i) => (
                <li key={`${e.symbol}-${e.type}-${e.date}-${i}`} className="flex flex-wrap justify-between gap-2 border-t pt-1.5" style={{ borderColor: 'var(--border-subtle)' }}>
                  <span>
                    <span className="font-mono-num font-semibold">{e.date}</span> ·{' '}
                    <button type="button" className="font-semibold hover:underline" onClick={() => onSelectAsset(e.symbol)}>
                      {getAssetBySymbol(e.symbol)?.shortName ?? e.symbol}
                    </button>{' '}
                    · {EVENT_LABELS[e.type]}
                    {e.estimate ? ' (estimated)' : ''}
                  </span>
                  {e.amount ? <span className="font-mono-num">{e.amount.toLocaleString('en-US')} per share</span> : null}
                </li>
              ))}
            </ul>
          )}
          <p style={muted}>Dates from Yahoo Finance; check the company's announcements on idx.co.id before acting on them.</p>
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
        + Record a dividend
      </button>
    );
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const amt = amount.trim() ? Number(amount) : suggested;
    if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(exDate) || !(ps > 0) || !(amt > 0)) {
      setError('Fill in the stock, ex-date, dividend per share and the amount received.');
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
        <span style={muted}>Stock</span>
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="w-full px-2 py-1.5 rounded border" style={inputStyle}>
          {symbols.map((s) => (
            <option key={s} value={s}>
              {getAssetBySymbol(s)?.shortName ?? s}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span style={muted}>Ex-dividend date</span>
        <input type="date" value={exDate} onChange={(e) => setExDate(e.target.value)} className="w-full px-2 py-1.5 rounded border" style={inputStyle} />
      </label>
      <label className="space-y-1">
        <span style={muted}>Payment date (optional)</span>
        <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="w-full px-2 py-1.5 rounded border" style={inputStyle} />
      </label>
      <label className="space-y-1">
        <span style={muted}>Dividend per share</span>
        <input inputMode="decimal" value={perShare} onChange={(e) => setPerShare(e.target.value)} className="w-full px-2 py-1.5 rounded border font-mono-num" style={inputStyle} />
      </label>
      <label className="space-y-1">
        <span style={muted}>Amount received (blank = {suggested ? suggested.toLocaleString('en-US') : 'per share × shares'})</span>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-2 py-1.5 rounded border font-mono-num" style={inputStyle} />
      </label>
      <div className="space-y-1">
        <span style={muted}>Shares held before the ex-date</span>
        <p className="font-mono-num font-semibold py-1.5">{exDate ? shares.toLocaleString('en-US') : '—'}</p>
      </div>
      {error && (
        <p className="sm:col-span-3 font-semibold" role="alert" style={{ color: 'var(--color-down)' }}>
          {error}
        </p>
      )}
      <div className="sm:col-span-3 flex gap-2">
        <button type="submit" className="px-3 py-1.5 rounded-lg font-semibold" style={{ backgroundColor: 'var(--accent-radar)', color: '#0B1220' }}>
          Save dividend
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg border font-semibold" style={{ borderColor: 'var(--border-subtle)' }}>
          Cancel
        </button>
      </div>
    </form>
  );
}
