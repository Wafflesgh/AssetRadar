/**
 * store.test.ts — Tests for the packed (gzip) values of the key/value store and its memory fallback.
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
