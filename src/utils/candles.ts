/**
 * candles.ts — OHLC candle helpers for the alternative chart: 4-hour aggregation and
 * conversion to lightweight-charts series data shifted to WIB.
 */
import type { OhlcCandle } from '../config/assets.ts';

/** Merges small candles (e.g. 1 hour) into larger ones (e.g. 4 hours). */
export function aggregateCandles(candles: OhlcCandle[], bucketSec: number): OhlcCandle[] {
  const out: OhlcCandle[] = [];
  let current: OhlcCandle | null = null;
  for (const c of candles) {
    const bucket = Math.floor(c.time / bucketSec) * bucketSec;
    if (!current || current.time !== bucket) {
      if (current) out.push(current);
      current = { ...c, time: bucket };
    } else {
      current.high = Math.max(current.high, c.high);
      current.low = Math.min(current.low, c.low);
      current.close = c.close;
      if (c.volume !== undefined) current.volume = (current.volume ?? 0) + c.volume;
    }
  }
  if (current) out.push(current);
  return out;
}

/** WIB (UTC+7) offset in seconds. lightweight-charts always displays time as UTC. */
export const WIB_OFFSET_SEC = 7 * 3600;

export interface ChartSeriesData {
  candles: Array<{ time: number; open: number; high: number; low: number; close: number }>;
  /** Empty when the source has no volume data (e.g. forex). */
  volumes: Array<{ time: number; value: number; up: boolean }>;
}

/** Prepares chart data: time is shifted +7 hours so the time axis shows WIB. */
export function toWibChartData(candles: OhlcCandle[]): ChartSeriesData {
  const out: ChartSeriesData = { candles: [], volumes: [] };
  let hasVolume = false;
  for (const c of candles) {
    const time = c.time + WIB_OFFSET_SEC;
    out.candles.push({ time, open: c.open, high: c.high, low: c.low, close: c.close });
    const value = c.volume !== undefined && Number.isFinite(c.volume) ? c.volume : 0;
    if (value > 0) hasVolume = true;
    out.volumes.push({ time, value, up: c.close >= c.open });
  }
  if (!hasVolume) out.volumes = [];
  return out;
}
