/**
 * WorldMarketGlobe.tsx — The world's stock markets on a globe (Radar page): each country with an
 * index in the app is coloured by that index's change today (green up, red down), hover shows the
 * index, its level, change and whether the exchange is open, a click opens the index. Hong Kong
 * and Singapore are too small to colour, so they are dots. Geopolitical alert headlines of the
 * last 24 hours pulse as dots where they happen (src/utils/geoPlaces.ts). Countries without an
 * index in the app stay grey.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Globe2, Maximize2, Minimize2 } from 'lucide-react';
import { getWorldGlobeHidden, saveWorldGlobeHidden } from '../utils/storage.ts';
import { useT } from '../i18n/index.ts';
import { assetName } from '../i18n/assetNames.ts';
import { ASSETS, type AssetConfig, type PriceTick } from '../config/assets.ts';
import { useLiveNews } from '../hooks/useLiveNews.ts';
import { formatPercent, formatPoints } from '../utils/format.ts';
import { locateHeadline } from '../utils/geoPlaces.ts';
import { Globe, loadMap, type GlobeDot, type GlobeShape } from './Globe.tsx';

/** ISO country → the app's index for it; `at` marks city markets drawn as a dot. */
const MARKETS: Array<{ iso: string; asset: string; at?: [number, number] }> = [
  { iso: 'ID', asset: 'jci' },
  { iso: 'US', asset: 'spx' },
  { iso: 'JP', asset: 'n225' },
  { iso: 'GB', asset: 'ftse' },
  { iso: 'DE', asset: 'dax' },
  { iso: 'FR', asset: 'cac' },
  { iso: 'CN', asset: 'sse' },
  { iso: 'KR', asset: 'kospi' },
  { iso: 'IN', asset: 'nifty' },
  { iso: 'AU', asset: 'asx' },
  { iso: 'HK', asset: 'hsi', at: [114.17, 22.3] },
  { iso: 'SG', asset: 'sti', at: [103.82, 1.35] },
  { iso: 'CA', asset: 'tsx' },
  { iso: 'BR', asset: 'ibov' },
  { iso: 'MX', asset: 'ipc' },
  { iso: 'TW', asset: 'taiex' },
  { iso: 'MY', asset: 'klci' },
  { iso: 'TH', asset: 'seti' },
  { iso: 'PH', asset: 'psei' },
  { iso: 'SA', asset: 'tasi' },
  { iso: 'CH', asset: 'smi' },
  { iso: 'ES', asset: 'ibex' },
  { iso: 'IT', asset: 'mib' },
  { iso: 'NL', asset: 'aex' },
  { iso: 'NZ', asset: 'nz50' },
];

const DAY_MS = 24 * 3600_000;
/** A move of ±2% (or more) gets the full colour. */
const moveColor = (c: number) => `color-mix(in srgb, var(${c >= 0 ? '--color-up' : '--color-down'}) ${Math.round(25 + 65 * Math.min(1, Math.abs(c) / 2))}%, var(--bg-surface))`;

