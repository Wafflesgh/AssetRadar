/**
 * FinancialStatementsPanel.tsx — "Financial Statements" section on a stock's detail page:
 * annual, semester or quarterly income statement, balance sheet and cash flow for up to 5 years,
 * with ratios (margins, ROE, ROA, DER, current ratio, asset turnover, growth, EPS, P/E, P/B,
 * dividend yield), a revenue / net income bar chart, CSV download and the source of every
 * number. Periods a source skipped are shown as "Not reported". Lazy-loaded (recharts).
 */
import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, FileText, RefreshCw } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AssetConfig } from '../config/assets.ts';
import { fetchFinancialStatements, type FinancialStatements } from '../services/marketDataService.ts';
import { LINE_ITEMS, statementsCsv, type PeriodRatios, type Statement, type StatementPeriod, type StatementRow } from '../utils/statements.ts';
import { formatAssetPrice } from '../utils/format.ts';

const PERIODS: Array<{ id: StatementPeriod; label: string; perYear: number }> = [
  { id: 'annual', label: 'Annual', perYear: 1 },
  { id: 'semester', label: 'Semester', perYear: 2 },
  { id: 'quarterly', label: 'Quarterly', perYear: 4 },
];

type Tab = Statement | 'ratios';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'income', label: 'Income' },
  { id: 'balance', label: 'Balance sheet' },
  { id: 'cashflow', label: 'Cash flow' },
  { id: 'ratios', label: 'Ratios' },
];

const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

