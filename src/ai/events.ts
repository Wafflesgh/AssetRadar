/**
 * events.ts — US Federal Reserve (FOMC) rate-decision calendar and event study.
 * Meeting dates are the published FOMC schedule (decision day = second day of the meeting).
 * Outcomes through 2025 are recorded; later outcomes are inferred from the move in the US
 * 13-week T-bill yield around the meeting, so the model adapts automatically as new data
 * arrives. The event study measures how each asset moved after past cuts, hikes and holds.
 */
import type { DailyBar } from './indicators.ts';

export type FedDecision = 'cut' | 'hike' | 'hold';

interface FomcMeeting {
  date: string; // decision day, YYYY-MM-DD (US Eastern)
  decision?: FedDecision; // recorded outcome; undefined = infer from T-bill yields
  bps?: number;
}

// prettier-ignore
export const FOMC_MEETINGS: FomcMeeting[] = [
  { date: '2021-01-27', decision: 'hold' }, { date: '2021-03-17', decision: 'hold' },
  { date: '2021-04-28', decision: 'hold' }, { date: '2021-06-16', decision: 'hold' },
  { date: '2021-07-28', decision: 'hold' }, { date: '2021-09-22', decision: 'hold' },
  { date: '2021-11-03', decision: 'hold' }, { date: '2021-12-15', decision: 'hold' },
  { date: '2022-01-26', decision: 'hold' }, { date: '2022-03-16', decision: 'hike', bps: 25 },
  { date: '2022-05-04', decision: 'hike', bps: 50 }, { date: '2022-06-15', decision: 'hike', bps: 75 },
  { date: '2022-07-27', decision: 'hike', bps: 75 }, { date: '2022-09-21', decision: 'hike', bps: 75 },
  { date: '2022-11-02', decision: 'hike', bps: 75 }, { date: '2022-12-14', decision: 'hike', bps: 50 },
  { date: '2023-02-01', decision: 'hike', bps: 25 }, { date: '2023-03-22', decision: 'hike', bps: 25 },
  { date: '2023-05-03', decision: 'hike', bps: 25 }, { date: '2023-06-14', decision: 'hold' },
  { date: '2023-07-26', decision: 'hike', bps: 25 }, { date: '2023-09-20', decision: 'hold' },
  { date: '2023-11-01', decision: 'hold' }, { date: '2023-12-13', decision: 'hold' },
  { date: '2024-01-31', decision: 'hold' }, { date: '2024-03-20', decision: 'hold' },
  { date: '2024-05-01', decision: 'hold' }, { date: '2024-06-12', decision: 'hold' },
  { date: '2024-07-31', decision: 'hold' }, { date: '2024-09-18', decision: 'cut', bps: 50 },
  { date: '2024-11-07', decision: 'cut', bps: 25 }, { date: '2024-12-18', decision: 'cut', bps: 25 },
  { date: '2025-01-29', decision: 'hold' }, { date: '2025-03-19', decision: 'hold' },
  { date: '2025-05-07', decision: 'hold' }, { date: '2025-06-18', decision: 'hold' },
  { date: '2025-07-30', decision: 'hold' }, { date: '2025-09-17', decision: 'cut', bps: 25 },
  { date: '2025-10-29', decision: 'cut', bps: 25 }, { date: '2025-12-10', decision: 'cut', bps: 25 },
  // 2026 schedule: outcomes are inferred from market data once they happen
  { date: '2026-01-28' }, { date: '2026-03-18' }, { date: '2026-04-29' }, { date: '2026-06-17' },
  { date: '2026-07-29' }, { date: '2026-09-16' }, { date: '2026-10-28' }, { date: '2026-12-09' },
];

export interface ResolvedMeeting {
  date: string;
  decision: FedDecision | null; // null = upcoming, or not enough data yet
  inferred: boolean;
}

/** T-bill move (percentage points) treated as a policy change when no outcome is recorded. */
const INFER_THRESHOLD = 0.15;

/**
 * Resolves each meeting's decision: recorded outcomes as-is; others inferred from the change
 * in the 13-week T-bill yield between ~15 trading days before and ~10 after the meeting.
 */
