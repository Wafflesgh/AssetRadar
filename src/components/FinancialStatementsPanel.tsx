/**
 * FinancialStatementsPanel.tsx — "Financial Statements" section on a stock's detail page:
 * annual, semester or quarterly income statement, balance sheet and cash flow for up to 5 years,
 * with ratios (margins, ROE, ROA, DER, current ratio, asset turnover, growth, EPS, P/E, P/B,
 * dividend yield), a revenue / net income bar chart, CSV download and the source of every
 * number. Periods a source skipped are shown as "Not reported". Lazy-loaded (recharts).
 */
import { dateLocale, useT, type TranslationKey } from '../i18n/index.ts';
import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, FileText, RefreshCw } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AssetConfig } from '../config/assets.ts';
import { fetchFinancialStatements, type FinancialStatements } from '../services/marketDataService.ts';
import { LINE_ITEMS, statementsCsv, type PeriodRatios, type Statement, type StatementPeriod, type StatementRow } from '../utils/statements.ts';
import { formatAssetPrice, formatDecimal, formatNumber, getNumberLocale } from '../utils/format.ts';

const PERIODS: Array<{ id: StatementPeriod; perYear: number }> = [
  { id: 'annual', perYear: 1 },
  { id: 'semester', perYear: 2 },
  { id: 'quarterly', perYear: 4 },
];

type Tab = Statement | 'ratios';
const TABS: Tab[] = ['income', 'balance', 'cashflow', 'ratios'];

const compactFmt = () => new Intl.NumberFormat(getNumberLocale(), { notation: 'compact', maximumFractionDigits: 2 });
const COMPACT = { format: (v: number) => compactFmt().format(v) };

function money(value: number, currency: string): string {
  const sign = value < 0 ? '-' : '';
  const body = COMPACT.format(Math.abs(value));
  return currency === 'IDR' ? `${sign}Rp${body}` : currency === 'USD' ? `${sign}$${body}` : `${sign}${body} ${currency}`;
}

const pct = (x: number) => `${formatDecimal(x * 100, 1)}%`;
const times = (x: number, d = 2) => `${formatNumber(x, d)}x`;
const growth = (x: number) => `${x >= 0 ? '+' : ''}${formatNumber(x, 1)}%`;

const RATIOS: Array<{ key: keyof PeriodRatios; fmt: (x: number) => string }> = [
  { key: 'grossMargin', fmt: pct },
  { key: 'operatingMargin', fmt: pct },
  { key: 'netMargin', fmt: pct },
  { key: 'roe', fmt: pct },
  { key: 'roa', fmt: pct },
  { key: 'der', fmt: (x) => times(x) },
  { key: 'currentRatio', fmt: (x) => times(x) },
  { key: 'assetTurnover', fmt: (x) => times(x) },
  { key: 'revenueYoY', fmt: growth },
  { key: 'netIncomeYoY', fmt: growth },
  { key: 'revenueQoQ', fmt: growth },
  { key: 'netIncomeQoQ', fmt: growth },
  { key: 'pe', fmt: (x) => times(x, 1) },
  { key: 'pb', fmt: (x) => times(x, 1) },
  { key: 'dividendYield', fmt: (x) => `${formatNumber(x * 100, 2)}%` },
];


