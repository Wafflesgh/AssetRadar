/**
 * sync.test.ts — Tests for the sync merge (conflicts, deletions, new items on both sides,
 * forward-log resolver, delta by server time), session tokens, the login limiter and the daily
 * job schedule (WIB).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dailyJobDue,
  describeSummary,
  diffCollection,
  itemsChangedSince,
  mergeSyncData,
  parseSyncData,
  stableStringify,
  TOMBSTONE_TTL_MS,
  wibDate,
} from './sync.ts';
import { issueToken, LoginLimiter, passphraseMatches, sessionSecret, verifyToken, bearerToken } from './syncAuth.ts';

const NOW = Date.UTC(2026, 9, 20, 3, 0); // 10:00 WIB

test('merge: newest edit wins, items new on either side are kept', () => {
  const local = {
    watchlist: { BBCA: { v: true, t: 100 }, BTC: { v: true, t: 50 } },
    settings: { theme: { v: 'light', t: 300 } },
  };
  const remote = {
    watchlist: { BBCA: { v: true, t: 90, s: 1000 }, NVDA: { v: true, t: 80, s: 1000 } },
    settings: { theme: { v: 'dark', t: 200, s: 1000 } },
  };
  const { merged, summary } = mergeSyncData(local, remote, { stamp: 2000, now: NOW });
  assert.deepEqual(Object.keys(merged.watchlist ?? {}).sort(), ['BBCA', 'BTC', 'NVDA']);
  assert.equal(merged.settings?.theme.v, 'light');
  assert.equal(merged.settings?.theme.s, 2000, 'the local winner is stamped with the server time');
  assert.equal(merged.watchlist?.NVDA.s, 1000, 'remote items keep their stamp');
  assert.equal(summary.watchlist?.toRemote.added, 1);
  assert.equal(summary.watchlist?.toLocal.added, 1);
  assert.equal(summary.settings?.toRemote.conflicts, 1);
});

test('merge: a later deletion beats an older edit, an older deletion loses to a newer edit', () => {
  const T = NOW - 1000;
  const a = mergeSyncData({ portfolio: { tx1: { v: null, t: T + 500 } } }, { portfolio: { tx1: { v: { qty: 1 }, t: T + 400 } } }, { now: NOW });
  assert.equal(a.merged.portfolio?.tx1.v, null);
  assert.equal(a.summary.portfolio?.toRemote.deleted, 1);
  const b = mergeSyncData({ portfolio: { tx1: { v: null, t: T + 300 } } }, { portfolio: { tx1: { v: { qty: 2 }, t: T + 400 } } }, { now: NOW });
  assert.deepEqual(b.merged.portfolio?.tx1.v, { qty: 2 });
  assert.equal(b.summary.portfolio?.toLocal.conflicts, 1);
});

test('merge: portfolio transactions are merged by id, none is lost', () => {
  const local = { portfolio: { a: { v: { id: 'a' }, t: 1 }, b: { v: { id: 'b' }, t: 2 } } };
  const remote = { portfolio: { c: { v: { id: 'c' }, t: 3 }, d: { v: { id: 'd' }, t: 4 } } };
  const { merged } = mergeSyncData(local, remote, { now: NOW });
  assert.deepEqual(Object.keys(merged.portfolio ?? {}).sort(), ['a', 'b', 'c', 'd']);
});

test('merge: equal values are not counted as conflicts; key order does not matter', () => {
  const { summary } = mergeSyncData(
    { riskResult: { r: { v: { a: 1, b: 2 }, t: 10 } } },
    { riskResult: { r: { v: { b: 2, a: 1 }, t: 20 } } },
    { now: NOW }
  );
  assert.deepEqual(summary.riskResult?.toLocal, { added: 0, conflicts: 0, deleted: 0 });
  assert.equal(stableStringify({ b: 1, a: [1, { d: 2, c: 3 }] }), '{"a":[1,{"c":3,"d":2}],"b":1}');
});

test('merge: forward-log entries with a result win even when older', () => {
  const scored = { v: { verdict: 'favorable', outcome: { up: true } }, t: 10 };
  const plain = { v: { verdict: 'favorable' }, t: 50 };
  const { merged } = mergeSyncData({ forwardLog: { k: plain } }, { forwardLog: { k: scored } }, { now: NOW });
  assert.ok((merged.forwardLog?.k.v as { outcome?: unknown }).outcome);
});

test('merge: tombstones older than the TTL are dropped', () => {
  const old = NOW - TOMBSTONE_TTL_MS - 1;
  const { merged } = mergeSyncData({ watchlist: { X: { v: null, t: old } } }, {}, { now: NOW });
  assert.equal(merged.watchlist?.X, undefined);
});

test('delta: only items stored after the last sync are returned', () => {
  const data = { watchlist: { A: { v: true, t: 1, s: 100 }, B: { v: true, t: 1, s: 300 } }, settings: { x: { v: 1, t: 1, s: 50 } } };
  assert.deepEqual(itemsChangedSince(data, 200), { watchlist: { B: { v: true, t: 1, s: 300 } } });
});

test('diffCollection finds changed and removed items', () => {
  assert.deepEqual(diffCollection({ a: 1, b: { x: 1 }, c: 3 }, { a: 1, b: { x: 2 }, d: 4 }), { changed: ['b', 'd'], removed: ['c'] });
});

test('parseSyncData drops unknown collections and malformed items', () => {
  const parsed = parseSyncData({ watchlist: { A: { v: true, t: 1 }, B: { v: true }, C: 'x' }, hacker: { a: { v: 1, t: 1 } } });
  assert.deepEqual(parsed, { watchlist: { A: { v: true, t: 1 } } });
});

test('describeSummary lists what changed', () => {
  const lines = describeSummary({ watchlist: { toLocal: { added: 2, conflicts: 0, deleted: 1 }, toRemote: { added: 0, conflicts: 0, deleted: 0 } } }, 'toLocal');
  assert.deepEqual(lines, ['Watchlist: 2 added, 1 removed']);
});

test('session tokens: valid until expiry, invalid with another passphrase or when tampered', () => {
  const secret = sessionSecret('correct horse');
  const { token, expiresAt } = issueToken(secret, NOW);
  assert.ok(verifyToken(token, secret, NOW + 1000));
  assert.ok(!verifyToken(token, secret, expiresAt + 1));
  assert.ok(!verifyToken(token, sessionSecret('other'), NOW));
  assert.ok(!verifyToken(token.slice(0, -2) + 'xx', secret, NOW));
  assert.ok(!verifyToken('garbage', secret, NOW));
  assert.equal(bearerToken(`Bearer ${token}`), token);
  assert.equal(bearerToken('Basic abc'), null);
});

test('passphrase comparison', () => {
  assert.ok(passphraseMatches('pass phrase', 'pass phrase'));
  assert.ok(!passphraseMatches('pass', 'pass phrase'));
  assert.ok(!passphraseMatches('', ''), 'an empty configured passphrase never matches');
});

test('login limiter: blocks after 5 failures per client and recovers after the window', () => {
  const lim = new LoginLimiter(5, 30, 60_000);
  for (let i = 0; i < 5; i++) {
    assert.equal(lim.retryAfter('ip1', NOW + i), 0);
    lim.recordFailure('ip1', NOW + i);
  }
  assert.ok(lim.retryAfter('ip1', NOW + 10) > 0);
  assert.equal(lim.retryAfter('ip2', NOW + 10), 0, 'other clients are not affected');
  assert.equal(lim.retryAfter('ip1', NOW + 60_001), 0);
  const g = new LoginLimiter(5, 3, 60_000);
  g.recordFailure('a', NOW);
  g.recordFailure('b', NOW);
  g.recordFailure('c', NOW);
  assert.ok(g.retryAfter('d', NOW + 1) > 0, 'the global limit applies to new clients too');
});

test('daily job: runs once per WIB day after the set time, optionally weekdays only', () => {
  const at = (h: number, m: number, day = 20) => Date.UTC(2026, 9, day, h - 7, m); // WIB → UTC
  assert.equal(wibDate(at(23, 30)), '2026-10-20');
  assert.equal(wibDate(Date.UTC(2026, 9, 20, 17, 30)), '2026-10-21', '00:30 WIB is already the next day');
  assert.ok(!dailyJobDue(at(16, 14), null, '16:15'));
  assert.ok(dailyJobDue(at(16, 15), null, '16:15'));
  assert.ok(dailyJobDue(at(16, 15), '2026-10-19', '16:15'));
  assert.ok(!dailyJobDue(at(18, 0), '2026-10-20', '16:15'), 'already ran today');
  // 24 Oct 2026 is a Saturday
  assert.ok(!dailyJobDue(at(17, 0, 24), null, '16:15', true));
  assert.ok(dailyJobDue(at(17, 0, 24), null, '16:15', false));
});
