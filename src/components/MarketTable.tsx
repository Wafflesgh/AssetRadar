/**
 * MarketTable.tsx — Compact market table in the companiesmarketcap.com style: rank, asset,
 * live price (flashes on change), 1h / 24h / 7d change, market cap, a 24h mini chart and the
 * watchlist star. Columns collapse on small screens (375px shows asset, price, 24h, star).
 */
import { useT } from '../i18n/index.ts';
import { assetName } from '../i18n/assetNames.ts';
import { RefreshCw, Star } from 'lucide-react';
import type { AssetConfig, PriceTick, SparklinePoint } from '../config/assets.ts';
import { formatPercent, formatRupiah, formatTickPrice, formatUsdCompact } from '../utils/format.ts';
import { flashClass, type Flash } from '../hooks/usePriceFlash.ts';

interface MarketTableProps {
  assets: AssetConfig[];
  ticks: Record<string, PriceTick>;
  flash: Record<string, Flash>;
  watchlist: string[];
  onSelect: (symbol: string) => void;
  onToggleWatchlist: (symbol: string) => void;
  onRetry: (symbol: string) => void;
  /** Rank shown in the first column = rankStart + row index. */
  rankStart?: number;
  showMarketCap?: boolean;
  caption: string;
}

export function MarketTable({
  assets,
  ticks,
  flash,
  watchlist,
  onSelect,
  onToggleWatchlist,
  onRetry,
  rankStart = 1,
  showMarketCap = true,
  caption,
}: MarketTableProps) {
  const t = useT();
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
    >
      <table className="w-full text-sm table-fixed sm:table-auto">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr
            className="text-[11px] uppercase tracking-wide text-left"
            style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-surface-subtle)' }}
          >
            <th scope="col" className="px-3 py-2 font-semibold w-10 hidden sm:table-cell">#</th>
            <th scope="col" className="px-2 sm:px-3 py-2 font-semibold">{t('table.asset')}</th>
            <th scope="col" className="px-2 sm:px-3 py-2 font-semibold text-right w-[46%] sm:w-auto">{t('table.price')}</th>
            <th scope="col" className="px-3 py-2 font-semibold text-right hidden md:table-cell">1H</th>
            <th scope="col" className="px-2 sm:px-3 py-2 font-semibold text-right w-[20%] sm:w-auto">24H</th>
            <th scope="col" className="px-3 py-2 font-semibold text-right hidden sm:table-cell">7D</th>
            {showMarketCap && (
              <th scope="col" className="px-3 py-2 font-semibold text-right hidden lg:table-cell">{t('table.marketCap')}</th>
            )}
            <th scope="col" className="px-3 py-2 font-semibold hidden md:table-cell">{t('table.chart24h')}</th>
            <th scope="col" className="px-1 py-2 w-9">
              <span className="sr-only">{t('table.watchlist')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset, idx) => {
            const tick = ticks[asset.symbol];
            const usable = tick !== undefined && tick.status !== 'error' && Number.isFinite(tick.price);
            const starred = watchlist.includes(asset.symbol);
            const f = flash[asset.symbol];
            return (
              <tr
                key={asset.id}
                onClick={() => onSelect(asset.symbol)}
                className="border-t cursor-pointer transition-colors hover:bg-[var(--bg-surface-subtle)]"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <td className="px-3 py-2.5 text-xs hidden sm:table-cell font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                  {rankStart + idx}
                </td>
                <td className="px-2 sm:px-3 py-2.5 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <StatusDot tick={tick} />
                    <span className="font-bold font-mono-num text-[13px] truncate">{asset.code}</span>
                  </div>
                  <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }} title={assetName(asset)}>
                    {assetName(asset)}
                  </div>
                </td>
                {usable ? (
                  <>
                    <td
                      key={`p-${f?.n ?? 0}`}
                      className={`px-2 sm:px-3 py-2.5 text-right font-mono-num font-semibold tabular-nums whitespace-nowrap text-xs sm:text-[13px] ${flashClass(f)}`}
                    >
                      {/* The unit (/oz, /bbl) goes on its own small line so long Rupiah prices fit at 375px */}
                      <span className="block truncate" title={formatTickPrice(tick, asset)}>
                        {formatTickPrice(tick, asset)}
                      </span>
                      {asset.unit ? (
                        <span className="block text-[10px] font-normal" style={{ color: 'var(--text-secondary)' }}>
                          {t('table.per', { unit: asset.unit.replace('/', '') })}
                        </span>
                      ) : null}
                      {asset.symbol === 'XAU/USD' && tick.priceIdrPerGram ? (
                        <span className="block text-[10px] font-normal" style={{ color: 'var(--text-secondary)' }}>
                          {formatRupiah(tick.priceIdrPerGram, 0)}/gr
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-right hidden md:table-cell">
                      <Pct value={tick.changePct1h} />
                    </td>
                    <td className="px-2 sm:px-3 py-2.5 text-right">
                      <Pct value={tick.changePct24h} bold />
                    </td>
                    <td className="px-3 py-2.5 text-right hidden sm:table-cell">
                      <Pct value={tick.changePct7d} />
                    </td>
                    {showMarketCap && (
                      <td className="px-3 py-2.5 text-right font-mono-num text-xs hidden lg:table-cell tabular-nums">
                        {formatUsdCompact(tick.marketCapUsd)}
                      </td>
                    )}
                    <td className="px-3 py-1.5 hidden md:table-cell">
                      <MiniSpark data={tick.sparkline} up={(tick.changePct24h ?? 0) >= 0} />
                    </td>
                  </>
                ) : (
                  <td colSpan={showMarketCap ? 6 : 5} className="px-3 py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {tick?.status === 'error' ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span style={{ color: 'var(--color-down)' }}>{t('common.dataUnavailable')}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRetry(asset.symbol);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold"
                          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                        >
                          <RefreshCw className="w-3 h-3" /> {t('common.tryAgain')}
                        </button>
                      </span>
                    ) : (
                      t('common.loading')
                    )}
                  </td>
                )}
                <td className="px-1 py-2.5 text-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleWatchlist(asset.symbol);
                    }}
                    aria-label={starred ? t('table.removeWatch', { name: assetName(asset) }) : t('table.addWatch', { name: assetName(asset) })}
                    aria-pressed={starred}
                    className="p-1 rounded"
                    style={{ color: starred ? 'var(--color-gold)' : 'var(--text-secondary)' }}
                  >
                    <Star className="w-4 h-4" fill={starred ? 'currentColor' : 'none'} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Live (green), delayed/closed (grey) or saved offline data (amber). */
