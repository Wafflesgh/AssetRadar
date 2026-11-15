/**
 * KitchenGlobe.tsx — Indonesia on a globe for Kitchen Radar: each province is coloured by the
 * price of the chosen staple (pale = cheap, strong = dear) or by its change (red = dearer, green =
 * cheaper). Hover shows the province and its price, a click makes it "my province". A month slider
 * with a play button replays the monthly prices since the start of the history (GET
 * /api/staples/map). Provinces with an unusual move this week are outlined in gold. Provinces
 * without a price stay grey: nothing is estimated.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { getLang, useT, type TranslationKey } from '../i18n/index.ts';
import { fetchStapleMap } from '../services/marketDataService.ts';
import { formatNumber, formatRupiah } from '../utils/format.ts';
import { STAPLES, type StapleItem } from '../utils/staples.ts';
import type { StapleAnomalyRow, StapleMapPayload } from '../utils/stapleInsights.ts';
import { Globe, loadMap, type GlobeShape } from './Globe.tsx';

type Mode = 'price' | 'change';

const MONTH = (m: string) => new Intl.DateTimeFormat(getLang() === 'id' ? 'id-ID' : 'en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`));
const mix = (token: string, pct: number) => `color-mix(in srgb, var(${token}) ${Math.round(pct)}%, var(--bg-surface))`;
/** Change of ±10% (or more) gets the full colour. */
const changeColor = (c: number) => (Math.abs(c) < 0.5 ? 'var(--bg-surface)' : mix(c > 0 ? '--color-down' : '--color-up', 20 + 70 * Math.min(1, Math.abs(c) / 10)));

/** The provinces, with neighbouring countries drawn as plain land around them. */
async function loadShapes() {
  const world = await loadMap('world');
  const provinces = await loadMap('indonesia');
  return [...world.filter((c) => c.properties.iso !== 'ID'), ...provinces];
}

interface Props {
  items: StapleItem[];
  myProvince: string;
  onPick: (province: string) => void;
  anomalies: StapleAnomalyRow[];
}

