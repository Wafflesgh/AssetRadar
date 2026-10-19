/**
 * MarketPanels.tsx — Terminal MONITOR table (price flash, live 5-minute change, click/1–9 to
 * select) and HEATMAP grid (color intensity by 24h % change), both filtered by market type
 * through the shared group tabs.
 */
import type { ReactNode } from 'react';
import { AssetConfig, AssetGroup, PriceTick } from '../../config/assets.ts';
import { LIVE_WINDOW_MS, liveHistory } from '../../utils/movers.ts';
import {
  RetryButton,
  TerminalPanel,
  changeColor,
  formatTerminalPct,
  formatTerminalPrice,
  formatWibStamp,
  isTickUsable,
} from './TerminalPanel.tsx';
import { usePriceFlash } from '../../hooks/usePriceFlash.ts';

interface MarketPanelProps {
  ticks: Record<string, PriceTick>;
  /** Assets to show (already filtered by the group tabs). */
  assets: AssetConfig[];
  selectedSymbol: string;
  onSelect: (symbol: string) => void;
  highlighted?: boolean;
  /** Header controls (the group tabs). */
  right?: ReactNode;
}

/** Market filter for MONITOR and HEATMAP. */
export type TerminalGroup = 'ALL' | AssetGroup;

export const TERMINAL_GROUPS: Array<{ key: TerminalGroup; label: string }> = [
  { key: 'ALL', label: 'ALL' },
  { key: 'crypto', label: 'CRYPTO' },
  { key: 'idStock', label: 'IDX' },
  { key: 'usStock', label: 'US' },
  { key: 'globalStock', label: 'WORLD' },
  { key: 'index', label: 'INDEX' },
  { key: 'commodity', label: 'CMDTY' },
  { key: 'forex', label: 'FX' },
];

export function GroupTabs({ value, onChange }: { value: TerminalGroup; onChange: (g: TerminalGroup) => void }) {
  return (
    <div role="group" aria-label="Market filter" className="flex flex-wrap">
      {TERMINAL_GROUPS.map((g) => (
        <button
          key={g.key}
          type="button"
          aria-pressed={value === g.key}
          onClick={() => onChange(g.key)}
          className="px-1.5 h-5 text-[10px] font-bold"
          style={{
            backgroundColor: value === g.key ? 'var(--t-amber)' : 'transparent',
            color: value === g.key ? '#05070A' : 'var(--t-muted)',
            borderRadius: 2,
          }}
        >
          {g.label}
        </button>
      ))}
    </div>
  );
}

