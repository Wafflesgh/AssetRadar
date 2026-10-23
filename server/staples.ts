/**
 * staples.ts — GET /api/staples: staple food prices for "Kitchen Radar" from Bank Indonesia's
 * PIHPS (the JSON its own price-table page loads; no key). A short window (3 weeks) answers in
 * under a second, but a full year takes almost a minute, so the server keeps a one-year history per
 * item in the database (`staples:data`, gzip): every update fetches the last 3 weeks of each item and
 * reaches 60 more days back for items whose history is still short, as time allows (on a request and
 * on each cron tick). Plus recent Indonesian news on staple prices (Google News, 30 minutes) and
 * the latest El Niño / La Niña reading (NOAA Oceanic Niño Index, 24 hours) for the price drivers.
 * No numbers are made up: an item that cannot be read keeps its last saved prices or stays empty.
 */
import type { Express } from 'express';
import { getPacked, setPacked, type KvStore } from './store.ts';
import { keepAlive } from './runtime.ts';
import { parseRssItems } from '../src/utils/sentiment.ts';
import { parseOni, type EnsoReading } from '../src/utils/stapleDrivers.ts';
import { addDays, mergeStaplePoints, parsePihpsGrid, PIHPS_API, PIHPS_PAGE, STAPLES, type StapleItem, type StaplesPayload } from '../src/utils/staples.ts';

const STORE_KEY = 'staples:data';
const REFRESH_MS = 6 * 3600_000;
const RECENT_DAYS = 21;
const CHUNK_DAYS = 60;
const HISTORY_DAYS = 365;
const NEWS_MS = 30 * 60_000;
const NEWS_QUERY =
  '"harga beras" OR "harga cabai" OR "harga bawang" OR "harga telur" OR "harga minyak goreng" OR "harga gula" OR "harga daging" OR "harga pangan" when:3d';

const state: { items: Map<string, StapleItem> | null; dirty: boolean; running: Promise<void> | null } = { items: null, dirty: false, running: null };
const news: { at: number; items: StaplesPayload['news'] } = { at: 0, items: [] };
const enso: { at: number; value: EnsoReading | null } = { at: 0, value: null };
const ONI_URL = 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt';

