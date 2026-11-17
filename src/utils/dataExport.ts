/** dataExport.ts — Owner backups through sync adapters, with validated previews and imports. */
import { isValidTimeframe } from '../config/assets.ts';
import { parseForwardLog } from '../ai/forwardTest.ts';
import { parseAlerts } from './alerts.ts';
import { parseStrategies } from './backtest.ts';
import { parseGoldEntries } from './goldBar.ts';
import { validateEntry } from './journal.ts';
import { parsePaperItems } from './paperTrading.ts';
import { parsePortfolioImport } from './portfolio.ts';
import { parseDividends } from './portfolioAnalytics.ts';
import { parseScreens } from './screener.ts';
import { getSyncAdapter, getSyncMeta, markSyncChanged, readSyncItems, saveSyncMeta } from './storage.ts';
import { diffCollection, isSyncCollection, mergeSyncData, sameValue, SYNC_COLLECTIONS, type SyncCollection, type SyncData, type SyncItems } from './sync.ts';

export interface DataExport {
  app: 'AssetRadar';
  version: 1;
  exportedAt: number;
  collections: SyncData;
}
export interface ParsedExport { data: DataExport; ignored: string[] }
export type ImportMode = 'merge' | 'replace';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const timestamp = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 8.64e15;
const invalid = () => new Error('export.invalid');

function adapterFor(col: SyncCollection) {
  const adapter = getSyncAdapter(col);
  if (!adapter) throw new Error('export.adapterMissing');
  return adapter;
}

/** These are sync item names, never localStorage keys. Reuse the collection parsers. */
function validValue(col: SyncCollection, id: string, v: unknown): boolean {
  if (v === null) return true;
  if (col === 'watchlist') return v === true;
  if (col === 'settings') {
    if (id === 'theme') return v === 'light' || v === 'dark' || v === 'system';
    if (id === 'timeframe') return typeof v === 'string' && isValidTimeframe(v);
    if (id === 'startInTerminal') return typeof v === 'boolean';
    return ['aiPrefs', 'alertSettings', 'kitchenBasket'].includes(id) && object(v);
  }
  if (!object(v)) return false;
  if (col === 'riskResult') return id === 'result' && Array.isArray(v.answers) && v.answers.every(n => typeof n === 'number');
  if (col === 'forwardLog') return parseForwardLog({ version: 1, snapshots: [v] })?.snapshots.length === 1
    && id === `${v.date}|${v.horizonDays}|${v.profile}|${v.symbol}`;
  if (v.id !== id) return false;
  switch (col) {
    case 'journal': return validateEntry(v);
    case 'portfolio': return parsePortfolioImport(JSON.stringify({ transactions: [v] }), () => true).length === 1;
    case 'alerts': return parseAlerts([v]).length === 1;
    case 'screens': return parseScreens([v]).length === 1;
    case 'strategies': return parseStrategies([v]).length === 1;
    case 'dividends': return parseDividends([v]).length === 1;
    case 'goldPrices': return parseGoldEntries([v]).length === 1;
    case 'paper': {
      const parsed = parsePaperItems([v]);
      return !!parsed.account || parsed.orders.length === 1;
    }
  }
}

/** Reject malformed known data before any write; unknown collections remain preview-only. */
export function parseDataExport(text: string): ParsedExport {
  try {
    const raw = JSON.parse(text, (key, value) => {
      if (['__proto__', 'constructor', 'prototype'].includes(key) || (typeof value === 'number' && !Number.isFinite(value))) throw invalid();
      return value;
    });
    if (!object(raw) || raw.app !== 'AssetRadar' || raw.version !== 1 || !timestamp(raw.exportedAt) || !object(raw.collections)) throw invalid();
    const collections: SyncData = {};
    const ignored: string[] = [];
    for (const [col, rows] of Object.entries(raw.collections)) {
      if (!isSyncCollection(col)) { ignored.push(col); continue; }
      if (!object(rows)) throw invalid();
      const items: SyncItems = {};
      for (const [id, item] of Object.entries(rows)) {
        if (!id || id.length > 200 || Object.hasOwn(Object.prototype, id) || !object(item)
          || !timestamp(item.t) || !Object.hasOwn(item, 'v') || !validValue(col, id, item.v)) throw invalid();
        items[id] = { v: item.v, t: item.t };
      }
      collections[col] = items;
    }
    return { data: { app: 'AssetRadar', version: 1, exportedAt: raw.exportedAt, collections }, ignored };
  } catch { throw invalid(); }
}

