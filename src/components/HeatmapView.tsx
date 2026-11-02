/**
 * HeatmapView.tsx — Market heatmap page (#/heatmap): tiles sized by market cap or by the value you
 * hold and coloured by the 24-hour or 7-day change, for the whole radar (by asset group), the
 * largest Indonesian stocks (by sector), your watchlist, your portfolio or your paper-trading
 * account. Layout from utils/treemap.ts (squarified); a tile opens the asset.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, RefreshCw } from 'lucide-react';
import { ASSETS, getAssetBySymbol, type AssetConfig, type PriceTick } from '../config/assets.ts';
import { fetchIdxSnapshot, type IdxSnapshot } from '../services/marketDataService.ts';
import { heatColor, nestedTreemap, type TreeGroup } from '../utils/treemap.ts';
import { sectorSlug } from '../utils/sectorRotation.ts';
import { assetClassOf, buildPositions, tradeUnitOf, valuePosition, type PortfolioTx } from '../utils/portfolio.ts';
import { parsePaperItems, summarizePaper } from '../utils/paperTrading.ts';
import { getPaperRaw, getPortfolioTxs } from '../utils/storage.ts';
import { useTrackedSymbols } from '../hooks/useTrackedSymbols.ts';
import { useT, type TranslationKey } from '../i18n/index.ts';
import { assetName, groupTitle } from '../i18n/assetNames.ts';
import { formatPercent } from '../utils/format.ts';

const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
const muted = { color: 'var(--text-secondary)' };
const SOURCES = ['market', 'idx', 'watchlist', 'portfolio', 'paper'] as const;
type Source = (typeof SOURCES)[number];
type Period = '24h' | '7d';
const IDX_TILES = 120;
const HEADER = 18;

interface Tile {
  symbol: string;
  code: string;
  name: string;
  size: number;
  change: number | null | undefined;
}

interface HeatmapViewProps {
  ticks: Record<string, PriceTick>;
  watchlist: string[];
  onSelectAsset: (symbol: string) => void;
}

export function HeatmapView({ ticks, watchlist, onSelectAsset }: HeatmapViewProps) {
  const t = useT();
  const [source, setSource] = useState<Source>('market');
  const [period, setPeriod] = useState<Period>('24h');
  const [idx, setIdx] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; data?: IdxSnapshot }>({ status: 'idle' });
  const [retry, setRetry] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (source !== 'idx') return;
    let alive = true;
    setIdx((s) => ({ ...s, status: 'loading' }));
    fetchIdxSnapshot()
      .then((data) => alive && setIdx({ status: 'ready', data }))
      .catch(() => alive && setIdx({ status: 'error' }));
    return () => {
      alive = false;
    };
  }, [source, retry]);

  const change = (tick: PriceTick | undefined) => (tick && !tick.fromSnapshot ? (period === '24h' ? tick.changePct24h : tick.changePct7d) : undefined);
  const tileOf = (a: AssetConfig, size: number, ch: number | null | undefined): Tile => ({ symbol: a.symbol, code: a.code.replace(/\.JK$/, ''), name: assetName(a), size, change: ch });

  // Symbols outside the core price loop need pricing while they are on screen
  const heldSymbols = useMemo(() => {
    if (source === 'watchlist') return watchlist;
    if (source === 'portfolio') return [...new Set(getPortfolioTxs<PortfolioTx>().map((x) => x.symbol))];
    if (source === 'paper') return [...new Set(parsePaperItems(getPaperRaw()).orders.map((o) => o.symbol))];
    return [];
  }, [source, watchlist]);
  useTrackedSymbols(heldSymbols);

  const groups = useMemo<Array<TreeGroup & { label: string; tiles: Map<string, Tile> }>>(() => {
    const out = new Map<string, { label: string; tiles: Tile[] }>();
    const add = (key: string, label: string, tile: Tile) => {
      if (!(tile.size > 0)) return;
      const g = out.get(key) ?? { label, tiles: [] };
      g.tiles.push(tile);
      out.set(key, g);
    };
    if (source === 'market') {
      for (const a of ASSETS) {
        if (a.group === 'forex') continue;
        const tick = ticks[a.symbol];
        add(a.group, groupTitle(a.group), tileOf(a, tick?.marketCapUsd ?? 0, change(tick)));
      }
    } else if (source === 'idx' && idx.data) {
      const rows = idx.data.rows.filter((r) => r.marketCapIdr && r.marketCapIdr > 0).sort((a, b) => b.marketCapIdr! - a.marketCapIdr!).slice(0, IDX_TILES);
      for (const r of rows) {
        const a = getAssetBySymbol(r.symbol);
        if (!a) continue;
        const slug = sectorSlug(a.sector ?? '');
        add(slug, t(`rotation.sector.${slug}` as TranslationKey), tileOf(a, r.marketCapIdr!, period === '24h' ? r.changePct24h : r.changePct7d));
      }
    } else if (source === 'watchlist') {
      for (const s of watchlist) {
        const a = getAssetBySymbol(s);
        if (a) add(a.group, groupTitle(a.group), tileOf(a, 1, change(ticks[s])));
      }
    } else if (source === 'portfolio') {
      for (const p of buildPositions(getPortfolioTxs<PortfolioTx>()).values()) {
        const a = getAssetBySymbol(p.symbol);
        if (!a || p.quantity <= 0) continue;
        const v = valuePosition(p, tradeUnitOf(a), ticks[p.symbol], ticks);
        const cls = assetClassOf(a);
        add(cls, t(`pf.class.${cls}` as TranslationKey), tileOf(a, v.marketValueIdr ?? 0, change(ticks[p.symbol])));
      }
    } else if (source === 'paper') {
      const { account, orders } = parsePaperItems(getPaperRaw());
      if (account) {
        for (const h of summarizePaper(account, orders, ticks, getAssetBySymbol).holdings) {
          const cls = assetClassOf(h.asset);
          add(cls, t(`pf.class.${cls}` as TranslationKey), tileOf(h.asset, h.valueIdr, change(ticks[h.symbol])));
        }
      }
    }
    return [...out.entries()].map(([id, g]) => ({ id, label: g.label, items: g.tiles.map((x) => ({ id: x.symbol, value: x.size })), tiles: new Map(g.tiles.map((x) => [x.symbol, x])) }));
  }, [source, period, ticks, idx.data, watchlist, t]);

  const height = width === 0 ? 0 : Math.max(320, Math.round(width >= 768 ? width * 0.52 : width * 1.35));
  const layout = useMemo(() => (width > 0 ? nestedTreemap(groups, width, height, HEADER) : []), [groups, width, height]);
  const empty = groups.length === 0;
  const loadingIdx = source === 'idx' && (idx.status === 'loading' || idx.status === 'idle');

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <LayoutGrid className="w-5 h-5" style={{ color: 'var(--accent-radar)' }} /> {t('heat.title')}
        </h2>
        <p className="text-sm max-w-3xl" style={muted}>
          {t('heat.intro')}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label={t('heat.sourceLabel')}>
          {SOURCES.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={source === s}
              onClick={() => setSource(s)}
              className="shrink-0 px-3 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap"
              style={source === s ? { borderColor: 'var(--accent-radar)', color: 'var(--accent-radar)', backgroundColor: 'var(--accent-radar-soft)' } : card}
            >
              {t(`heat.src.${s}` as TranslationKey)}
            </button>
          ))}
        </div>
        <div className="inline-flex p-1 rounded-lg gap-1 ml-auto" style={{ backgroundColor: 'var(--bg-surface-subtle)' }} role="radiogroup" aria-label={t('heat.periodLabel')}>
          {(['24h', '7d'] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={period === p}
              onClick={() => setPeriod(p)}
              className="px-3 py-1 rounded-md text-xs font-bold"
              style={period === p ? { backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' } : muted}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs" style={muted}>
        {t(`heat.size.${source}` as TranslationKey)}
      </p>

      <div ref={boxRef} className="w-full">
        {source === 'idx' && idx.status === 'error' ? (
          <div className="flex items-center gap-2 text-sm">
            <span style={muted}>{t('common.dataUnavailable')}</span>
            <button type="button" onClick={() => setRetry((n) => n + 1)} className="inline-flex items-center gap-1 px-2 py-1 rounded border font-semibold" style={card}>
              <RefreshCw className="w-3 h-3" /> {t('common.tryAgain')}
            </button>
          </div>
        ) : loadingIdx ? (
          <div className="skeleton rounded-2xl" style={{ height: height || 320 }} aria-busy="true" aria-label={t('common.loading')} />
        ) : empty ? (
          <p className="text-sm rounded-xl border p-4" style={{ ...card, ...muted }}>
            {t(`heat.empty.${source}` as TranslationKey)}
          </p>
        ) : (
          <div className="relative rounded-2xl overflow-hidden border" style={{ height, borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-canvas)' }}>
            {layout.map(({ group, items }) => {
              const g = groups.find((x) => x.id === group.id)!;
              return (
                <div key={group.id}>
                  {group.h > HEADER * 3 && (
                    <div
                      className="absolute px-1.5 text-[11px] font-bold truncate leading-[18px]"
                      style={{ left: group.x, top: group.y, width: group.w, height: HEADER, color: 'var(--text-secondary)' }}
                    >
                      {g.label}
                    </div>
                  )}
                  {items.map((r) => {
                    const tile = g.tiles.get(r.id)!;
                    const showText = r.w >= 44 && r.h >= 28;
                    const big = r.w * r.h > 14_000;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => onSelectAsset(tile.symbol)}
                        title={`${tile.name} · ${formatPercent(tile.change ?? undefined)}`}
                        aria-label={`${tile.name}, ${formatPercent(tile.change ?? undefined)}`}
                        className="absolute flex flex-col items-center justify-center text-center overflow-hidden"
                        style={{ left: r.x, top: r.y, width: r.w, height: r.h, backgroundColor: heatColor(tile.change), boxShadow: 'inset 0 0 0 1px var(--bg-canvas)', color: 'var(--text-primary)' }}
                      >
                        {showText && (
                          <>
                            <span className={`font-bold font-mono-num leading-tight ${big ? 'text-sm' : 'text-[10px]'}`}>{tile.code}</span>
                            <span className={`font-mono-num leading-tight ${big ? 'text-xs' : 'text-[9px]'}`}>{formatPercent(tile.change ?? undefined)}</span>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-[11px]" style={muted} aria-hidden="true">
        <span>-3%</span>
        <span className="h-2 flex-1 max-w-xs rounded-full" style={{ background: `linear-gradient(90deg, ${heatColor(-3)}, ${heatColor(-0.5)}, var(--bg-surface-subtle), ${heatColor(0.5)}, ${heatColor(3)})` }} />
        <span>+3%</span>
      </div>
    </div>
  );
}