export function MonitorPanel({
  ticks,
  assets,
  right,
  selectedSymbol,
  onSelect,
  onRetry,
  highlighted,
  className,
}: MarketPanelProps & { onRetry: (symbol: string) => void; className?: string }) {
  const flash = usePriceFlash(ticks);

  return (
    <TerminalPanel
      id="panel-monitor"
      className={className}
      title="Monitor"
      subtitle={`${assets.length} assets · click or press 1–9`}
      highlighted={highlighted}
      right={right}
      bodyClassName="overflow-auto max-h-[30rem]"
    >
      <table className="w-full text-[11px] terminal-mono">
        <thead className="sticky top-0 z-[1]" style={{ backgroundColor: 'var(--t-panel)' }}>
          <tr style={{ color: 'var(--t-muted)' }} className="text-left">
            <th className="px-2 py-1 font-medium">#</th>
            <th className="px-2 py-1 font-medium">CODE</th>
            <th className="px-2 py-1 font-medium text-right">PRICE</th>
            <th className="px-2 py-1 font-medium text-right" title="Change over the last 5 minutes of live ticks">%5M</th>
            <th className="px-2 py-1 font-medium text-right">%24H</th>
            <th className="px-2 py-1 font-medium text-right hidden sm:table-cell">HIGH</th>
            <th className="px-2 py-1 font-medium text-right hidden sm:table-cell">LOW</th>
            <th className="px-2 py-1 font-medium text-right hidden lg:table-cell">UPD</th>
            <th className="px-2 py-1 font-medium hidden md:table-cell">STATUS</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset, idx) => {
            const tick = ticks[asset.symbol];
            const usable = isTickUsable(tick);
            const selected = asset.symbol === selectedSymbol;
            const live5m = usable && !tick.fromSnapshot ? liveHistory.changeOver(asset.symbol, LIVE_WINDOW_MS)?.pct : undefined;
            const f = flash[asset.symbol];
            return (
              <tr
                key={asset.id}
                onClick={() => onSelect(asset.symbol)}
                aria-selected={selected}
                className="cursor-pointer border-t"
                style={{
                  borderColor: 'var(--t-line)',
                  backgroundColor: selected ? 'var(--t-amber-soft)' : undefined,
                }}
              >
                <td className="px-2 py-1.5" style={{ color: 'var(--t-muted)' }}>
                  {idx + 1}
                </td>
                <td className="px-2 py-1.5 font-bold whitespace-nowrap" style={{ color: 'var(--t-amber)' }}>
                  {selected ? '▸ ' : ''}
                  {asset.code}
                </td>
                {usable ? (
                  <>
                    <td
                      // the key changes on every flash so the CSS animation replays
                      key={`p-${f?.n ?? 0}`}
                      className={`px-2 py-1.5 text-right whitespace-nowrap ${
                        f ? (f.dir === 'up' ? 'terminal-flash-up' : 'terminal-flash-down') : ''
                      }`}
                      style={{ color: 'var(--t-text)' }}
                    >
                      {formatTerminalPrice(tick.price, asset)}
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap" style={{ color: changeColor(live5m) }}>
                      {formatTerminalPct(live5m)}
                    </td>
                    <td
                      className="px-2 py-1.5 text-right whitespace-nowrap"
                      style={{ color: changeColor(tick.changePct24h) }}
                    >
                      {formatTerminalPct(tick.changePct24h)}
                    </td>
                    <td className="px-2 py-1.5 text-right hidden sm:table-cell" style={{ color: 'var(--t-muted)' }}>
                      {formatTerminalPrice(tick.high24h, asset)}
                    </td>
                    <td className="px-2 py-1.5 text-right hidden sm:table-cell" style={{ color: 'var(--t-muted)' }}>
                      {formatTerminalPrice(tick.low24h, asset)}
                    </td>
                    <td className="px-2 py-1.5 text-right hidden lg:table-cell" style={{ color: 'var(--t-muted)' }}>
                      {formatWibStamp(tick.updatedAt)}
                    </td>
                    <td className="px-2 py-1.5 hidden md:table-cell uppercase" style={{ color: 'var(--t-muted)' }}>
                      {tick.fromSnapshot ? 'SAVED' : tick.isMarketOpen === false ? 'CLOSED' : tick.status}
                    </td>
                  </>
                ) : (
                  <td colSpan={7} className="px-2 py-1.5" style={{ color: 'var(--t-muted)' }}>
                    {tick ? (
                      <span className="inline-flex items-center gap-2">
                        Data unavailable
                        <span onClick={(e) => e.stopPropagation()}>
                          <RetryButton onClick={() => onRetry(asset.symbol)} />
                        </span>
                      </span>
                    ) : (
                      'Loading...'
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </TerminalPanel>
  );
}

/** Heatmap cell color: intensity follows the size of the % move (capped at ±5%). */
function heatColor(pct: number | undefined): string {
  if (pct === undefined || !Number.isFinite(pct) || pct === 0) return 'rgba(156, 163, 175, 0.12)';
  const alpha = 0.15 + Math.min(Math.abs(pct), 5) / 5 * 0.7;
  return pct > 0 ? `rgba(34, 197, 94, ${alpha.toFixed(2)})` : `rgba(239, 68, 68, ${alpha.toFixed(2)})`;
}

export function HeatmapPanel({ ticks, assets, selectedSymbol, onSelect, highlighted, right }: MarketPanelProps) {
  return (
    <TerminalPanel id="panel-heatmap" title="Heatmap" subtitle="24-hour % change" highlighted={highlighted} right={right} bodyClassName="overflow-y-auto max-h-[30rem]">
      <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-4 gap-1 p-1.5 terminal-mono">
        {assets.map((asset) => {
          const tick = ticks[asset.symbol];
          const pct = isTickUsable(tick) ? tick.changePct24h : undefined;
          const selected = asset.symbol === selectedSymbol;
          return (
            <button
              key={asset.id}
              type="button"
              onClick={() => onSelect(asset.symbol)}
              className="h-12 flex flex-col items-center justify-center border"
              style={{
                backgroundColor: heatColor(pct),
                borderColor: selected ? 'var(--t-amber)' : 'transparent',
                borderRadius: 2,
              }}
            >
              <span className="text-[11px] font-bold" style={{ color: 'var(--t-text)' }}>
                {asset.code}
              </span>
              <span className="text-xs font-bold" style={{ color: 'var(--t-text)' }}>
                {pct === undefined && tick && !isTickUsable(tick) ? 'N/A' : formatTerminalPct(pct)}
              </span>
            </button>
          );
        })}
      </div>
    </TerminalPanel>
  );
}
