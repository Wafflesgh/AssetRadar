/**
 * KitchenInsights.tsx — Three Kitchen Radar blocks built on the price history:
 *   SeasonBlock   the usual month-by-month pattern of one staple and its run-up before Eid al-Fitr
 *   AnomalyCard   provinces where a main staple moved far outside its own habits this week, each
 *                 with the news headlines that name the staple and the place (keyword match, so
 *                 "related news", never "confirmed"); one-day spikes are called possible data errors
 *   BasketCard    the owner's own monthly shopping list priced now, a month ago and a year ago,
 *                 next to official inflation
 * Calculations live in src/utils/stapleInsights.ts. Short histories show "not enough data".
 */
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, SearchCheck, ShoppingCart } from 'lucide-react';
import { getLang, useT, type TranslationKey } from '../i18n/index.ts';
import { formatNumber, formatRupiah } from '../utils/format.ts';
import { onSyncApplied } from '../services/syncService.ts';
import { getKitchenBasket, saveKitchenBasket } from '../utils/storage.ts';
import { STAPLES, type StaplePoint } from '../utils/staples.ts';
import { basketCost, eidEffect, seasonalPattern, type StapleAnomalyRow } from '../utils/stapleInsights.ts';

const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
const signed = (v: number, digits = 1) => `${v > 0 ? '+' : ''}${formatNumber(v, digits)}%`;
// Dearer food is bad news for a household: rises red, falls green (as on the price cards)
const tone = (v: number | null) => (v === null || Math.abs(v) < 0.05 ? 'var(--text-secondary)' : v > 0 ? 'var(--color-down)' : 'var(--color-up)');
const monthName = (index: number, width: 'narrow' | 'long') =>
  new Intl.DateTimeFormat(getLang() === 'id' ? 'id-ID' : 'en-GB', { month: width, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, index, 1)));

