/**
 * usePriceFlash.ts — Tracks the direction of the latest price change per symbol so tables can
 * flash a cell green/red. `n` increases on every change: use it in the cell's React key so
 * the CSS animation (terminal-flash-up / terminal-flash-down) replays.
 */
import { useEffect, useRef, useState } from 'react';
import type { PriceTick } from '../config/assets.ts';

export type Flash = { dir: 'up' | 'down'; n: number };

export function usePriceFlash(ticks: Record<string, PriceTick>): Record<string, Flash> {
  const prevRef = useRef<Record<string, number>>({});
  const [flash, setFlash] = useState<Record<string, Flash>>({});

  useEffect(() => {
    const changes: Record<string, 'up' | 'down'> = {};
    for (const [sym, tick] of Object.entries(ticks)) {
      if (!tick || tick.status === 'error' || !Number.isFinite(tick.price)) continue;
      const prev = prevRef.current[sym];
      if (prev !== undefined && prev !== tick.price) changes[sym] = tick.price > prev ? 'up' : 'down';
      prevRef.current[sym] = tick.price;
    }
    if (Object.keys(changes).length === 0) return;
    setFlash((old) => {
      const next = { ...old };
      for (const [sym, dir] of Object.entries(changes)) next[sym] = { dir, n: (old[sym]?.n ?? 0) + 1 };
      return next;
    });
  }, [ticks]);

  return flash;
}

/** Class name for a flashing cell. */
export function flashClass(f: Flash | undefined): string {
  return f ? (f.dir === 'up' ? 'terminal-flash-up' : 'terminal-flash-down') : '';
}
