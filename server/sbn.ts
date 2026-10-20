/**
 * sbn.ts — GET /api/sbn/retail: the retail government securities (ORI, SBR, SR, ST, SWR) read
 * from the official DJPPR product pages (the site's public page API, the same data its pages
 * show), cached 12 hours. Every series seen is kept in the database (`sbn:series`) so earlier
 * series stay listed after the ministry replaces the page with the next one. A page that cannot
 * be read is reported by type; no numbers are filled in.
 */
import type { Express } from 'express';
import type { KvStore } from './store.ts';
import { DJPPR_CMS_API, extractCms, mergeSbnHistory, parseSbnPage, SBN_PAGES, type SbnSeries, type SbnType } from '../src/utils/sbnRetail.ts';

const TTL_MS = 12 * 3600_000;
const HISTORY_KEY = 'sbn:series';

export interface SbnPayload {
  checkedAt: number;
  /** Series on the official pages right now (one page per type). */
  current: SbnSeries[];
  /** Earlier series remembered by this app (database), newest first. */
  earlier: SbnSeries[];
  errors: Array<{ type: SbnType; error: string }>;
  source: string;
}

let cache: { at: number; data: SbnPayload } | null = null;
let pending: Promise<SbnPayload> | null = null;

async function readPage(slug: string): Promise<{ lines: string[]; links: string[] }> {
  const res = await fetch(DJPPR_CMS_API + encodeURIComponent(slug), {
    headers: { 'User-Agent': 'Mozilla/5.0 (AssetRadar personal research app)', Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { Data?: { Title?: string; PageContentLive?: string } };
  if (!json.Data?.PageContentLive || json.Data.Title === '404') throw new Error('page not found');
  return extractCms(json.Data.PageContentLive);
}

async function load(store: KvStore): Promise<SbnPayload> {
  const errors: SbnPayload['errors'] = [];
  const current: SbnSeries[] = [];
  await Promise.all(
    SBN_PAGES.map(async (def) => {
      try {
        const { lines, links } = await readPage(def.slug);
        const series = parseSbnPage(def, lines, links);
        if (series.length === 0) throw new Error('no series found on the page');
        current.push(...series);
      } catch (err) {
        errors.push({ type: def.type, error: err instanceof Error ? err.message : 'failed' });
      }
    })
  );
  const order = SBN_PAGES.map((p) => p.type);
  current.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.code.localeCompare(b.code));
  let history: SbnSeries[] = [];
  try {
    history = mergeSbnHistory(((await store.get<SbnSeries[]>(HISTORY_KEY)) ?? []) as SbnSeries[], current);
    if (current.length) await store.set(HISTORY_KEY, history);
  } catch {
    history = current;
  }
  const now = new Set(current.map((s) => s.code));
  return {
    checkedAt: Date.now(),
    current,
    earlier: history.filter((s) => !now.has(s.code)),
    errors,
    source: 'DJPPR, Kementerian Keuangan RI (djppr.kemenkeu.go.id)',
  };
}

export async function getSbnRetail(store: KvStore, fresh = false): Promise<SbnPayload> {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.data;
  pending ??= load(store).finally(() => {
    pending = null;
  });
  const data = await pending;
  // A failed read of every page is retried after 10 minutes, not 12 hours
  cache = { at: data.current.length ? Date.now() : Date.now() - TTL_MS + 10 * 60_000, data };
  return data;
}

export function registerSbnRoute(app: Express, store: KvStore): void {
  app.get('/api/sbn/retail', async (req, res) => {
    try {
      const data = await getSbnRetail(store, req.query.refresh === '1');
      if (data.current.length === 0 && data.earlier.length === 0) {
        res.status(502).json({ error: 'SBN data unavailable', errors: data.errors });
        return;
      }
      res.json(data);
    } catch {
      res.status(502).json({ error: 'SBN data unavailable' });
    }
  });
}
