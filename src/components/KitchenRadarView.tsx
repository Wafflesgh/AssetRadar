/**
 * KitchenRadarView.tsx — "Kitchen Radar" page (#/kitchen): daily staple food prices in Indonesian
 * traditional markets (national average per kg, Bank Indonesia PIHPS): rice, chicken, beef, eggs,
 * shallots, garlic, chili, bird's-eye chili, cooking oil and sugar. A "kitchen basket" line (average
 * change of the main item of each category), biggest movers of the month, a card per item with its
 * price, 1W/1M/1Y changes, a chart and the cheapest / most expensive provinces, and recent news on
 * food prices (headlines in their own language). Rising prices are shown red: dearer for households.
 */
import { getLang, useT, type TranslationKey } from '../i18n/index.ts';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ExternalLink, RefreshCw, ShoppingBasket } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchStaples } from '../services/marketDataService.ts';
import { formatNumber, formatRupiah } from '../utils/format.ts';
import {
  addDays,
  basketChange,
  STAPLE_CATEGORIES,
  STAPLES,
  stapleSummary,
  type StapleCategory,
  type StapleItem,
  type StaplesPayload,
  type StapleSummary,
} from '../utils/staples.ts';

type Range = 'm1' | 'm3' | 'y1';
const RANGE_DAYS: Record<Range, number> = { m1: 31, m3: 92, y1: 366 };

