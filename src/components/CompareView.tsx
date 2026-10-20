/**
 * CompareView.tsx — Compare page (#/compare?s=BBCA,BBRI,BMRI): 2–4 assets picked with the search
 * box; a performance chart rebased to 100 (1M/3M/1Y/3Y/5Y, each asset in its own currency, so
 * the comparison is in %); a table of live price and changes; and for stocks the main statement
 * lines and ratios side by side (annual or quarterly, figures in each company's reporting
 * currency with a label). Information only, not a recommendation.
 */
import { useEffect, useMemo, useState } from 'react';
import { GitCompare, RefreshCw, X } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getAssetBySymbol, type PriceTick } from '../config/assets.ts';
import { fetchDailyHistory, fetchFinancialStatements, type DailyHistory, type FinancialStatements } from '../services/marketDataService.ts';
import { COMPARE_PERIODS, MAX_COMPARE, normalizeSeries, periodReturns, periodStart, type ComparePeriod } from '../utils/compare.ts';
import { formatAssetPrice, getNumberLocale } from '../utils/format.ts';
import { t as tr, useT, type TranslationKey } from '../i18n/index.ts';
import { assetShortName } from '../i18n/assetNames.ts';
import { useTrackedSymbols } from '../hooks/useTrackedSymbols.ts';
import { AssetSearch } from './AssetSearch.tsx';

export const SERIES_COLORS = ['#38BDF8', '#F59E0B', '#A78BFA', '#34D399'];
const STOCKS = new Set(['idStock', 'usStock', 'globalStock']);
const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
const muted = { color: 'var(--text-secondary)' };