export function KitchenGlobe({ items, myProvince, onPick, anomalies }: Props) {
  const t = useT();
  const [shapes, setShapes] = useState<GlobeShape[] | null>(null);
  const [mapError, setMapError] = useState(false);
  const [id, setId] = useState('com_3');
  const [mode, setMode] = useState<Mode>('price');
  const [history, setHistory] = useState<StapleMapPayload | null>(null);
  // null = today's prices; a number = that month in the history
  const [month, setMonth] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    loadShapes()
      .then(setShapes)
      .catch(() => setMapError(true));
  }, []);
  useEffect(() => {
    setHistory(null);
    setMonth(null);
    setPlaying(false);
    let live = true;
    fetchStapleMap(id)
      .then((h) => live && setHistory(h))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);
  const months = history?.months ?? [];
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setMonth((m) => {
        const next = (m ?? 0) + 1;
        if (next >= months.length - 1) {
          setPlaying(false);
          return null;
        }
        return next;
      });
    }, 350);
    return () => clearInterval(timer);
  }, [playing, months.length]);

  const item = items.find((i) => i.id === id);
  /** Province → price and % change for the frame on screen. */
  const frame = useMemo(() => {
    const out = new Map<string, { price: number; change: number | null }>();
    if (month === null || !history) {
      for (const p of item?.provinces ?? []) out.set(p.name, { price: p.price, change: p.earlier ? ((p.price - p.earlier) / p.earlier) * 100 : null });
    } else {
      for (const [name, list] of Object.entries(history.provinces)) {
        const price = list[month];
        const before = month > 0 ? list[month - 1] : null;
        if (price !== null && price !== undefined) out.set(name, { price, change: before ? ((price - before) / before) * 100 : null });
      }
    }
    return out;
  }, [item, history, month]);
  const prices = [...frame.values()].map((v) => v.price);
  const low = prices.length ? Math.min(...prices) : 0;
  const high = prices.length ? Math.max(...prices) : 0;
  const marked = useMemo(() => new Set(month === null ? anomalies.filter((a) => a.id === id).map((a) => a.province) : []), [anomalies, id, month]);

  const fill = (s: GlobeShape) => {
    if (s.properties.iso) return null;
    const v = frame.get(s.properties.name);
    if (!v) return 'var(--border-subtle)';
    if (mode === 'change') return v.change === null ? 'var(--border-subtle)' : changeColor(v.change);
    return mix('--accent-radar', 12 + 78 * (high > low ? (v.price - low) / (high - low) : 0.5));
  };
  const tip = (s: GlobeShape) => {
    const v = frame.get(s.properties.name);
    return (
      <>
        <span className="font-semibold block">{s.properties.name}</span>
        {v ? (
          <span className="font-mono-num">
            {formatRupiah(v.price, 0)}
            {v.change !== null && (
              <span style={{ color: Math.abs(v.change) < 0.05 ? 'var(--text-secondary)' : v.change > 0 ? 'var(--color-down)' : 'var(--color-up)' }}>
                {' '}
                {v.change > 0 ? '+' : ''}
                {formatNumber(v.change, 1)}%
              </span>
            )}
          </span>
        ) : (
          <span style={{ color: 'var(--text-secondary)' }}>{t('globe.noData')}</span>
        )}
      </>
    );
  };
  const chip = (active: boolean) => ({
    backgroundColor: active ? 'var(--accent-radar)' : 'var(--bg-surface-subtle)',
    color: active ? 'var(--bg-canvas)' : 'var(--text-primary)',
  });
  const control = { backgroundColor: 'var(--bg-surface-subtle)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' };
  const swatches = mode === 'price' ? [12, 32, 51, 71, 90].map((p) => mix('--accent-radar', p)) : [-10, -5, 0, 5, 10].map(changeColor);

  return (
    <section className="p-4 md:p-5 rounded-xl border space-y-3" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }} aria-labelledby="kitchen-globe-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="kitchen-globe-heading" className="text-sm font-bold">
          {t('kitchen.globe.title')}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <select value={id} onChange={(e) => setId(e.target.value)} aria-label={t('kitchen.globe.staple')} className="px-2 py-1.5 rounded-lg border text-base sm:text-xs font-semibold" style={control}>
            {STAPLES.map((s) => (
              <option key={s.id} value={s.id}>
                {t(`kitchen.item.${s.key}` as TranslationKey)}
              </option>
            ))}
          </select>
          <div className="flex gap-1" role="group" aria-label={t('kitchen.globe.mode')}>
            {(['price', 'change'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} className="px-2.5 py-1 rounded-md text-xs font-semibold" style={chip(mode === m)}>
                {t(`kitchen.globe.${m}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mapError ? (
        <p className="text-sm" role="alert">
          {t('globe.mapError')}
        </p>
      ) : !shapes ? (
        <div className="skeleton rounded-xl" style={{ aspectRatio: '680 / 420' }} />
      ) : (
        <Globe
          shapes={shapes}
          idOf={(s) => (s.properties.iso ? `country-${s.properties.iso}-${s.properties.name}` : s.properties.name)}
          fill={fill}
          tip={tip}
          onPick={(s) => onPick(s.properties.name)}
          selected={myProvince}
          marked={marked}
          center={[118, -2.5]}
          zoom={2.3}
          label={t('kitchen.globe.title')}
        />
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        <span className="inline-flex items-center gap-1.5 font-mono-num">
          {mode === 'price' ? formatRupiah(low, 0) : '−10%'}
          <span className="inline-flex rounded overflow-hidden border" style={{ borderColor: 'var(--border-subtle)' }}>
            {swatches.map((c, i) => (
              <span key={i} className="block w-5 h-2.5" style={{ backgroundColor: c }} />
            ))}
          </span>
          {mode === 'price' ? formatRupiah(high, 0) : '+10%'}
        </span>
        <span>{t(mode === 'price' ? 'kitchen.globe.priceNote' : month === null ? 'kitchen.globe.changeNoteNow' : 'kitchen.globe.changeNoteMonth')}</span>
        {marked.size > 0 && <span style={{ color: 'var(--color-gold)' }}>{t('kitchen.globe.marked')}</span>}
      </div>

      {months.length > 2 && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (!playing && month === null) setMonth(0);
              setPlaying((p) => !p);
            }}
            aria-label={t(playing ? 'kitchen.globe.pause' : 'kitchen.globe.play')}
            title={t(playing ? 'kitchen.globe.pause' : 'kitchen.globe.play')}
            className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-full"
            style={chip(true)}
          >
            {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          </button>
          <input
            type="range"
            min={0}
            max={months.length - 1}
            step={1}
            value={month ?? months.length - 1}
            onChange={(e) => {
              const v = Number(e.target.value);
              setPlaying(false);
              setMonth(v >= months.length - 1 ? null : v);
            }}
            aria-label={t('kitchen.globe.month')}
            className="flex-1 min-w-0"
            style={{ accentColor: 'var(--accent-radar)' }}
          />
          <span className="text-xs font-semibold font-mono-num w-24 text-right shrink-0">{month === null ? t('kitchen.globe.today') : MONTH(months[month])}</span>
        </div>
      )}
      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        {t('kitchen.globe.help')}
      </p>
    </section>
  );
}
