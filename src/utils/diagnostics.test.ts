/**
 * diagnostics.test.ts — Tests for the diagnostics logic: probe classification (ok, region-blocked,
 * rate-limited, key needed, down), the optional-setup summary (names only, never values) and the
 * Cloud Run region parser.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyProbe, PROBES, regionFromMetadata, setupStatus } from './diagnostics.ts';

test('probe results are classified by HTTP status', () => {
  assert.equal(classifyProbe(200).status, 'ok');
  assert.equal(classifyProbe(451).status, 'blocked');
  assert.equal(classifyProbe(403).status, 'blocked');
  assert.equal(classifyProbe(429).status, 'limited');
  assert.equal(classifyProbe(418).status, 'limited');
  assert.equal(classifyProbe(401).status, 'auth');
  assert.equal(classifyProbe(401, [401]).status, 'ok'); // reachable, just no key
  assert.equal(classifyProbe(503).status, 'down');
  assert.deepEqual(classifyProbe(null, [], 'timeout'), { status: 'down', detail: 'timeout' });
});

test('probe URLs never carry a key', () => {
  for (const p of PROBES) assert.doesNotMatch(p.url, /token=|key=|apikey/i, p.id);
});

test('setup status reports what is configured without exposing values', () => {
  const s = setupStatus({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'Zq9-value-must-not-leak', SYNC_PASSPHRASE: 'short', CRON_TOKEN: 'abc' });
  const by = Object.fromEntries(s.map((x) => [x.id, x.configured]));
  assert.equal(by.database, true);
  assert.equal(by.sync, false); // passphrase under 8 characters
  assert.equal(by.cron, true);
  assert.equal(by.push, false);
  assert.ok(!JSON.stringify(s).includes('Zq9-value-must-not-leak'));
  assert.equal(setupStatus({ GEMINI_API_KEY: 'MY_GEMINI_API_KEY' }).find((x) => x.id === 'gemini')?.configured, false);
});

test('region from the metadata server', () => {
  assert.equal(regionFromMetadata('projects/123456/regions/us-central1'), 'us-central1');
  assert.equal(regionFromMetadata('nonsense'), null);
});
