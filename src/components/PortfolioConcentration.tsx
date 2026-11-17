/** PortfolioConcentration.tsx — Descriptive concentration by five portfolio dimensions. */
import { useMemo, useState } from 'react';
import { concentration, DIMENSIONS, type ConcentrationPosition, type Dimension } from '../utils/concentration.ts';
import { useT, type TranslationKey } from '../i18n/index.ts';
import { formatNumber } from '../utils/format.ts';

export function PortfolioConcentration({ positions }: { positions: ConcentrationPosition[] }) {
  const t = useT();
  const [dimension, setDimension] = useState<Dimension>('asset');
  const result = useMemo(() => concentration(positions), [positions]);
  const current = result[dimension];
  const label = (key: string, fallback: string) => dimension === 'asset' || dimension === 'currency' && key !== 'unclassified'
    ? fallback : t(`conc.label.${key}` as TranslationKey);
  const bars = current.items.slice(0, 8).map((item) => ({ ...item, label: label(item.key, item.label) }));
  if (current.items.length > 8) bars.push({ key: 'others', label: t('conc.others'), weight: current.items.slice(8).reduce((s, i) => s + i.weight, 0) });
  return <section className="p-4 rounded-xl border space-y-3" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }} aria-labelledby="concentration-title">
    <h2 id="concentration-title" className="text-base font-bold">{t('conc.title')}</h2>
    <div className="flex flex-wrap gap-2" role="group" aria-label={t('conc.dimension')}>
      {DIMENSIONS.map((dim) => <button key={dim} type="button" aria-pressed={dimension === dim} onClick={() => setDimension(dim)}
        className="min-h-11 px-3 py-2 rounded-lg border text-xs font-semibold"
        style={{ borderColor: dimension === dim ? 'var(--accent-radar)' : 'var(--border-subtle)', color: dimension === dim ? 'var(--accent-radar)' : 'var(--text-primary)' }}>{t(`conc.dim.${dim}`)}</button>)}
    </div>
    {current.top && current.level ? <>
      <p className="text-sm" role="status">{t('conc.score', { name: label(current.top.key, current.top.label), weight: formatNumber(current.top.weight * 100, 1), level: t(`conc.level.${current.level}`) })}</p>
      <ul className="space-y-2">{bars.map((item) => <li key={item.key}>
        <div className="flex justify-between gap-2 text-xs"><span className="min-w-0 break-words">{item.label}</span><span className="shrink-0 font-mono-num">{formatNumber(item.weight * 100, 1)}%</span></div>
        <div aria-hidden="true" className="h-2 mt-1 rounded overflow-hidden" style={{ backgroundColor: 'var(--bg-surface-subtle)' }}><div className="h-full rounded" style={{ width: `${item.weight * 100}%`, backgroundColor: 'var(--accent-radar)' }} /></div>
      </li>)}</ul>
      <p className="text-xs">{t('conc.metrics', { hhi: formatNumber(current.hhi!, 3), n: formatNumber(current.effectiveN!, 1) })}</p>
    </> : <p className="text-sm">{t('conc.empty')}</p>}
    {result.unpriced > 0 && <p className="text-xs" style={{ color: 'var(--color-gold)' }}>{t('conc.unpriced', { n: result.unpriced })}</p>}
    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('conc.explain')}</p>
    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('conc.note')}</p>
  </section>;
}