async function latestEnso(): Promise<EnsoReading | null> {
  if (Date.now() - enso.at < 24 * 3600_000) return enso.value;
  try {
    const res = await fetch(ONI_URL, { headers: { 'User-Agent': 'AssetRadar/1.0 (personal research; non-commercial)' }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    enso.value = parseOni(await res.text()).at(-1) ?? enso.value;
    enso.at = Date.now();
  } catch {
    // Keep the last reading; try again in 30 minutes
    enso.at = Date.now() - 24 * 3600_000 + 30 * 60_000;
  }
  return enso.value;
}

/** Today in Jakarta (WIB), YYYY-MM-DD. */
const todayWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

async function fetchGrid(id: string, from: string, to: string, timeoutMs: number) {
  const q = new URLSearchParams({
    price_type_id: '1',
    comcat_id: id,
    province_id: '',
    regency_id: '',
    showKota: 'false',
    showPasar: 'false',
    tipe_laporan: '1',
    start_date: from,
    end_date: to,
  });
  const res = await fetch(`${PIHPS_API}?${q}`, {
    headers: { 'User-Agent': 'AssetRadar/1.0 (personal research; non-commercial)', 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parsePihpsGrid(await res.json());
}

async function load(store: KvStore): Promise<Map<string, StapleItem>> {
  if (state.items) return state.items;
  const saved = await getPacked<StapleItem[]>(store, STORE_KEY).catch(() => null);
  state.items = new Map((saved ?? []).map((i) => [i.id, i]));
  for (const s of STAPLES) if (!state.items.has(s.id)) state.items.set(s.id, { id: s.id, points: [], provinces: [], updatedAt: 0, backfilled: false });
  return state.items;
}

/** One round of work until `until`: recent prices for stale items, then older history. */
async function work(store: KvStore, until: number): Promise<{ refreshed: number; backfilled: number; errors: number }> {
  const items = await load(store);
  const today = todayWib();
  let refreshed = 0;
  let backfilled = 0;
  let errors = 0;
  const due = [...items.values()].filter((i) => Date.now() - i.updatedAt > REFRESH_MS);
  // Recent window, 4 at a time
  for (let k = 0; k < due.length && Date.now() < until - 5_000; k += 4) {
    await Promise.all(
      due.slice(k, k + 4).map(async (item) => {
        try {
          const g = await fetchGrid(item.id, addDays(today, -RECENT_DAYS), today, 30_000);
          if (!g.national.length) throw new Error('no prices');
          item.points = mergeStaplePoints(item.points, g.national, HISTORY_DAYS + 35);
          if (g.provinces.length) item.provinces = g.provinces;
          item.updatedAt = Date.now();
          state.dirty = true;
          refreshed++;
        } catch {
          errors++;
        }
      })
    );
  }
  // Older history, one chunk at a time (the slow part)
  const target = addDays(today, -HISTORY_DAYS);
  for (const item of items.values()) {
    if (item.backfilled || !item.points.length) continue;
    if (Date.now() > until - 12_000) break;
    const earliest = item.points[0][0];
    if (earliest <= target) {
      item.backfilled = true;
      state.dirty = true;
      continue;
    }
    const to = addDays(earliest, -1);
    const from = addDays(earliest, -CHUNK_DAYS) < target ? target : addDays(earliest, -CHUNK_DAYS);
    try {
      const g = await fetchGrid(item.id, from, to, 45_000);
      // An empty answer for a whole older window means the data does not go further back
      if (!g.national.length) item.backfilled = true;
      else item.points = mergeStaplePoints(item.points, g.national, HISTORY_DAYS + 35);
      state.dirty = true;
      backfilled++;
    } catch {
      errors++;
    }
  }
  if (state.dirty) {
    await setPacked(store, STORE_KEY, [...items.values()]).catch(() => {});
    state.dirty = false;
  }
  return { refreshed, backfilled, errors };
}

/** Cron tick step (and the on-request update): runs at most one round at a time. */
export async function staplesStep(store: KvStore, until: number): Promise<unknown> {
  if (state.running) {
    await state.running;
    return 'already running';
  }
  let result: unknown;
  state.running = work(store, until)
    .then((r) => {
      result = r;
    })
    .finally(() => {
      state.running = null;
    });
  await state.running;
  return result;
}

async function stapleNews(): Promise<StaplesPayload['news']> {
  if (Date.now() - news.at < NEWS_MS) return news.items;
  try {
    const res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(NEWS_QUERY)}&hl=id&gl=ID&ceid=ID:id`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (AssetRadar personal research app)' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    news.items = parseRssItems(await res.text(), 12).map((n) => ({ title: n.title, link: n.link, source: n.source, publishedAt: n.publishedAt, publishedAtMs: n.publishedAtMs }))
      .sort((a, b) => (b.publishedAtMs ?? 0) - (a.publishedAtMs ?? 0));
    news.at = Date.now();
  } catch {
    // Keep the last headlines; try again in 5 minutes
    news.at = Date.now() - NEWS_MS + 5 * 60_000;
  }
  return news.items;
}

export function registerStaplesRoute(app: Express, store: KvStore): void {
  app.get('/api/staples', async (_req, res) => {
    try {
      const items = await load(store);
      const stale = [...items.values()].some((i) => Date.now() - i.updatedAt > REFRESH_MS);
      // Fresh prices first (a few seconds); the slower history keeps filling in the background
      const [, headlines, ensoNow] = await Promise.all([stale ? staplesStep(store, Date.now() + 25_000) : Promise.resolve(), stapleNews(), latestEnso()]);
      const list = STAPLES.map((s) => items.get(s.id)!).filter(Boolean);
      if (!state.running && list.some((i) => !i.backfilled && i.points.length)) {
        keepAlive(staplesStep(store, Date.now() + 90_000)).catch(() => {});
      }
      if (!list.some((i) => i.points.length)) {
        res.status(502).json({ error: 'Staple prices unavailable' });
        return;
      }
      const payload: StaplesPayload = {
        items: list,
        news: headlines,
        checkedAt: Math.max(...list.map((i) => i.updatedAt)),
        source: 'PIHPS Nasional, Bank Indonesia (traditional markets)',
        sourceUrl: PIHPS_PAGE,
        filling: list.filter((i) => !i.backfilled).length,
        enso: ensoNow,
      };
      res.json(payload);
    } catch {
      res.status(502).json({ error: 'Staple prices unavailable' });
    }
  });
}
