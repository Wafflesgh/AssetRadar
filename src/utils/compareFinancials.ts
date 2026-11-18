/** compareFinancials.ts — Three annual periods using the shared statement ratio calculations. */
import { buildStatementRows, type PeriodValues } from './statements.ts';
import { getAssetBySymbol } from '../config/assets.ts';
import us from '../config/sp500.json' with { type: 'json' };

export function financialSector(symbol: string): boolean {
  const asset = getAssetBySymbol(symbol);
  return asset?.sector === 'Financials' || us.stocks.some(r => r[0] === symbol && r[2] === 'Financials');
}
export function compareFinancials(periods: PeriodValues[], fiscalEnd: number, financial: boolean) {
  const value = (v: number | undefined) => v !== undefined && Number.isFinite(v) ? v : null;
  const rows = buildStatementRows(periods.filter(p => p.months === 12), fiscalEnd, { sameCurrency: false })
    .filter(r => !r.missing).slice(-3);
  const metrics = ['revenueYoY', 'netMargin', 'roe', ...(!financial ? ['der'] : []), 'operatingCashFlow'];
  return { financial, metrics, periods: rows.map(r => ({ end: r.end, values: {
    revenueYoY: value(r.ratios.revenueYoY), netMargin: value(r.ratios.netMargin), roe: value(r.ratios.roe),
    der: financial ? null : value(r.ratios.der), operatingCashFlow: value(r.values.operatingCashFlow),
  } as Record<string, number | null> })) };
}
