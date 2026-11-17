/** backup.test.ts — Allowlist, integrity checks and opt-out without network or storage access. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_KEYS, BACKUP_PREFIXES, buildBackup, verifyBackup, isBackupKey } from './backup.ts';
import { backupStep } from '../../server/backup.ts';
import { createStore } from '../../server/store.ts';

test('backup selection includes durable data and excludes caches', () => {
  for (const key of [...BACKUP_KEYS, ...BACKUP_PREFIXES.map((p) => `${p}test`)]) assert.ok(isBackupKey(key));
  for (const key of ['xs:idx:1', 'macro:indonesia:v3', 'screener:idx', 'sbn:series', 'calendar:x', 'pink:x', 'tick:last', 'backup:last']) assert.equal(isBackupKey(key), false);
  assert.deepEqual(buildBackup({ 'xs:idx:1': {}, 'sync:data': {} }, 1).data, { 'sync:data': {} });
});

test('backup round trip retains packed values and detects tampering', () => {
  const file = buildBackup({ 'sync:data': { note: 'é' }, 'staples:data': { gz: 'unchanged' } }, 1);
  assert.deepEqual(verifyBackup(JSON.parse(JSON.stringify(file))), { ok: true, keys: 2, mismatches: 0 });
  assert.deepEqual(file.data['staples:data'], { gz: 'unchanged' });
  assert.equal(file.manifest.find((m) => m.key === 'sync:data')?.bytes, Buffer.byteLength(JSON.stringify({ note: 'é' })));
  file.data['sync:data'] = { changed: true };
  assert.deepEqual(verifyBackup(file), { ok: false, keys: 2, mismatches: 1 });
});

test('empty backup is valid and malformed or incomplete manifests fail', () => {
  assert.deepEqual(verifyBackup(buildBackup({}, 1)), { ok: true, keys: 0, mismatches: 0 });
  for (const value of [null, {}, { version: 2 }, { ...buildBackup({}, 1), data: { 'sync:data': {} } }]) assert.equal(verifyBackup(value).ok, false);
  const file = buildBackup({ 'sync:data': {} }, 1);
  file.manifest.push(file.manifest[0]);
  assert.equal(verifyBackup(file).ok, false);
});

test('unset backup bucket performs no network or storage access', async (t) => {
  const saved = process.env.GCS_BACKUP_BUCKET;
  delete process.env.GCS_BACKUP_BUCKET;
  t.after(() => { if (saved === undefined) delete process.env.GCS_BACKUP_BUCKET; else process.env.GCS_BACKUP_BUCKET = saved; });
  const store = createStore({});
  t.mock.method(globalThis, 'fetch', () => { assert.fail('Unexpected network'); });
  t.mock.method(store, 'get', () => { assert.fail('Unexpected read'); });
  assert.equal(await backupStep(store, Date.now() + 1000), 'off');
});

test('Sunday backup uploads both copies and saves a marker only after success', async (t) => {
  const saved = process.env.GCS_BACKUP_BUCKET;
  process.env.GCS_BACKUP_BUCKET = 'test-bucket';
  t.after(() => { if (saved === undefined) delete process.env.GCS_BACKUP_BUCKET; else process.env.GCS_BACKUP_BUCKET = saved; });
  const now = Date.parse('2026-11-15T03:00:00+07:00');
  t.mock.method(Date, 'now', () => now);
  const store = createStore({});
  await store.set('sync:data', { example: 1 });
  const uploads: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    if (input.startsWith('http://metadata.google.internal/')) return Response.json({ access_token: 'fake-token' });
    const url = new URL(input);
    assert.equal(url.searchParams.get('ifGenerationMatch'), '0');
    uploads.push(url.searchParams.get('name')!);
    return new Response('', { status: 200 });
  });
  assert.match(await backupStep(store, now + 60_000), /^saved 1 keys/);
  assert.deepEqual(uploads, ['backups/daily/2026-11-15.json.gz', 'backups/weekly/2026-11-15.json.gz']);
  assert.equal((await store.get<{ date: string }>('backup:last'))?.date, '2026-11-15');
  assert.equal(await backupStep(store, now + 60_000), 'done today');
});
