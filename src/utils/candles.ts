import type { OhlcCandle } from '../config/assets.ts';

/** Menggabungkan candle kecil (mis. 1 jam) menjadi candle lebih besar (mis. 4 jam). */
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

/** Selisih WIB (UTC+7) dalam detik. lightweight-charts selalu menampilkan waktu sebagai UTC. */
export const WIB_OFFSET_SEC = 7 * 3600;

export interface ChartSeriesData {
  candles: Array<{ time: number; open: number; high: number; low: number; close: number }>;
  /** Kosong jika sumber tidak punya data volume (mis. kurs). */
  volumes: Array<{ time: number; value: number; up: boolean }>;
}

/** Menyiapkan data grafik: waktu digeser +7 jam agar sumbu waktu tampil dalam WIB. */
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
