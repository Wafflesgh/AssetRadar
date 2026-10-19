/**
 * MoversPanel.tsx — "Biggest movers" across every tracked index, stock, commodity, crypto and
 * currency: top gainers and losers for the live 5-minute window (from the ticks this app
 * received), 1 hour, 24 hours and 7 days, filterable by market type.
 */
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

const FILTERS: Array<{ key: string; label: string; groups: AssetGroup[] | null }> = [
  { key: 'all', label: 'All', groups: null },
  { key: 'stocks', label: 'Stocks', groups: ['idStock', 'usStock', 'globalStock'] },
  { key: 'index', label: 'Indices', groups: ['index'] },
  { key: 'crypto', label: 'Crypto', groups: ['crypto'] },
  { key: 'commodity', label: 'Commodities', groups: ['commodity'] },
  { key: 'forex', label: 'Forex', groups: ['forex'] },
];

interface MoversPanelProps {
  ticks: Record<string, PriceTick>;
  onSelect: (symbol: string) => void;
}

export function MoversPanel({ ticks, onSelect }: MoversPanelProps) {
  const [win, setWin] = useState<MoverWindow>('24h');
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
  const activeHint = MOVER_WINDOWS.find((w) => w.key === win)?.hint ?? '';

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
            Biggest Movers
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Which indices, stocks, commodities, crypto and currencies are moving the most. {activeHint}.
          </p>
        </div>
        <div role="tablist" aria-label="Movers time window" className="flex flex-wrap gap-1.5">
          {MOVER_WINDOWS.map((w) => (
            <button
              key={w.key}
              type="button"
              role="tab"
              aria-selected={win === w.key}
              title={w.hint}
              onClick={() => setWin(w.key)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap"
              style={chipStyle(win === w.key)}
            >
              {w.key === 'now' && <span className="news-live-dot inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ backgroundColor: 'var(--color-down)' }} />}
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Market type">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className="px-2.5 py-1 rounded-md text-[11px] font-semibold border whitespace-nowrap"
            style={chipStyle(filter === f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {win === 'now' && coverage < LIVE_WINDOW_MS && (
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          Collecting live ticks since this page opened ({Math.floor(coverage / 60_000)}m {Math.floor((coverage % 60_000) / 1000)}s of 5m) —
          changes are measured over the time collected so far. Exchange-traded assets only move while their market is open.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MoverList title="Top gainers" icon="up" rows={gainers} ticks={ticks} onSelect={onSelect} />
        <MoverList title="Top losers" icon="down" rows={losers} ticks={ticks} onSelect={onSelect} />
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
          No movement measured yet for this window.
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
                      {item.name}
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
