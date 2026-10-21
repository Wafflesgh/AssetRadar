/**
 * MonthlyCommodities.tsx — Radar card under the commodity table: nickel, tin, Newcastle coal, palm
 * oil (CPO) and rubber from the World Bank Pink Sheet. These have no free daily price, so the card
 * shows monthly averages (latest month, change on the month and on the year, a 24-month line) and
 * says so; "Data unavailable" + retry when the file cannot be read.
 */
import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import type { MonthlyCommodity } from '../utils/pinkSheet.ts';
import { dateLocale, useLang, useT, type TranslationKey } from '../i18n/index.ts';
import { formatDecimal } from '../utils/format.ts';

interface MonthlyResponse {
  updated: string | null;
  rows: MonthlyCommodity[];
  source: string;
}

function MiniLine({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(1)},${(28 - ((v - min) / span) * 26).toFixed(1)}`).join(' ');
  const up = values[values.length - 1] >= values[0];
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-8" aria-hidden="true">
      <polyline points={pts} fill="none" strokeWidth="1.5" vectorEffect="non-scaling-stroke" style={{ stroke: up ? 'var(--color-up)' : 'var(--color-down)' }} />
    </svg>
  );
}

const change = (v: number | null) =>
  v === null ? <span>—</span> : <span style={{ color: v > 0 ? 'var(--color-up)' : v < 0 ? 'var(--color-down)' : undefined }}>{`${v >= 0 ? '+' : ''}${formatDecimal(v, 1)}%`}</span>;

export function MonthlyCommodities() {
  const t = useT();
  const lang = useLang();
  const [data, setData] = useState<MonthlyResponse | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch('/api/commodities/monthly');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const monthLabel = (iso: string) => new Intl.DateTimeFormat(dateLocale(lang), { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };

  return (
    <div className="rounded-xl border p-4 space-y-3" style={card} aria-labelledby="monthly-commodities-heading">
      <div className="flex items-start gap-2">
        <CalendarDays className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--color-gold)' }} />
        <div className="min-w-0">
          <h3 id="monthly-commodities-heading" className="text-sm font-bold">
            {t('monthly.title')}
          </h3>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {t('monthly.subtitle')}
          </p>
        </div>
      </div>
      {error ? (
        <div className="space-y-2">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {t('common.dataUnavailable')}
          </p>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
            style={{ backgroundColor: 'var(--bg-surface-subtle)', borderColor: 'var(--border-subtle)' }}
          >
            <RefreshCw className="w-3.5 h-3.5" /> {t('common.tryAgain')}
          </button>
        </div>
      ) : !data ? (
        <div className="h-24 rounded animate-pulse" style={{ backgroundColor: 'var(--bg-surface-subtle)' }} aria-busy="true" />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {data.rows.map((r) => (
              <div key={r.id} className="rounded-lg border p-3 space-y-1" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-bold">{t(`monthly.name.${r.id}` as TranslationKey)}</span>
                  <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    {monthLabel(r.month)}
                  </span>
                </div>
                <div className="font-mono-num font-bold text-base">
                  US${formatDecimal(r.value, r.value >= 100 ? 0 : 2)}
                  <span className="text-[10px] font-normal ml-1" style={{ color: 'var(--text-secondary)' }}>
                    {r.unit.replace('US$', '')}
                  </span>
                </div>
                <div className="flex gap-3 text-[11px] font-mono-num">
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {t('monthly.mom')} {change(r.changeMoM)}
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {t('monthly.yoy')} {change(r.changeYoY)}
                  </span>
                </div>
                <MiniLine values={r.history} />
              </div>
            ))}
          </div>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {t('monthly.source', { updated: data.updated ?? '—' })}
          </p>
        </>
      )}
    </div>
  );
}
