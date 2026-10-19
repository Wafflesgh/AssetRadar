/** TickerTape.tsx — Terminal scrolling price tape for all assets (click to select). */
import { useState } from 'react';
import { ASSETS, PriceTick } from '../../config/assets.ts';
import { changeColor, formatTerminalPct, formatTerminalPrice, isTickUsable } from './TerminalPanel.tsx';

interface TickerTapeProps {
  ticks: Record<string, PriceTick>;
  onSelect: (symbol: string) => void;
}

/** Scrolling price tape; pauses on hover/touch, static with reduced motion. */
export function TickerTape({ ticks, onSelect }: TickerTapeProps) {
  const [paused, setPaused] = useState(false);

  const items = (copy: number) =>
    ASSETS.map((asset) => {
      const tick = ticks[asset.symbol];
      const usable = isTickUsable(tick);
      const pct = usable ? tick.changePct24h : undefined;
      return (
        <button
          key={`${copy}-${asset.id}`}
          type="button"
          tabIndex={copy === 0 ? 0 : -1}
          onClick={() => onSelect(asset.symbol)}
          className="inline-flex items-baseline gap-1.5 px-4 text-[11px] whitespace-nowrap hover:underline"
        >
          <span className="font-bold" style={{ color: 'var(--t-amber)' }}>
            {asset.code}
          </span>
          <span style={{ color: 'var(--t-text)' }}>
            {usable ? formatTerminalPrice(tick.price, asset) : tick ? 'N/A' : '...'}
          </span>
          <span style={{ color: changeColor(pct) }}>
            {pct !== undefined && pct > 0 ? '▲' : pct !== undefined && pct < 0 ? '▼' : ''}
            {formatTerminalPct(pct)}
          </span>
        </button>
      );
    });

  return (
    <div
      className={`terminal-ticker terminal-mono overflow-hidden border-b h-7 flex items-center ${
        paused ? 'is-paused' : ''
      }`}
      style={{ backgroundColor: 'var(--t-panel)', borderColor: 'var(--t-line)' }}
      onTouchStart={() => setPaused((p) => !p)}
      aria-label="Price tape for all assets"
    >
      <div className="terminal-ticker-track flex w-max">
        <div className="flex">{items(0)}</div>
        <div className="terminal-ticker-dup flex" aria-hidden="true">
          {items(1)}
        </div>
      </div>
    </div>
  );
}
