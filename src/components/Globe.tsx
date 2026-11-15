/**
 * Globe.tsx — A light interactive globe drawn as SVG (d3-geo orthographic projection, no WebGL):
 * drag to turn it, + / − to zoom, hover (or tap) a shape for its tooltip, click to pick it.
 * Used for Indonesia's provinces (Kitchen Radar) and the world's stock markets (Radar). Shapes
 * come from the small map files in public/maps (built by scripts/build-maps.mjs). Colours are
 * the app's own tokens, so light and dark mode both work. Optional pulsing dots mark places.
 */
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useT } from '../i18n/index.ts';

export interface GlobeShape {
  type: 'Feature';
  properties: Record<string, string>;
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] };
}

export interface GlobeDot {
  id: string;
  lon: number;
  lat: number;
  color: string;
  pulse?: boolean;
  tip: ReactNode;
  onPick?: () => void;
}

const maps = new Map<string, Promise<GlobeShape[]>>();

/** Loads a map file once (shared by every globe on the page). */
export function loadMap(name: 'indonesia' | 'world'): Promise<GlobeShape[]> {
  let hit = maps.get(name);
  if (!hit) {
    hit = fetch(`/maps/${name}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { features: GlobeShape[] }) => j.features);
    hit.catch(() => maps.delete(name));
    maps.set(name, hit);
  }
  return hit;
}

const W = 680;
const H = 420;

interface GlobeProps {
  shapes: GlobeShape[];
  idOf: (s: GlobeShape) => string;
  /** Fill colour; null draws the shape as plain land that cannot be picked. */
  fill: (s: GlobeShape) => string | null;
  tip: (s: GlobeShape) => ReactNode;
  onPick?: (s: GlobeShape) => void;
  selected?: string;
  /** Shapes outlined in gold (something to check there). */
  marked?: Set<string>;
  dots?: GlobeDot[];
  /** Where the globe faces at first: [longitude, latitude] and zoom (1 = whole globe). */
  center: [number, number];
  zoom: number;
  label: string;
}

export function Globe({ shapes, idOf, fill, tip, onPick, selected, marked, dots = [], center, zoom, label }: GlobeProps) {
  const t = useT();
  const [view, setView] = useState({ lon: center[0], lat: center[1], k: zoom });
  const [hover, setHover] = useState<{ id: string; x: number; y: number; node: ReactNode } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; moved: number; touch: boolean } | null>(null);

  const path = useMemo(() => {
    const projection = geoOrthographic()
      .translate([W / 2, H / 2])
      .scale((H / 2 - 6) * view.k)
      .rotate([-view.lon, -view.lat])
      .clipAngle(90);
    const d = geoPath(projection);
    // Projected once per view, not on every hover or price update
    return { projection, sphere: d({ type: 'Sphere' }) ?? '', grid: d(geoGraticule10()) ?? '', shapes: shapes.map((s) => d(s)) };
  }, [view, shapes]);

  const place = (e: { clientX: number; clientY: number }, id: string, node: ReactNode) => {
    const box = wrap.current?.getBoundingClientRect();
    if (box) setHover({ id, x: e.clientX - box.left, y: e.clientY - box.top, node });
  };
  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: 0, touch: e.pointerType !== 'mouse' };
  };
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    d.moved += Math.abs(dx) + Math.abs(dy);
    if (d.moved < 4) return;
    setHover(null);
    // Degrees per pixel shrink as the globe is zoomed in
    const step = 0.35 / view.k;
    setView((v) => ({ ...v, lon: v.lon - dx * step, lat: Math.max(-70, Math.min(70, v.lat + dy * step)) }));
  };
  // A click right after a drag is the end of the drag, not a pick
  const dragged = () => (drag.current?.moved ?? 0) >= 4;
  // Touch has no hover: the first tap shows the tooltip, a second tap on the same thing picks it
  const tap = (e: { clientX: number; clientY: number }, id: string, node: ReactNode, pick?: () => void) => {
    if (dragged()) return;
    if (drag.current?.touch && hover?.id !== id) place(e, id, node);
    else pick?.();
  };
  // A finger "leaves" when it lifts, just before the click: only a mouse leaving hides the tooltip
  const leave = (e: ReactPointerEvent) => e.pointerType === 'mouse' && setHover(null);
  const zoomBy = (f: number) => setView((v) => ({ ...v, k: Math.max(1, Math.min(14, v.k * f)) }));
  const button = 'w-8 h-8 inline-flex items-center justify-center rounded-lg border';
  const buttonStyle = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' };
  const facing: [number, number] = [view.lon, view.lat];

  return (
    <div ref={wrap} className="relative rounded-xl overflow-hidden select-none" style={{ backgroundColor: 'var(--bg-surface-subtle)' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        className="w-full block"
        style={{ cursor: 'grab', touchAction: 'pan-y' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => setTimeout(() => (drag.current = null), 0)}
        onPointerCancel={() => (drag.current = null)}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'mouse') return;
          drag.current = null;
          setHover(null);
        }}
      >
        <path d={path.sphere} fill="var(--bg-canvas)" stroke="var(--border-strong)" strokeWidth={1} />
        <path d={path.grid} fill="none" stroke="var(--border-subtle)" strokeWidth={0.5} />
        {shapes.map((s, i) => {
          const id = idOf(s);
          const d = path.shapes[i];
          if (!d) return null;
          const color = fill(s);
          if (color === null) return <path key={id} d={d} fill="var(--border-subtle)" stroke="var(--bg-canvas)" strokeWidth={0.4} />;
          const active = hover?.id === id || selected === id;
          return (
            <path
              key={id}
              d={d}
              fill={color}
              stroke={active ? 'var(--text-primary)' : marked?.has(id) ? 'var(--color-gold)' : 'var(--bg-canvas)'}
              strokeWidth={selected === id ? 2 : active || marked?.has(id) ? 1.4 : 0.5}
              strokeDasharray={marked?.has(id) && !active ? '4 2' : undefined}
              style={{ cursor: onPick ? 'pointer' : 'default' }}
              onPointerMove={(e) => !drag.current?.moved && place(e, id, tip(s))}
              onPointerLeave={leave}
              onClick={(e) => tap(e, id, tip(s), onPick && (() => onPick(s)))}
            />
          );
        })}
        {dots.map((dot) => {
          if (geoDistance([dot.lon, dot.lat], facing) > Math.PI / 2 - 0.05) return null;
          const p = path.projection([dot.lon, dot.lat]);
          if (!p) return null;
          return (
            <g key={dot.id} style={{ cursor: dot.onPick ? 'pointer' : 'default' }} onPointerMove={(e) => place(e, dot.id, dot.tip)} onPointerLeave={leave} onClick={(e) => tap(e, dot.id, dot.tip, dot.onPick)}>
              {dot.pulse && <circle cx={p[0]} cy={p[1]} r={6} fill={dot.color} className="globe-pulse" />}
              <circle cx={p[0]} cy={p[1]} r={hover?.id === dot.id ? 6 : 4.5} fill={dot.color} stroke="var(--bg-canvas)" strokeWidth={1.2} />
            </g>
          );
        })}
      </svg>
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button type="button" className={button} style={buttonStyle} onClick={() => zoomBy(1.6)} aria-label={t('globe.zoomIn')} title={t('globe.zoomIn')}>
          <Plus size={16} aria-hidden="true" />
        </button>
        <button type="button" className={button} style={buttonStyle} onClick={() => zoomBy(1 / 1.6)} aria-label={t('globe.zoomOut')} title={t('globe.zoomOut')}>
          <Minus size={16} aria-hidden="true" />
        </button>
        <button type="button" className={button} style={buttonStyle} onClick={() => setView({ lon: center[0], lat: center[1], k: zoom })} aria-label={t('globe.reset')} title={t('globe.reset')}>
          <RotateCcw size={15} aria-hidden="true" />
        </button>
      </div>
      {hover && (
        <div
          className="absolute pointer-events-none px-2.5 py-1.5 rounded-lg border text-xs max-w-[16rem]"
          style={{
            left: Math.max(4, Math.min(hover.x + 12, (wrap.current?.clientWidth ?? 0) - 200)),
            top: Math.max(4, hover.y - 44),
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-strong)',
            color: 'var(--text-primary)',
          }}
        >
          {hover.node}
        </div>
      )}
      <p className="absolute left-3 bottom-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        {t('globe.hint')}
      </p>
    </div>
  );
}
