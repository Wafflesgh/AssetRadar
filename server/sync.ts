/**
 * sync.ts — Owner login and the /api/sync/* endpoints. The owner logs in with SYNC_PASSPHRASE
 * and gets a signed session token; the browser then sends its changed items and receives
 * what changed on the server since its last sync (merge rules in src/utils/sync.ts). All data
 * goes through this server, so the database key stays here. Sync is off (everything stays on
 * the device) until both a database and a passphrase are configured.
 */
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { bearerToken, issueToken, LoginLimiter, passphraseMatches, sessionSecret, verifyToken } from '../src/utils/syncAuth.ts';
import { itemsChangedSince, mergeSyncData, parseSyncData, sameValue, SYNC_COLLECTIONS, type SyncData } from '../src/utils/sync.ts';
import { KeyedMutex, type KvStore } from './store.ts';

export const SYNC_DATA_KEY = 'sync:data';

export interface OwnerAuth {
  /** A passphrase is configured. */
  configured: boolean;
  isOwner(req: Request): boolean;
  requireOwner(req: Request, res: Response, next: NextFunction): void;
}

/** Client address for the login limiter (the last proxy hop's view, not a spoofable header value). */
export function clientKey(req: Request): string {
  const fwd = String(req.headers['x-forwarded-for'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return fwd[fwd.length - 1] || req.socket.remoteAddress || 'unknown';
}

export function createOwnerAuth(env: NodeJS.ProcessEnv = process.env): OwnerAuth & { secret: Buffer | null; passphrase: string } {
  const passphrase = env.SYNC_PASSPHRASE ?? '';
  const configured = passphrase.trim().length >= 8;
  const secret = configured ? sessionSecret(passphrase, env.SYNC_SESSION_SECRET?.trim() || undefined) : null;
  const isOwner = (req: Request) => Boolean(secret && verifyToken(bearerToken(req.headers.authorization), secret));
  return {
    configured,
    secret,
    passphrase,
    isOwner,
    requireOwner(req, res, next) {
      if (!configured) {
        res.status(503).json({ error: 'Sync is not configured on this server' });
        return;
      }
      if (!isOwner(req)) {
        res.status(401).json({ error: 'Login required' });
        return;
      }
      next();
    },
  };
}

/** True when synced data can be stored (a real database, or the explicit dev-only memory mode). */
export function syncStorageReady(store: KvStore, env: NodeJS.ProcessEnv = process.env): boolean {
  return store.persistent || env.SYNC_DEV_MEMORY_DB === '1';
}

const mutex = new KeyedMutex();

/** The synced data (watchlist, portfolio, alerts…) as stored on the server, or {} when none. */
export async function loadSyncData(store: KvStore): Promise<SyncData> {
  try {
    return parseSyncData(await store.get(SYNC_DATA_KEY));
  } catch (err) {
    console.warn('[Sync] load failed:', err instanceof Error ? err.message : err);
    return {};
  }
}

/** Live (not deleted) values of one synced collection. */
export function liveValues<T>(data: SyncData, col: (typeof SYNC_COLLECTIONS)[number]): Array<{ id: string; value: T }> {
  return Object.entries(data[col] ?? {})
    .filter(([, it]) => it.v !== null)
    .map(([id, it]) => ({ id, value: it.v as T }));
}

/** Server-side change to synced data (e.g. an alert marked as triggered), stamped like a device edit. */
export async function updateSyncData(store: KvStore, change: (data: SyncData, now: number) => SyncData | null): Promise<void> {
  await mutex.run(SYNC_DATA_KEY, async () => {
    const current = parseSyncData(await store.get(SYNC_DATA_KEY));
    const next = change(current, Date.now());
    if (next) await store.set(SYNC_DATA_KEY, next);
  });
}

export function registerSyncRoutes(app: Express, store: KvStore, auth: ReturnType<typeof createOwnerAuth>, env: NodeJS.ProcessEnv = process.env): void {
  const limiter = new LoginLimiter();
  const ready = () => auth.configured && syncStorageReady(store, env);

  app.get('/api/sync/status', (req, res) => {
    res.json({
      enabled: ready(),
      passphraseConfigured: auth.configured,
      database: store.persistent ? store.provider : env.SYNC_DEV_MEMORY_DB === '1' ? 'memory (development only)' : null,
      loggedIn: auth.isOwner(req),
      serverTime: Date.now(),
    });
  });

  app.post('/api/sync/login', express.json({ limit: '4kb' }), (req, res) => {
    if (!ready()) {
      res.status(503).json({ error: 'Sync is not configured on this server' });
      return;
    }
    const who = clientKey(req);
    const wait = limiter.retryAfter(who);
    if (wait > 0) {
      res.set('Retry-After', String(Math.ceil(wait / 1000)));
      res.status(429).json({ error: `Too many attempts. Try again in ${Math.ceil(wait / 60_000)} min.` });
      return;
    }
    const input = typeof req.body?.passphrase === 'string' ? req.body.passphrase.slice(0, 500) : '';
    if (!passphraseMatches(input, auth.passphrase)) {
      limiter.recordFailure(who);
      res.status(401).json({ error: 'Wrong passphrase' });
      return;
    }
    limiter.recordSuccess(who);
    res.json(issueToken(auth.secret as Buffer));
  });

  app.post('/api/sync/merge', auth.requireOwner, express.json({ limit: '12mb' }), async (req, res) => {
    if (!syncStorageReady(store, env)) {
      res.status(503).json({ error: 'No database configured' });
      return;
    }
    const since = Number(req.body?.since) || 0;
    const incoming = parseSyncData(req.body?.items);
    try {
      const result = await mutex.run(SYNC_DATA_KEY, async () => {
        const remote = parseSyncData(await store.get(SYNC_DATA_KEY));
        const stamp = Date.now();
        const { merged, summary } = mergeSyncData(incoming, remote, { stamp });
        if (!sameValue(merged, remote)) await store.set(SYNC_DATA_KEY, merged);
        // Back to the device: everything new since its last sync, minus what it just sent
        const base = since > 0 ? itemsChangedSince(merged, since) : merged;
        const delta: SyncData = {};
        for (const col of SYNC_COLLECTIONS) {
          if (!base[col]) continue;
          const items = { ...base[col] };
          delta[col] = items;
          for (const id of Object.keys(items)) {
            const sent = incoming[col]?.[id];
            if (sent && sent.t === items[id].t && sameValue(sent.v, items[id].v)) delete items[id];
          }
          if (Object.keys(items).length === 0) delete delta[col];
        }
        return { serverTime: stamp, items: delta, summary };
      });
      res.json(result);
    } catch (err) {
      console.warn('[Sync] merge failed:', err instanceof Error ? err.message : err);
      res.status(502).json({ error: 'Database unavailable' });
    }
  });
}
