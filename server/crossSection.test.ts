/** crossSection.test.ts — Tests for the paced cross-section queues and monthly closes (fake loaders, no network). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CrossSection, monthlyFromBars, shardOf } from './crossSection.ts';

test('monthly closes keep one value per month and skip gaps', () => {
  const t = (d: string) => Date.parse(d) / 1000;
  const m = monthlyFromBars([t('2026-01-31'), t('2026-02-27'), t('2026-03-02'), t('2026-03-31')], [100, null, 101, 103]);
  assert.deepEqual(m, [
    { month: '2026-01', close: 100 },
    { month: '2026-03', close: 103 },
  ]);
});

test('queues fill the maps, count failures and report progress', async () => {
  const assets = Array.from({ length: 25 }, (_, i) => `S${i}`);
  const cs = new CrossSection<string>(
    'idx',
    () => assets,
    {
      symbolOf: (a) => a,
      monthly: async (batch) => new Map(batch.filter((a) => a !== 'S3').map((a) => [a, [{ month: '2026-01', close: 1 }]])),
      statements: async (a) => (a === 'S5' ? Promise.reject(new Error('HTTP 404')) : { annual: [], quarterly: [], currency: 'IDR' }),
      analyst: async () => null,
    },
    { monthly: 0, statements: 0, analyst: 0 }
  );
  await cs.touch();
  const p = Object.fromEntries(cs.status().progress.map((x) => [x.kind, x]));
  assert.equal(p.monthly.done, 24);
  assert.equal(p.monthly.failed, 1);
  assert.equal(p.statements.failed, 1);
  assert.equal(p.analyst.done, 25);
  assert.equal(cs.monthlyOf('S3'), null);
  assert.equal(cs.statementsOf('S1')?.currency, 'IDR');
  assert.equal(cs.status().freshness.monthly.count, 24);
  // Fresh data is not fetched again
  let calls = 0;
  const again = new CrossSection<string>('idx', () => assets.slice(0, 2), { symbolOf: (a) => a, monthly: async (b) => (calls++, new Map(b.map((a) => [a, [{ month: '2026-01', close: 1 }]]))), statements: async () => null, analyst: async () => null }, { monthly: 0, statements: 0, analyst: 0 });
  await again.touch();
  await again.touch();
  assert.equal(calls, 1);
});

test('serverless scan steps save shards and resume; a new instance loads everything', async () => {
  const saved = new Map<string, unknown>();
  const persist = {
    get: async <T,>(k: string) => (saved.has(k) ? (JSON.parse(JSON.stringify(saved.get(k))) as T) : null),
    set: async (k: string, v: unknown) => void saved.set(k, JSON.parse(JSON.stringify(v))),
  };
  const assets = Array.from({ length: 30 }, (_, i) => `S${i}`);
  let statementCalls = 0;
  const loaders = {
    symbolOf: (a: string) => a,
    monthly: async (batch: string[]) => new Map(batch.map((a) => [a, [{ month: '2026-01', close: 1 }]])),
    statements: async () => (statementCalls++, { annual: [], quarterly: [], currency: 'IDR' }),
    analyst: async () => null,
  };
  const make = () => {
    const cs = new CrossSection<string>('idx', () => assets, loaders, { monthly: 0, statements: 0, analyst: 0 });
    cs.passive = true;
    return cs;
  };
  const a = make();
  await a.touch(); // passive: nothing is fetched on demand
  assert.equal(statementCalls, 0);
  // An expired deadline leaves everything pending
  assert.deepEqual(await a.scanStep(persist, Date.now() - 1), { fetched: 0, pending: 90 });
  const r = await a.scanStep(persist, Date.now() + 60_000);
  assert.equal(r.fetched, 90);
  assert.equal(r.pending, 0);
  assert.ok([...saved.keys()].some((k) => k.startsWith('xs:idx:statements:')));
  // Nothing stale: the next step fetches nothing
  assert.equal((await a.scanStep(persist, Date.now() + 60_000)).fetched, 0);
  assert.equal(statementCalls, 30);
  const b = make();
  await b.loadAll(persist);
  assert.equal(b.statementsOf('S7')?.currency, 'IDR');
  assert.equal(b.monthlyOf('S29')?.length, 1);
  const p = Object.fromEntries(b.status().progress.map((x) => [x.kind, x]));
  assert.equal(p.analyst.done, 30);
});

test('shards are stable and in range', () => {
  assert.equal(shardOf('idx-BBCA', 8), shardOf('idx-BBCA', 8));
  for (const s of ['A', 'idx-TLKM', 'peer:MSFT']) assert.ok(shardOf(s, 4) >= 0 && shardOf(s, 4) < 4);
});
