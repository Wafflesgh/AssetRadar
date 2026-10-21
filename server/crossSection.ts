/**
 * crossSection.ts — In-memory cross-section of a market for the sentiment pillars: monthly
 * closes (10 years), financial statements and analyst consensus for every stock of the IDX
 * universe (±960) and the US core stocks, collected by slow background queues so Yahoo and SEC
 * are never hammered. Cloud Run can sleep and lose memory, so every result carries its scan time
 * and the progress is reported; pages never wait for a full scan. Loaders are injected by
 * server.ts (they reuse its caches, cookies and timeouts). On a serverless host the queues do not
 * run on demand ("passive"); scanStep() works through stale symbols until a deadline and keeps the
 * data in the database, sharded so one step loads and saves only the shard it works on.
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

const KINDS = ['monthly', 'statements', 'analyst'] as const;
type Kind = (typeof KINDS)[number];
/** A failed symbol is tried again after this long (not on every step). */
const RETRY_MS = 2 * 3600_000;

/** Durable storage for the serverless scans (packed values of the key/value table). */
export interface CrossPersist {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
}

/** Shards per market: a scan step loads and saves only the shard it works on. */
export const SHARDS: Record<CrossMarket, number> = { idx: 8, us: 4 };

/** Stable shard of a symbol (independent of the order of the asset list). */
export function shardOf(symbol: string, shards: number): number {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  return h % shards;
}

