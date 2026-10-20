/**
 * TechnicalLevelsPanel.tsx — Detail-page card "Technical ranges & levels": calibrated 68% / 90%
 * ranges per horizon (with the past hit rate and a warning when off by > 5 points), ATR levels,
 * merged support/resistance with their sources and strength, nearest levels with reward/risk,
 * pattern targets with their historical hit rate, an optional Fibonacci set (low evidence), a
 * "show on chart" switch (price lines on the alternative chart) and the position calculator.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, Ruler } from 'lucide-react';
import type { AssetConfig } from '../../config/assets.ts';
import { tOr, useT } from '../../i18n/index.ts';
import { Rich } from '../../i18n/Rich.tsx';
import { patternName } from '../../i18n/analysisText.ts';
import { fetchProjections, type Projections } from '../../services/sentimentService.ts';
import { formatAssetPrice, formatDecimal } from '../../utils/format.ts';

export interface ChartLine {
  price: number;
  color: string;
  title: string;
}

interface Props {
  asset: AssetConfig;
  /** Called with the lines to draw (empty array = none). */
  onChartLines?: (lines: ChartLine[]) => void;
}

const pct = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${x >= 0 ? '+' : ''}${formatDecimal(x, 1)}%`);

export function TechnicalLevelsPanel({ asset, onChartLines }: Props) {
  const t = useT();
  const [data, setData] = useState<Projections | null>(null);
  const [error, setError] = useState(false);
  const [fib, setFib] = useState(false);
  const [onChart, setOnChart] = useState(false);
  const price = (v: number) => formatAssetPrice(v, asset);

  useEffect(() => {
    let alive = true;
    setError(false);
    fetchProjections(asset.symbol, fib)
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [asset.symbol, fib]);

  useEffect(() => {
    if (!onChartLines) return;
    if (!onChart || !data) {
      onChartLines([]);
      return;
    }
    const lines: ChartLine[] = data.levels
      .slice()
      .sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct))
      .slice(0, 8)
      .map((l) => ({
        price: l.price,
        color: l.kind === 'support' ? '#16A34A' : '#DC2626',
        title: t(l.kind === 'support' ? 'proj.support' : 'proj.resistance'),
      }));
    const r = data.ranges.find((x) => x.id === '1W' || x.id === '1D');
    if (r?.low68 && r.high68) {
      lines.push({ price: r.low68, color: '#EAB308', title: `${r.id} 68%` }, { price: r.high68, color: '#EAB308', title: `${r.id} 68%` });
    }
    onChartLines(lines);
  }, [onChart, data, onChartLines, t]);

  const card = 'p-5 md:p-6 rounded-xl border space-y-4';
  const cardStyle = {
    backgroundColor: 'var(--bg-surface)',
    borderColor: 'var(--border-subtle)',
  };

  return (
    <section aria-labelledby="proj-heading" className={card} style={cardStyle}>
      <div className="flex items-start gap-2.5">
        <Ruler className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--accent-radar)' }} />
        <div>
          <h2 id="proj-heading" className="text-base font-bold">
            {t('proj.title')}
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {t('proj.subtitle')}
          </p>
        </div>
      </div>

      {!data ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {error ? t('common.dataUnavailable') : t('common.loading')}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left" style={{ color: 'var(--text-secondary)' }}>
                  <th className="py-1 pr-2 font-semibold">{t('proj.horizon')}</th>
                  <th className="py-1 pr-2 font-semibold">{t('proj.r68')}</th>
                  <th className="py-1 pr-2 font-semibold hidden sm:table-cell">{t('proj.r90')}</th>
                  <th className="py-1 font-semibold">{t('proj.calibration')}</th>
                </tr>
              </thead>
              <tbody>
                {data.ranges.map((r) => (
                  <tr key={r.id} className="border-t align-top" style={{ borderColor: 'var(--border-subtle)' }}>
                    <td className="py-1.5 pr-2 font-semibold">{r.id}</td>
                    {r.unavailable || r.low68 === undefined ? (
                      <td colSpan={3} className="py-1.5" style={{ color: 'var(--text-secondary)' }}>
                        {r.unavailable?.includes('500')
                          ? t('proj.unavailable4h')
                          : r.unavailable?.includes('1 year')
                            ? t('proj.unavailable1y')
                            : t('proj.unavailable2y')}
                      </td>
                    ) : (
                      <>
                        <td className="py-1.5 pr-2 font-mono-num whitespace-nowrap">
                          {price(r.low68)} – {price(r.high68 as number)}
                          <span className="block sm:hidden text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                            90%: {price(r.low90 as number)} – {price(r.high90 as number)}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 font-mono-num whitespace-nowrap hidden sm:table-cell">
                          {price(r.low90 as number)} – {price(r.high90 as number)}
                        </td>
                        <td
                          className="py-1.5 font-mono-num"
                          style={{
                            color: r.calibration?.warning ? 'var(--color-gold)' : undefined,
                          }}
                        >
                          {r.calibration && r.calibration.samples > 0
                            ? t('proj.calib', {
                                h68: Math.round(r.calibration.hit68 ?? 0),
                                h90: Math.round(r.calibration.hit90 ?? 0),
                                n: r.calibration.samples,
                              })
                            : '—'}
                          {r.calibration?.warning && <span className="block text-[10px]">{t('proj.calibWarn')}</span>}
                          {r.limitedHistoryBars ? (
                            <span className="block text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                              {t('proj.limited4h', { n: r.limitedHistoryBars })}
                            </span>
                          ) : null}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {t('proj.calibNote')}
          </p>

          {data.atr !== null && data.atrLevels.length === 3 && (
            <p className="text-xs">
              <Rich
                text={t('proj.atr', {
                  atr: price(data.atr),
                  d1: `${price(data.atrLevels[0].down)} – ${price(data.atrLevels[0].up)}`,
                  d2: `${price(data.atrLevels[1].down)} – ${price(data.atrLevels[1].up)}`,
                  d3: `${price(data.atrLevels[2].down)} – ${price(data.atrLevels[2].up)}`,
                })}
              />
            </p>
          )}

          {data.nearest && (data.nearest.resistance || data.nearest.support) && (
            <p className="text-xs">
              <Rich
                text={t('proj.nearest', {
                  res: data.nearest.resistance ? price(data.nearest.resistance.price) : '—',
                  up: pct(data.nearest.upsidePct),
                  sup: data.nearest.support ? price(data.nearest.support.price) : '—',
                  down: pct(data.nearest.downsidePct),
                  rr: data.nearest.rewardRisk === null ? '—' : formatDecimal(data.nearest.rewardRisk, 2),
                })}
              />
            </p>
          )}

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <h3 className="text-sm font-bold">{t('proj.levels')}</h3>
              <div className="flex flex-wrap gap-3 text-xs">
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={fib} onChange={(e) => setFib(e.target.checked)} />
                  {t('proj.fib')}
                </label>
                {onChartLines && (
                  <label className="inline-flex items-center gap-1.5" title={t('proj.onChartNote')}>
                    <input type="checkbox" checked={onChart} onChange={(e) => setOnChart(e.target.checked)} />
                    {t('proj.onChart')}
                  </label>
                )}
              </div>
            </div>
            {data.levels.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {t('common.dataUnavailable')}
              </p>
            ) : (
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left" style={{ color: 'var(--text-secondary)' }}>
                      <th className="py-1 pr-2 font-semibold">{t('proj.col.level')}</th>
                      <th className="py-1 pr-2 font-semibold">{t('proj.col.type')}</th>
                      <th className="py-1 pr-2 font-semibold text-right">{t('proj.col.distance')}</th>
                      <th className="py-1 pr-2 font-semibold hidden md:table-cell">{t('proj.col.sources')}</th>
                      <th className="py-1 font-semibold text-right">{t('proj.col.strength')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.levels]
                      .sort((a, b) => b.price - a.price)
                      .map((l) => (
                        <tr key={l.price} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                          <td className="py-1 pr-2 font-mono-num whitespace-nowrap">{price(l.price)}</td>
                          <td
                            className="py-1 pr-2"
                            style={{
                              color: l.kind === 'support' ? 'var(--color-up)' : 'var(--color-down)',
                            }}
                          >
                            {t(l.kind === 'support' ? 'proj.support' : 'proj.resistance')}
                          </td>
                          <td className="py-1 pr-2 text-right font-mono-num">{pct(l.distancePct)}</td>
                          <td className="py-1 pr-2 hidden md:table-cell" style={{ color: 'var(--text-secondary)' }}>
                            {l.sources.map((s) => tOr(`proj.src.${s}`, s)).join(', ')}
                          </td>
                          <td className="py-1 text-right font-mono-num">{l.strength}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-bold mb-1.5">{t('proj.patterns')}</h3>
            {data.patterns.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {t('proj.noPatterns')}
              </p>
            ) : (
              <ul className="space-y-1 text-xs">
                {data.patterns.map((p) => (
                  <li key={p.id}>
                    <span className="font-semibold">
                      {patternName({
                        id: p.id,
                        name: p.name,
                        bias: p.bias,
                        status: p.status,
                        description: '',
                      })}
                    </span>{' '}
                    <span style={{ color: 'var(--text-secondary)' }}>({tOr(`ta.status.${p.status}`, p.status)})</span> ·{' '}
                    {p.target !== null ? t('proj.target', { target: price(p.target) }) : t('proj.noTarget')}
                    {p.target !== null && (
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {' · '}
                        {p.hitRate !== null
                          ? t('proj.hit', {
                              rate: Math.round(p.hitRate),
                              n: p.pastCases,
                              bars: p.withinBars,
                            })
                          : t('proj.tooFew', { n: p.pastCases })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

        </>
      )}
      <p role="note" className="text-[11px] flex items-start gap-1.5 p-2.5 rounded-lg" style={{ backgroundColor: 'var(--color-gold-soft)' }}>
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" style={{ color: 'var(--color-gold)' }} />
        <span>{t('sent.disclaimer')}</span>
      </p>
    </section>
  );
}
