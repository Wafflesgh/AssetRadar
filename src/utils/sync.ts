/**
 * sync.ts — Pure merge logic for cross-device sync (watchlist, portfolio, AI forward-test log,
 * risk profile, settings and the later collections such as alerts or saved screens).
 * Every collection is a map of item id → { v: value | null (deleted), t: edit time, s: server
 * receive time }. Merging is per item: the newest edit (`t`) wins, deletions are kept as
 * tombstones so they spread to other devices, portfolio transactions merge by id so none is
 * lost, and a collection can supply its own resolver (forward-test entries prefer the one that
 * already has a result). Used by both the server (/api/sync/merge) and the browser.
 */
import { translate, type AppLang, type TParams, type TranslationKey } from '../i18n/core.ts';

export const SYNC_COLLECTIONS = [
  'watchlist',
  'portfolio',
  'forwardLog',
  'riskResult',
  'settings',
  'alerts',
  'screens',
  'strategies',
  'dividends',
  'goldPrices',
] as const;

export type SyncCollection = (typeof SYNC_COLLECTIONS)[number];

export const COLLECTION_LABELS: Record<SyncCollection, string> = {
  watchlist: 'Watchlist',
  portfolio: 'Portfolio transactions',
  forwardLog: 'AI forward-test log',
  riskResult: 'Risk profile',
  settings: 'Settings',
  alerts: 'Price alerts',
  screens: 'Saved screens',
  strategies: 'Backtest strategies',
  dividends: 'Dividends received',
  goldPrices: 'Gold buyback prices',
};

export interface SyncItem {
  /** The value; null marks a deletion (tombstone). */
  v: unknown;
  /** Edit time on the device that made the change (ms). */
  t: number;
  /** Time the server stored this version (ms); used to send only what changed since a sync. */
  s?: number;
}

export type SyncItems = Record<string, SyncItem>;
export type SyncData = Partial<Record<SyncCollection, SyncItems>>;

export interface CollectionSummary {
  /** Items the other side did not have yet (or had an older version of). */
  added: number;
  /** Items on both sides with different values, settled by the newest edit. */
  conflicts: number;
  /** Deletions applied. */
  deleted: number;
}

export type MergeSummary = Partial<Record<SyncCollection, { toLocal: CollectionSummary; toRemote: CollectionSummary }>>;

/** Tombstones older than this are dropped (a device offline for longer may bring an item back). */
export const TOMBSTONE_TTL_MS = 180 * 86_400_000;

export function isSyncCollection(name: string): name is SyncCollection {
  return (SYNC_COLLECTIONS as readonly string[]).includes(name);
}

/** JSON with sorted object keys, so equal values compare equal regardless of key order. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

export function sameValue(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

/**
 * Picks the winner of two versions of one item. Returns 'a' or 'b'. Newest edit wins; on a tie a
 * live value beats a deletion, then the larger serialized value wins (deterministic on every
 * device).
 */
export type Resolver = (a: SyncItem, b: SyncItem) => 'a' | 'b';

export const newestWins: Resolver = (a, b) => {
  if (a.t !== b.t) return a.t > b.t ? 'a' : 'b';
  if ((a.v === null) !== (b.v === null)) return a.v === null ? 'b' : 'a';
  return stableStringify(a.v) >= stableStringify(b.v) ? 'a' : 'b';
};

/** Forward-test entries: a version with a scored outcome always beats one without. */
export const forwardLogResolver: Resolver = (a, b) => {
  const done = (x: SyncItem) => Boolean(x.v && typeof x.v === 'object' && (x.v as { outcome?: unknown }).outcome);
  if (done(a) !== done(b)) return done(a) ? 'a' : 'b';
  return newestWins(a, b);
};

export const RESOLVERS: Partial<Record<SyncCollection, Resolver>> = { forwardLog: forwardLogResolver };

function emptySummary(): CollectionSummary {
  return { added: 0, conflicts: 0, deleted: 0 };
}

/**
 * Merges two versions of the data. `stamp` (server time) is written as `s` on every item whose
 * stored version changes, so a later delta sync can find it. Returns the merged data and what
 * each side gains: `toLocal` = changes the device must apply, `toRemote` = changes the server
 * must store.
 */
export function mergeSyncData(
  local: SyncData,
  remote: SyncData,
  options: { stamp?: number; now?: number } = {}
): { merged: SyncData; summary: MergeSummary } {
  const now = options.now ?? Date.now();
  const merged: SyncData = {};
  const summary: MergeSummary = {};
  for (const col of SYNC_COLLECTIONS) {
    const a = local[col] ?? {};
    const b = remote[col] ?? {};
    if (!local[col] && !remote[col]) continue;
    const resolve = RESOLVERS[col] ?? newestWins;
    const out: SyncItems = {};
    const toLocal = emptySummary();
    const toRemote = emptySummary();
    for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const la = a[id];
      const rb = b[id];
      let winner: SyncItem;
      if (la && rb) {
        if (sameValue(la.v, rb.v)) {
          winner = { ...rb, t: Math.max(la.t, rb.t) };
        } else {
          const pick = resolve(la, rb);
          if (pick === 'a') {
            winner = { v: la.v, t: la.t, ...(options.stamp !== undefined ? { s: options.stamp } : {}) };
            if (la.v === null) toRemote.deleted++;
            else toRemote.conflicts++;
          } else {
            winner = rb;
            if (rb.v === null) toLocal.deleted++;
            else toLocal.conflicts++;
          }
        }
      } else if (la) {
        winner = { v: la.v, t: la.t, ...(options.stamp !== undefined ? { s: options.stamp } : {}) };
        if (la.v === null) toRemote.deleted++;
        else toRemote.added++;
      } else {
        winner = rb as SyncItem;
        if (winner.v === null) toLocal.deleted++;
        else toLocal.added++;
      }
      // Old tombstones are forgotten
      if (winner.v === null && now - winner.t > TOMBSTONE_TTL_MS) continue;
      out[id] = winner;
    }
    merged[col] = out;
    summary[col] = { toLocal, toRemote };
  }
  return { merged, summary };
}

