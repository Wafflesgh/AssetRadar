/** dataExport.test.ts — Full owner-backup round trips, sync conflicts, validation and write failures. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataExport, importData, parseDataExport, previewDataImport, type DataExport } from './dataExport.ts';
import { getSyncAdapter, getSyncMeta, markSyncChanged, readSyncItems } from './storage.ts';
import { SYNC_COLLECTIONS, type SyncCollection } from './sync.ts';

const NOW = Date.parse('2026-11-17T03:00:00Z');
const journal = { id: 'j1', symbol: 'BBCA.JK', txId: null, createdAt: NOW - 1000, note: 'Reasons',
  snapshot: { price: null, currency: 'IDR', sentiment: { short: null, medium: null, long: null }, evidenceScore: null } };
const transaction = { id: 'p1', symbol: 'BBCA.JK', side: 'buy', date: '2026-11-16', quantity: 100, price: 1000, fee: 0 };
const forwardId = '2026-11-16|20|moderate|BBCA.JK';
const forward = { date: '2026-11-16', horizonDays: 20, profile: 'moderate', symbol: 'BBCA.JK', verdict: 'Neutral', price: 1000 };
const fixtures: Record<SyncCollection, Record<string, unknown>> = {
  watchlist: { 'BBCA.JK': true }, portfolio: { p1: transaction }, journal: { j1: journal },
  forwardLog: { [forwardId]: forward }, riskResult: { result: { answers: [1, 2, 3], savedAt: NOW } },
  settings: { theme: 'light', timeframe: 'D', startInTerminal: true, aiPrefs: { profile: 'moderate' },
    alertSettings: { quiet: { enabled: true, start: '22:00', end: '06:00' }, holdingsCalendar: false }, kitchenBasket: { rice: 1 } },
  alerts: { a1: { id: 'a1', kind: 'priceAbove', symbol: 'BBCA.JK', threshold: 1200, createdAt: NOW } },
  screens: { s1: { id: 's1', name: 'Screen', filters: [] } },
  strategies: { b1: { id: 'b1', name: 'Strategy', entry: [], exit: [] } },
  dividends: { d1: { id: 'd1', symbol: 'BBCA.JK', exDate: '2026-11-16', amount: 100 } },
  goldPrices: { g1: { id: 'g1', date: '2026-11-16', buybackPerGram: 1000 } },
  paper: { account: { id: 'account', kind: 'account', startedAt: NOW, startCash: 1000000, jciStart: null } },
};
const file = (collections: DataExport['collections']): DataExport => ({ app: 'AssetRadar', version: 1, exportedAt: NOW, collections });

function browser(run: (data: Map<string, string>, events: string[], fail: (key: string | null) => void) => void) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const data = new Map<string, string>();
  const events: string[] = [];
  let failKey: string | null = null;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { if (key === failKey) throw new Error('Storage blocked'); data.set(key, value); },
      removeItem: (key: string) => { if (key === failKey) throw new Error('Storage blocked'); data.delete(key); },
    }, dispatchEvent: (event: Event) => { events.push(event.type); return true; },
  } });
  try { run(data, events, key => { failKey = key; }); }
  finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}

test('all registered collections, including the journal, round trip through an empty device', () => browser((storage, events) => {
  for (const col of SYNC_COLLECTIONS) {
    getSyncAdapter(col)!.write(fixtures[col]);
    markSyncChanged(col, Object.keys(fixtures[col]), [], NOW - 1000);
  }
  const exported = createDataExport(NOW);
  assert.deepEqual(Object.keys(exported.collections), [...SYNC_COLLECTIONS]);
  const parsed = parseDataExport(JSON.stringify(exported));
  const expected = Object.fromEntries(SYNC_COLLECTIONS.map(col => [col, getSyncAdapter(col)!.read()]));
  storage.clear();
  assert.equal(previewDataImport(parsed.data).find(r => r.collection === 'journal')?.added, 1);
  importData(parsed.data, 'replace', NOW);
  assert.deepEqual(Object.fromEntries(SYNC_COLLECTIONS.map(col => [col, getSyncAdapter(col)!.read()])), expected);
  assert.ok(events.includes('assetradar:local-change'));
  assert.ok(events.includes('assetradar:sync-applied'));
  assert.deepEqual(readSyncItems('journal', false).j1.v, journal);
  assert.equal(Object.isFrozen(getSyncAdapter('journal')), true);
}));

test('merge uses edit times and the existing completed-forward-result resolver', () => browser(() => {
  getSyncAdapter('journal')!.write({ j1: journal });
  markSyncChanged('journal', ['j1'], [], NOW - 10);
  importData(file({ journal: { j1: { v: { ...journal, note: 'Older' }, t: NOW - 100 } } }), 'merge', NOW);
  assert.deepEqual(getSyncAdapter('journal')!.read().j1, journal);
  importData(file({ journal: { j1: { v: { ...journal, note: 'Newer' }, t: NOW } } }), 'merge', NOW + 1);
  assert.equal((getSyncAdapter('journal')!.read().j1 as typeof journal).note, 'Newer');
  const completed = { ...forward, outcome: { returnPct: 2 } };
  getSyncAdapter('forwardLog')!.write({ [forwardId]: completed });
  markSyncChanged('forwardLog', [forwardId], [], NOW - 100);
  importData(file({ forwardLog: { [forwardId]: { v: forward, t: NOW } } }), 'merge', NOW);
  assert.deepEqual(getSyncAdapter('forwardLog')!.read()[forwardId], completed);
}));

test('replace removes extra items, preserves unlisted collections and retains omitted settings', () => browser(() => {
  getSyncAdapter('journal')!.write({ j1: journal, j2: { ...journal, id: 'j2' } });
  getSyncAdapter('portfolio')!.write(fixtures.portfolio);
  getSyncAdapter('settings')!.write({ theme: 'dark', timeframe: 'D', startInTerminal: true });
  markSyncChanged('journal', ['j1', 'j2'], [], NOW - 100);
  const incoming = file({ journal: { j1: { v: { ...journal, note: 'Restored older text' }, t: NOW - 1000 } },
    settings: { theme: { v: 'light', t: NOW }, timeframe: { v: null, t: NOW } } });
  assert.deepEqual(previewDataImport(incoming)[0], { collection: 'journal', items: 1, added: 0, existing: 1, deleted: 0 });
  importData(incoming, 'replace', NOW);
  assert.deepEqual(getSyncAdapter('portfolio')!.read(), fixtures.portfolio);
  assert.equal(getSyncAdapter('journal')!.read().j2, undefined);
  assert.equal(readSyncItems('journal', false).j2.v, null);
  assert.equal((getSyncAdapter('journal')!.read().j1 as typeof journal).note, 'Restored older text');
  assert.deepEqual(getSyncAdapter('settings')!.read(), { theme: 'light', timeframe: 'D', startInTerminal: true });
}));

test('new imported tombstones are marked dirty; an older deletion cannot overwrite a newer edit', () => browser(() => {
  getSyncAdapter('journal')!.write({ j1: journal });
  markSyncChanged('journal', ['j1'], [], NOW);
  const incoming = file({ journal: { j1: { v: null, t: NOW - 1 }, missing: { v: null, t: NOW - 1 } } });
  importData(incoming, 'merge', NOW);
  assert.deepEqual(getSyncAdapter('journal')!.read().j1, journal);
  assert.equal(readSyncItems('journal', false).missing.v, null);
}));

test('equal values retain newer imported edit times for the next merge', () => browser(() => {
  getSyncAdapter('journal')!.write({ j1: journal });
  markSyncChanged('journal', ['j1'], ['gone'], NOW - 100);
  importData(file({ journal: { j1: { v: journal, t: NOW - 10 }, gone: { v: null, t: NOW - 10 } } }), 'merge', NOW);
  importData(file({ journal: { j1: { v: { ...journal, note: 'Older competing edit' }, t: NOW - 50 },
    gone: { v: { ...journal, id: 'gone' }, t: NOW - 50 } } }), 'merge', NOW + 1);
  assert.deepEqual(getSyncAdapter('journal')!.read(), { j1: journal });
}));

test('merge keeps the original chronology across successive backup imports', () => browser(() => {
  importData(file({ journal: { j1: { v: journal, t: NOW - 100 } } }), 'merge', NOW);
  assert.equal(readSyncItems('journal', true).j1.t, NOW - 100);
  const newer = { ...journal, note: 'Later source edit' };
  importData(file({ journal: { j1: { v: newer, t: NOW - 50 } } }), 'merge', NOW + 1);
  assert.deepEqual(getSyncAdapter('journal')!.read().j1, newer);
}));

test('replace marks even equal imported values as intentional new edits for sync', () => browser(() => {
  getSyncAdapter('journal')!.write({ j1: journal });
  markSyncChanged('journal', ['j1'], ['gone'], NOW - 10);
  importData(file({ journal: { j1: { v: journal, t: NOW - 100 }, gone: { v: null, t: NOW - 100 } } }), 'replace', NOW);
  assert.equal(readSyncItems('journal', true).j1.t, NOW);
  assert.equal(readSyncItems('journal', true).gone.t, NOW);
}));

test('invalid files and unsafe object keys are rejected before any local write', () => browser(() => {
  getSyncAdapter('journal')!.write({ j1: journal });
  const original = createDataExport(NOW);
  for (const raw of [{}, { ...original, app: 'Other' }, { ...original, version: 2 },
    { ...original, exportedAt: -1 }, file({ journal: [] as never }),
    file({ journal: { j1: { v: journal, t: -1 } } }), file({ journal: { j1: { v: {}, t: NOW } } }),
    file({ portfolio: { mismatch: { v: transaction, t: NOW } } }),
    file({ watchlist: { toString: { v: true, t: NOW } } }),
    file({ settings: { session: { v: { token: 'fixture-only' }, t: NOW } } })]) {
    assert.throws(() => parseDataExport(JSON.stringify(raw)), /export.invalid/);
  }
  assert.throws(() => parseDataExport('{broken'), /export.invalid/);
  assert.throws(() => parseDataExport('{"app":"AssetRadar","version":1,"exportedAt":0,"collections":{"watchlist":{"__proto__":{"v":true,"t":0}}}}'), /export.invalid/);
  assert.throws(() => parseDataExport('{"app":"AssetRadar","version":1,"exportedAt":1e400,"collections":{}}'), /export.invalid/);
  assert.deepEqual(createDataExport(NOW), original);
}));

test('exports exclude credentials, device caches and sync bookkeeping; unknown collections are listed', () => browser(storage => {
  storage.set('assetradar_sync_session', JSON.stringify({ token: 'credential-fixture-only', expiresAt: NOW + 1000 }));
  storage.set('unrelated_passphrase', 'passphrase-fixture-only');
  storage.set('assetradar_last_ticks_v3', 'cache-fixture-only');
  const exported = JSON.stringify(createDataExport(NOW));
  assert.equal(/credential-fixture|passphrase-fixture|cache-fixture|expiresAt|sync_session/.test(exported), false);
  const parsed = parseDataExport(JSON.stringify({ ...file({ journal: {} }), collections: { journal: {}, futureCollection: { anything: true } } }));
  assert.deepEqual(parsed.ignored, ['futureCollection']);
  assert.deepEqual(Object.keys(parsed.data.collections), ['journal']);
  const unknownOnly = parseDataExport(JSON.stringify({ ...file({}), collections: { futureCollection: {} } }));
  assert.deepEqual(unknownOnly.ignored, ['futureCollection']);
  assert.deepEqual(previewDataImport(unknownOnly.data), []);
  importData(parsed.data, 'replace', NOW);
  assert.ok(storage.has('assetradar_sync_session'));
}));

test('failed writes restore previously changed collections and do not report success', () => browser((storage, events, fail) => {
  getSyncAdapter('portfolio')!.write(fixtures.portfolio);
  getSyncAdapter('journal')!.write(fixtures.journal);
  const before = createDataExport(NOW);
  const incoming = file({ portfolio: {}, journal: { j1: { v: { ...journal, note: 'Changed' }, t: NOW } } });
  fail('assetradar_journal_v1');
  assert.throws(() => importData(incoming, 'replace', NOW), /export.writeFailed/);
  assert.deepEqual(createDataExport(NOW), before);
  assert.equal(events.includes('assetradar:local-change'), false);
  assert.equal(storage.has('assetradar_sync_meta_v1'), false);
}));

test('a blocked sync metadata write is reported as a partial import', () => browser((_storage, _events, fail) => {
  fail('assetradar_sync_meta_v1');
  assert.throws(() => importData(file({ journal: { j1: { v: journal, t: NOW } } }), 'replace', NOW), /export.partial/);
  assert.deepEqual(getSyncAdapter('journal')!.read().j1, journal);
  assert.deepEqual(getSyncMeta().dirty, {});
  fail(null);
  importData(file({ journal: { j1: { v: journal, t: NOW } } }), 'replace', NOW + 1);
  assert.deepEqual(readSyncItems('journal', false).j1?.v, journal);
}));

test('a settings rollback that cannot remove an imported preference reports the adapter limitation', () => browser((_storage, events, fail) => {
  fail('assetradar_alerts_v1');
  assert.throws(() => importData(file({ settings: { theme: { v: 'light', t: NOW } },
    alerts: { a1: { v: fixtures.alerts.a1, t: NOW } } }), 'replace', NOW), /export.partial/);
  assert.equal(getSyncAdapter('settings')!.read().theme, 'light');
  assert.ok(events.includes('assetradar:local-change'));
  assert.equal(readSyncItems('settings', false).theme.v, 'light');
}));
