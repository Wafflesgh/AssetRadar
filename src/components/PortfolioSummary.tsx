/** PortfolioSummary.tsx — Existing valuations, concentration and quote-based portfolio overview. */
import type { PriceTick } from '../config/assets.ts';
import { concentration, type ConcentrationPosition } from '../utils/concentration.ts';
import { portfolioChange } from '../utils/portfolioChange.ts';
import { formatPercent, formatRupiah } from '../utils/format.ts';
import { useT } from '../i18n/index.ts';

export function PortfolioSummary({ positions, ticks, total, realized, unrealized, onSelectAsset }: {
  positions: ConcentrationPosition[]; ticks: Record<string, PriceTick>; total: number; realized: number; unrealized: number;
  onSelectAsset: (symbol: string) => void;
}) {
  const t = useT();
  const change = portfolioChange(positions.map(({ asset, v }) => ({ valueIdr: v.marketValueIdr, changePct24h: ticks[asset.symbol]?.status === 'error' ? undefined : ticks[asset.symbol]?.changePct24h })));
  const level = concentration(positions).asset.level;
  const stale = positions.filter(({ asset }) => { const tick = ticks[asset.symbol]; return !tick || tick.fromSnapshot || tick.status === 'error' || Date.now() - tick.updatedAt > 15 * 60_000; });
  const movers = positions.filter(({ asset }) => { const tick = ticks[asset.symbol]; return tick && tick.status !== 'error' && Number.isFinite(tick.changePct24h); });
  return <section className="space-y-4">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[[t('pf.value'), formatRupiah(total, 0)], [t('pft.change'), change.total === null ? t('common.dataUnavailable') : formatRupiah(change.total, 0)],
        [t('pft.totalPl'), formatRupiah(unrealized + realized, 0)], [t('pf.realized'), formatRupiah(realized, 0)]].map(([label, value]) =>
        <div key={label} className="p-3 rounded-xl border min-w-0" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}><div className="text-xs">{label}</div><div className="font-bold break-words">{value}</div></div>)}
    </div>
    <p className="text-xs">{t('pft.changeNote', { n: change.excluded })}</p>
    <p className="text-sm">{t('pft.concentrationNote', { level: level ? t(`conc.level.${level}`) : t('common.dataUnavailable') })}</p>
    <p className="text-xs">{t('pft.stale', { n: stale.length })}</p>
    <div className="grid sm:grid-cols-2 gap-4">{(['up', 'down'] as const).map(direction => {
      const rows = movers.filter(({ asset }) => direction === 'up' ? ticks[asset.symbol].changePct24h! > 0 : ticks[asset.symbol].changePct24h! < 0)
        .sort((a, b) => (ticks[a.asset.symbol].changePct24h! - ticks[b.asset.symbol].changePct24h!) * (direction === 'up' ? -1 : 1)).slice(0, 3);
      return <div key={direction}><h3 className="font-semibold">{t(`pft.${direction}`)}</h3>{rows.length ? rows.map(({ asset }) => <button key={asset.symbol} type="button" className="block min-h-11 text-sm" onClick={() => onSelectAsset(asset.symbol)}>{asset.shortName} · {formatPercent(ticks[asset.symbol].changePct24h)}</button>) : <p className="text-sm">{t('common.dataUnavailable')}</p>}</div>;
    })}</div>
  </section>;
}