/** Twelve small bars (average change per calendar month) and what this month and Eid usually bring. */
export function SeasonBlock({ points }: { points: StaplePoint[] }) {
  const t = useT();
  const pattern = useMemo(() => seasonalPattern(points), [points]);
  const eid = useMemo(() => eidEffect(points), [points]);
  if (!pattern) {
    return (
      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        {t('kitchen.season.short')}
      </p>
    );
  }
  const thisMonth = new Date(Date.now() + 7 * 3600_000).getUTCMonth();
  const now = pattern[thisMonth];
  const peak = Math.max(...pattern.map((m) => Math.abs(m.avg)), 0.1);
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold" style={{ color: 'var(--accent-radar)' }}>
        {t('kitchen.season.title')}
      </p>
      <div className="flex items-stretch gap-0.5 h-10" role="img" aria-label={t('kitchen.season.chartLabel')}>
        {pattern.map((m, i) => (
          <div key={i} className="flex-1 flex flex-col min-w-0" title={`${monthName(i, 'long')}: ${signed(m.avg)} (${m.up}/${m.n})`}>
            <div className="flex-1 flex items-end">{m.avg > 0 && <div className="w-full rounded-t-sm" style={{ height: `${(m.avg / peak) * 100}%`, backgroundColor: 'var(--color-down)' }} />}</div>
            <div className="h-px" style={{ backgroundColor: i === thisMonth ? 'var(--text-primary)' : 'var(--border-strong)' }} />
            <div className="flex-1 flex items-start">{m.avg < 0 && <div className="w-full rounded-b-sm" style={{ height: `${(-m.avg / peak) * 100}%`, backgroundColor: 'var(--color-up)' }} />}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-0.5 text-[9px] text-center" aria-hidden="true" style={{ color: 'var(--text-secondary)' }}>
        {pattern.map((_, i) => (
          <span key={i} className="flex-1" style={i === thisMonth ? { color: 'var(--text-primary)', fontWeight: 700 } : undefined}>
            {monthName(i, 'narrow')}
          </span>
        ))}
      </div>
      <p className="text-[11px]">
        {t(now.avg >= 0 ? 'kitchen.season.monthUp' : 'kitchen.season.monthDown', { month: monthName(thisMonth, 'long'), pct: formatNumber(Math.abs(now.avg), 1), up: now.avg >= 0 ? now.up : now.n - now.up, n: now.n })}
      </p>
      {eid && (
        <p className="text-[11px]">
          {t(eid.avg >= 0 ? 'kitchen.season.eidUp' : 'kitchen.season.eidDown', { pct: formatNumber(Math.abs(eid.avg), 1), up: eid.avg >= 0 ? eid.up : eid.n - eid.up, n: eid.n })}
        </p>
      )}
    </div>
  );
}

/** "Worth checking": unusual province moves with related headlines. */
export function AnomalyCard({ rows }: { rows: StapleAnomalyRow[] | null }) {
  const t = useT();
  if (!rows) return null;
  return (
    <section className="p-5 rounded-xl border space-y-3" style={card} aria-labelledby="anomaly-heading">
      <div className="flex items-center gap-2">
        <SearchCheck size={18} style={{ color: 'var(--color-gold)' }} aria-hidden="true" />
        <h3 id="anomaly-heading" className="text-sm font-bold">
          {t('kitchen.anomaly.title')}
        </h3>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm">{t('kitchen.anomaly.none')}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={`${r.id}-${r.province}`} className="text-sm space-y-0.5">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold">
                  {t(`kitchen.item.${r.key}` as TranslationKey)} · {r.province}
                </span>
                <span className="font-mono-num text-xs">{formatRupiah(r.price, 0)}</span>
                <span className="font-mono-num text-xs" style={{ color: tone(r.change) }}>
                  {signed(r.change)} {t(r.kind === 'glitch' ? 'kitchen.anomaly.inDay' : 'kitchen.anomaly.inWeek')}
                </span>
              </p>
              {r.kind === 'glitch' ? (
                <p className="text-xs" style={{ color: 'var(--color-gold)' }}>
                  {t('kitchen.anomaly.glitch', { date: r.date })}
                </p>
              ) : r.news === null ? (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {t('kitchen.anomaly.notSearched')}
                </p>
              ) : r.news.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {t('kitchen.anomaly.noNews')}
                </p>
              ) : (
                <ul className="text-xs space-y-0.5">
                  <li style={{ color: 'var(--color-up)' }}>{t('kitchen.anomaly.related')}</li>
                  {r.news.map((n) => (
                    <li key={n.link}>
                      <a href={n.link} target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-baseline gap-1">
                        {n.title} <ExternalLink size={10} className="shrink-0" aria-hidden="true" />
                      </a>
                      <span style={{ color: 'var(--text-secondary)' }}> · {n.source}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        {t('kitchen.anomaly.note')}
      </p>
    </section>
  );
}

const MAIN = STAPLES.filter((s) => s.main);

/** My own monthly shopping list: what it costs now and how that changed, next to official inflation. */
interface BasketProps {
  series: Record<string, StaplePoint[]>;
  /** Whose prices are used (province, city or the national average). */
  where: string;
  official: OfficialRate[];
}
type OfficialRate = { label: string; value: number };

export function BasketCard({ series, where, official }: BasketProps) {
  const t = useT();
  const [qty, setQty] = useState<Record<string, number>>(getKitchenBasket);
  // Bumped when another device's list arrives, so the (uncontrolled) inputs show it
  const [rev, setRev] = useState(0);
  useEffect(
    () =>
      onSyncApplied(['settings'], () => {
        setQty(getKitchenBasket());
        setRev((r) => r + 1);
      }),
    []
  );
  const cost = useMemo(() => basketCost(qty, series), [qty, series]);
  const change = (id: string, text: string) => {
    const n = Number(text.replace(',', '.'));
    const next = { ...qty };
    if (text.trim() === '' || !Number.isFinite(n) || n <= 0) delete next[id];
    else next[id] = Math.min(n, 1000);
    setQty(next);
    saveKitchenBasket(next);
  };
  return (
    <section className="p-5 rounded-xl border space-y-3" style={card} aria-labelledby="my-basket-heading">
      <div className="flex items-center gap-2">
        <ShoppingCart size={18} style={{ color: 'var(--accent-radar)' }} aria-hidden="true" />
        <h3 id="my-basket-heading" className="text-sm font-bold">
          {t('kitchen.mine.title')}
        </h3>
      </div>
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        {t('kitchen.mine.help', { where })}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {MAIN.map((s) => (
          <label key={`${s.id}-${rev}`} className="text-xs space-y-1 min-w-0">
            <span className="block truncate">{t(`kitchen.cat.${s.category}` as TranslationKey)}</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={1000}
              step={0.5}
              defaultValue={qty[s.id] ?? ''}
              onChange={(e) => change(s.id, e.target.value)}
              placeholder="0"
              className="w-full px-2 py-1.5 rounded-lg border text-base sm:text-sm font-mono-num"
              style={{ backgroundColor: 'var(--bg-surface-subtle)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            />
          </label>
        ))}
      </div>
      {!cost ? (
        <p className="text-sm">{t('kitchen.mine.empty')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {t('kitchen.mine.now')}
            </p>
            <p className="text-lg font-bold font-mono-num">{formatRupiah(cost.now, 0)}</p>
          </div>
          {(
            [
              ['kitchen.mine.m1', cost.m1],
              ['kitchen.mine.y1', cost.y1],
            ] as const
          ).map(([label, v]) => (
            <div key={label}>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {t(label)}
              </p>
              <p className="text-lg font-bold font-mono-num" style={{ color: tone(v) }}>
                {v === null ? '—' : signed(v)}
              </p>
            </div>
          ))}
        </div>
      )}
      {cost && cost.missing.length > 0 && (
        <p className="text-xs" style={{ color: 'var(--color-gold)' }}>
          {t('kitchen.mine.missing', { items: cost.missing.map((id) => t(`kitchen.cat.${MAIN.find((s) => s.id === id)?.category}` as TranslationKey)).join(', ') })}
        </p>
      )}
      {cost && official.length > 0 && (
        <p className="text-xs">
          {t('kitchen.mine.official')}{' '}
          {official.map((o, i) => (
            <span key={o.label} className="font-mono-num">
              {i > 0 && ' · '}
              {o.label} {signed(o.value, 2)}
            </span>
          ))}
        </p>
      )}
      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        {t('kitchen.mine.note')}
      </p>
    </section>
  );
}