const DAY = (date: string, withYear = true) =>
  new Intl.DateTimeFormat(getLang() === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`)
  );

/** "+1.2%"; rising prices red (dearer), falling green. */
function Change({ value, label }: { value: number | null; label: string }) {
  const color = value === null || Math.abs(value) < 0.05 ? 'var(--text-secondary)' : value > 0 ? 'var(--color-down)' : 'var(--color-up)';
  return (
    <span className="inline-flex items-baseline gap-1 text-[11px] font-mono-num" style={{ color }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      {value === null ? '—' : `${value > 0 ? '+' : ''}${formatNumber(value, 1)}%`}
    </span>
  );
}

const itemName = (t: ReturnType<typeof useT>, key: string) => t(`kitchen.item.${key}` as TranslationKey);

function StapleCard({ item, range }: { item: StapleItem; range: Range }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const def = STAPLES.find((s) => s.id === item.id)!;
  const s: StapleSummary = stapleSummary(item);
  const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
  const from = s.latest ? addDays(s.latest[0], -RANGE_DAYS[range]) : '';
  const chart = item.points.filter(([d]) => d >= from).map(([d, v]) => ({ d, v }));
  const rangeVals = chart.map((p) => p.v);
  return (
    <article className="p-4 rounded-xl border space-y-2" style={card}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--text-secondary)' }}>
            {t(`kitchen.cat.${def.category}` as TranslationKey)}
          </p>
          <h3 className="text-sm font-bold">{itemName(t, def.key)}</h3>
        </div>
        {s.latest && (
          <div className="text-right shrink-0">
            <p className="text-lg font-bold font-mono-num">{formatRupiah(s.latest[1], 0)}</p>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              {t('kitchen.perKg', { date: DAY(s.latest[0]) })}
            </p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <Change value={s.change.w1} label={t('kitchen.w1')} />
        <Change value={s.change.m1} label={t('kitchen.m1')} />
        <Change value={s.change.m3} label={t('kitchen.m3')} />
        <Change value={s.change.y1} label={t('kitchen.y1')} />
      </div>
      {chart.length >= 2 ? (
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 4, right: 4, bottom: 0, left: -6 }}>
              <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" />
              <XAxis dataKey="d" tickFormatter={(d: string) => DAY(d, false)} tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} minTickGap={40} />
              <YAxis
                tick={{ fontSize: 9, fill: 'var(--text-secondary)' }}
                domain={['auto', 'auto']}
                width={44}
                tickFormatter={(v: number) => (v >= 1000 ? `${formatNumber(v / 1000, v >= 100_000 ? 0 : 1)}k` : formatNumber(v, 0))}
              />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', fontSize: 11 }}
                labelFormatter={(d) => DAY(String(d))}
                formatter={(v) => [typeof v === 'number' ? formatRupiah(v, 0) : String(v), t('kitchen.price')]}
              />
              <Line type="monotone" dataKey="v" stroke="var(--accent-radar)" strokeWidth={1.8} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {t('kitchen.noHistory')}
        </p>
      )}
      {rangeVals.length >= 2 && (
        <p className="text-[11px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
          {t('kitchen.rangeHighLow', { high: formatRupiah(Math.max(...rangeVals), 0), low: formatRupiah(Math.min(...rangeVals), 0) })}
        </p>
      )}
      {item.provinces.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex items-center gap-1 text-xs font-semibold"
            style={{ color: 'var(--accent-radar)' }}
          >
            <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
            {t('kitchen.provinces')}
          </button>
          {open && (
            <div className="grid grid-cols-2 gap-3 mt-2 text-xs">
              {(
                [
                  ['kitchen.cheapest', s.cheapest, 'var(--color-up)'],
                  ['kitchen.dearest', s.dearest, 'var(--color-down)'],
                ] as const
              ).map(([label, list, color]) => (
                <div key={label}>
                  <p className="font-semibold mb-1" style={{ color }}>
                    {t(label)}
                  </p>
                  <ul className="space-y-0.5">
                    {list.map((p) => (
                      <li key={p.name} className="flex justify-between gap-2">
                        <span className="truncate">{p.name}</span>
                        <span className="font-mono-num shrink-0">{formatRupiah(p.price, 0)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="col-span-2 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                {t('kitchen.provincesNote', { n: item.provinces.length })}
              </p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function KitchenRadarView() {
  const t = useT();
  const [data, setData] = useState<StaplesPayload | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<StapleCategory | 'all'>('all');
  const [range, setRange] = useState<Range>('m3');
  const [allVarieties, setAllVarieties] = useState(false);

  const load = () => {
    setLoading(true);
    setError(false);
    fetchStaples()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
  const items = data?.items ?? [];
  const movers = useMemo(() => {
    const rows = items
      .map((i) => ({ i, m1: stapleSummary(i).change.m1 }))
      .filter((r): r is { i: StapleItem; m1: number } => r.m1 !== null)
      .sort((a, b) => b.m1 - a.m1);
    return { up: rows.filter((r) => r.m1 > 0).slice(0, 3), down: rows.filter((r) => r.m1 < 0).reverse().slice(0, 3) };
  }, [items]);
  const shown = items.filter((i) => {
    const def = STAPLES.find((s) => s.id === i.id);
    if (!def) return false;
    if (cat !== 'all') return def.category === cat;
    return allVarieties || def.main;
  });
  const chip = (active: boolean) => ({
    backgroundColor: active ? 'var(--accent-radar)' : 'var(--bg-surface-subtle)',
    color: active ? 'var(--bg-canvas)' : 'var(--text-primary)',
  });

  return (
    <div className="space-y-5">
      <section className="p-5 md:p-6 rounded-xl border space-y-2" style={card}>
        <div className="flex items-center gap-2">
          <ShoppingBasket size={20} style={{ color: 'var(--accent-radar)' }} aria-hidden="true" />
          <h2 className="text-lg font-bold">{t('kitchen.title')}</h2>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('kitchen.intro')}
        </p>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {t('kitchen.colorNote')}
        </p>
      </section>

      {loading && !data && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('kitchen.loading')}
        </p>
      )}
      {error && !data && (
        <div className="p-6 rounded-xl border text-sm space-y-3" style={card} role="alert">
          <p>{t('kitchen.unavailable')}</p>
          <button type="button" onClick={load} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold" style={chip(true)}>
            <RefreshCw size={14} /> {t('kitchen.retry')}
          </button>
        </div>
      )}

      {data && (
        <>
          <section className="p-5 rounded-xl border grid grid-cols-1 md:grid-cols-3 gap-4" style={card} aria-labelledby="basket-heading">
            <div className="space-y-1">
              <h3 id="basket-heading" className="text-sm font-bold">
                {t('kitchen.basket')}
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {t('kitchen.basketHelp')}
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
                <Change value={basketChange(items, 'w1')} label={t('kitchen.w1')} />
                <Change value={basketChange(items, 'm1')} label={t('kitchen.m1')} />
                <Change value={basketChange(items, 'y1')} label={t('kitchen.y1')} />
              </div>
            </div>
            {(
              [
                ['kitchen.moversUp', movers.up],
                ['kitchen.moversDown', movers.down],
              ] as const
            ).map(([label, rows]) => (
              <div key={label} className="space-y-1">
                <h3 className="text-sm font-bold">{t(label)}</h3>
                {rows.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {t('kitchen.noMovers')}
                  </p>
                ) : (
                  <ul className="text-xs space-y-0.5">
                    {rows.map(({ i, m1 }) => (
                      <li key={i.id} className="flex justify-between gap-2">
                        <span className="truncate">{itemName(t, STAPLES.find((s) => s.id === i.id)!.key)}</span>
                        <Change value={m1} label="" />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>

          {data.filling > 0 && (
            <p className="text-xs p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-secondary)' }}>
              {t('kitchen.filling', { n: data.filling, total: items.length })}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {(['all', ...STAPLE_CATEGORIES] as const).map((c) => (
              <button key={c} type="button" onClick={() => setCat(c)} aria-pressed={cat === c} className="px-3 py-1 rounded-full text-xs font-semibold" style={chip(cat === c)}>
                {t(c === 'all' ? 'kitchen.cat.all' : (`kitchen.cat.${c}` as TranslationKey))}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1" role="group" aria-label={t('kitchen.rangeLabel')}>
              {(['m1', 'm3', 'y1'] as const).map((r) => (
                <button key={r} type="button" onClick={() => setRange(r)} aria-pressed={range === r} className="px-2.5 py-1 rounded-md text-xs font-semibold" style={chip(range === r)}>
                  {t(`kitchen.${r}`)}
                </button>
              ))}
            </div>
            {cat === 'all' && (
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={allVarieties} onChange={(e) => setAllVarieties(e.target.checked)} />
                {t('kitchen.allVarieties')}
              </label>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {shown.map((i) => (
              <StapleCard key={i.id} item={i} range={range} />
            ))}
          </div>

          <section className="p-5 rounded-xl border space-y-3" style={card} aria-labelledby="kitchen-news-heading">
            <h3 id="kitchen-news-heading" className="text-sm font-bold">
              {t('kitchen.news')}
            </h3>
            {data.news.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {t('kitchen.noNews')}
              </p>
            ) : (
              <ul className="space-y-2">
                {data.news.map((n) => (
                  <li key={n.link} className="text-sm">
                    <a href={n.link} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {n.title}
                    </a>
                    <span className="block text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      {n.source}
                      {n.publishedAtMs ? ` · ${new Intl.DateTimeFormat(getLang() === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(n.publishedAtMs)} WIB` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              {t('kitchen.newsNote')}
            </p>
          </section>

          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {t('kitchen.sourceNote')}{' '}
            <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline">
              PIHPS Nasional <ExternalLink size={11} />
            </a>
          </p>
        </>
      )}
    </div>
  );
}
