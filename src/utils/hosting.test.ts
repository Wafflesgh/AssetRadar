/**
 * hosting.test.ts — Tests for host detection (Railway, Cloud Run, Vercel, local), the internal
 * job timer switch, the Supabase key choice and its request headers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostingFrom, internalSchedulerOn, supabaseHeaders, supabaseKey } from './hosting.ts';

test('host detection', () => {
  assert.deepEqual(hostingFrom({ RAILWAY_ENVIRONMENT: 'production', RAILWAY_REPLICA_REGION: 'asia-southeast1-eqsg3a' }), { host: 'railway', region: 'asia-southeast1-eqsg3a', alwaysOn: true });
  assert.equal(hostingFrom({ K_SERVICE: 'app' }).host, 'cloudRun');
  assert.equal(hostingFrom({ VERCEL: '1', VERCEL_REGION: 'sin1' }).region, 'sin1');
  assert.equal(hostingFrom({}).host, 'local');
});

test('internal scheduler: Railway by default, env override', () => {
  assert.equal(internalSchedulerOn({ RAILWAY_PROJECT_ID: 'x' }), true);
  assert.equal(internalSchedulerOn({}), false);
  assert.equal(internalSchedulerOn({ INTERNAL_SCHEDULER: '1' }), true);
  assert.equal(internalSchedulerOn({ RAILWAY_PROJECT_ID: 'x', INTERNAL_SCHEDULER: '0' }), false);
});

test('Supabase key choice and headers', () => {
  assert.equal(supabaseKey({ SUPABASE_SECRET_KEY: ' sb_secret_a ', SUPABASE_SERVICE_ROLE_KEY: 'eyJ' }), 'sb_secret_a');
  assert.equal(supabaseKey({ SUPABASE_SERVICE_ROLE_KEY: 'eyJ' }), 'eyJ');
  assert.equal(supabaseKey({}), null);
  assert.deepEqual(supabaseHeaders('sb_secret_a'), { apikey: 'sb_secret_a' });
  assert.deepEqual(supabaseHeaders('eyJ'), { apikey: 'eyJ', Authorization: 'Bearer eyJ' });
});
