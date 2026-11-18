/** PortfolioCosts.tsx — Recorded fees by currency, period and asset in the Positions tab. */
import { useMemo, useState } from 'react';
import { useT } from '../i18n/index.ts';
import { assetName } from '../i18n/assetNames.ts';
import { getAssetBySymbol } from '../config/assets.ts';
import type { PortfolioTx } from '../utils/portfolio.ts';
import { txCosts, type CostRow } from '../utils/txCosts.ts';
import { formatNumber, formatPrice } from '../utils/format.ts';

export function PortfolioCosts({ txs }: { txs: PortfolioTx[] }) {
  const t = useT();
  const [year, setYear] = useState('');
  const all = useMemo(() => txCosts(txs), [txs]);
  const years = [...new Set(all.currencies.flatMap(c => c.years.map(y => y.key)))].sort().reverse();
  const selectedYear = years.includes(year) ? year : '';
  const result = useMemo(() => selectedYear ? txCosts(txs.filter(tx => tx.date.startsWith(`${selectedYear}-`))) : all,
    [txs, selectedYear, all]);
  const unavailable = t('costs.unavailable');
  const number = (value: number | null) => value !== null && Number.isFinite(value) ? formatNumber(value, 2) : unavailable;
  const money = (value: number | null, currency: string) => value !== null && Number.isFinite(value) ? formatPrice(value, currency) : unavailable;
  const table = (title: string, rows: CostRow[], currency: string, assets = false) => (
    <div className="min-w-0">
      <h4 className="font-semibold mb-2">{title}</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{title}</caption>
          <thead><tr className="text-left" style={{ color: 'var(--text-secondary)' }}>
            <th scope="col" className="py-2 pr-2">{assets ? t('costs.asset') : t('costs.period')}</th>
            <th scope="col" className="py-2 px-2 text-right">{t('costs.fees')}</th>
            <th scope="col" className="py-2 pl-2 text-right">{t('costs.percent')}</th>
          </tr></thead>
          <tbody>{rows.map(row => {
            const asset = assets ? getAssetBySymbol(row.key) : undefined;
            return <tr key={row.key} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <th scope="row" className="py-2 pr-2 text-left font-normal">{asset ? assetName(asset) : row.key}</th>
              <td className="py-2 px-2 text-right font-mono-num">{money(row.fees, currency)}</td>
              <td className="py-2 pl-2 text-right font-mono-num">{number(row.feePct)}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </div>
  );
  return (
    <section className="rounded-xl border p-4 space-y-4 min-w-0" aria-labelledby="costs-heading"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <h2 id="costs-heading" className="text-base font-bold">{t('costs.title')}</h2>
        <label className="flex items-center gap-2 text-sm">
          {t('costs.year')}
          <select value={selectedYear} onChange={e => setYear(e.target.value)} className="rounded-lg border px-3 min-h-11 text-base"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
            <option value="">{t('costs.allYears')}</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('costs.note')}</p>
      {all.excluded > 0 && <p className="text-sm">{t('costs.excluded', { count: all.excluded })}</p>}
      {result.currencies.length === 0 && <p className="text-sm">{txs.length === 0 ? t('costs.empty') : unavailable}</p>}
      {result.currencies.map(c => (
        <div key={c.currency} className="space-y-4 border-t pt-4" style={{ borderColor: 'var(--border-subtle)' }}>
          <h3 className="font-bold">{t('costs.currency', { currency: c.currency })}</h3>
          <dl className="grid gap-3 sm:grid-cols-3 text-sm">
            <div><dt>{t('costs.fees')}</dt><dd className="font-mono-num font-semibold">{money(c.fees, c.currency)}</dd></div>
            <div><dt>{t('costs.traded')}</dt><dd className="font-mono-num">{money(c.tradedValue, c.currency)}</dd></div>
            <div><dt>{t('costs.percent')}</dt><dd className="font-mono-num">{number(c.feePct)}</dd></div>
          </dl>
          <div className="grid gap-5 lg:grid-cols-3">
            {table(t('costs.months'), c.months, c.currency)}
            {table(t('costs.years'), c.years, c.currency)}
            {table(t('costs.assets'), c.assets, c.currency, true)}
          </div>
        </div>
      ))}
    </section>
  );
}