/** Items stored by the server after `since` (server time): the delta a device has not seen. */
export function itemsChangedSince(data: SyncData, since: number): SyncData {
  const out: SyncData = {};
  for (const col of SYNC_COLLECTIONS) {
    const items = data[col];
    if (!items) continue;
    const changed = Object.entries(items).filter(([, it]) => (it.s ?? 0) > since);
    if (changed.length) out[col] = Object.fromEntries(changed);
  }
  return out;
}

/**
 * Turns a fresh copy of a collection (id → value) into sync items, using the previous edit times
 * from `meta`: unchanged items keep their time, new or changed ones get `now`, items that
 * disappeared become tombstones.
 */
export function diffCollection(
  previous: Record<string, unknown>,
  next: Record<string, unknown>
): { changed: string[]; removed: string[] } {
  const changed: string[] = [];
  const removed: string[] = [];
  for (const [id, v] of Object.entries(next)) {
    if (!(id in previous) || !sameValue(previous[id], v)) changed.push(id);
  }
  for (const id of Object.keys(previous)) if (!(id in next)) removed.push(id);
  return { changed, removed };
}

/** Sanitizes data received over the network: known collections, string ids, numeric times. */
export function parseSyncData(raw: unknown, maxItems = 60_000): SyncData {
  const out: SyncData = {};
  if (!raw || typeof raw !== 'object') return out;
  let count = 0;
  for (const [col, items] of Object.entries(raw as Record<string, unknown>)) {
    if (!isSyncCollection(col) || !items || typeof items !== 'object' || Array.isArray(items)) continue;
    const clean: SyncItems = {};
    for (const [id, it] of Object.entries(items as Record<string, unknown>)) {
      if (count >= maxItems) break;
      const item = it as Partial<SyncItem>;
      if (!id || id.length > 200 || !item || typeof item !== 'object' || typeof item.t !== 'number' || !Number.isFinite(item.t)) continue;
      if (!('v' in item)) continue;
      clean[id] = { v: item.v ?? null, t: item.t, ...(typeof item.s === 'number' ? { s: item.s } : {}) };
      count++;
    }
    out[col] = clean;
  }
  return out;
}

/** Plain-English one-liner of a merge summary for the Sync card. */
/** One line per collection that changed, in the given language. */
export function describeSummary(summary: MergeSummary, side: 'toLocal' | 'toRemote', lang: AppLang = 'en'): string[] {
  const tx = (key: string, params?: TParams) => translate(lang, key as TranslationKey, params);
  const lines: string[] = [];
  for (const col of SYNC_COLLECTIONS) {
    const s = summary[col]?.[side];
    if (!s || s.added + s.conflicts + s.deleted === 0) continue;
    const parts = [
      s.added ? tx('sync.sum.added', { n: s.added }) : '',
      s.conflicts ? tx('sync.sum.updated', { n: s.conflicts }) : '',
      s.deleted ? tx('sync.sum.removed', { n: s.deleted }) : '',
    ].filter(Boolean);
    lines.push(`${tx(`sync.col.${col}`)}: ${parts.join(', ')}`);
  }
  return lines;
}

// ---- Daily server jobs (WIB) ------------------------------------------------------------------

const WIB_OFFSET_MS = 7 * 3600_000;

/** WIB calendar date (YYYY-MM-DD) of a timestamp. */
export function wibDate(ms: number): string {
  return new Date(ms + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** Minutes since WIB midnight and the WIB weekday (0 = Sunday). */
export function wibClock(ms: number): { minutes: number; weekday: number } {
  const d = new Date(ms + WIB_OFFSET_MS);
  return { minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), weekday: d.getUTCDay() };
}

/**
 * True when a once-a-day job should run now: the WIB time is at or after `at` ("HH:MM"), it did
 * not run yet today (`lastRunDate`), and (optionally) it is a weekday.
 */
export function dailyJobDue(nowMs: number, lastRunDate: string | null, at: string, weekdaysOnly = false): boolean {
  const [h, m] = at.split(':').map(Number);
  const { minutes, weekday } = wibClock(nowMs);
  if (weekdaysOnly && (weekday === 0 || weekday === 6)) return false;
  if (minutes < h * 60 + m) return false;
  return lastRunDate !== wibDate(nowMs);
}
