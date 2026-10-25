/**
 * SectorRotationView.tsx — "Sector Rotation" page (#/sectors): every IDX-IC sector ranked from
 * strongest to weakest over 1 day or 1 week (market-cap-weighted change of all listed stocks),
 * a summary line, a bar per sector (green up / red down) with its rotation quadrant and a short
 * rule-based reason; a row expands to breadth, equal-weight change, value traded and the top
 * gainers / losers (linked to the stock page). Data: /api/sectors/idx (src/utils/sectorRotation.ts).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, PieChart, RefreshCw } from 'lucide-react';
import { useLang, useT, type TranslationKey } from '../i18n/index.ts';
import { renderParts, type TextPart } from '../i18n/textParts.ts';
import { fetchSectorRotation, type SectorRotationResponse } from '../services/marketDataService.ts';
import { formatIdrCompact, formatNumber, formatPercent } from '../utils/format.ts';
import { buildHashRoute } from '../utils/router.ts';
import { rotationSummary, sectorPerf, sortSectors, type RotationPeriod, type RotationQuadrant, type SectorMover, type SectorSummary } from '../utils/sectorRotation.ts';

const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
const tone = (v: number | null) => (v === null || Math.abs(v) < 0.005 ? 'var(--text-secondary)' : v > 0 ? 'var(--color-up)' : 'var(--color-down)');

const QUADRANT_COLOR: Record<RotationQuadrant, string> = {
  leading: 'var(--color-up)',
  improving: 'var(--accent-radar)',
  weakening: 'var(--color-gold)',
  lagging: 'var(--color-down)',
};

/** Formats the numeric params of a reason in the current language before rendering it. */
function useReason() {
  const lang = useLang();
  return (parts: TextPart[]) =>
    renderParts(
      lang,
      parts.map((x) => ({
        ...x,
        p: x.p && Object.fromEntries(
          Object.entries(x.p).map(([k, v]) => [k, typeof v !== 'number' ? v : k.endsWith('Pct') ? formatPercent(v) : k === 'level' ? `${formatNumber(v, 2)}%` : formatNumber(v, 0)])
        ),
      })),
      ''
    );
}