export function FinancialStatementsPanel({ asset }: { asset: AssetConfig }) {
  const [period, setPeriod] = useState<StatementPeriod>('annual');
  const t = useT();
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
            <FileText className="w-4 h-4" style={{ color: 'var(--accent-radar)' }} /> {t('stmt.title')}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {t('stmt.reportedIn', { currency })}
            {data?.fiscalYearEndMonth && data.fiscalYearEndMonth !== 12
              ? t('stmt.fyEnds', { month: new Date(Date.UTC(2000, data.fiscalYearEndMonth - 1, 1)).toLocaleString(dateLocale(), { month: 'long', timeZone: 'UTC' }) })
              : ''}
          </p>
        </div>
        {data?.fScore && (
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full border"
            style={{ borderColor: 'var(--border-subtle)', color: data.fScore.score >= 7 ? 'var(--color-up)' : data.fScore.score <= 3 ? 'var(--color-down)' : 'var(--text-primary)' }}
            title={t('stmt.fscoreTitle')}
          >
            Piotroski F-score {data.fScore.score}/{data.fScore.max}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border overflow-hidden" role="group" aria-label={t('stmt.period')} style={{ borderColor: 'var(--border-subtle)' }}>
          {PERIODS.map((p) => (
            <button key={p.id} type="button" onClick={() => setPeriod(p.id)} aria-pressed={period === p.id} className="px-3 py-1.5 text-xs font-semibold" style={pill(period === p.id)}>
              {t(`stmt.period.${p.id}` as TranslationKey)}
            </button>
          ))}
        </div>
        <label className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
          {t('stmt.show')}
          <select
            value={years}
            onChange={(e) => setYears(Number(e.target.value))}
            className="px-2 py-1.5 rounded-lg border text-xs"
            style={{ backgroundColor: 'var(--bg-canvas)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {t('stmt.lastYears', { n })}
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
          <p>{t('common.dataUnavailable')}</p>
          <button type="button" onClick={() => setReload((r) => r + 1)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--border-subtle)' }}>
            <RefreshCw className="w-3.5 h-3.5" /> {t('common.tryAgain')}
          </button>
        </div>
      ) : !data ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('stmt.loading')}
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('stmt.none', { period: t(`stmt.period.${period}` as TranslationKey).toLowerCase() })}
        </p>
      ) : (
        <>
          {chart.length > 0 && (
            <div className="h-48" aria-label={t('stmt.chartLabel')}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} interval="preserveStartEnd" minTickGap={8} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} tickFormatter={(v: number) => COMPACT.format(v)} width={48} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', fontSize: 11 }}
                    formatter={(v) => (typeof v === 'number' ? money(v, currency) : t('common.notReported'))}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Revenue" name={t('item.revenue')} fill="var(--accent-radar)" isAnimationActive={false} />
                  <Bar dataKey="Net income" name={t('item.netIncome')} fill="var(--color-gold)" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('stmt.statement')}>
            {TABS.map((id) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="px-3 py-1 rounded-full border text-xs font-semibold" style={pill(tab === id)}>
                {t(`stmt.tab.${id}` as TranslationKey)}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-xs font-mono-num border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 text-left py-1.5 pr-3 font-semibold min-w-[140px]" style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
                    {tab === 'ratios' ? t('stmt.ratio') : t('stmt.item')}
                  </th>
                  {columns.map((c) => (
                    <th key={c.end} className="text-right py-1.5 px-2 font-semibold whitespace-nowrap" style={{ color: c.missing ? 'var(--text-secondary)' : 'var(--text-primary)' }} title={t('stmt.periodEnd', { end: c.end })}>
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
                          {t(`item.${item.key}` as TranslationKey)}
                        </td>
                        {columns.map((c) => {
                          const v = c.values[item.key];
                          const src = c.sources[item.key];
                          return (
                            <td
                              key={c.end}
                              className="text-right py-1.5 px-2 border-t whitespace-nowrap"
                              style={{ borderColor: 'var(--border-subtle)', color: v === undefined ? 'var(--text-secondary)' : v < 0 ? 'var(--color-down)' : 'var(--text-primary)' }}
                              title={v === undefined ? t('stmt.notAvailable') : t('stmt.sourceTitle', { source: t(`stmt.src.${src ?? 'yahoo'}` as TranslationKey) })}
                            >
                              {v === undefined
                                ? c.missing
                                  ? t('common.notReported')
                                  : '—'
                                : item.perShare
                                  ? formatNumber(v, 2)
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
                          <td className="sticky left-0 z-10 py-1.5 pr-3 border-t font-sans" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }} title={t(`ratio.${r.key}.hint` as TranslationKey)}>
                            {t(`ratio.${r.key}` as TranslationKey)}
                          </td>
                          {columns.map((c) => {
                            const v = c.ratios[r.key];
                            return (
                              <td key={c.end} className="text-right py-1.5 px-2 border-t whitespace-nowrap" style={{ borderColor: 'var(--border-subtle)', color: typeof v === 'number' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                {typeof v === 'number' ? r.fmt(v) : c.missing ? t('common.notReported') : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      <tr>
                        <td className="sticky left-0 z-10 py-1.5 pr-3 border-t font-sans" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                          {t('stmt.basis')}
                        </td>
                        {columns.map((c) => (
                          <td key={c.end} className="text-right py-1.5 px-2 border-t whitespace-nowrap font-sans" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                            {c.missing ? '—' : t(`stmt.basis.${c.ratios.basis}` as TranslationKey)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="sticky left-0 z-10 py-1.5 pr-3 border-t font-sans" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                          {t('stmt.priceUsed')}
                        </td>
                        {columns.map((c) => (
                          <td key={c.end} className="text-right py-1.5 px-2 border-t whitespace-nowrap" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                            {c.price !== undefined ? `${formatAssetPrice(c.price, asset)}${c.priceKind === 'live' ? t('stmt.live') : ''}` : '—'}
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
                <p>{t('stmt.ratioNote1')}</p>
                <p>
                  {t('stmt.ratioNote2', { when: latest?.priceKind === 'live' ? '' : t('stmt.whenAvailable') })}
                  {data.valuationNote ? ` ${data.valuationNote}` : ''}
                </p>
              </>
            ) : (
              <p>
                <sup>c</sup> {t('stmt.computedNote')}
              </p>
            )}
            <p className="flex flex-wrap gap-x-3 gap-y-1">
              {t('stmt.sources')}
              {data.sources.map((s) => (
                <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1" style={{ color: 'var(--accent-radar)' }}>
                  {s.label} <ExternalLink className="w-3 h-3" />
                </a>
              ))}
            </p>
            <p>{t('stmt.footer')}</p>
          </div>
        </>
      )}
    </section>
  );
}