function money(value: number, currency: string): string {
  const sign = value < 0 ? '-' : '';
  const body = COMPACT.format(Math.abs(value));
  return currency === 'IDR' ? `${sign}Rp${body}` : currency === 'USD' ? `${sign}$${body}` : `${sign}${body} ${currency}`;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const times = (x: number, d = 2) => `${x.toFixed(d)}x`;
const growth = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}%`;

const RATIOS: Array<{ key: keyof PeriodRatios; label: string; fmt: (x: number) => string; hint: string }> = [
  { key: 'grossMargin', label: 'Gross margin', fmt: pct, hint: 'Gross profit ÷ revenue' },
  { key: 'operatingMargin', label: 'Operating margin', fmt: pct, hint: 'Operating income ÷ revenue' },
  { key: 'netMargin', label: 'Net margin', fmt: pct, hint: 'Net income ÷ revenue' },
  { key: 'roe', label: 'ROE', fmt: pct, hint: 'Yearly net income ÷ equity at period end' },
  { key: 'roa', label: 'ROA', fmt: pct, hint: 'Yearly net income ÷ total assets at period end' },
  { key: 'der', label: 'DER', fmt: (x) => times(x), hint: 'Total liabilities ÷ equity' },
  { key: 'currentRatio', label: 'Current ratio', fmt: (x) => times(x), hint: 'Current assets ÷ current liabilities' },
  { key: 'assetTurnover', label: 'Asset turnover', fmt: (x) => times(x), hint: 'Yearly revenue ÷ total assets' },
  { key: 'revenueYoY', label: 'Revenue growth YoY', fmt: growth, hint: 'Versus the same period a year earlier' },
  { key: 'netIncomeYoY', label: 'Net income growth YoY', fmt: growth, hint: 'Versus the same period a year earlier' },
  { key: 'revenueQoQ', label: 'Revenue growth vs previous', fmt: growth, hint: 'Versus the previous quarter / semester' },
  { key: 'netIncomeQoQ', label: 'Net income growth vs previous', fmt: growth, hint: 'Versus the previous quarter / semester' },
  { key: 'pe', label: 'P/E', fmt: (x) => times(x, 1), hint: 'Share price ÷ yearly EPS' },
  { key: 'pb', label: 'P/B', fmt: (x) => times(x, 1), hint: 'Share price × shares ÷ equity' },
  { key: 'dividendYield', label: 'Dividend yield', fmt: (x) => `${(x * 100).toFixed(2)}%`, hint: 'Yearly dividends paid per share ÷ share price' },
];

const SOURCE_LABEL: Record<string, string> = { sec: 'SEC filing', yahoo: 'Yahoo Finance', derived: 'Computed from reported figures' };
const BASIS_LABEL: Record<PeriodRatios['basis'], string> = { annual: 'Full year', ttm: 'Trailing 12 months', annualized: 'Annualized' };

export function FinancialStatementsPanel({ asset }: { asset: AssetConfig }) {
  const [period, setPeriod] = useState<StatementPeriod>('annual');
  const [years, setYears] = useState(5);
  const [tab, setTab] = useState<Tab>('income');
  const [data, setData] = useState<FinancialStatements | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(false);
    fetchFinancialStatements(asset.symbol, period)
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [asset.symbol, period, reload]);

  const perYear = PERIODS.find((p) => p.id === period)?.perYear ?? 1;
  const visible: StatementRow[] = useMemo(() => (data?.rows ?? []).slice(-years * perYear), [data, years, perYear]);
  const columns = useMemo(() => [...visible].reverse(), [visible]); // newest first
  const currency = data?.currency ?? asset.currency;
  const items = LINE_ITEMS.filter((i) => tab !== 'ratios' && i.statement === tab && visible.some((r) => r.values[i.key] !== undefined));
  const ratios = RATIOS.filter((r) => visible.some((row) => typeof row.ratios[r.key] === 'number'));
  const chart = visible.filter((r) => !r.missing).map((r) => ({ label: r.label, Revenue: r.values.revenue ?? r.values.netInterestIncome ?? null, 'Net income': r.values.netIncome ?? null }));
  const latest = [...visible].reverse().find((r) => !r.missing);
  const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };

  const download = () => {
    if (!data) return;
    const blob = new Blob([statementsCsv(visible, currency)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${asset.code}-${period}-statements.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pill = (active: boolean) => ({
    backgroundColor: active ? 'var(--accent-radar)' : 'transparent',
    color: active ? '#fff' : 'var(--text-secondary)',
    borderColor: active ? 'var(--accent-radar)' : 'var(--border-subtle)',
  });

  return (
    <section className="p-4 md:p-5 rounded-xl border space-y-4 min-w-0" style={card} aria-labelledby="statements-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="statements-heading" className="text-base font-bold flex items-center gap-2">
            <FileText className="w-4 h-4" style={{ color: 'var(--accent-radar)' }} /> Financial Statements
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Reported figures in {currency}
            {data?.fiscalYearEndMonth && data.fiscalYearEndMonth !== 12
              ? ` · fiscal year ends in ${new Date(Date.UTC(2000, data.fiscalYearEndMonth - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })}`
              : ''}
          </p>
        </div>
        {data?.fScore && (
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full border"
            style={{ borderColor: 'var(--border-subtle)', color: data.fScore.score >= 7 ? 'var(--color-up)' : data.fScore.score <= 3 ? 'var(--color-down)' : 'var(--text-primary)' }}
            title="Piotroski F-score from the latest two annual reports — details in the Analysis panel"
          >
            Piotroski F-score {data.fScore.score}/{data.fScore.max}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border overflow-hidden" role="group" aria-label="Period" style={{ borderColor: 'var(--border-subtle)' }}>
          {PERIODS.map((p) => (
            <button key={p.id} type="button" onClick={() => setPeriod(p.id)} aria-pressed={period === p.id} className="px-3 py-1.5 text-xs font-semibold" style={pill(period === p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <label className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
          Show
          <select
            value={years}
            onChange={(e) => setYears(Number(e.target.value))}
            className="px-2 py-1.5 rounded-lg border text-xs"
            style={{ backgroundColor: 'var(--bg-canvas)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                last {n} year{n > 1 ? 's' : ''}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={download}
          disabled={!data || visible.length === 0}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-50"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>

      {error ? (
        <div className="text-sm space-y-2" role="alert">
          <p>Data unavailable</p>
          <button type="button" onClick={() => setReload((r) => r + 1)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--border-subtle)' }}>
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      ) : !data ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Loading statements…
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          No {period} figures are available for this company from free sources.
        </p>
      ) : (
        <>
          {chart.length > 0 && (
            <div className="h-48" aria-label="Revenue and net income per period">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} interval="preserveStartEnd" minTickGap={8} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} tickFormatter={(v: number) => COMPACT.format(v)} width={48} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', fontSize: 11 }}
                    formatter={(v) => (typeof v === 'number' ? money(v, currency) : 'Not reported')}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Revenue" fill="var(--accent-radar)" isAnimationActive={false} />
                  <Bar dataKey="Net income" fill="var(--color-gold)" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Statement">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className="px-3 py-1 rounded-full border text-xs font-semibold" style={pill(tab === t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-xs font-mono-num border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 text-left py-1.5 pr-3 font-semibold min-w-[140px]" style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
                    {tab === 'ratios' ? 'Ratio' : 'Item'}
                  </th>
                  {columns.map((c) => (
                    <th key={c.end} className="text-right py-1.5 px-2 font-semibold whitespace-nowrap" style={{ color: c.missing ? 'var(--text-secondary)' : 'var(--text-primary)' }} title={`Period end ${c.end}`}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tab !== 'ratios'
                  ? items.map((item) => (
                      <tr key={item.key}>
                        <td className="sticky left-0 z-10 py-1.5 pr-3 border-t font-sans" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
                          {item.label}
                        </td>
                        {columns.map((c) => {
                          const v = c.values[item.key];
                          const src = c.sources[item.key];
                          return (
                            <td
                              key={c.end}
                              className="text-right py-1.5 px-2 border-t whitespace-nowrap"
                              style={{ borderColor: 'var(--border-subtle)', color: v === undefined ? 'var(--text-secondary)' : v < 0 ? 'var(--color-down)' : 'var(--text-primary)' }}
                              title={v === undefined ? 'Not reported / not available' : `Source: ${SOURCE_LABEL[src ?? 'yahoo']}`}
                            >
                              {v === undefined
                                ? c.missing
                                  ? 'Not reported'
                                  : '—'
                                : item.perShare
                                  ? v.toFixed(2)
                                  : item.key === 'shares'
                                    ? COMPACT.format(v)
                                    : money(v, currency)}
                              {src === 'derived' && <sup style={{ color: 'var(--text-secondary)' }}>c</sup>}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  : (
                    <>
                      {ratios.map((r) => (
                        <tr key={r.key}>
                          <td className="sticky left-0 z-10 py-1.5 pr-3 border-t font-sans" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }} title={r.hint}>
                            {r.label}
                          </td>
                          {columns.map((c) => {
                            const v = c.ratios[r.key];
                            return (
                              <td key={c.end} className="text-right py-1.5 px-2 border-t whitespace-nowrap" style={{ borderColor: 'var(--border-subtle)', color: typeof v === 'number' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                {typeof v === 'number' ? r.fmt(v) : c.missing ? 'Not reported' : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      <tr>
                        <td className="sticky left-0 z-10 py-1.5 pr-3 border-t font-sans" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                          Basis for yearly ratios
                        </td>
                        {columns.map((c) => (
                          <td key={c.end} className="text-right py-1.5 px-2 border-t whitespace-nowrap font-sans" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                            {c.missing ? '—' : BASIS_LABEL[c.ratios.basis]}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="sticky left-0 z-10 py-1.5 pr-3 border-t font-sans" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                          Share price used
                        </td>
                        {columns.map((c) => (
                          <td key={c.end} className="text-right py-1.5 px-2 border-t whitespace-nowrap" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                            {c.price !== undefined ? `${formatAssetPrice(c.price, asset)}${c.priceKind === 'live' ? ' (live)' : ''}` : '—'}
                          </td>
                        ))}
                      </tr>
                    </>
                  )}
              </tbody>
            </table>
          </div>

          <div className="text-[11px] space-y-1" style={{ color: 'var(--text-secondary)' }}>
            {tab === 'ratios' ? (
              <>
                <p>
                  ROE, ROA, asset turnover, P/E and dividend yield need a yearly figure. For quarters and semesters they use the trailing 12 months when all
                  periods are reported; otherwise the period is annualized (quarter × 4, semester × 2), which ignores seasonality.
                </p>
                <p>
                  Valuation ratios use the live share price for the latest period
                  {latest?.priceKind === 'live' ? '' : ' (when available)'} and the month-end closing price for older periods.
                  {data.valuationNote ? ` ${data.valuationNote}` : ''}
                </p>
              </>
            ) : (
              <p>
                <sup>c</sup> computed from reported figures (for example the fourth quarter = full year − first nine months, a semester = two quarters, free
                cash flow = operating cash flow − capex). "Not reported" = the source has no figures for that period; "—" = item not reported.
              </p>
            )}
            <p className="flex flex-wrap gap-x-3 gap-y-1">
              Sources:
              {data.sources.map((s) => (
                <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1" style={{ color: 'var(--accent-radar)' }}>
                  {s.label} <ExternalLink className="w-3 h-3" />
                </a>
              ))}
            </p>
            <p>Figures as reported by the company; information only, not investment advice.</p>
          </div>
        </>
      )}
    </section>
  );
}