export function WorldMarketGlobe({ ticks, onSelectAsset }: { ticks: Record<string, PriceTick>; onSelectAsset: (symbol: string) => void }) {
  const t = useT();
  const news = useLiveNews();
  const [shapes, setShapes] = useState<GlobeShape[] | null>(null);
  const [mapError, setMapError] = useState(false);
  const [hidden, setHidden] = useState(getWorldGlobeHidden);
  const [full, setFull] = useState(false);
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === box.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggleHidden = () => {
    saveWorldGlobeHidden(!hidden);
    setHidden(!hidden);
  };
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else box.current?.requestFullscreen().catch(() => {});
  };
  const headButton = 'w-8 h-8 inline-flex items-center justify-center rounded-lg border';
  const headStyle = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' };
  useEffect(() => {
    loadMap('world')
      .then(setShapes)
      .catch(() => setMapError(true));
  }, []);

  const byIso = useMemo(() => {
    const out = new Map<string, { asset: AssetConfig; at?: [number, number] }>();
    for (const m of MARKETS) {
      const asset = ASSETS.find((a) => a.id === m.asset);
      if (asset) out.set(m.iso, { asset, at: m.at });
    }
    return out;
  }, []);
  const change = (asset: AssetConfig): number | null => {
    const tick = ticks[asset.symbol];
    return tick && tick.status !== 'error' && Number.isFinite(tick.changePct24h) ? (tick.changePct24h as number) : null;
  };
  const marketTip = (asset: AssetConfig) => {
    const tick = ticks[asset.symbol];
    const c = change(asset);
    return (
      <>
        <span className="font-semibold block">{assetName(asset)}</span>
        {tick && c !== null ? (
          <span className="font-mono-num">
            {formatPoints(tick.price)} <span style={{ color: c >= 0 ? 'var(--color-up)' : 'var(--color-down)' }}>{formatPercent(c)}</span>
            {tick.isMarketOpen !== undefined && <span style={{ color: 'var(--text-secondary)' }}> · {t(tick.isMarketOpen ? 'globe.open' : 'globe.closed')}</span>}
          </span>
        ) : (
          <span style={{ color: 'var(--text-secondary)' }}>{t('globe.noData')}</span>
        )}
      </>
    );
  };

  const alerts = useMemo(() => {
    const cut = Date.now() - DAY_MS;
    const seen = new Set<string>();
    const out: Array<{ id: string; title: string; link: string; level: 'high' | 'elevated'; place: ReturnType<typeof locateHeadline>[number] }> = [];
    for (const n of news.items) {
      if (!n.geoAlert || (n.publishedAtMs ?? n.firstSeenAt ?? 0) < cut) continue;
      // One dot per place: the newest headline about it
      const place = locateHeadline(n.title, 1)[0];
      if (!place || seen.has(place.id)) continue;
      seen.add(place.id);
      out.push({ id: n.id, title: n.title, link: n.link, level: n.geoAlert, place });
    }
    return out;
  }, [news.items]);

  const dots: GlobeDot[] = [
    ...[...byIso.values()]
      .filter((m) => m.at)
      .map((m) => {
        const c = change(m.asset);
        return { id: m.asset.id, lon: m.at![0], lat: m.at![1], color: c === null ? 'var(--border-strong)' : moveColor(c), tip: marketTip(m.asset), onPick: () => onSelectAsset(m.asset.symbol) };
      }),
    ...alerts.map((a) => ({
      id: `geo-${a.id}`,
      lon: a.place.lon,
      lat: a.place.lat,
      color: a.level === 'high' ? 'var(--color-down)' : 'var(--color-gold)',
      pulse: true,
      tip: (
        <>
          <span className="font-semibold block">{a.place.name}</span>
          {a.title}
        </>
      ),
      onPick: () => window.open(a.link, '_blank', 'noopener,noreferrer'),
    })),
  ];

  return (
    <section
      ref={box}
      className="world-globe p-4 md:p-5 rounded-xl border space-y-3"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      aria-labelledby="world-globe-heading"
    >
      <div className="flex items-center gap-2">
        <Globe2 size={18} style={{ color: 'var(--accent-radar)' }} aria-hidden="true" />
        <h3 id="world-globe-heading" className="text-sm font-bold flex-1">
          {t('globe.world.title')}
        </h3>
        {!hidden && document.fullscreenEnabled && (
          <button type="button" onClick={toggleFull} className={headButton} style={headStyle} aria-label={t(full ? 'globe.exitFullscreen' : 'globe.fullscreen')} title={t(full ? 'globe.exitFullscreen' : 'globe.fullscreen')}>
            {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        )}
        {!full && (
          <button type="button" onClick={toggleHidden} className={headButton} style={headStyle} aria-expanded={!hidden} aria-label={t(hidden ? 'globe.expand' : 'globe.minimize')} title={t(hidden ? 'globe.expand' : 'globe.minimize')}>
            {hidden ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        )}
      </div>
      {hidden ? null : mapError ? (
        <p className="text-sm" role="alert">
          {t('globe.mapError')}
        </p>
      ) : !shapes ? (
        <div className="skeleton rounded-xl" style={{ aspectRatio: '680 / 420' }} />
      ) : (
        <Globe
          shapes={shapes}
          idOf={(s) => `${s.properties.iso}-${s.properties.name}`}
          fill={(s) => {
            const m = byIso.get(s.properties.iso);
            if (!m || m.at) return null;
            const c = change(m.asset);
            return c === null ? 'var(--border-strong)' : moveColor(c);
          }}
          tip={(s) => marketTip(byIso.get(s.properties.iso)!.asset)}
          onPick={(s) => onSelectAsset(byIso.get(s.properties.iso)!.asset.symbol)}
          dots={dots}
          center={[105, 12]}
          zoom={1}
          label={t('globe.world.title')}
        />
      )}
      {!hidden && <><div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        <span className="inline-flex items-center gap-1.5 font-mono-num">
          −2%
          <span className="inline-flex rounded overflow-hidden border" style={{ borderColor: 'var(--border-subtle)' }}>
            {[-2, -1, -0.2, 0.2, 1, 2].map((c) => (
              <span key={c} className="block w-5 h-2.5" style={{ backgroundColor: moveColor(c) }} />
            ))}
          </span>
          +2%
        </span>
        <span>{t('globe.world.note')}</span>
      </div>
      {alerts.length > 0 && (
        <ul className="text-xs space-y-1">
          {alerts.slice(0, 3).map((a) => (
            <li key={a.id} className="flex items-baseline gap-2">
              <span className="w-2 h-2 rounded-full shrink-0 translate-y-[-1px]" style={{ backgroundColor: a.level === 'high' ? 'var(--color-down)' : 'var(--color-gold)' }} aria-hidden="true" />
              <a href={a.link} target="_blank" rel="noopener noreferrer" className="hover:underline min-w-0">
                <span className="font-semibold">{a.place.name}:</span> {a.title}
              </a>
            </li>
          ))}
        </ul>
      )}</>}
    </section>
  );
}