/** Only registered owner collections and edit times; no session or sync credentials. */
export function createDataExport(now = Date.now()): DataExport {
  const collections: SyncData = {};
  for (const col of SYNC_COLLECTIONS) {
    adapterFor(col);
    collections[col] = readSyncItems(col, true);
  }
  return { app: 'AssetRadar', version: 1, exportedAt: now, collections };
}

export function previewDataImport(data: DataExport) {
  return SYNC_COLLECTIONS.filter(col => data.collections[col] !== undefined).map(col => {
    const values = adapterFor(col).read();
    const items = data.collections[col]!;
    const liveIds = Object.keys(items).filter(id => items[id].v !== null);
    return { collection: col, items: liveIds.length, added: liveIds.filter(id => !Object.hasOwn(values, id)).length,
      existing: liveIds.filter(id => Object.hasOwn(values, id)).length,
      deleted: Object.values(items).filter(it => it.v === null).length };
  });
}

/** Replace only listed collections, so older/partial backups cannot erase newer collections. */
export function importData(data: DataExport, mode: ImportMode, now = Date.now()): void {
  const validated = parseDataExport(JSON.stringify(data)).data;
  const local = createDataExport(now).collections;
  const desired = mode === 'merge' ? mergeSyncData(local, validated.collections, { now }).merged : validated.collections;
  const plans = SYNC_COLLECTIONS.filter(col => validated.collections[col] !== undefined).map(col => {
    const adapter = adapterFor(col);
    const before = adapter.read();
    const items = desired[col] ?? {};
    let values = Object.fromEntries(Object.entries(items).filter(([, it]) => it.v !== null).map(([id, it]) => [id, it.v]));
    // shortcut: the settings adapter retains omitted values; change only if that adapter gains deletion support.
    if (col === 'settings') values = { ...before, ...values };
    return { col, adapter, before, values, items };
  });
  const notify = () => {
    window.dispatchEvent(new CustomEvent('assetradar:sync-applied', { detail: { collections: plans.map(p => p.col) } }));
    window.dispatchEvent(new Event('assetradar:local-change'));
  };
  const attempted: typeof plans = [];
  try {
    for (const p of plans) {
      attempted.push(p);
      p.adapter.write(p.values);
      if (!sameValue(p.adapter.read(), p.values)) throw new Error('export.writeFailed');
    }
  } catch {
    // Adapters swallow storage failures; verify both writes and best-effort rollback.
    let restored = true;
    for (const p of attempted.reverse()) {
      try {
        p.adapter.write(p.before);
        const actual = p.adapter.read();
        if (!sameValue(actual, p.before)) {
          restored = false;
          const diff = diffCollection(p.before, actual);
          markSyncChanged(p.col, diff.changed, diff.removed, now);
        }
      } catch { restored = false; }
    }
    if (!restored) notify();
    throw new Error(restored ? 'export.writeFailed' : 'export.partial');
  }
  const meta = getSyncMeta();
  for (const p of plans) {
    const { changed, removed } = diffCollection(p.before, p.values);
    // Equal values still need newer edit times; deletions may be new to this device.
    for (const [id, it] of Object.entries(p.items)) {
      const previous = local[p.col]?.[id];
      if (it.v === null) {
        if (p.col !== 'settings' && (mode === 'replace' || previous?.v !== null || it.t > previous.t)) removed.push(id);
      } else if (mode === 'replace' || it.t > (previous?.t ?? -1)) changed.push(id);
    }
    if (!changed.length && !removed.length) continue;
    const times = { ...meta.times[p.col] };
    const deleted = { ...meta.deleted[p.col] };
    for (const id of new Set([...changed, ...removed])) {
      // Merge keeps the source chronology; Replace is an intentional new local edit.
      const stamp = mode === 'merge' ? (p.items[id]?.t ?? now)
        : Math.max(now, (local[p.col]?.[id]?.t ?? 0) + 1, (p.items[id]?.t ?? 0) + 1);
      if (Object.hasOwn(p.values, id)) { times[id] = stamp; delete deleted[id]; }
      else { deleted[id] = stamp; delete times[id]; }
    }
    meta.times[p.col] = times;
    meta.deleted[p.col] = deleted;
    meta.dirty[p.col] = [...new Set([...(meta.dirty[p.col] ?? []), ...changed, ...removed])];
  }
  saveSyncMeta(meta);
  if (!sameValue(getSyncMeta(), meta)) { notify(); throw new Error('export.partial'); }
  notify();
}
