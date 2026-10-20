/**
 * MethodAccuracy.tsx — How each method has scored so far on real prices: sentiment per horizon
 * (short / medium / long) and the AI Advisor per horizon (20 / 60 trading days), with the number
 * of saved and scored calls, the directional hit rate versus always guessing the more common
 * direction, and a plain status: not enough results yet (< 30), beats the base rate, or needs
 * review. Used on the daily analysis page, the AI Advisor page and the asset page.
 */
import { useT, type TranslationKey } from '../i18n/index.ts';
import type { MethodSummary } from '../ai/recommendationTrace.ts';
import { formatDecimal } from '../utils/format.ts';

export const MIN_SCORED = 30;

const pct = (v: number | null) => (v === null ? '—' : `${formatDecimal(v * 100, 1)}%`);

export function methodName(m: MethodSummary, t: ReturnType<typeof useT>): string {
  return m.method === 'sentiment'
    ? t('trace.m.sentiment', { h: t(`sent.h.${m.horizon}` as TranslationKey) })
    : t('trace.m.advisor', { days: m.horizon.replace('d', '') });
}

export function methodStatus(m: MethodSummary): 'few' | 'good' | 'review' {
  const directional = m.rows.filter((r) => r.hitRate !== null).reduce((a, r) => a + r.samples, 0);
  if (directional < MIN_SCORED || m.edge === null) return 'few';
  return m.edge > 0 ? 'good' : 'review';
}

export function MethodAccuracy({ methods }: { methods: MethodSummary[] }) {
  const t = useT();
  if (!methods.length) return null;
  const color = { few: 'var(--text-secondary)', good: 'var(--color-up)', review: 'var(--color-down)' } as const;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left" style={{ color: 'var(--text-secondary)' }}>
            <th className="py-1.5 pr-2 font-semibold">{t('trace.method')}</th>
            <th className="py-1.5 pr-2 font-semibold text-right">{t('trace.saved')}</th>
            <th className="py-1.5 pr-2 font-semibold text-right">{t('trace.scored')}</th>
            <th className="py-1.5 pr-2 font-semibold text-right">{t('trace.hitRate')}</th>
            <th className="py-1.5 pr-2 font-semibold text-right">{t('trace.edge')}</th>
            <th className="py-1.5 font-semibold">{t('trace.status')}</th>
          </tr>
        </thead>
        <tbody>
          {methods.map((m) => {
            const st = methodStatus(m);
            const directional = m.rows.filter((r) => r.hitRate !== null).reduce((a, r) => a + r.samples, 0);
            return (
              <tr key={`${m.method}-${m.horizon}`} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <td className="py-1.5 pr-2 font-semibold">{methodName(m, t)}</td>
                <td className="py-1.5 pr-2 text-right font-mono-num">{m.saved}</td>
                <td className="py-1.5 pr-2 text-right font-mono-num">{m.evaluated}</td>
                <td className="py-1.5 pr-2 text-right font-mono-num">{pct(m.hitRate)}</td>
                <td className="py-1.5 pr-2 text-right font-mono-num" style={{ color: m.edge === null ? undefined : m.edge > 0 ? 'var(--color-up)' : 'var(--color-down)' }}>
                  {m.edge === null ? '—' : `${m.edge > 0 ? '+' : ''}${formatDecimal(m.edge * 100, 1)} pt`}
                </td>
                <td className="py-1.5" style={{ color: color[st] }}>
                  {st === 'few' ? t('trace.st.few', { n: directional, min: MIN_SCORED }) : t(`trace.st.${st}` as TranslationKey)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-secondary)' }}>
        {t('trace.methodNote')}
      </p>
    </div>
  );
}
