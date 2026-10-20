/**
 * cadence.ts — How often a sentiment horizon is worth re-checking, and the next catalyst.
 * Default cadence: Short daily (crypto every 4 hours), Medium weekly, Long monthly plus each new
 * financial report. Once validation has measured how fast the score's information coefficient
 * decays (IC half-life), the cadence follows it: half-life < 5 trading days → Daily, < 30 → Weekly,
 * otherwise Monthly. The next catalyst is the nearest relevant scheduled event (earnings,
 * ex-dividend, Bank Indonesia board meeting, FOMC).
 */
import type { Cadence } from './horizons.ts';
import type { Horizon } from './newsHorizon.ts';

export type CatalystType = 'earnings' | 'exDividend' | 'dividendPayment' | 'shareholderMeeting' | 'biMeeting' | 'fomc';

export interface Catalyst {
  type: CatalystType;
  date: string; // YYYY-MM-DD
  label?: string;
}

/** Which events matter for each horizon. */
const RELEVANT: Record<Horizon, CatalystType[]> = {
  short: ['earnings', 'exDividend', 'biMeeting', 'fomc'],
  medium: ['earnings', 'exDividend', 'shareholderMeeting', 'biMeeting', 'fomc'],
  long: ['earnings', 'shareholderMeeting', 'biMeeting', 'fomc'],
};

export function nextCatalyst(events: Catalyst[], h: Horizon, today: string): (Catalyst & { daysUntil: number }) | null {
  const next = events
    .filter((e) => RELEVANT[h].includes(e.type) && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) return null;
  const daysUntil = Math.round((Date.parse(next.date) - Date.parse(today)) / 86_400_000);
  return { ...next, daysUntil };
}

/** Cadence from the measured IC half-life (trading days); null half-life keeps the default. */
export function cadenceFromHalfLife(halfLifeDays: number | null, fallback: Cadence): { cadence: Cadence; reason: string | null } {
  if (halfLifeDays === null || !Number.isFinite(halfLifeDays) || halfLifeDays <= 0) return { cadence: fallback, reason: null };
  const days = Math.round(halfLifeDays);
  const cadence: Cadence = halfLifeDays < 5 ? 'Daily' : halfLifeDays < 30 ? 'Weekly' : 'Monthly';
  return { cadence, reason: `score information halves in about ${days} trading days` };
}

/**
 * Half-life from information coefficients measured at increasing look-ahead lags (days → IC):
 * the first lag where the IC falls to half of the first one, interpolated; null when it never
 * halves or the first IC is not positive.
 */
export function icHalfLife(series: Array<{ lag: number; ic: number }>): number | null {
  const s = [...series].sort((a, b) => a.lag - b.lag);
  if (s.length < 2 || !(s[0].ic > 0)) return null;
  const half = s[0].ic / 2;
  for (let i = 1; i < s.length; i++) {
    if (s[i].ic <= half) {
      const a = s[i - 1];
      const b = s[i];
      return a.lag + ((a.ic - half) / (a.ic - b.ic)) * (b.lag - a.lag);
    }
  }
  return null;
}