function compact(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return tr('common.notReported');
  const a = Math.abs(v);
  const [d, s] = a >= 1e12 ? [1e12, 'T'] : a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : [1, ''];
  return `${(v / d).toLocaleString(getNumberLocale(), { maximumFractionDigits: 2 })}${s}`;
}
const pctOf = (v: number | undefined, factor = 100) => (v === undefined || !Number.isFinite(v) ? tr('common.notReported') : `${(v * factor).toFixed(1)}%`);
const times = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? tr('common.notReported') : `${v.toFixed(2)}×`);
const signed = (v: number | null | undefined, digits = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`);

type Loaded<T> = { state: 'loading' } | { state: 'error' } | { state: 'ready'; data: T };

interface CompareViewProps {
  symbols: string[];
  ticks: Record<string, PriceTick>;
  onChange: (symbols: string[]) => void;
  onSelectAsset: (symbol: string) => void;
}

export function CompareView({ symbols, ticks, onChange, onSelectAsset }: CompareViewProps) {
  const t = useT();
  const nameOf = (sym: string) => {
    const a = getAssetBySymbol(sym);
    return a ? assetShortName(a) : sym;
  };
  const [period, setPeriod] = useState<ComparePeriod>('1Y');
  const [statementPeriod, setStatementPeriod] = useState<'annual' | 'quarterly'>('annual');
  const [history, setHistory] = useState<Record<string, Loaded<DailyHistory>>>({});
  const [statements, setStatements] = useState<Record<string, Loaded<FinancialStatements>>>({});
  const [retry, setRetry] = useState(0);
  useTrackedSymbols(symbols);

  const assets = symbols.map((s) => getAssetBySymbol(s)).filter((a): a is NonNullable<typeof a> => Boolean(a));
  const stocks = assets.filter((a) => STOCKS.has(a.group));

  useEffect(() => {
    let alive = true;
    for (const s of symbols) {
      setHistory((h) => (h[s]?.state === 'ready' ? h : { ...h, [s]: { state: 'loading' } }));
      fetchDailyHistory(s)
        .then((data) => alive && setHistory((h) => ({ ...h, [s]: { state: 'ready', data } })))
        .catch(() => alive && setHistory((h) => ({ ...h, [s]: { state: 'error' } })));
    }
    return () => {
      alive = false;
    };
  }, [symbols.join(','), retry]);

  useEffect(() => {
    let alive = true;
    for (const a of stocks) {
      const key = `${a.symbol}|${statementPeriod}`;
      setStatements((st) => (st[key]?.state === 'ready' ? st : { ...st, [key]: { state: 'loading' } }));
      fetchFinancialStatements(a.symbol, statementPeriod)
        .then((data) => alive && setStatements((st) => ({ ...st, [key]: { state: 'ready', data } })))
        .catch(() => alive && setStatements((st) => ({ ...st, [key]: { state: 'error' } })));
    }
    return () => {
      alive = false;
    };
  }, [stocks.map((a) => a.symbol).join(','), statementPeriod, retry]);

  const ready = symbols.filter((s) => history[s]?.state === 'ready');
  const failed = symbols.filter((s) => history[s]?.state === 'error');
  const chart = useMemo(() => {
    const series = ready.map((s) => ({ symbol: s, bars: (history[s] as { data: DailyHistory }).data.bars }));
    if (series.length < 1) return [];
    const lastDate = series.map((x) => x.bars[x.bars.length - 1]?.date ?? '').sort().at(-1) ?? '';
    return normalizeSeries(series, periodStart(period, lastDate));
  }, [ready.join(','), period, history]);
  const returns = periodReturns(chart);
  const chartData = chart.map((p) => ({ date: p.date, ...p.values }));

  const add = (symbol: string) => {
    if (!symbols.includes(symbol) && symbols.length < MAX_COMPARE) onChange([...symbols, symbol]);
  };
  const remove = (symbol: string) => onChange(symbols.filter((s) => s !== symbol));

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
          <GitCompare className="w-5 h-5" style={{ color: 'var(--accent-radar)' }} /> {t('cmp.title')}
        </h1>
        <p className="text-sm" style={muted}>
          {t('cmp.intro')}
        </p>
      </header>

      <section className="p-3 md:p-4 rounded-xl border space-y-3" style={card}>
        <div className="flex flex-wrap gap-2">
          {assets.map((a, i) => (
            <span key={a.symbol} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full border text-xs font-semibold" style={{ borderColor: SERIES_COLORS[i] }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SERIES_COLORS[i] }} aria-hidden="true" />
              <button type="button" onClick={() => onSelectAsset(a.symbol)} className="hover:underline">
                {assetShortName(a)}
              </button>
              <button type="button" onClick={() => remove(a.symbol)} aria-label={t('cmp.remove', { name: assetShortName(a) })} className="p-0.5 rounded-full" style={muted}>
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
        {symbols.length < MAX_COMPARE ? (
          <AssetSearch onSelect={(a) => add(a.symbol)} ticks={ticks} label={t('cmp.addLabel')} placeholder={t('cmp.addPh', { n: symbols.length, max: MAX_COMPARE })} limit={6} />
        ) : (
          <p className="text-xs" style={muted}>
            {t('cmp.max', { max: MAX_COMPARE })}
          </p>
        )}
      </section>

      {symbols.length < 2 && (
        <p className="text-sm p-4 rounded-xl border" style={card}>
          {t('cmp.pick')} <code className="mx-1">CMP BBCA BBRI</code>.
        </p>
      )}

      {symbols.length >= 1 && (
        <section className="p-3 md:p-4 rounded-xl border space-y-3" style={card} aria-labelledby="cmp-perf">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="cmp-perf" className="text-base font-bold">
              {t('cmp.perf')}
            </h2>
            <div className="flex gap-1" role="group" aria-label={t('stmt.period')}>
              {COMPARE_PERIODS.map((p) => (
                <button key={p.key} type="button" onClick={() => setPeriod(p.key)} aria-pressed={period === p.key} className="px-2.5 py-1 rounded-md text-xs font-semibold font-mono-num border" style={{ borderColor: period === p.key ? 'var(--accent-radar)' : 'var(--border-subtle)', color: period === p.key ? 'var(--accent-radar)' : 'var(--text-primary)' }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {failed.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span style={{ color: 'var(--color-down)' }}>{t('cmp.unavailableFor', { names: failed.map(nameOf).join(', ') })}</span>
              <button type="button" onClick={() => setRetry((n) => n + 1)} className="inline-flex items-center gap-1 px-2 py-1 rounded border font-semibold" style={{ borderColor: 'var(--border-subtle)' }}>
                <RefreshCw className="w-3 h-3" /> {t('common.tryAgain')}
              </button>
            </div>
          )}
          {chartData.length > 1 ? (
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 8, bottom: 0, left: -10 }}>
                  <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} minTickGap={40} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', fontSize: 12 }}
                    formatter={(v, name) => [Number(v).toFixed(1), nameOf(String(name))]}
                  />
                  <Legend formatter={(name) => nameOf(String(name))} wrapperStyle={{ fontSize: 12 }} />
                  {ready.map((s) => (
                    <Line key={s} type="monotone" dataKey={s} dot={false} strokeWidth={2} stroke={SERIES_COLORS[symbols.indexOf(s)]} isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            symbols.some((s) => history[s]?.state === 'loading') && <p className="text-sm" style={muted}>{t('cmp.loadingHistory')}</p>
          )}
          <p className="text-[11px]" style={muted}>
            {t('cmp.closes')}
            {ready.length ? ` (${[...new Set(ready.map((s) => (history[s] as { data: DailyHistory }).data.source))].join(', ')})` : ''}. {t('cmp.closesNote')}
          </p>
        </section>
      )}

      {assets.length > 0 && (
        <section className="rounded-xl border overflow-x-auto" style={card} aria-label={t('cmp.pricesLabel')}>
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr style={muted}>
                <th className="p-2 text-left font-semibold">{t('cmp.asset')}</th>
                <th className="p-2 text-right font-semibold">{t('cmp.price')}</th>
                <th className="p-2 text-right font-semibold">24h</th>
                <th className="p-2 text-right font-semibold">7d</th>
                <th className="p-2 text-right font-semibold">30d</th>
                <th className="p-2 text-right font-semibold">{t('cmp.periodChart', { period })}</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a, i) => {
                const tick = ticks[a.symbol];
                const ok = tick && tick.status !== 'error' && Number.isFinite(tick.price);
                return (
                  <tr key={a.symbol} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    <td className="p-2 font-semibold">
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: SERIES_COLORS[i] }} aria-hidden="true" />
                      {assetShortName(a)} <span style={muted}>· {a.currency === 'USX' ? 'USD' : a.currency}</span>
                    </td>
                    <td className="p-2 text-right font-mono-num">{ok ? formatAssetPrice(tick.price, a) : t('common.dataUnavailable')}</td>
                    <td className="p-2 text-right font-mono-num">{signed(ok ? tick.changePct24h : null)}</td>
                    <td className="p-2 text-right font-mono-num">{signed(ok ? tick.changePct7d : null)}</td>
                    <td className="p-2 text-right font-mono-num">{signed(ok ? tick.changePct30d : null)}</td>
                    <td className="p-2 text-right font-mono-num">{signed(returns[a.symbol])}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {stocks.length > 0 && (
        <section className="p-3 md:p-4 rounded-xl border space-y-3" style={card} aria-labelledby="cmp-fund">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="cmp-fund" className="text-base font-bold">
              {statementPeriod === 'annual' ? t('cmp.fsYear') : t('cmp.fsQuarter')}
            </h2>
            <div className="flex gap-1" role="group" aria-label={t('cmp.fsPeriod')}>
              {(['annual', 'quarterly'] as const).map((p) => (
                <button key={p} type="button" onClick={() => setStatementPeriod(p)} aria-pressed={statementPeriod === p} className="px-2.5 py-1 rounded-md text-xs font-semibold border" style={{ borderColor: statementPeriod === p ? 'var(--accent-radar)' : 'var(--border-subtle)', color: statementPeriod === p ? 'var(--accent-radar)' : 'var(--text-primary)' }}>
                  {p === 'annual' ? t('stmt.period.annual') : t('stmt.period.quarterly')}
                </button>
              ))}
            </div>
          </div>
          <StatementsTable stocks={stocks.map((a) => ({ symbol: a.symbol, name: assetShortName(a), color: SERIES_COLORS[symbols.indexOf(a.symbol)], loaded: statements[`${a.symbol}|${statementPeriod}`] }))} />
          <p className="text-[11px]" style={muted}>
            {t('cmp.fsNote')}
          </p>
        </section>
      )}
    </div>
  );
}

function StatementsTable({ stocks }: { stocks: Array<{ symbol: string; name: string; color: string; loaded?: Loaded<FinancialStatements> }> }) {
  const t = useT();
  const L = (key: string) => t(key as TranslationKey);
  const latest = stocks.map((s) => {
    if (s.loaded?.state !== 'ready') return null;
    const rows = s.loaded.data.rows.filter((r) => !r.missing);
    return rows[rows.length - 1] ?? null;
  });
  const lines: Array<{ label: string; get: (i: number) => string }> = [
    { label: L('stmt.period'), get: (i) => latest[i]?.label ?? '—' },
    { label: L('item.revenue'), get: (i) => compact(latest[i]?.values.revenue ?? latest[i]?.values.netInterestIncome) },
    { label: L('item.netIncome'), get: (i) => compact(latest[i]?.values.netIncome) },
    { label: L('item.totalAssets'), get: (i) => compact(latest[i]?.values.totalAssets) },
    { label: L('item.equity'), get: (i) => compact(latest[i]?.values.equity) },
    { label: L('ratio.grossMargin'), get: (i) => pctOf(latest[i]?.ratios.grossMargin) },
    { label: L('ratio.netMargin'), get: (i) => pctOf(latest[i]?.ratios.netMargin) },
    { label: L('ratio.roe'), get: (i) => pctOf(latest[i]?.ratios.roe) },
    { label: L('ratio.der'), get: (i) => times(latest[i]?.ratios.der) },
    { label: L('ratio.pe'), get: (i) => times(latest[i]?.ratios.pe) },
    { label: L('ratio.pb'), get: (i) => times(latest[i]?.ratios.pb) },
    { label: L('ratio.dividendYield'), get: (i) => pctOf(latest[i]?.ratios.dividendYield) },
    { label: L('ratio.revenueYoY'), get: (i) => pctOf(latest[i]?.ratios.revenueYoY, 1) },
    { label: L('ratio.netIncomeYoY'), get: (i) => pctOf(latest[i]?.ratios.netIncomeYoY, 1) },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs whitespace-nowrap">
        <thead>
          <tr>
            <th className="p-2 text-left font-semibold" style={muted}>
              {t('stmt.item')}
            </th>
            {stocks.map((s) => (
              <th key={s.symbol} className="p-2 text-right font-semibold">
                <span style={{ color: s.color }}>{s.name}</span>
                <span className="block font-normal" style={muted}>
                  {s.loaded?.state === 'ready' ? s.loaded.data.currency : s.loaded?.state === 'error' ? t('common.dataUnavailable') : t('common.loading')}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.label} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <td className="p-2" style={muted}>
                {line.label}
              </td>
              {stocks.map((s, i) => {
                const text = latest[i] ? line.get(i) : s.loaded?.state === 'error' ? '—' : '…';
                const missing = text === t('common.notReported');
                return (
                  <td key={s.symbol} className={`p-2 text-right ${missing ? 'text-[10px]' : 'font-mono-num'}`} style={missing ? muted : undefined}>
                    {text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