/** When each symbol was last fetched (or failed), per kind; saved next to the shards. */
interface CrossMeta {
  at: Record<Kind, Record<string, number>>;
  lastStepAt: number;
}

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
  /** Serverless: touch() starts nothing (scanStep() from the cron tick does the work). */
  passive = false;
  private pace: typeof PACE;
  private meta: CrossMeta | null = null;

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
    if (this.passive) return Promise.resolve();
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
      await this.fetchKind(kind, todo, () => this.wanted(), (ok) => (ok ? pr.done++ : pr.failed++));
    } finally {
      pr.running = false;
      pr.finishedAt = Date.now();
    }
  }

  /** Fetches one kind for these assets (paced) while keepGoing() holds; returns symbol → success. */
  private async fetchKind(kind: Kind, todo: A[], keepGoing: () => boolean, onEach?: (ok: boolean) => void): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();
    const map = this[kind] as Map<string, Timed<unknown>>;
    if (kind === 'monthly') {
      for (let i = 0; i < todo.length && keepGoing(); i += 20) {
        const batch = todo.slice(i, i + 20);
        const got = await this.loaders.monthly(batch).catch(() => new Map<string, MonthlyClose[]>());
        for (const a of batch) {
          const sym = this.loaders.symbolOf(a);
          const series = got.get(sym);
          const ok = Boolean(series && series.length);
          if (ok) this.monthly.set(sym, { data: series as MonthlyClose[], at: Date.now() });
          result.set(sym, ok);
          onEach?.(ok);
        }
        await sleep(this.pace.monthly);
      }
    } else {
      for (const a of todo) {
        if (!keepGoing()) break;
        const sym = this.loaders.symbolOf(a);
        try {
          const data = kind === 'statements' ? await this.loaders.statements(a) : await this.loaders.analyst(a);
          map.set(sym, { data, at: Date.now() });
          result.set(sym, true);
          onEach?.(true);
        } catch {
          result.set(sym, false);
          onEach?.(false);
        }
        await sleep(this.pace[kind]);
      }
    }
    return result;
  }

  // ---- Serverless: database-backed, deadline-bound scan steps --------------------------------

  private key(part: string): string {
    return `xs:${this.market}:${part}`;
  }

  private async loadMeta(persist: CrossPersist): Promise<CrossMeta> {
    const saved = await persist.get<Partial<CrossMeta>>(this.key('meta'));
    const at = (kind: Kind) => ({ ...(saved?.at?.[kind] ?? {}) });
    this.meta = { at: { monthly: at('monthly'), statements: at('statements'), analyst: at('analyst') }, lastStepAt: saved?.lastStepAt ?? 0 };
    return this.meta;
  }

  /** Merges a saved shard into memory (newer entries win). */
  private async loadShard(persist: CrossPersist, kind: Kind, shard: number): Promise<void> {
    const saved = await persist.get<Record<string, Timed<unknown>>>(this.key(`${kind}:${shard}`));
    const map = this[kind] as Map<string, Timed<unknown>>;
    for (const [sym, t] of Object.entries(saved ?? {})) {
      if (t && typeof t.at === 'number' && !((map.get(sym)?.at ?? 0) >= t.at)) map.set(sym, t);
    }
  }

  private async saveShard(persist: CrossPersist, kind: Kind, shard: number): Promise<void> {
    const n = SHARDS[this.market];
    const out: Record<string, Timed<unknown>> = {};
    for (const [sym, t] of this[kind] as Map<string, Timed<unknown>>) if (shardOf(sym, n) === shard) out[sym] = t;
    await persist.set(this.key(`${kind}:${shard}`), out);
  }

  /**
   * One serverless scan step: stale symbols shard by shard until the deadline; each worked shard
   * and the fetch times are saved right away. Returns how many were fetched and how many stay stale.
   */
  async scanStep(persist: CrossPersist, deadline: number): Promise<{ fetched: number; pending: number }> {
    const meta = await this.loadMeta(persist);
    const n = SHARDS[this.market];
    let fetched = 0;
    let pending = 0;
    for (const kind of KINDS) {
      const now = Date.now();
      const byShard = new Map<number, A[]>();
      for (const a of this.assets()) {
        const sym = this.loaders.symbolOf(a);
        if (now - (meta.at[kind][sym] ?? 0) <= TTL[kind]) continue;
        const sh = shardOf(sym, n);
        byShard.set(sh, [...(byShard.get(sh) ?? []), a]);
      }
      for (const [shard, list] of byShard) {
        if (Date.now() >= deadline) {
          pending += list.length;
          continue;
        }
        await this.loadShard(persist, kind, shard);
        const done = await this.fetchKind(kind, list, () => Date.now() < deadline);
        for (const [sym, ok] of done) {
          meta.at[kind][sym] = ok ? Date.now() : Date.now() - TTL[kind] + RETRY_MS;
          if (ok) fetched++;
        }
        pending += list.length - done.size;
        if (done.size) {
          await this.saveShard(persist, kind, shard);
          meta.lastStepAt = Date.now();
          await persist.set(this.key('meta'), meta);
        }
      }
    }
    this.progressFromMeta();
    return { fetched, pending };
  }

  /** Loads every saved shard (to compute the market's pillars and validation). */
  async loadAll(persist: CrossPersist): Promise<void> {
    await this.loadMeta(persist);
    for (const kind of KINDS) for (let shard = 0; shard < SHARDS[this.market]; shard++) await this.loadShard(persist, kind, shard);
    this.progressFromMeta();
  }

  /** Progress as the saved fetch times describe it (serverless: no queue is running). */
  private progressFromMeta(): void {
    if (!this.meta) return;
    const all = this.assets().map((a) => this.loaders.symbolOf(a));
    const now = Date.now();
    for (const kind of KINDS) {
      const at = this.meta.at[kind];
      const done = all.filter((sym) => at[sym] !== undefined && now - at[sym] <= TTL[kind]).length;
      Object.assign(this.progress[kind], { done, failed: 0, total: all.length, running: false, startedAt: null, finishedAt: this.meta.lastStepAt || null });
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
    const f = (times: number[]) => {
      let oldest: number | null = null;
      let newest: number | null = null;
      for (const at of times) {
        oldest = oldest === null ? at : Math.min(oldest, at);
        newest = newest === null ? at : Math.max(newest, at);
      }
      return { oldest, newest, count: times.length };
    };
    // Serverless: the saved fetch times cover every shard, memory only the loaded ones
    const times = (kind: Kind) =>
      this.meta ? Object.values(this.meta.at[kind]) : [...(this[kind] as Map<string, Timed<unknown>>).values()].map((t) => t.at);
    return { monthly: f(times('monthly')), statements: f(times('statements')), analyst: f(times('analyst')) };
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