function MoverList({ title, items }: { title: string; items: SectorMover[] }) {
  return (
    <div className="min-w-0">
      <p className="font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
        {title}
      </p>
      {items.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>—</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((m) => (
            <li key={m.symbol} className="flex items-baseline justify-between gap-2">
              <a href={buildHashRoute('detail', m.symbol)} className="truncate hover:underline" style={{ color: 'var(--text-primary)' }} title={m.name}>
                <span className="font-semibold">{m.code}</span> <span style={{ color: 'var(--text-secondary)' }}>{m.name}</span>
              </a>
              <span className="font-mono-num shrink-0" style={{ color: tone(m.chg) }}>
                {formatPercent(m.chg)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SectorRow({ s, period, maxAbs }: { s: SectorSummary; period: RotationPeriod; maxAbs: number }) {
  const t = useT();
  const reason = useReason();
  const [open, setOpen] = useState(false);
  const st = s[period];
  const perf = sectorPerf(s, period);
  const width = perf === null || maxAbs <= 0 ? 0 : Math.max(2, (Math.abs(perf) / maxAbs) * 50);
  const name = t(`rotation.sector.${s.slug}` as TranslationKey);
  return (
    <li className="border-b last:border-b-0" style={{ borderColor: 'var(--border-subtle)' }}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full text-left py-3 space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold text-sm truncate">{name}</span>
          <span className="flex items-center gap-2 shrink-0">
            {s.quadrant && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border" style={{ color: QUADRANT_COLOR[s.quadrant], borderColor: QUADRANT_COLOR[s.quadrant] }}>
                {t(`rotation.quadrant.${s.quadrant}` as TranslationKey)}
              </span>
            )}
            <span className="font-mono-num text-sm font-semibold" style={{ color: tone(perf) }}>
              {perf === null ? '—' : formatPercent(perf)}
            </span>
            <ChevronDown size={14} aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined, color: 'var(--text-secondary)' }} />
          </span>
        </div>
        {/* Bar from the centre line: right = up, left = down */}
        <div className="relative h-2 rounded" style={{ backgroundColor: 'var(--bg-surface-subtle)' }} aria-hidden="true">
          <div className="absolute top-0 bottom-0 w-px" style={{ left: '50%', backgroundColor: 'var(--border-subtle)' }} />
          {perf !== null && (
            <div
              className="absolute top-0 bottom-0 rounded"
              style={{ width: `${width}%`, left: perf >= 0 ? '50%' : `${50 - width}%`, backgroundColor: perf >= 0 ? 'var(--color-up)' : 'var(--color-down)' }}
            />
          )}
        </div>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {reason(st.reason)}
        </p>
      </button>
      {open && (
        <div className="pb-3 space-y-3 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label={t('rotation.breadth')} value={st.breadth === null ? '—' : t('rotation.breadthValue', { pct: formatNumber(st.breadth, 0), up: st.up, n: st.counted })} />
            <Stat label={t('rotation.equalWeight')} value={st.equalWeighted === null ? '—' : formatPercent(st.equalWeighted)} color={tone(st.equalWeighted)} />
            <Stat label={t('rotation.stocks')} value={formatNumber(s.stocks, 0)} />
            <Stat label={t('rotation.valueTraded')} value={formatIdrCompact(s.valueTraded)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <MoverList title={t('rotation.topGainers')} items={st.gainers} />
            <MoverList title={t('rotation.topLosers')} items={st.losers} />
          </div>
        </div>
      )}
    </li>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="p-2 rounded-lg min-w-0" style={{ backgroundColor: 'var(--bg-surface-subtle)' }}>
      <p style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="font-mono-num font-semibold break-words" style={{ color: color ?? 'var(--text-primary)' }}>
        {value}
      </p>
    </div>
  );
}

export function SectorRotationView() {
  const t = useT();
  const lang = useLang();
  const [data, setData] = useState<SectorRotationResponse | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<RotationPeriod>('w1');

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    fetchSectorRotation()
      .then((d) => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
    const id = window.setInterval(load, 10 * 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const sectors = useMemo(() => (data ? sortSectors([...data.sectors], period) : []), [data, period]);
  const summary = useMemo(() => rotationSummary(sectors, period), [sectors, period]);
  const maxAbs = Math.max(0, ...sectors.map((s) => Math.abs(sectorPerf(s, period) ?? 0)));
  const hasData = sectors.some((s) => sectorPerf(s, period) !== null);
  const chip = (active: boolean) => ({
    backgroundColor: active ? 'var(--accent-radar)' : 'var(--bg-surface-subtle)',
    color: active ? 'var(--bg-canvas)' : 'var(--text-primary)',
  });
  const name = (s: SectorSummary) => t(`rotation.sector.${s.slug}` as TranslationKey);
  const market = data?.market[period] ?? null;

  return (
    <div className="space-y-5">
      <section className="p-5 md:p-6 rounded-xl border space-y-2" style={card}>
        <div className="flex items-center gap-2">
          <PieChart size={20} style={{ color: 'var(--accent-radar)' }} aria-hidden="true" />
          <h2 className="text-lg font-bold">{t('rotation.title')}</h2>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('rotation.intro')}
        </p>
        <p className="text-xs font-semibold" style={{ color: 'var(--color-gold)' }}>
          {t('common.disclaimerShort')}
        </p>
      </section>

      {loading && !data && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('rotation.loading')}
        </p>
      )}

      {(error || (data && !hasData)) && !loading && (
        <div className="p-6 rounded-xl border text-sm space-y-3" style={card} role="alert">
          <p>{t('common.dataUnavailable')}</p>
          <button type="button" onClick={load} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold" style={chip(true)}>
            <RefreshCw size={14} aria-hidden="true" /> {t('common.tryAgain')}
          </button>
        </div>
      )}

      {data && hasData && (
        <section className="p-5 rounded-xl border space-y-3" style={card} aria-labelledby="rotation-list">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="rotation-list" className="text-sm font-bold">
              {t('rotation.ranking')}
            </h3>
            <div className="flex gap-1" role="group" aria-label={t('rotation.period')}>
              {(['d1', 'w1'] as const).map((p) => (
                <button key={p} type="button" onClick={() => setPeriod(p)} aria-pressed={period === p} className="px-3 py-1 rounded-lg text-xs font-semibold" style={chip(period === p)}>
                  {t(p === 'd1' ? 'rotation.period.d1' : 'rotation.period.w1')}
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm">
            {t(period === 'd1' ? 'rotation.summary.d1' : 'rotation.summary.w1', { up: summary.up, down: summary.down })}
            {summary.strongest && ` ${t('rotation.summary.strongest', { name: name(summary.strongest), chg: formatPercent(sectorPerf(summary.strongest, period) ?? undefined) })}`}
            {summary.weakest && ` ${t('rotation.summary.weakest', { name: name(summary.weakest), chg: formatPercent(sectorPerf(summary.weakest, period) ?? undefined) })}`}
            {market !== null && ` ${t('rotation.summary.market', { chg: formatPercent(market) })}`}
          </p>
          <ul>
            {sectors.map((s) => (
              <SectorRow key={s.sector} s={s} period={period} maxAbs={maxAbs} />
            ))}
          </ul>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {t('rotation.quadrantNote')}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {t('rotation.sourceNote', {
              time: new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(data.pricesAt ?? data.asOf)),
            })}
          </p>
        </section>
      )}
    </div>
  );
}
