/** freshness.ts — Pure cadence assessment for stored jobs and cached market data. */
import type { ExchangeId } from '../config/assets.ts';
import { isExchangeOpen } from './marketHours.ts';

export interface FreshnessInput {
  id: string;
  lastOk: number | null;
  expectedMs: number;
  market?: ExchangeId;
  weekdaysOnly?: boolean;
  problem?: unknown;
  /** Filled only while someone views the app (prices, news): shown, but not counted in `overall`. */
  viewerDriven?: boolean;
}
export type FreshnessStatus = 'ok' | 'late' | 'stale' | 'closed';
export interface FreshnessItem {
  id: string;
  lastOk: number | null;
  ageMs: number | null;
  expectedMs: number;
  status: FreshnessStatus;
  viewerDriven?: boolean;
}
export interface FreshnessReport {
  overall: Exclude<FreshnessStatus, 'closed'>;
  checkedAt: number;
  items: FreshnessItem[];
}

function hasProblem(value: unknown): boolean {
  if (typeof value === 'string') return value.startsWith('failed') || value === 'no time left';
  if (!value || typeof value !== 'object') return false;
  return 'error' in value || Object.values(value).some(hasProblem);
}

export function assessFreshness(inputs: FreshnessInput[], now: number): FreshnessReport {
  const items: FreshnessItem[] = inputs.map((input) => {
    const lastOk = input.lastOk !== null && Number.isFinite(input.lastOk) && input.lastOk > 0 ? input.lastOk : null;
    const ageMs = lastOk === null ? null : Math.max(0, now - lastOk);
    let effectiveAge = ageMs;
    if (lastOk !== null && input.weekdaysOnly) {
      // Move the next scheduled run past the weekend, retaining the ordinary cadence grace.
      const next = new Date(lastOk + 7 * 3600_000 + 86400_000);
      while (next.getUTCDay() === 0 || next.getUTCDay() === 6) next.setUTCDate(next.getUTCDate() + 1);
      effectiveAge = Math.max(0, now - (next.getTime() - 7 * 3600_000 - 86400_000));
    }
    let status: FreshnessStatus = effectiveAge === null || effectiveAge > 3 * input.expectedMs
      ? 'stale' : effectiveAge > 1.5 * input.expectedMs ? 'late' : 'ok';
    if (hasProblem(input.problem) && status === 'ok') status = 'late';
    if (input.market && !isExchangeOpen(input.market, now)) status = 'closed';
    return { id: input.id, lastOk, ageMs, expectedMs: input.expectedMs, status, ...(input.viewerDriven ? { viewerDriven: true } : {}) };
  });
  // A cold Cloud Run instance has empty price/news caches; only server-driven work decides `overall`
  const counted = items.filter((i) => !i.viewerDriven);
  const overall = counted.some((i) => i.status === 'stale') ? 'stale' : counted.some((i) => i.status === 'late') ? 'late' : 'ok';
  return { overall, checkedAt: now, items };
}
