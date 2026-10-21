/**
 * store.ts — Server-side key/value storage for data that must survive Cloud Run restarts:
 * synced user data, the server AI forward-test log, alerts state, push subscriptions and daily
 * morning briefs. Uses Supabase (Postgres via its REST API, one table `assetradar_kv`) when
 * SUPABASE_URL and SUPABASE_SECRET_KEY (or the legacy SUPABASE_SERVICE_ROLE_KEY) are set; otherwise an in-memory map that is lost
 * on restart. The key never leaves the server and is never logged.
 */
import { gunzipSync, gzipSync } from 'node:zlib';
import { supabaseHeaders, supabaseKey } from '../src/utils/hosting.ts';

export interface KvStore {
  provider: 'supabase' | 'memory';
  /** False for the in-memory fallback (data is lost when the server restarts or sleeps). */
  persistent: boolean;
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  /** Keys that start with `prefix`. */
  keys(prefix: string): Promise<string[]>;
  remove(key: string): Promise<void>;
}

export const KV_TABLE = 'assetradar_kv';

class MemoryStore implements KvStore {
  provider = 'memory' as const;
  persistent = false;
  private data = new Map<string, string>();

  async get<T>(key: string): Promise<T | null> {
    const raw = this.data.get(key);
    return raw === undefined ? null : (JSON.parse(raw) as T);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.data.set(key, JSON.stringify(value));
  }

  async keys(prefix: string): Promise<string[]> {
    return [...this.data.keys()].filter((k) => k.startsWith(prefix)).sort();
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }
}

class SupabaseStore implements KvStore {
  provider = 'supabase' as const;
  persistent = true;
  private base: string;
  private key: string;

  constructor(url: string, serviceKey: string) {
    this.base = `${url.replace(/\/+$/, '')}/rest/v1/${KV_TABLE}`;
    this.key = serviceKey;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { ...supabaseHeaders(this.key), 'Content-Type': 'application/json', ...extra };
  }

  private async call(url: string, init: RequestInit): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      if (!res.ok) {
        // The body may echo the request; only the status is reported
        throw new Error(`Database HTTP ${res.status}`);
      }
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const res = await this.call(`${this.base}?key=eq.${encodeURIComponent(key)}&select=value`, { headers: this.headers() });
    const rows = (await res.json()) as Array<{ value: T }>;
    return rows[0]?.value ?? null;
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.call(this.base, {
      method: 'POST',
      headers: this.headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify([{ key, value, updated_at: new Date().toISOString() }]),
    });
  }

  async keys(prefix: string): Promise<string[]> {
    const pattern = `${prefix.replace(/[*%_\\]/g, '')}*`;
    const res = await this.call(`${this.base}?key=like.${encodeURIComponent(pattern)}&select=key&order=key.asc`, { headers: this.headers() });
    return ((await res.json()) as Array<{ key: string }>).map((r) => r.key);
  }

  async remove(key: string): Promise<void> {
    await this.call(`${this.base}?key=eq.${encodeURIComponent(key)}`, { method: 'DELETE', headers: this.headers({ Prefer: 'return=minimal' }) });
  }
}

/** Supabase when configured, otherwise memory. */
export function createStore(env: NodeJS.ProcessEnv = process.env): KvStore {
  const url = env.SUPABASE_URL?.trim();
  const key = supabaseKey(env);
  if (url && key && /^https:\/\//.test(url)) return new SupabaseStore(url, key);
  return new MemoryStore();
}

/**
 * Large values (scan data, computed rankings) are stored gzip-compressed as {gz: base64}, which
 * cuts the database egress several times; values saved plain are still read.
 */
export async function getPacked<T>(store: KvStore, key: string): Promise<T | null> {
  return unpack<T>(await store.get<unknown>(key));
}

export async function setPacked(store: KvStore, key: string, value: unknown): Promise<void> {
  await store.set(key, pack(value));
}

export function pack(value: unknown): { gz: string } {
  return { gz: gzipSync(Buffer.from(JSON.stringify(value), 'utf8')).toString('base64') };
}

export function unpack<T>(raw: unknown): T | null {
  if (raw && typeof raw === 'object' && typeof (raw as { gz?: unknown }).gz === 'string') {
    return JSON.parse(gunzipSync(Buffer.from((raw as { gz: string }).gz, 'base64')).toString('utf8')) as T;
  }
  return (raw ?? null) as T | null;
}

/** Runs async jobs one at a time per key (read-modify-write of one stored document). */
export class KeyedMutex {
  private chains = new Map<string, Promise<unknown>>();

  run<T>(key: string, job: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(key) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(job);
    this.chains.set(key, next);
    next.finally(() => {
      if (this.chains.get(key) === next) this.chains.delete(key);
    }).catch(() => undefined);
    return next;
  }
}
