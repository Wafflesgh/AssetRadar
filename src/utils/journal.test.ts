/** journal.test.ts — Decision-note validation, dated reviews and local sync persistence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJournal, reviewChanges, sortEntries, validateEntry, type JournalEntry } from './journal.ts';
import { applySyncItems, getJournal, getSyncMeta, readSyncItems, saveJournal } from './storage.ts';
import { describeSummary, mergeSyncData, parseSyncData } from './sync.ts';

const entry: JournalEntry = {
  id: 'note-1', symbol: 'BBCA.JK', txId: 'tx-1', createdAt: Date.parse('2026-01-01T03:00:00Z'), note: 'My reasons',
  snapshot: { price: 100, currency: 'IDR', sentiment: { short: 'Bullish', medium: null, long: 'Neutral' }, evidenceScore: 0 },
};
const now = Date.parse('2026-05-01T03:00:00Z');
const near = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-9);

test('journal validates text, identity and every snapshot field without inventing missing values', () => {
  assert.equal(validateEntry(entry), true);
  assert.equal(validateEntry({ ...entry, txId: null, snapshot: { ...entry.snapshot, price: null, evidenceScore: null } }), true);
  assert.equal(validateEntry({ ...entry, note: 'a'.repeat(1000) }), true);
  for (const invalid of [null, {}, { ...entry, note: '' }, { ...entry, note: '  ' }, { ...entry, note: 'a'.repeat(1001) },
    { ...entry, id: '' }, { ...entry, symbol: '' }, { ...entry, txId: 7 }, { ...entry, createdAt: NaN },
    { ...entry, snapshot: null }, { ...entry, snapshot: { ...entry.snapshot, price: 0 } },
    { ...entry, snapshot: { ...entry.snapshot, price: Infinity } },
    { ...entry, snapshot: { ...entry.snapshot, evidenceScore: 101 } },
    { ...entry, snapshot: { ...entry.snapshot, sentiment: { short: 'Buy' } } }]) {
    assert.equal(validateEntry(invalid), false);
  }
  assert.deepEqual(parseJournal([null, entry, { ...entry, note: '' }]), [entry]);
  assert.deepEqual(parseJournal('{broken'), []);
  const older = { ...entry, id: 'older', createdAt: entry.createdAt - 1 };
  const input = [older, entry];
  assert.deepEqual(sortEntries(input), [entry, older]);
  assert.equal(input[0], older);
});

test('reviews use the first valid close on or after 7/30/91 days, including weekends', () => {
  const bars = [{ date: '2026-04-02', close: 125 }, { date: '2026-02-02', close: 90 },
    { date: '2026-01-09', close: 110 }, { date: '2026-01-07', close: 999 },
    { date: '2026-01-08', close: NaN }];
  const result = reviewChanges(entry, bars, now);
  near(result.w1, 10);
  near(result.m1, -10);
  near(result.m3, 25);
  assert.equal(bars[0].date, '2026-04-02');
});

test('reviews stay null for future deadlines, future bars, missing prices and missing history', () => {
  const empty = { w1: null, m1: null, m3: null };
  assert.deepEqual(reviewChanges(entry, [], now), empty);
  assert.deepEqual(reviewChanges(entry, [{ date: '2026-06-01', close: 110 }], now), empty);
  assert.deepEqual(reviewChanges(entry, [{ date: '2026-01-08', close: 110 }], entry.createdAt), empty);
  assert.deepEqual(reviewChanges({ ...entry, snapshot: { ...entry.snapshot, price: null } }, [{ date: '2026-01-08', close: 110 }], now), empty);
  assert.deepEqual(reviewChanges(entry, [{ date: '2026-01-08', close: 0 }, { date: '2026-02-01', close: -10 }], now), empty);
  const result = reviewChanges(entry, [{ date: '2026-01-08', close: 100 }], now);
  assert.deepEqual(result, { w1: 0, m1: null, m3: null });
});

test('review dates follow WIB at midnight and do not mature before the elapsed deadline', () => {
  const late = { ...entry, createdAt: Date.parse('2026-01-01T18:00:00Z') }; // Jan 2 WIB
  const bars = [{ date: '2026-01-08', close: 999 }, { date: '2026-01-09', close: 120 }];
  assert.equal(reviewChanges(late, bars, late.createdAt + 7 * 86_400_000 - 1).w1, null);
  near(reviewChanges(late, bars, late.createdAt + 7 * 86_400_000).w1, 20);
});

test('journal storage and sync round trip, edit, deletion and refused writes', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const data = new Map<string, string>();
  let blocked = false;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { if (blocked) throw new Error('Storage full'); data.set(key, value); },
    }, dispatchEvent: () => true,
  } });
  try {
    assert.equal(saveJournal([entry]), true);
    assert.deepEqual(getJournal(), [entry]);
    assert.deepEqual(getSyncMeta().dirty.journal, [entry.id]);
    const outgoing = readSyncItems('journal', true);
    const parsed = parseSyncData({ journal: outgoing });
    const merged = mergeSyncData(parsed, {}, { now, stamp: now });
    data.clear();
    assert.equal(applySyncItems('journal', merged.merged.journal!), true);
    assert.deepEqual(getJournal(), [entry]);
    assert.deepEqual(getSyncMeta().dirty, {});
    assert.match(describeSummary(merged.summary, 'toRemote', 'en')[0], /^Decision journal:/);
    assert.match(describeSummary(merged.summary, 'toRemote', 'id')[0], /^Jurnal keputusan:/);
    const edited = { ...entry, note: 'Revised reasons' };
    assert.equal(saveJournal([edited]), true);
    assert.deepEqual(readSyncItems('journal', false)[entry.id].v, edited);
    blocked = true;
    assert.equal(saveJournal([{ ...entry, note: 'Cannot persist' }]), false);
    assert.deepEqual(getJournal(), [edited]);
    blocked = false;
    assert.equal(saveJournal([]), true);
    assert.equal(readSyncItems('journal', false)[entry.id].v, null);
    data.clear();
    applySyncItems('journal', outgoing);
    applySyncItems('journal', { [entry.id]: { v: null, t: Date.now() + 1 } });
    assert.deepEqual(getJournal(), []);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
