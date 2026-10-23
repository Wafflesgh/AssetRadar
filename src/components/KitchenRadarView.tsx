/**
 * KitchenRadarView.tsx — "Kitchen Radar" page (#/kitchen): daily staple food prices in Indonesian
 * traditional markets (national average per kg, Bank Indonesia PIHPS): rice, chicken, beef, eggs,
 * shallots, garlic, chili, bird's-eye chili, cooking oil and sugar. A "kitchen basket" line (average
 * change of the main item of each category), biggest movers of the month, a card per item with its
 * price, 1W/1M/1Y changes, a chart and the cheapest / most expensive provinces, and recent news on
 * food prices (headlines in their own language). Rising prices are shown red: dearer for households.
 * Each card also lists the popular (most populous, most reported) provinces and explains why the
 * price moves: live factors (rupiah, yuan, world rice and palm oil, oil, El Niño, season, holidays,
 * school meals MBG, village cooperatives KDMP with their recent headlines), the cause → effect chains with the one that applies now, Indonesia's exposure
 * and politics / policy (src/utils/stapleDrivers.ts).
 */
import { getLang, useT, type TranslationKey } from '../i18n/index.ts';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ExternalLink, RefreshCw, ShoppingBasket } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchIndonesiaMacro, fetchStaples } from '../services/marketDataService.ts';
import { activeChain, readDrivers, STAPLE_FACTORS, type DriverEffect, type DriverInputs } from '../utils/stapleDrivers.ts';
import { formatNumber, formatRupiah } from '../utils/format.ts';
import {
  addDays,
  basketChange,
  POPULAR_PROVINCES,
  STAPLE_CATEGORIES,
  STAPLES,
  stapleSummary,
  type PolicyNews,
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

const EFFECT_COLOR: Record<DriverEffect, string> = {
  raises: 'var(--color-down)',
  eases: 'var(--color-up)',
  neutral: 'var(--text-secondary)',
  unknown: 'var(--text-secondary)',
};
const EFFECT_ICON: Record<DriverEffect, string> = { raises: '▲', eases: '▼', neutral: '•', unknown: '·' };

const bullets = (text: string) =>
  text
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

/** Most populous, most reported provinces: price, gap to the national average, change in ~3 weeks. */
function PopularRegions({ item, national }: { item: StapleItem; national: number | null }) {
  const t = useT();
  const rows = POPULAR_PROVINCES.map((name) => item.provinces.find((p) => p.name === name)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  if (!rows.length) return null;
  const pct = (a: number, b: number) => ((a - b) / b) * 100;
  const signed = (v: number) => `${v > 0 ? '+' : ''}${formatNumber(v, 1)}%`;
  const tone = (v: number | null) => (v === null || Math.abs(v) < 0.05 ? 'var(--text-secondary)' : v > 0 ? 'var(--color-down)' : 'var(--color-up)');
  return (
    <div className="col-span-2">
      <p className="font-semibold mb-1" style={{ color: 'var(--accent-radar)' }}>
        {t('kitchen.popular')}
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ color: 'var(--text-secondary)' }}>
            <th className="text-left font-normal">{t('kitchen.popularRegion')}</th>
            <th className="text-right font-normal">{t('kitchen.price')}</th>
            <th className="text-right font-normal">{t('kitchen.popularVsNational')}</th>
            <th className="text-right font-normal">{t('kitchen.popularChange')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const gap = national ? pct(p.price, national) : null;
            const ch = p.earlier ? pct(p.price, p.earlier) : null;
            return (
              <tr key={p.name}>
                <td className="truncate max-w-[8rem]">{p.name}</td>
                <td className="text-right font-mono-num">{formatRupiah(p.price, 0)}</td>
                <td className="text-right font-mono-num" style={{ color: tone(gap) }}>
                  {gap === null ? '—' : signed(gap)}
                </td>
                <td className="text-right font-mono-num" style={{ color: tone(ch) }}>
                  {ch === null ? '—' : signed(ch)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** "Why does the price move?": live factors, chains (the one that applies now marked), exposure, politics. */
function WhySection({ item, inputs, policy }: { item: StapleItem; inputs: DriverInputs; policy: PolicyNews | null }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const c = STAPLES.find((x) => x.id === item.id)!.category;
  const m1 = stapleSummary(item).change.m1;
  const active = activeChain(m1);
  const box = { backgroundColor: 'var(--bg-surface-subtle)' };
  const list = (key: string) => (
    <ul className="list-disc pl-4 space-y-1">
      {bullets(t(key as TranslationKey)).map((b) => (
        <li key={b}>{b}</li>
      ))}
    </ul>
  );
  const num = (v: string | number) => (typeof v === 'number' ? formatNumber(v, Number.isInteger(v) || Math.abs(v) >= 100 ? 0 : 2) : v);
  const signed = (v: number) => `${v > 0 ? '+' : ''}${formatNumber(v, 1)}`;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1 text-xs font-semibold"
        style={{ color: 'var(--accent-radar)' }}
      >
        <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
        {t('kitchen.whyButton')}
      </button>
      {open && (
        <div className="mt-2 space-y-3 text-xs">
          <p>{t(`kitchen.why.${c}.what` as TranslationKey)}</p>
          {m1 !== null && (
            <p className="font-semibold">
              {active === 'up'
                ? t('kitchen.whyRising', { pct: signed(m1) })
                : active === 'down'
                  ? t('kitchen.whyFalling', { pct: formatNumber(Math.abs(m1), 1) })
                  : t('kitchen.whyStable', { pct: signed(m1) })}
            </p>
          )}
          <div className="space-y-1">
            <p className="font-semibold">{t('kitchen.whyNow')}</p>
            <ul className="space-y-1.5">
              {readDrivers(c, inputs).map((r) => (
                <li key={r.factor} className="flex gap-2">
                  <span className="shrink-0 font-semibold w-24" style={{ color: EFFECT_COLOR[r.effect] }}>
                    {EFFECT_ICON[r.effect]} {t(`kitchen.effect.${r.effect}`)}
                  </span>
                  <span>{t(`kitchen.f.${r.factor}.${r.state}` as TranslationKey, Object.fromEntries(Object.entries(r.params).map(([k, v]) => [k, num(v)])))}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-1">
            <p className="font-semibold">{t('kitchen.whyLink')}</p>
            {list(`kitchen.why.${c}.link`)}
          </div>
          {(['up', 'down'] as const).map((dir) => {
            const color = dir === 'up' ? 'var(--color-down)' : 'var(--color-up)';
            return (
              <div key={dir} className="space-y-1 p-2 rounded-lg" style={active === dir ? { ...box, outline: `1px solid ${color}` } : box}>
                <p className="font-semibold flex flex-wrap items-center gap-2">
                  {t(dir === 'up' ? 'kitchen.whyUp' : 'kitchen.whyDown')}
                  {active === dir && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border" style={{ color, borderColor: color }}>
                      {t('kitchen.appliesNow')}
                    </span>
                  )}
                </p>
                {list(`kitchen.why.${c}.${dir}`)}
              </div>
            );
          })}
          <div className="space-y-1">
            <p className="font-semibold">{t('kitchen.whyPolicy')}</p>
            {list(`kitchen.why.${c}.policy`)}
            {(() => {
              // Headlines on the programmes that apply to this staple
              const factors = STAPLE_FACTORS[c];
              const heads = [...(factors.includes('mbg') ? (policy?.mbg.items ?? []) : []), ...(factors.includes('kdmp') ? (policy?.kdmp.items ?? []) : [])].filter(
                (h, i, all) => all.findIndex((x) => x.link === h.link) === i
              );
              if (!heads.length) return null;
              return (
                <div className="pt-1 space-y-1">
                  <p className="font-semibold">{t('kitchen.policyNews')}</p>
                  <ul className="space-y-1">
                    {heads.slice(0, 5).map((h) => (
                      <li key={h.link}>
                        <a href={h.link} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {h.title}
                        </a>
                        <span className="block text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                          {h.source}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </div>
          <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            {t('kitchen.whyNote')}
          </p>
        </div>
      )}
    </div>
  );
}

function StapleCard({ item, range, inputs, policy }: { item: StapleItem; range: Range; inputs: DriverInputs; policy: PolicyNews | null }) {
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
              <PopularRegions item={item} national={s.latest?.[1] ?? null} />
              <p className="col-span-2 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                {t('kitchen.provincesNote', { n: item.provinces.length })}
              </p>
            </div>
          )}
        </div>
      )}
      <WhySection item={item} inputs={inputs} policy={policy} />
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
  // Rupiah, yuan, world rice / palm oil and oil prices for the price drivers (best effort)
  const [macroSeries, setMacroSeries] = useState<DriverInputs['series']>({});
  useEffect(() => {
    fetchIndonesiaMacro()
      .then((m) => setMacroSeries(Object.fromEntries((m.indicators ?? []).map((i) => [i.id, i.points]))))
      .catch(() => {});
  }, []);

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
  const inputs: DriverInputs = useMemo(
    () => ({ today: new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10), series: macroSeries, enso: data?.enso ?? null,
      policyNews: data?.policyNews ? { mbg: data.policyNews.mbg.count, kdmp: data.policyNews.kdmp.count } : null,
    }),
    [macroSeries, data]
  );
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
              <StapleCard key={i.id} item={i} range={range} inputs={inputs} policy={data.policyNews ?? null} />
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
