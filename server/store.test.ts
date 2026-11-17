/**
 * store.test.ts — Tests for packed values, the memory fallback and Supabase key pagination.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, getPacked, pack, setPacked, unpack } from './store.ts';

test('pack and unpack round-trip; plain values pass through', () => {
  const value = { a: [1, 2, 3], b: 'teks', c: null };
  const packed = pack(value);
  assert.equal(typeof packed.gz, 'string');
  assert.deepEqual(unpack(packed), value);
  assert.deepEqual(unpack({ plain: true }), { plain: true });
  assert.equal(unpack(null), null);
});

test('packed values in the memory store', async () => {
  const store = createStore({});
  assert.equal(store.provider, 'memory');
  await setPacked(store, 'k', { x: 1 });
  assert.deepEqual(await getPacked(store, 'k'), { x: 1 });
  await store.set('plain', [1]);
  assert.deepEqual(await getPacked(store, 'plain'), [1]);
  assert.equal(await getPacked(store, 'missing'), null);
});

test('Supabase keys returns all 1005 keys in order across two pages', async (t) => {
  const keys = Array.from({ length: 1005 }, (_, i) => `snap:${String(i).padStart(4, '0')}`);
  const ranges: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string, init: RequestInit) => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://store.example');
    assert.equal(url.searchParams.get('key'), 'like.snap:*');
    assert.equal(url.searchParams.get('select'), 'key');
    assert.equal(url.searchParams.get('order'), 'key.asc');
    const range = new Headers(init.headers).get('Range')!;
    ranges.push(range);
    assert.ok(ranges.length <= 2);
    const [start, end] = range.split('-').map(Number);
    return Response.json(keys.slice(start, end + 1).map((key) => ({ key })));
  });
  const store = createStore({ SUPABASE_URL: 'https://store.example', SUPABASE_SECRET_KEY: 'test-only-placeholder' });
  assert.deepEqual(await store.keys('snap:*%_\\'), keys);
  assert.deepEqual(ranges, ['0-999', '1000-1999']);
});

test('Supabase keys returns an empty list after one request', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async (_input: string, init: RequestInit) => {
    requests++;
    assert.equal(requests, 1);
    assert.equal(new Headers(init.headers).get('Range'), '0-999');
    return Response.json([]);
  });
  const store = createStore({ SUPABASE_URL: 'https://store.example', SUPABASE_SECRET_KEY: 'test-only-placeholder' });
  assert.deepEqual(await store.keys('missing:'), []);
  assert.equal(requests, 1);
});
