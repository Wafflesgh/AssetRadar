/** FreshnessCard.tsx — Read-only dataset age and cadence in Settings. */
import { useEffect, useState } from 'react';
import { useT, type TranslationKey } from '../i18n/index.ts';
import { formatRelativeTime } from '../utils/marketHours.ts';
import type { FreshnessReport, FreshnessStatus } from '../utils/freshness.ts';

const colors: Record<FreshnessStatus, string> = {
  ok: 'var(--color-up)', late: 'var(--color-gold)', stale: 'var(--color-down)', closed: 'var(--text-secondary)',
};

export function FreshnessCard() {
  const t = useT();
  const [data, setData] = useState<FreshnessReport | null>(null);
  const [request, setRequest] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    fetch('/api/freshness', { signal: controller.signal })
      .then((res) => { if (!res.ok) throw new Error(); return res.json(); })
      .then((report: FreshnessReport) => { if (!controller.signal.aborted) setData(report); })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [request]);
  return (
    <section aria-labelledby="fresh-heading" className="p-5 md:p-6 rounded-xl border space-y-4"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
      <h2 id="fresh-heading" className="text-base font-bold">{t('fresh.title')}</h2>
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('fresh.note')}</p>
      <button type="button" disabled={loading} onClick={() => setRequest((n) => n + 1)}
        className="min-h-11 px-3 py-2 rounded-lg border text-sm disabled:opacity-60"
        style={{ borderColor: 'var(--border-subtle)' }}>{t(loading ? 'fresh.loading' : 'fresh.refresh')}</button>
      {error && <p role="alert" className="text-sm" style={{ color: 'var(--color-down)' }}>{t('fresh.error')}</p>}
      {data && <>
        <p role="status" className="text-sm" style={{ color: colors[data.overall] }}>
          {t('fresh.overall', { status: t(`fresh.${data.overall}`) })}
        </p>
        <table className="w-full table-fixed text-xs">
          <caption className="sr-only">{t('fresh.title')}</caption>
          <thead><tr className="text-left">
            <th scope="col" className="w-2/5 py-2 pr-2">{t('fresh.dataset')}</th>
            <th scope="col" className="w-2/5 py-2 pr-2">{t('fresh.updated')}</th>
            <th scope="col" className="w-1/5 py-2">{t('fresh.status')}</th>
          </tr></thead>
          <tbody>{data.items.map((item) => <tr key={item.id} className="border-t align-top break-words" style={{ borderColor: 'var(--border-subtle)' }}>
            <th scope="row" className="text-left font-medium py-2 pr-2">{t(`fresh.item.${item.id}` as TranslationKey)}</th>
            <td className="py-2 pr-2">
              {formatRelativeTime(item.lastOk ?? 0, data.checkedAt)}
              <span className="block mt-1" style={{ color: 'var(--text-secondary)' }}>
                {t('fresh.cadence', { minutes: item.expectedMs / 60_000 })}
              </span>
            </td>
            <td className="py-2"><span className="inline-block rounded px-1 py-0.5 font-semibold" style={{ color: colors[item.status], backgroundColor: 'var(--bg-surface-subtle)' }}>{t(`fresh.${item.status}`)}</span></td>
          </tr>)}</tbody>
        </table>
      </>}
    </section>
  );
}
