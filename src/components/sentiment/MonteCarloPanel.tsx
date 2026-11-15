/**
 * MonteCarloPanel.tsx — Detail-page card "Monte Carlo simulation": 2,000 possible price paths for
 * 1 month, 3 months or 1 year, drawn from the asset's own daily moves of the last five years
 * (src/utils/monteCarlo.ts, calculated in the browser from /api/market/daily). Shows the fan of
 * outcomes (middle half and 9 in 10 of the paths, with the middle path), the chance of a 10% dip
 * or rise on the way and the typical worst drop. The past trend is removed, so this shows how wide
 * the outcomes can be, not an expected gain; the disclaimer is always shown.
 */
import { useMemo, useState } from 'react';
import { Dices } from 'lucide-react';
import type { AssetConfig } from '../../config/assets.ts';
import { useSymbolSource } from '../../hooks/useSymbolSource.ts';
import { useT } from '../../i18n/index.ts';
import { fetchDailyHistory } from '../../services/marketDataService.ts';
import { formatAssetPrice, formatDecimal } from '../../utils/format.ts';
import { MC_BLOCK, MC_PATHS, monteCarlo, seedOf } from '../../utils/monteCarlo.ts';

// Crypto trades every day, the rest about 252 days a year
const HORIZONS = [
  { id: 'm1', bars: 21, cryptoBars: 30 },
  { id: 'm3', bars: 63, cryptoBars: 91 },
  { id: 'y1', bars: 252, cryptoBars: 365 },
] as const;
type HorizonId = (typeof HORIZONS)[number]['id'];

const W = 600;
const H = 220;
const PAD = { left: 44, right: 8, top: 10, bottom: 10 };
const signed = (v: number, digits = 1) => `${v > 0 ? '+' : ''}${formatDecimal(v, digits)}%`;
const share = (v: number) => `${formatDecimal(v * 100, 0)}%`;

export function MonteCarloPanel({ asset }: { asset: AssetConfig }) {
  const t = useT();
  const [retry, setRetry] = useState(0);
  const [horizon, setHorizon] = useState<HorizonId>('m3');
  const source = useSymbolSource(asset.symbol, fetchDailyHistory, retry);
  const crypto = asset.group === 'crypto';
  const bars = source.status === 'ready' ? source.data.bars : null;
  const last = bars?.[bars.length - 1];
  const result = useMemo(() => {
    if (!bars || !last) return null;
    const h = HORIZONS.find((x) => x.id === horizon)!;
    return monteCarlo(
      bars.map((b) => b.close),
      crypto ? h.cryptoBars : h.bars,
      seedOf(`${asset.symbol}|${last.date}`)
    );
  }, [bars, last, horizon, crypto, asset.symbol]);

  const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
  const price = (pct: number) => formatAssetPrice(last ? last.close * (1 + pct / 100) : undefined, asset);

  let chart = null;
  if (result) {
    const { p5, p25, p50, p75, p95 } = result.bands;
    const top = Math.max(...p95, 1);
    const bottom = Math.min(...p5, -1);
    const x = (d: number) => PAD.left + (d / result.horizon) * (W - PAD.left - PAD.right);
    const y = (v: number) => PAD.top + ((top - v) / (top - bottom)) * (H - PAD.top - PAD.bottom);
    const line = (band: number[]) => band.map((v, d) => `${x(d).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const area = (upper: number[], lower: number[]) => `${line(upper)} ${[...lower.keys()].reverse().map((d) => `${x(d).toFixed(1)},${y(lower[d]).toFixed(1)}`).join(' ')}`;
    chart = (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" role="img" aria-label={t('mc.chartLabel')}>
        <polygon points={area(p95, p5)} fill="var(--accent-radar)" opacity={0.14} />
        <polygon points={area(p75, p25)} fill="var(--accent-radar)" opacity={0.28} />
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="4 3" />
        <polyline points={line(p50)} fill="none" stroke="var(--accent-radar)" strokeWidth={2} />
        {[top, 0, bottom].map((v) => (
          <text key={v} x={PAD.left - 6} y={y(v) + 3.5} textAnchor="end" fontSize={11} fill="var(--text-secondary)" className="font-mono-num">
            {signed(v, 0)}
          </text>
        ))}
      </svg>
    );
  }

  const tiles: Array<[string, string, string?]> = result
    ? [
        [t('mc.half'), `${signed(result.bands.p25[result.horizon], 0)} … ${signed(result.bands.p75[result.horizon], 0)}`, `${price(result.bands.p25[result.horizon])} – ${price(result.bands.p75[result.horizon])}`],
        [t('mc.range'), `${signed(result.bands.p5[result.horizon], 0)} … ${signed(result.bands.p95[result.horizon], 0)}`, `${price(result.bands.p5[result.horizon])} – ${price(result.bands.p95[result.horizon])}`],
        [t('mc.dip'), share(result.touchDown)],
        [t('mc.rise'), share(result.touchUp)],
        [t('mc.drawdown'), signed(result.medianDrawdown)],
      ]
    : [];

  return (
    <section aria-labelledby="mc-heading" className="p-5 md:p-6 rounded-xl border space-y-4" style={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <Dices size={20} className="shrink-0 mt-0.5" style={{ color: 'var(--accent-radar)' }} aria-hidden="true" />
          <div className="min-w-0">
            <h3 id="mc-heading" className="text-base font-bold">
              {t('mc.title')}
            </h3>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {t('mc.subtitle')}
            </p>
          </div>
        </div>
        <div className="flex gap-1" role="group" aria-label={t('mc.horizon')}>
          {HORIZONS.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => setHorizon(h.id)}
              aria-pressed={horizon === h.id}
              className="px-2.5 py-1 rounded-md text-xs font-semibold"
              style={{ backgroundColor: horizon === h.id ? 'var(--accent-radar)' : 'var(--bg-surface-subtle)', color: horizon === h.id ? 'var(--bg-canvas)' : 'var(--text-primary)' }}
            >
              {t(`mc.h.${h.id}`)}
            </button>
          ))}
        </div>
      </div>

      {source.status === 'loading' ? (
        <div className="skeleton rounded-xl h-56" />
      ) : source.status === 'error' ? (
        <div className="text-sm space-y-2" role="alert">
          <p>{t('common.dataUnavailable')}</p>
          <button type="button" className="btn-accent px-3 py-1.5 rounded-lg text-xs font-semibold" onClick={() => setRetry((n) => n + 1)}>
            {t('common.tryAgain')}
          </button>
        </div>
      ) : !result || !last ? (
        <p className="text-sm">{t('mc.short')}</p>
      ) : (
        <>
          <div className="rounded-xl p-2" style={{ backgroundColor: 'var(--bg-surface-subtle)' }}>
            {chart}
          </div>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {t('mc.legend', { date: last.date, price: formatAssetPrice(last.close, asset) })}
          </p>
          <dl className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {tiles.map(([label, value, sub]) => (
              <div key={label} className="p-3 rounded-lg min-w-0" style={{ backgroundColor: 'var(--bg-surface-subtle)' }}>
                <dt className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {label}
                </dt>
                <dd className="text-base font-bold font-mono-num">{value}</dd>
                {sub && (
                  <dd className="text-[11px] font-mono-num break-words" style={{ color: 'var(--text-secondary)' }}>
                    {sub}
                  </dd>
                )}
              </div>
            ))}
          </dl>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {t('mc.method', { paths: formatDecimal(MC_PATHS, 0), days: formatDecimal(result.sample, 0), block: MC_BLOCK })} {t('sent.disclaimer')}
          </p>
        </>
      )}
    </section>
  );
}
