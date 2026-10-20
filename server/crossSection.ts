/**
 * crossSection.ts — In-memory cross-section of a market for the sentiment pillars: monthly
 * closes (10 years), financial statements and analyst consensus for every stock of the IDX
 * universe (±960) and the US core stocks, collected by slow background queues so Yahoo and SEC
 * are never hammered. Cloud Run can sleep and lose memory, so every result carries its scan time
 * and the progress is reported; pages never wait for a full scan. Loaders are injected by
 * server.ts (they reuse its caches, cookies and timeouts).
 */
import type { AnalystData } from '../src/utils/analyst.ts';
import type { PeriodValues } from '../src/utils/statements.ts';

export type CrossMarket = 'idx' | 'us';

export interface MonthlyClose {
  /** YYYY-MM of the month end. */
  month: string;
  close: number;
}

export interface StatementSet {
  annual: PeriodValues[];
  quarterly: PeriodValues[];
  currency: string;
}

export interface CrossLoaders<A> {
  /** Monthly closes for up to 20 symbols at once (Yahoo spark). */
  monthly: (assets: A[]) => Promise<Map<string, MonthlyClose[]>>;
  statements: (asset: A) => Promise<StatementSet | null>;
  analyst: (asset: A) => Promise<AnalystData | null>;
  symbolOf: (asset: A) => string;
}

interface Timed<T> {
  data: T;
  at: number;
}

export interface ScanProgress {
  kind: 'monthly' | 'statements' | 'analyst';
  done: number;
  failed: number;
  total: number;
  running: boolean;
  startedAt: number | null;
  finishedAt: number | null;
}

const TTL = { monthly: 24 * 3600_000, statements: 12 * 3600_000, analyst: 12 * 3600_000 };
/** Pause between requests of one queue (ms). */
const PACE = { monthly: 1500, statements: 1200, analyst: 2000 };
/** Scans run while someone asked for cross-section data within this window. */
const DEMAND_WINDOW_MS = 30 * 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One market's cross-section with three paced queues. */
export class CrossSection<A> {
  market: CrossMarket;
  private assets: () => A[];
  private loaders: CrossLoaders<A>;
  monthly = new Map<string, Timed<MonthlyClose[]>>();
  statements = new Map<string, Timed<StatementSet | null>>();
  analyst = new Map<string, Timed<AnalystData | null>>();
  progress: Record<ScanProgress['kind'], ScanProgress>;
  lastDemandAt = 0;
  private pace: typeof PACE;

  constructor(market: CrossMarket, assets: () => A[], loaders: CrossLoaders<A>, pace: Partial<typeof PACE> = {}) {
    this.market = market;
    this.assets = assets;
    this.loaders = loaders;
    this.pace = { ...PACE, ...pace };
    const p = (kind: ScanProgress['kind']): ScanProgress => ({ kind, done: 0, failed: 0, total: 0, running: false, startedAt: null, finishedAt: null });
    this.progress = { monthly: p('monthly'), statements: p('statements'), analyst: p('analyst') };
  }

  /** Records demand and starts any queue whose data is stale (callers need not await it). */
  touch(): Promise<void> {
    this.lastDemandAt = Date.now();
    return Promise.all([this.run('monthly'), this.run('statements'), this.run('analyst')]).then(
      () => undefined,
      () => undefined
    );
  }

  private wanted(): boolean {
    return Date.now() - this.lastDemandAt <= DEMAND_WINDOW_MS;
  }

  private stale<T>(map: Map<string, Timed<T>>, sym: string, ttl: number): boolean {
    const t = map.get(sym);
    return !t || Date.now() - t.at > ttl;
  }

  private async run(kind: ScanProgress['kind']): Promise<void> {
    const pr = this.progress[kind];
    if (pr.running) return;
    const all = this.assets();
    const map = this[kind] as Map<string, Timed<unknown>>;
    const todo = all.filter((a) => this.stale(map, this.loaders.symbolOf(a), TTL[kind]));
    if (!todo.length) return;
    Object.assign(pr, { running: true, total: all.length, done: all.length - todo.length, failed: 0, startedAt: Date.now(), finishedAt: null });
    try {
      if (kind === 'monthly') {
        for (let i = 0; i < todo.length && this.wanted(); i += 20) {
          const batch = todo.slice(i, i + 20);
          const got = await this.loaders.monthly(batch).catch(() => new Map<string, MonthlyClose[]>());
          for (const a of batch) {
            const sym = this.loaders.symbolOf(a);
            const series = got.get(sym);
            if (series && series.length) {
              this.monthly.set(sym, { data: series, at: Date.now() });
              pr.done++;
            } else pr.failed++;
          }
          await sleep(this.pace.monthly);
        }
      } else {
        for (const a of todo) {
          if (!this.wanted()) break;
          const sym = this.loaders.symbolOf(a);
          try {
            const data = kind === 'statements' ? await this.loaders.statements(a) : await this.loaders.analyst(a);
            map.set(sym, { data, at: Date.now() });
            pr.done++;
          } catch {
            pr.failed++;
          }
          await sleep(this.pace[kind]);
        }
      }
    } finally {
      pr.running = false;
      pr.finishedAt = Date.now();
    }
  }

  monthlyOf(sym: string): MonthlyClose[] | null {
    return this.monthly.get(sym)?.data ?? null;
  }

  statementsOf(sym: string): StatementSet | null {
    return this.statements.get(sym)?.data ?? null;
  }

  analystOf(sym: string): AnalystData | null {
    return this.analyst.get(sym)?.data ?? null;
  }

  /** When each kind of data was last refreshed (oldest entry still in use). */
  freshness(): Record<ScanProgress['kind'], { oldest: number | null; newest: number | null; count: number }> {
    const f = (m: Map<string, Timed<unknown>>) => {
      let oldest: number | null = null;
      let newest: number | null = null;
      for (const t of m.values()) {
        oldest = oldest === null ? t.at : Math.min(oldest, t.at);
        newest = newest === null ? t.at : Math.max(newest, t.at);
      }
      return { oldest, newest, count: m.size };
    };
    return { monthly: f(this.monthly), statements: f(this.statements), analyst: f(this.analyst) };
  }

  status() {
    return { market: this.market, progress: Object.values(this.progress), freshness: this.freshness() };
  }
}

/** Month-end closes (YYYY-MM) from monthly bars; the running month uses its latest close. */
export function monthlyFromBars(timestamps: number[], closes: Array<number | null>): MonthlyClose[] {
  const by = new Map<string, number>();
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (c === null || c === undefined || !Number.isFinite(c) || c <= 0) continue;
    by.set(new Date(timestamps[i] * 1000).toISOString().slice(0, 7), c);
  }
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, close]) => ({ month, close }));
}
