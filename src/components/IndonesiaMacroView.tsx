/**
 * IndonesiaMacroView.tsx — "Indonesia Macro" page (#/macro): the Indonesia Macro Pulse (one light
 * per category from direction-adjusted 10-year z-scores), BI-Rate decisions, category tabs with
 * indicator cards (latest value, change, z-score, stale flag, frequency, source, 10-year chart),
 * IDX valuation and breadth of the scanned stocks, the next FOMC date, and the indicators without
 * a free source. Free macro data is often published with a delay — every card shows how recent it is.
 * Each card shows a sentiment for Indonesia and whether the effect is global or Indonesian, and can
 * open the reasons: what the indicator is, why this sentiment, why global or Indonesian, and the
 * typical cause-and-effect chain when it rises / falls with the one that applies now marked
 * (src/utils/macroImpact.ts).
 */
import { getLang, tOr, useT, type TranslationKey } from '../i18n/index.ts';
import { createContext, useContext, useEffect, useState } from 'react';
import { Rich } from '../i18n/Rich.tsx';
import { ChevronDown, ExternalLink, Globe, Landmark, Lightbulb, MapPin, RefreshCw } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchIndonesiaMacro, type IndonesiaMacro } from '../services/marketDataService.ts';
import { SbnRetailSection } from './SbnRetailSection.tsx';
import { formatDecimal, formatNumber } from '../utils/format.ts';
import { IMPACT_INFO, IMPACT_RELATED, IMPACT_RELATED_BY_SERIES, impactBullets, impactConcept, impactReading, type ImpactConcept, type ImpactSentiment } from '../utils/macroImpact.ts';
import { MACRO_CATEGORIES, latest, type MacroCategory, type MacroIndicator, type MacroSeries, type PulseCategory } from '../utils/macro.ts';

const MONTH = {
  format: (d: Date) =>
    new Intl.DateTimeFormat(getLang() === 'id' ? 'id-ID' : 'en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d),
};
const DAY = {
  format: (d: Date) =>
    new Intl.DateTimeFormat(getLang() === 'id' ? 'id-ID' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d),
};

function periodLabel(date: string, frequency: MacroSeries['frequency']): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (frequency === 'annual') return String(d.getUTCFullYear());
  if (frequency === 'quarterly') return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
  if (frequency === 'decision') return DAY.format(d);
  return MONTH.format(d);
}

function fmt(value: number, unit: string): string {
  const n = (d: number) => formatNumber(value, Math.abs(value) >= 1000 ? 0 : d);
  if (unit === 'Rp') return `Rp${formatNumber(value, 0)}`;
  if (unit === 'US$ bn') return `US$${formatNumber(value, 1)} bn`;
  if (unit === '%') return `${formatNumber(value, 2)}%`;
  if (unit === 'index' || unit === 'pts') return n(2);
  if (unit.startsWith('US$')) return `US$${n(2)}${unit.slice(3)}`;
  return `${n(2)} ${unit}`;
}

/** Cards on the page (id → label) and how to jump to one (switches to "All" when it is hidden). */
const MacroCardsContext = createContext<{ labels: Map<string, string>; jump: (id: string) => void }>({ labels: new Map(), jump: () => {} });
const cardDomId = (id: string) => `macro-card-${id}`;

const LIGHT_COLOR: Record<string, string> = {
  green: 'var(--color-up)',
  amber: 'var(--color-gold)',
  red: 'var(--color-down)',
  none: 'var(--text-secondary)',
};

