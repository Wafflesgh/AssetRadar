/**
 * syncService.ts — Browser side of cross-device sync. Logs the owner in with the passphrase
 * (the server returns a signed session token, kept via storage.ts), then syncs: sends the items
 * changed on this device, applies what changed on the server, and tells the app which
 * collections to reload (`assetradar:sync-applied` event). Syncs on start, a few seconds after a
 * local edit, every 5 minutes, when the tab becomes visible and when the device comes back
 * online. Local data stays the source of truth offline and when sync is off.
 */
import { getLang, t } from '../i18n/index.ts';
import {
  applySyncItems,
  getSyncMeta,
  getSyncSession,
  readSyncItems,
  saveSyncMeta,
  saveSyncSession,
  syncAdapterCollections,
} from '../utils/storage.ts';
import { describeSummary, type MergeSummary, type SyncCollection, type SyncData } from '../utils/sync.ts';

export interface SyncServerStatus {
  enabled: boolean;
  passphraseConfigured: boolean;
  database: string | null;
  loggedIn: boolean;
}

export interface SyncState {
  /** null until the server answered. */
  server: SyncServerStatus | null;
  serverUnreachable: boolean;
  loggedIn: boolean;
  syncing: boolean;
  lastSyncAt: number | null;
  lastError: string | null;
  /** Plain-English result of the first merge after login. */
  firstMerge: { toDevice: string[]; toServer: string[] } | null;
}

type Listener = (state: SyncState) => void;

const listeners = new Set<Listener>();
let state: SyncState = {
  server: null,
  serverUnreachable: false,
  loggedIn: Boolean(getSyncSession()),
  syncing: false,
  lastSyncAt: getSyncMeta().lastSyncAt,
  lastError: getSyncMeta().lastError,
  firstMerge: null,
};

function setState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l(state);
}

export function getSyncState(): SyncState {
  return state;
}

export function subscribeSync(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

/** Authorization header for owner-only endpoints (sync, push, alerts), or {} when logged out. */
export function ownerHeaders(): Record<string, string> {
  const s = getSyncSession();
  return s ? { Authorization: `Bearer ${s.token}` } : {};
}

export async function refreshSyncStatus(): Promise<SyncServerStatus | null> {
  try {
    const res = await fetch('/api/sync/status', { headers: ownerHeaders() });
    if (!res.ok || res.headers.get('X-AssetRadar-Offline')) throw new Error(`HTTP ${res.status}`);
    const server = (await res.json()) as SyncServerStatus;
    // A token the server no longer accepts (passphrase changed, expired) is dropped
    if (getSyncSession() && server.passphraseConfigured && !server.loggedIn) {
      saveSyncSession(null);
      setState({ server, serverUnreachable: false, loggedIn: false, lastError: t('sync.err.expired') });
    } else {
      setState({ server, serverUnreachable: false, loggedIn: Boolean(getSyncSession()) && server.loggedIn });
    }
    return server;
  } catch {
    setState({ serverUnreachable: true });
    return null;
  }
}

export async function login(passphrase: string): Promise<void> {
  const res = await fetch('/api/sync/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passphrase }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Login failed (HTTP ${res.status})`);
  saveSyncSession({ token: data.token, expiresAt: data.expiresAt });
  // First sync after a login merges everything on both sides
  const meta = getSyncMeta();
  saveSyncMeta({ ...meta, since: 0 });
  setState({ loggedIn: true, lastError: null });
  await syncNow({ first: true });
}

export function logout(): void {
  saveSyncSession(null);
  setState({ loggedIn: false, firstMerge: null, lastError: null });
}

let inFlight: Promise<void> | null = null;

export function syncNow(options: { first?: boolean } = {}): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = doSync(Boolean(options.first)).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doSync(first: boolean): Promise<void> {
  if (!getSyncSession()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setState({ lastError: t('sync.err.offline') });
    return;
  }
  setState({ syncing: true });
  const meta = getSyncMeta();
  const full = meta.since === 0;
  const items: SyncData = {};
  const sentTimes: Partial<Record<SyncCollection, Record<string, number>>> = {};
  for (const col of syncAdapterCollections()) {
    const it = readSyncItems(col, full, meta);
    if (Object.keys(it).length) {
      items[col] = it;
      sentTimes[col] = Object.fromEntries(Object.entries(it).map(([id, x]) => [id, x.t]));
    }
  }
  try {
    const res = await fetch('/api/sync/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...ownerHeaders() },
      body: JSON.stringify({ since: meta.since, items }),
    });
    if (res.status === 401) {
      saveSyncSession(null);
      throw new Error('Session expired — log in again');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) throw new Error(data?.error || `Sync failed (HTTP ${res.status})`);
    // Apply the server's changes, then clear what was sent (unless edited again meanwhile)
    const applied: SyncCollection[] = [];
    for (const [col, colItems] of Object.entries((data.items ?? {}) as SyncData)) {
      if (colItems && applySyncItems(col as SyncCollection, colItems)) applied.push(col as SyncCollection);
    }
    const after = getSyncMeta();
    for (const [col, sent] of Object.entries(sentTimes) as Array<[SyncCollection, Record<string, number>]>) {
      const times = { ...(after.times[col] ?? {}), ...(after.deleted[col] ?? {}) };
      after.dirty[col] = (after.dirty[col] ?? []).filter((id) => !(id in sent) || times[id] !== sent[id]);
    }
    const now = Date.now();
    saveSyncMeta({ ...after, since: data.serverTime, lastSyncAt: now, lastError: null });
    const summary = data.summary as MergeSummary;
    setState({
      syncing: false,
      loggedIn: true,
      lastSyncAt: now,
      lastError: null,
      ...(first ? { firstMerge: { toDevice: describeSummary(summary, 'toLocal', getLang()), toServer: describeSummary(summary, 'toRemote', getLang()) } } : {}),
    });
    if (applied.length) window.dispatchEvent(new CustomEvent('assetradar:sync-applied', { detail: { collections: applied } }));
  } catch (err) {
    const message = err instanceof Error ? err.message : t('sync.err.failed');
    saveSyncMeta({ ...getSyncMeta(), lastError: message });
    setState({ syncing: false, lastError: message, loggedIn: Boolean(getSyncSession()) });
  }
}

let started = false;

/** Starts automatic syncing (no-op when logged out; safe to call more than once). */
export function startSync(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener('assetradar:local-change', () => {
    if (!getSyncSession()) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => syncNow(), 4000);
  });
  window.addEventListener('online', () => syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') syncNow();
  }, 5 * 60_000);
  refreshSyncStatus().then((s) => {
    if (s?.enabled && getSyncSession()) syncNow();
  });
}

/** Re-renders when sync applied changes to any of the given collections. */
export function onSyncApplied(collections: SyncCollection[], handler: () => void): () => void {
  const listener = (e: Event) => {
    const cols = (e as CustomEvent<{ collections: SyncCollection[] }>).detail?.collections ?? [];
    if (cols.some((c) => collections.includes(c))) handler();
  };
  window.addEventListener('assetradar:sync-applied', listener);
  return () => window.removeEventListener('assetradar:sync-applied', listener);
}
