/** freshness.ts — Cached read-only freshness route; never forwards diagnostic error details. */
import type { Express } from 'express';
import { assessFreshness, type FreshnessInput, type FreshnessReport } from '../src/utils/freshness.ts';
export type { FreshnessInput } from '../src/utils/freshness.ts';

export function registerFreshnessRoute(app: Express, live: () => Promise<FreshnessInput[]>): void {
  let cache: FreshnessReport | null = null;
  let pending: Promise<FreshnessReport> | null = null;
  app.get('/api/freshness', async (_req, res) => {
    if (!cache || Date.now() - cache.checkedAt >= 60_000) {
      pending ??= live()
        .catch(() => [{ id: 'tick', lastOk: null, expectedMs: 2 * 3600_000 }])
        .then((items) => assessFreshness(items, Date.now()))
        .finally(() => { pending = null; });
      cache = await pending;
    }
    res.json(cache);
  });
}
