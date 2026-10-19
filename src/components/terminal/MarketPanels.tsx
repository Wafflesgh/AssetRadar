/**
 * MarketPanels.tsx — Terminal MONITOR table (all assets, price flash, click/1–9 to select)
 * and HEATMAP grid (color intensity by 24h % change).
 */
import { ASSETS, PriceTick } from '../../config/assets.ts';
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
  selectedSymbol: string;
  onSelect: (symbol: string) => void;
  highlighted?: boolean;
}

export function MonitorPanel({
  ticks,
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
      subtitle="Click a row or press 1–9"
      highlighted={highlighted}
      bodyClassName="overflow-x-auto"
    >
      <table className="w-full text-[11px] terminal-mono">
        <thead>
          <tr style={{ color: 'var(--t-muted)' }} className="text-left">
            <th className="px-2 py-1 font-medium">#</th>
            <th className="px-2 py-1 font-medium">CODE</th>
            <th className="px-2 py-1 font-medium text-right">PRICE</th>
            <th className="px-2 py-1 font-medium text-right">%24H</th>
            <th className="px-2 py-1 font-medium text-right hidden sm:table-cell">HIGH</th>
            <th className="px-2 py-1 font-medium text-right hidden sm:table-cell">LOW</th>
            <th className="px-2 py-1 font-medium text-right hidden lg:table-cell">UPD</th>
            <th className="px-2 py-1 font-medium hidden md:table-cell">STATUS</th>
          </tr>
        </thead>
        <tbody>
          {ASSETS.map((asset, idx) => {
            const tick = ticks[asset.symbol];
            const usable = isTickUsable(tick);
            const selected = asset.symbol === selectedSymbol;
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
                  <td colSpan={6} className="px-2 py-1.5" style={{ color: 'var(--t-muted)' }}>
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

export function HeatmapPanel({ ticks, selectedSymbol, onSelect, highlighted }: MarketPanelProps) {
  return (
    <TerminalPanel id="panel-heatmap" title="Heatmap" subtitle="24-hour % change" highlighted={highlighted}>
      <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-3 gap-1 p-1.5 terminal-mono">
        {ASSETS.map((asset) => {
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