function StatusDot({ tick }: { tick?: PriceTick }) {
  const t = useT();
  const state = !tick
    ? { color: 'var(--border-subtle)', label: t('status.loading') }
    : tick.fromSnapshot
      ? { color: 'var(--color-gold)', label: t('status.offline') }
      : tick.status === 'error'
        ? { color: 'var(--color-down)', label: t('status.unavailable') }
        : tick.isMarketOpen === false
          ? { color: 'var(--text-secondary)', label: t('status.closed') }
          : tick.status === 'live'
            ? { color: 'var(--accent-radar)', label: t('status.live') }
            : { color: 'var(--text-secondary)', label: t('status.delayed') };
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
      style={{ backgroundColor: state.color }}
      title={state.label}
      aria-label={state.label}
      role="img"
    />
  );
}

export function Pct({ value, bold = false }: { value?: number; bold?: boolean }) {
  const color =
    value === undefined || !Number.isFinite(value) || value === 0
      ? 'var(--text-secondary)'
      : value > 0
        ? 'var(--color-up)'
        : 'var(--color-down)';
  return (
    <span className={`font-mono-num tabular-nums text-xs whitespace-nowrap ${bold ? 'font-bold' : ''}`} style={{ color }}>
      {formatPercent(value)}
    </span>
  );
}

/** Tiny inline SVG line chart (cheap enough for 100+ rows). */
export function MiniSpark({ data, up, width = 96, height = 28 }: { data?: SparklinePoint[]; up: boolean; width?: number; height?: number }) {
  if (!data || data.length < 2) {
    return <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>—</span>;
  }
  let min = Infinity;
  let max = -Infinity;
  for (const p of data) {
    if (p.value < min) min = p.value;
    if (p.value > max) max = p.value;
  }
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const points = data
    .map((p, i) => `${(i * step).toFixed(1)},${(height - 2 - ((p.value - min) / span) * (height - 4)).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="block">
      <polyline
        points={points}
        fill="none"
        stroke={up ? 'var(--color-up)' : 'var(--color-down)'}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