export function IndonesiaMacroView() {
  const [data, setData] = useState<IndonesiaMacro | null>(null);
  const t = useT();
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [cat, setCat] = useState<MacroCategory | 'all'>('all');
  const [jumpTo, setJumpTo] = useState<string | null>(null);

  useEffect(() => {
    if (!jumpTo) return;
    const el = document.getElementById(cardDomId(jumpTo));
    if (!el) return;
    // Instant jump: focusing during a smooth scroll cancels it in Chromium
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'start' });
    setJumpTo(null);
  }, [jumpTo, cat]);
  const jump = (id: string) => {
    if (!document.getElementById(cardDomId(id))) setCat('all');
    setJumpTo(id);
  };

  useEffect(() => {
    let alive = true;
    setError(false);
    fetchIndonesiaMacro()
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [reload]);

  const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
  const bi = data?.biRate ?? [];
  const biNow = bi[bi.length - 1];
  const biPrev = [...bi].reverse().find((p) => p.value !== biNow?.value);
  const indicators = data?.indicators;
  const shown = indicators ? indicators.filter((i) => cat === 'all' || i.category === cat) : null;
  const tabBtn = (c: MacroCategory | 'all') => (
    <button
      key={c}
      type="button"
      aria-pressed={cat === c}
      onClick={() => setCat(c)}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold border"
      style={{
        borderColor: cat === c ? 'var(--accent-radar)' : 'var(--border-subtle)',
        backgroundColor: cat === c ? 'var(--accent-radar)' : 'transparent',
        color: cat === c ? '#fff' : 'var(--text-primary)',
      }}
    >
      {t(`macro.cat.${c}` as TranslationKey)}
    </button>
  );

  return (
    <div className="space-y-6">
      <section className="p-5 md:p-6 rounded-xl border space-y-2" style={card}>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
          <Landmark className="w-5 h-5" style={{ color: 'var(--accent-radar)' }} /> {t('macro.title')}
        </h1>
        <p className="text-sm max-w-3xl" style={{ color: 'var(--text-secondary)' }}>
          {t('macro.intro')}
        </p>
      </section>

      <SbnRetailSection />

      {error && !data ? (
        <div className="p-6 rounded-xl border text-sm space-y-3" style={card} role="alert">
          <p>{t('common.dataUnavailable')}</p>
          <button
            type="button"
            onClick={() => setReload((r) => r + 1)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <RefreshCw className="w-3.5 h-3.5" /> {t('common.tryAgain')}
          </button>
        </div>
      ) : !data ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('common.loading')}
        </p>
      ) : (
        <>
          {data.pulse && data.pulse.length > 0 && <PulseSection pulse={data.pulse} onPick={setCat} />}

          {biNow && (
            <section className="p-5 rounded-xl border grid grid-cols-1 md:grid-cols-3 gap-4" style={card} aria-labelledby="bi-rate-heading">
              <div>
                <h2 id="bi-rate-heading" className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  {t('macro.biOfficial')}
                </h2>
                <p className="text-3xl font-bold font-mono-num mt-1">{formatNumber(biNow.value, 2)}%</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {t('macro.decided', { date: DAY.format(new Date(`${biNow.date}T00:00:00Z`)) })}
                  {biPrev ? t('macro.previous', { value: formatNumber(biPrev.value, 2) }) : ''}
                </p>
                <a
                  href="https://www.bi.go.id/en/statistik/indikator/bi-rate.aspx"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] inline-flex items-center gap-1 mt-1"
                  style={{ color: 'var(--accent-radar)' }}
                >
                  Bank Indonesia <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="md:col-span-2 overflow-x-auto">
                <table className="w-full text-xs">
                  <caption className="sr-only">{t('macro.biCaption')}</caption>
                  <thead>
                    <tr className="text-left" style={{ color: 'var(--text-secondary)' }}>
                      <th className="py-1 font-semibold">{t('macro.meeting')}</th>
                      <th className="py-1 font-semibold text-right">BI-Rate</th>
                      <th className="py-1 font-semibold text-right">{t('macro.change')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...bi].reverse().map((p, i, arr) => {
                      const prev = arr[i + 1];
                      const ch = prev ? p.value - prev.value : null;
                      return (
                        <tr key={p.date} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                          <td className="py-1 font-mono-num">{DAY.format(new Date(`${p.date}T00:00:00Z`))}</td>
                          <td className="py-1 text-right font-mono-num">{formatNumber(p.value, 2)}%</td>
                          <td
                            className="py-1 text-right font-mono-num"
                            style={{ color: ch ? (ch > 0 ? 'var(--color-down)' : 'var(--color-up)') : 'var(--text-secondary)' }}
                          >
                            {ch === null ? '—' : ch === 0 ? t('macro.hold') : t('macro.bp', { v: `${ch > 0 ? '+' : ''}${(ch * 100).toFixed(0)}` })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {(data.idxValuation || (data.calendar && data.calendar.length > 0)) && (
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.idxValuation && <ValuationCard v={data.idxValuation} />}
              {data.calendar && data.calendar.length > 0 && (
                <div className="p-4 rounded-xl border text-sm space-y-1" style={card}>
                  <h2 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                    {t('macro.calendar')}
                  </h2>
                  {data.calendar.map((c) => (
                    <p key={`${c.type}-${c.date}`}>{t('macro.fomc', { date: DAY.format(new Date(`${c.date}T00:00:00Z`)) })}</p>
                  ))}
                </div>
              )}
            </section>
          )}

          {shown ? (
            <>
              <div role="group" aria-label={t('macro.tabs')} className="flex flex-wrap gap-2">
                {(['all', ...MACRO_CATEGORIES] as const).map(tabBtn)}
              </div>
              <MacroCardsContext.Provider value={{ labels: new Map((data.indicators ?? []).map((x) => [x.id, tOr(`macro.s.${x.id}`, x.label)])), jump }}>
                <section className="grid grid-cols-1 lg:grid-cols-2 gap-4" aria-label={t('macro.indicators')}>
                  {shown.map((s) => (
                    <SeriesCard key={s.id} s={s} ind={s} />
                  ))}
                </section>
              </MacroCardsContext.Provider>
            </>
          ) : (
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4" aria-label={t('macro.indicators')}>
              {data.series.map((s) => (
                <SeriesCard key={s.id} s={s} />
              ))}
            </section>
          )}

          <section className="p-4 rounded-xl border text-xs space-y-1" style={{ ...card, color: 'var(--text-secondary)' }}>
            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t('macro.notAvailable')}
            </p>
            {data.unavailable.map((u) => (
              <p key={u.id ?? u.label}>{u.id ? tOr(`macro.un.${u.id}`, `${u.label}: ${u.reason}`) : `${u.label}: ${u.reason}`}</p>
            ))}
            {data.failed.length > 0 && <p style={{ color: 'var(--color-down)' }}>{t('macro.failed', { list: data.failed.join(', ') })}</p>}
          </section>
        </>
      )}
    </div>
  );
}

function PulseSection({ pulse, onPick }: { pulse: PulseCategory[]; onPick: (c: MacroCategory) => void }) {
  const t = useT();
  return (
    <section
      className="p-5 rounded-xl border space-y-3"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      aria-labelledby="macro-pulse-heading"
    >
      <h2 id="macro-pulse-heading" className="text-sm font-bold">
        {t('macro.pulse')}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {pulse.map((p) => {
          const light = p.light ?? 'none';
          return (
            <button
              key={p.category}
              type="button"
              onClick={() => onPick(p.category)}
              className="text-left p-3 rounded-lg border flex flex-col items-start justify-start gap-1"
              style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface-subtle)' }}
            >
              <span className="flex items-center gap-2 text-xs font-bold">
                <span aria-hidden="true" className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: LIGHT_COLOR[light] }} />
                {t(`macro.cat.${p.category}` as TranslationKey)}
              </span>
              <span className="block text-xs font-semibold" style={{ color: LIGHT_COLOR[light] }}>
                {t(`macro.light.${light}` as TranslationKey)}
                {p.score !== null && (
                  <span className="font-mono-num">
                    {' '}
                    ({p.score >= 0 ? '+' : ''}
                    {formatDecimal(p.score, 2)})
                  </span>
                )}
              </span>
              <span className="block text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {t(`macro.means.${p.category}` as TranslationKey)}
              </span>
              <span className="block text-[10px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
                {t('macro.pulseCount', { used: p.used, stale: p.stale })}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        {t('macro.pulseNote')}
      </p>
    </section>
  );
}

function ValuationCard({ v }: { v: NonNullable<IndonesiaMacro['idxValuation']> }) {
  const t = useT();
  return (
    <div className="p-4 rounded-xl border text-sm space-y-1" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
      <h2 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
        {t('macro.valuation')}
      </h2>
      {v.medianPE !== null && (
        <p>
          <Rich text={t('macro.medianPE', { v: formatDecimal(v.medianPE, 1) })} />
        </p>
      )}
      {v.medianPB !== null && (
        <p>
          <Rich text={t('macro.medianPB', { v: formatDecimal(v.medianPB, 2) })} />
        </p>
      )}
      {v.earningsYield !== null && (
        <p>
          <Rich
            text={
              v.eyMinusBiRate !== null
                ? t('macro.ey', {
                    v: formatDecimal(v.earningsYield, 2),
                    d: `${v.eyMinusBiRate >= 0 ? '+' : ''}${formatDecimal(v.eyMinusBiRate, 2)}`,
                  })
                : t('macro.eyOnly', { v: formatDecimal(v.earningsYield, 2) })
            }
          />
        </p>
      )}
      {v.advancers + v.decliners + v.unchanged > 0 && (
        <p className="font-mono-num text-xs">{t('macro.breadth', { a: v.advancers, d: v.decliners, u: v.unchanged })}</p>
      )}
      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        {t('macro.valuationN', { n: v.n })}
      </p>
    </div>
  );
}

function ZBadge({ ind }: { ind: MacroIndicator }) {
  const t = useT();
  if (ind.zScore10y === null) return null;
  const z = ind.zScore10y;
  const dir = ind.higherIsBetter === null ? null : z * (ind.higherIsBetter ? 1 : -1);
  const color = dir === null || Math.abs(dir) <= 0.5 ? 'var(--text-secondary)' : dir > 0 ? 'var(--color-up)' : 'var(--color-down)';
  const word = dir === null ? t('macro.zNeutral') : dir > 0.5 ? t('macro.zBetter') : dir < -0.5 ? t('macro.zWorse') : t('macro.light.amber');
  return (
    <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border" style={{ color, borderColor: color }}>
      {t('macro.z', { z: `${z >= 0 ? '+' : ''}${formatDecimal(z, 1)}` })} · {word}
    </span>
  );
}

const SENT_COLOR: Record<ImpactSentiment, string> = {
  strongPositive: 'var(--color-up)',
  positive: 'var(--color-up)',
  neutral: 'var(--text-secondary)',
  negative: 'var(--color-down)',
  strongNegative: 'var(--color-down)',
  mixed: 'var(--color-gold)',
};

/** Always-visible chips: sentiment for Indonesia and whether the effect is global or Indonesian. */
function ImpactChips({ s }: { s: MacroSeries }) {
  const t = useT();
  const concept = impactConcept(s.id);
  if (!concept) return null;
  const r = s.points.length ? impactReading(s.id, s.points) : null;
  const scope = IMPACT_INFO[concept].scope;
  const ScopeIcon = scope === 'indonesia' ? MapPin : Globe;
  return (
    <>
      {r && (
      <span
        className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded"
        style={{ color: 'var(--bg-surface)', backgroundColor: SENT_COLOR[r.sentiment] }}
      >
        {t('impact.sentTitle')}: {t(`impact.sent.${r.sentiment}` as TranslationKey)}
      </span>
      )}
      <span
        className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border"
        style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}
      >
        <ScopeIcon className="w-3 h-3" />
        {t(`impact.scope.${scope}` as TranslationKey)}
      </span>
    </>
  );
}

/** Cause-and-effect chain to the other cards on the page, as buttons that jump to them. */
function RelatedCards({ c, self }: { c: ImpactConcept; self: string }) {
  const t = useT();
  const { labels, jump } = useContext(MacroCardsContext);
  const ids = (IMPACT_RELATED_BY_SERIES[self] ?? IMPACT_RELATED[c]).filter((id) => id !== self && labels.has(id));
  return (
    <div className="space-y-1">
      <p className="font-semibold">{t('impact.relatedTitle')}</p>
      <p>{tOr(`impact.s.${self}.chain`, t(`impact.${c}.chain` as TranslationKey))}</p>
      {ids.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {ids.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => jump(id)}
                className="text-[11px] px-2 py-1 rounded-lg border text-left"
                style={{ borderColor: 'var(--accent-radar)', color: 'var(--accent-radar)', backgroundColor: 'var(--bg-surface)' }}
              >
                {labels.get(id)}
              </button>
            ))}
          </div>
          <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            {t('impact.relatedHint')}
          </p>
        </>
      )}
    </div>
  );
}

