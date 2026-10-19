/**
 * forwardTest.ts — Live (forward) test of the AI Advisor: once a day per horizon and risk
 * profile, the verdict of every asset is saved with the date and price; when the horizon has
 * passed, the real daily closes decide whether the price rose. The track record compares the
 * share of rises after each verdict with the base rate of all saved verdicts in the same
 * period. Missed days are never filled in afterwards. Stored on the device (see storage.ts).
 */
import type { Verdict } from './outlook.ts';

export interface VerdictSnapshot {
  /** Snapshot day (WIB), YYYY-MM-DD. */
  date: string;
  horizonDays: number;
  profile: string;
  symbol: string;
  verdict: Verdict;
  /** Chance of a gain shown at the time (0–1), if any. */
  chance: number | null;
  /** Live price when saved (reference only; results use daily closes). */
  price: number;
  /** Filled in once the horizon has passed. */
  outcome?: { dueDate: string; ret: number; up: boolean };
}

export interface ForwardLog {
  version: 1;
  startedAt: string | null;
  snapshots: VerdictSnapshot[];
}

/** Keeps the stored log well under the browser's storage quota (~120 bytes per entry). */
export const MAX_SNAPSHOTS = 15_000;

export function emptyLog(): ForwardLog {
  return { version: 1, startedAt: null, snapshots: [] };
}

/**
 * Adds today's verdicts unless this day/horizon/profile was already saved. Returns the same
 * log object when nothing changed.
 */
export function recordSnapshots(
  log: ForwardLog,
  date: string,
  horizonDays: number,
  profile: string,
  rows: Array<{ symbol: string; verdict: Verdict; chance: number | null; price: number | undefined }>
): ForwardLog {
  if (log.snapshots.some((s) => s.date === date && s.horizonDays === horizonDays && s.profile === profile)) return log;
  const fresh: VerdictSnapshot[] = rows
    .filter((r) => r.price !== undefined && Number.isFinite(r.price) && (r.price as number) > 0)
    .map((r) => ({ date, horizonDays, profile, symbol: r.symbol, verdict: r.verdict, chance: r.chance, price: r.price as number }));
  if (fresh.length === 0) return log;
  const snapshots = [...log.snapshots, ...fresh];
  return { version: 1, startedAt: log.startedAt ?? date, snapshots: snapshots.slice(-MAX_SNAPSHOTS) };
}

export interface DailyClose {
  date: string; // YYYY-MM-DD
  close: number;
}

/**
 * Scores due snapshots against daily closes: the close on the snapshot day (or the last one
 * before it) versus the close `horizonDays` trading days later. Snapshots whose horizon has not
 * passed, or whose history is missing, are left open.
 */
export function evaluateSnapshots(log: ForwardLog, history: Map<string, DailyClose[]>): ForwardLog {
  let changed = false;
  const snapshots = log.snapshots.map((s) => {
    if (s.outcome) return s;
    const bars = history.get(s.symbol);
    if (!bars || bars.length === 0) return s;
    let i = -1;
    for (let k = 0; k < bars.length; k++) {
      if (bars[k].date <= s.date) i = k;
      else break;
    }
    if (i < 0) return s;
    const due = bars[i + s.horizonDays];
    if (!due || bars[i].close <= 0) return s;
    changed = true;
    const ret = due.close / bars[i].close - 1;
    return { ...s, outcome: { dueDate: due.date, ret, up: ret > 0 } };
  });
  return changed ? { ...log, snapshots } : log;
}

export interface TrackRow {
  verdict: Verdict;
  samples: number;
  upRate: number | null;
  avgReturn: number | null;
}

export interface TrackRecord {
  horizonDays: number;
  profile: string;
  startedAt: string | null;
  saved: number;
  evaluated: number;
  baseUpRate: number | null;
  rows: TrackRow[];
}

export const MIN_RESULTS = 30;

export function trackRecord(log: ForwardLog, horizonDays: number, profile: string): TrackRecord {
  const mine = log.snapshots.filter((s) => s.horizonDays === horizonDays && s.profile === profile);
  const done = mine.filter((s) => s.outcome);
  const rate = (list: VerdictSnapshot[]) => (list.length ? list.filter((s) => s.outcome?.up).length / list.length : null);
  const avg = (list: VerdictSnapshot[]) => (list.length ? list.reduce((a, s) => a + (s.outcome?.ret ?? 0), 0) / list.length : null);
  const verdicts: Verdict[] = ['favorable', 'watch', 'unfavorable', 'no-signal', 'not-suitable'];
  return {
    horizonDays,
    profile,
    startedAt: mine.length ? mine.reduce((m, s) => (s.date < m ? s.date : m), mine[0].date) : null,
    saved: mine.length,
    evaluated: done.length,
    baseUpRate: rate(done),
    rows: verdicts.map((v) => {
      const list = done.filter((s) => s.verdict === v);
      return { verdict: v, samples: list.length, upRate: rate(list), avgReturn: avg(list) };
    }),
  };
}

/**
 * Symbols with snapshots that may be due: no result yet and at least horizonDays trading days
 * (≈ 7/5 calendar days each) old, so nothing is fetched before a result can exist.
 */
export function pendingSymbols(log: ForwardLog, today: string): string[] {
  const t = Date.parse(today);
  return [
    ...new Set(
      log.snapshots
        .filter((s) => !s.outcome && t - Date.parse(s.date) >= Math.floor((s.horizonDays * 7) / 5) * 86_400_000)
        .map((s) => s.symbol)
    ),
  ];
}

export function parseForwardLog(raw: unknown): ForwardLog | null {
  const l = raw as Partial<ForwardLog>;
  if (!l || l.version !== 1 || !Array.isArray(l.snapshots)) return null;
  const snapshots = l.snapshots.filter(
    (s): s is VerdictSnapshot =>
      Boolean(s) &&
      typeof s.date === 'string' &&
      typeof s.symbol === 'string' &&
      typeof s.verdict === 'string' &&
      typeof s.price === 'number' &&
      typeof s.horizonDays === 'number' &&
      typeof s.profile === 'string'
  );
  return { version: 1, startedAt: typeof l.startedAt === 'string' ? l.startedAt : snapshots[0]?.date ?? null, snapshots };
}