export function resolveMeetings(tbill: DailyBar[], today: string): ResolvedMeeting[] {
  const sorted = [...tbill].sort((a, b) => a.date.localeCompare(b.date));
  const indexOnOrAfter = (date: string) => sorted.findIndex((b) => b.date >= date);
  return FOMC_MEETINGS.map((m) => {
    if (m.decision) return { date: m.date, decision: m.decision, inferred: false };
    if (m.date > today) return { date: m.date, decision: null, inferred: false };
    const i = indexOnOrAfter(m.date);
    if (i < 15 || i + 10 >= sorted.length) return { date: m.date, decision: null, inferred: true };
    const before = sorted[i - 15].close;
    const after = sorted[i + 10].close;
    const move = after - before;
    const decision: FedDecision = move <= -INFER_THRESHOLD ? 'cut' : move >= INFER_THRESHOLD ? 'hike' : 'hold';
    return { date: m.date, decision, inferred: true };
  });
}

/**
 * Fed stance per target date: +1 if a cut happened in the previous 180 days and no hike
 * since, −1 for a recent hike, 0 otherwise. Uses only meetings on or before each date.
 */
/**
 * Before the first meeting in FOMC_MEETINGS (2021) there are no recorded decisions. When the
 * aligned 3-month T-bill yield is given, the stance there is read from its move over the last
 * ~6 months (≥ 0.5 point down = cutting, ≥ 0.5 up = hiking), so older history is not mistaken
 * for "no recent change".
 */
export function fedStanceSeries(dates: string[], meetings: ResolvedMeeting[], tbill?: Array<number | null>): number[] {
  const past = meetings.filter((m) => m.decision && m.decision !== 'hold');
  const first = FOMC_MEETINGS[0]?.date ?? '';
  return dates.map((date, i) => {
    if (tbill && date < first) {
      const now = tbill[i];
      const then = i >= 126 ? tbill[i - 126] : null;
      if (now === null || now === undefined || then === null || then === undefined) return 0;
      const move = now - then;
      return move <= -0.5 ? 1 : move >= 0.5 ? -1 : 0;
    }
    const limit = shiftDays(date, -180);
    let last: ResolvedMeeting | undefined;
    for (const m of past) {
      if (m.date <= date && m.date >= limit) last = m;
    }
    return last?.decision === 'cut' ? 1 : last?.decision === 'hike' ? -1 : 0;
  });
}

export function nextMeeting(today: string): string | null {
  return FOMC_MEETINGS.find((m) => m.date >= today)?.date ?? null;
}

export interface EventReaction {
  decision: FedDecision;
  count: number;
  /** Average return from the close before the decision to 5 / 20 trading days after. */
  avg5: number | null;
  avg20: number | null;
  /** Share of events with a positive 20-day return. */
  positive20: number | null;
}

/** How an asset reacted to past Fed decisions (event study on its own daily closes). */
export function eventStudy(bars: DailyBar[], meetings: ResolvedMeeting[]): EventReaction[] {
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const byType: Record<FedDecision, { r5: number[]; r20: number[] }> = {
    cut: { r5: [], r20: [] },
    hike: { r5: [], r20: [] },
    hold: { r5: [], r20: [] },
  };
  for (const m of meetings) {
    if (!m.decision) continue;
    const i = sorted.findIndex((b) => b.date >= m.date);
    if (i < 1) continue;
    const base = sorted[i - 1].close;
    if (base <= 0) continue;
    if (i + 5 < sorted.length) byType[m.decision].r5.push(sorted[i + 5].close / base - 1);
    if (i + 20 < sorted.length) byType[m.decision].r20.push(sorted[i + 20].close / base - 1);
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return (['cut', 'hike', 'hold'] as FedDecision[]).map((decision) => {
    const { r5, r20 } = byType[decision];
    return {
      decision,
      count: r20.length,
      avg5: mean(r5),
      avg20: mean(r20),
      positive20: r20.length ? r20.filter((r) => r > 0).length / r20.length : null,
    };
  });
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