function ImpactSection({ s }: { s: MacroSeries }) {
  const t = useT();
  const c = impactConcept(s.id);
  if (!c) return null;
  const r = s.points.length ? impactReading(s.id, s.points) : null;
  const { scope, good } = IMPACT_INFO[c];
  const order: Array<'up' | 'down'> = r?.active === 'down' ? ['down', 'up'] : ['up', 'down'];
  const z = r?.z == null ? '' : `${r.z >= 0 ? '+' : ''}${formatDecimal(r.z, 1)}`;
  const reasons: string[] = [];
  if (!r) reasons.push(t('impact.noData'));
  else if (r.level) reasons.push(t(`impact.level.${r.level}` as TranslationKey, { z }));
  if (r?.trend) reasons.push(t(`impact.trend.${r.trend}` as TranslationKey));
  if (r?.active) reasons.push(t('impact.effectNow', { sum: t(`impact.${c}.${r.active}.sum` as TranslationKey) }));
  if (!r) {
    // no data: only the explanation
  } else if (good === null) reasons.push(t('impact.reason.mixed'));
  else if (!r.active) reasons.push(t('impact.reason.neutral'));
  else reasons.push(t(r.active === good ? 'impact.reason.good' : 'impact.reason.bad', { dir: t(`impact.dir.${r.active}`) }));
  if (r?.sentiment === 'strongPositive' || r?.sentiment === 'strongNegative') reasons.push(t('impact.reason.strong'));
  return (
    <details className="group rounded-lg border text-xs" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface-subtle)' }}>
      <summary className="flex items-center gap-1.5 px-3 py-2 cursor-pointer select-none font-semibold list-none [&::-webkit-details-marker]:hidden">
        <Lightbulb className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--color-gold)' }} />
        <span className="flex-1">{t('impact.toggle')}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-3 pb-3 space-y-3 leading-relaxed">
        <div className="space-y-1">
          <p className="font-semibold">{t('impact.whatTitle')}</p>
          <p>{tOr(`impact.s.${s.id}.what`, t(`impact.${c}.what` as TranslationKey))}</p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold flex flex-wrap items-center gap-1.5">
            {t('impact.whyTitle')}
            {r && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ color: 'var(--bg-surface)', backgroundColor: SENT_COLOR[r.sentiment] }}
            >
              {t(`impact.sent.${r.sentiment}` as TranslationKey)}
            </span>
            )}
          </p>
          <ul className="list-disc pl-5 space-y-0.5">
            {reasons.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          {r?.z != null && (
            <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
              {t('impact.zHelp')}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <p className="font-semibold flex flex-wrap items-center gap-1.5">
            {scope === 'indonesia' ? <MapPin className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
            {t('impact.scopeTitle')}
            <span className="font-normal" style={{ color: 'var(--text-secondary)' }}>
              {t(`impact.scope.${scope}` as TranslationKey)}
            </span>
          </p>
          <p>{t(`impact.${c}.scopeWhy` as TranslationKey)}</p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold">{t('impact.linkTitle')}</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {impactBullets(tOr(`impact.s.${s.id}.link`, t(`impact.${c}.link` as TranslationKey))).map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            {t('impact.linkNote')}
          </p>
        </div>
        <RelatedCards c={c} self={s.id} />
        {order.map((dir) => {
          const active = r?.active === dir;
          const color = dir === 'up' ? 'var(--color-up)' : 'var(--color-down)';
          return (
            <div key={dir} className="space-y-1" style={{ opacity: r?.active && !active ? 0.75 : 1 }}>
              <p className="font-semibold flex flex-wrap items-center gap-1.5">
                <span style={{ color }}>{dir === 'up' ? '▲' : '▼'}</span>
                {t(`impact.${dir}`)}
                {active && (
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded border"
                    style={{ color: 'var(--accent-radar)', borderColor: 'var(--accent-radar)' }}
                  >
                    {t('impact.now')}
                  </span>
                )}
              </p>
              <ul className="list-disc pl-5 space-y-0.5">
                {impactBullets(t(`impact.${c}.${dir}` as TranslationKey)).map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          );
        })}
        <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
          {t('impact.note')}
        </p>
      </div>
    </details>
  );
}

function SeriesCard({ s, ind }: { s: MacroSeries; ind?: MacroIndicator }) {
  const t = useT();
  const l = latest(s.points);
  const chart = s.points.slice(s.frequency === 'annual' ? -26 : s.frequency === 'quarterly' ? -40 : -120);
  return (
    <article
      id={cardDomId(s.id)}
      tabIndex={-1}
      className="p-4 rounded-xl border space-y-2 scroll-mt-20 outline-none"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold">{tOr(`macro.s.${s.id}`, s.label)}</h3>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {t(`macro.freq.${s.frequency}` as TranslationKey)} · {s.source}
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            <ImpactChips s={s} />
            {ind && <ZBadge ind={ind} />}
            {ind && (
              <>
              {ind.stale && l && (
                <span
                  className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border"
                  style={{ color: 'var(--color-gold)', borderColor: 'var(--color-gold)' }}
                >
                  {t('macro.stale', { date: periodLabel(l.date, s.frequency) })}
                </span>
              )}
              </>
            )}
          </div>
        </div>
        {l && (
          <div className="text-right shrink-0">
            <p className="text-lg font-bold font-mono-num">{fmt(l.value, s.unit)}</p>
            <p className="text-[11px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
              {periodLabel(l.date, s.frequency)}
              {l.change !== null &&
                ` · ${l.change >= 0 ? '+' : ''}${formatNumber(l.change, s.unit === 'Rp' ? 0 : 2)}${s.unit === '%' ? ` ${t('macro.pts')}` : ''}`}
            </p>
          </div>
        )}
      </div>
      {ind?.requiresKey && s.points.length === 0 ? (
        <p className="text-xs p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-secondary)' }}>
          <span className="block font-semibold">{t('macro.requiresKey')}</span>
          <span className="block">{t('macro.noKeyData')}</span>
        </p>
      ) : (
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chart.map((p) => ({ x: periodLabel(p.date, s.frequency), v: Number(p.value.toFixed(3)) }))}
              margin={{ top: 4, right: 4, bottom: 0, left: -18 }}
            >
              <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" />
              <XAxis dataKey="x" tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} minTickGap={40} />
              <YAxis tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', fontSize: 11 }}
                formatter={(v) => (typeof v === 'number' ? fmt(v, s.unit) : String(v))}
              />
              <Line
                type="monotone"
                dataKey="v"
                stroke="var(--accent-radar)"
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <ImpactSection s={s} />
      {s.note && (
        <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
          {tOr(`macro.s.${s.id}.note`, s.note)}
        </p>
      )}
      <a
        href={s.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] inline-flex items-center gap-1"
        style={{ color: 'var(--accent-radar)' }}
      >
        {t('common.source')} <ExternalLink className="w-3 h-3" />
      </a>
    </article>
  );
}
