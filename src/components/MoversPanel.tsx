/**
 * MoversPanel.tsx — "Biggest movers" across every tracked index, stock, commodity, crypto and
 * currency: top gainers and losers for the live 5-minute window (from the ticks this app
 * received), 1 hour, 24 hours and 7 days, filterable by market type.
 */
import { useT, type TranslationKey } from '../i18n/index.ts';
import { assetName } from '../i18n/assetNames.ts';
import { useEffect, useMemo, useState } from 'react';
import { Activity, TrendingDown, TrendingUp } from 'lucide-react';
import { ASSETS, AssetConfig, AssetGroup, PriceTick } from '../config/assets.ts';
import { formatAssetPrice, formatPercent } from '../utils/format.ts';
import {
  LIVE_WINDOW_MS,
  MOVER_WINDOWS,
  MoverRow,
  MoverWindow,
  changeForWindow,
  liveHistory,
  rankMovers,
} from '../utils/movers.ts';

const FILTERS: Array<{ key: string; label: TranslationKey; groups: AssetGroup[] | null }> = [
  { key: 'all', label: 'movers.filter.all', groups: null },
  { key: 'stocks', label: 'movers.filter.stocks', groups: ['idStock', 'usStock', 'globalStock'] },
  { key: 'index', label: 'movers.filter.index', groups: ['index'] },
  { key: 'crypto', label: 'movers.filter.crypto', groups: ['crypto'] },
  { key: 'commodity', label: 'movers.filter.commodity', groups: ['commodity'] },
  { key: 'forex', label: 'movers.filter.forex', groups: ['forex'] },
];

interface MoversPanelProps {
  ticks: Record<string, PriceTick>;
  onSelect: (symbol: string) => void;
}

export function MoversPanel({ ticks, onSelect }: MoversPanelProps) {
  const [win, setWin] = useState<MoverWindow>('24h');
  const tr = useT();
  const [filter, setFilter] = useState('all');
  const [now, setNow] = useState(() => Date.now());

  // The live window reads a buffer outside React state, so refresh it on a short timer
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 2_000);
    return () => clearInterval(t);
  }, []);

  const groups = FILTERS.find((f) => f.key === filter)?.groups ?? null;
  const pool = useMemo(() => ASSETS.filter((a) => !groups || groups.includes(a.group)), [groups]);

  const { gainers, losers } = rankMovers(
    pool,
    (a) => changeForWindow(ticks[a.symbol], win, liveHistory, now),
    6,
    win === 'now' ? 0.001 : 0
  );

  const coverage = liveHistory.coverageMs(now);
  const activeHint = tr(`movers.win.${win}.hint` as TranslationKey);

  return (
    <section
      aria-labelledby="movers-heading"
      className="p-4 md:p-5 rounded-xl border space-y-4"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h2 id="movers-heading" className="text-base md:text-lg font-bold tracking-tight flex items-center gap-2">
            <Activity className="w-4 h-4" style={{ color: 'var(--accent-radar)' }} />
            {tr('movers.title')}
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {tr('movers.note', { hint: activeHint })}
          </p>
        </div>
        <div role="tablist" aria-label={tr('movers.window')} className="flex flex-wrap gap-1.5">
          {MOVER_WINDOWS.map((w) => (
            <button
              key={w.key}
              type="button"
              role="tab"
              aria-selected={win === w.key}
              title={tr(`movers.win.${w.key}.hint` as TranslationKey)}
              onClick={() => setWin(w.key)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap"
              style={chipStyle(win === w.key)}
            >
              {w.key === 'now' && <span className="news-live-dot inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ backgroundColor: 'var(--color-down)' }} />}
              {tr(`movers.win.${w.key}` as TranslationKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label={tr('movers.marketType')}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className="px-2.5 py-1 rounded-md text-[11px] font-semibold border whitespace-nowrap"
            style={chipStyle(filter === f.key)}
          >
            {tr(f.label)}
          </button>
        ))}
      </div>

      {win === 'now' && coverage < LIVE_WINDOW_MS && (
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {tr('movers.collecting', { min: Math.floor(coverage / 60_000), sec: Math.floor((coverage % 60_000) / 1000) })}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MoverList title={tr('movers.gainers')} icon="up" rows={gainers} ticks={ticks} onSelect={onSelect} />
        <MoverList title={tr('movers.losers')} icon="down" rows={losers} ticks={ticks} onSelect={onSelect} />
      </div>
    </section>
  );
}

function chipStyle(active: boolean) {
  return {
    backgroundColor: active ? 'var(--accent-radar-soft)' : 'var(--bg-surface-subtle)',
    borderColor: active ? 'var(--accent-radar)' : 'var(--border-subtle)',
    color: active ? 'var(--accent-radar)' : 'var(--text-secondary)',
  };
}

function MoverList({
  title,
  icon,
  rows,
  ticks,
  onSelect,
}: {
  title: string;
  icon: 'up' | 'down';
  rows: MoverRow<AssetConfig>[];
  ticks: Record<string, PriceTick>;
  onSelect: (symbol: string) => void;
}) {
  const tr = useT();
  const color = icon === 'up' ? 'var(--color-up)' : 'var(--color-down)';
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.value)), 0.0001);
  const Icon = icon === 'up' ? TrendingUp : TrendingDown;
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color }}>
        <Icon className="w-3.5 h-3.5" /> {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-xs py-4" style={{ color: 'var(--text-secondary)' }}>
          {tr('movers.none')}
        </p>
      ) : (
        <ol className="space-y-1">
          {rows.map(({ item, value }) => {
            const tick = ticks[item.symbol];
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.symbol)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg relative overflow-hidden flex items-center justify-between gap-3 hover:bg-[var(--bg-surface-subtle)]"
                >
                  {/* magnitude bar */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 opacity-15"
                    style={{ width: `${(Math.abs(value) / maxAbs) * 100}%`, backgroundColor: color }}
                  />
                  <span className="relative min-w-0">
                    <span className="font-mono-num font-bold text-[13px]">{item.code}</span>
                    <span className="text-[11px] ml-2 truncate" style={{ color: 'var(--text-secondary)' }}>
                      {assetName(item)}
                    </span>
                  </span>
                  <span className="relative text-right shrink-0">
                    <span className="font-mono-num text-xs tabular-nums mr-3 hidden sm:inline" style={{ color: 'var(--text-secondary)' }}>
                      {tick ? formatAssetPrice(tick.price, item) : ''}
                    </span>
                    <span className="font-mono-num text-xs font-bold tabular-nums" style={{ color }}>
                      {formatPercent(value)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
