/**
 * staples.ts — Staple food prices ("Kitchen Radar", #/kitchen) from Bank Indonesia's PIHPS
 * (Pusat Informasi Harga Pangan Strategis Nasional): daily traditional-market prices per kg, as a
 * national average and per province. Parses the PIHPS grid JSON (dates "22/10/2026" as keys,
 * prices "16,400" as text), merges daily histories, and summarises an item (latest price, changes
 * over 1 week / 1 month / 3 months / 1 year, cheapest and most expensive provinces).
 */

export const PIHPS_API = 'https://www.bi.go.id/hargapangan/WebSite/TabelHarga/GetGridDataKomoditas';
export const PIHPS_PAGE = 'https://www.bi.go.id/hargapangan/TabelHarga/PasarTradisionalKomoditas';

export type StapleCategory = 'rice' | 'chicken' | 'beef' | 'eggs' | 'shallot' | 'garlic' | 'chili' | 'birdChili' | 'oil' | 'sugar';

export const STAPLE_CATEGORIES: StapleCategory[] = ['rice', 'chicken', 'beef', 'eggs', 'shallot', 'garlic', 'chili', 'birdChili', 'oil', 'sugar'];

/** PIHPS commodities (id "com_n"), each in a category; `main` = the one shown first in its category. */
export const STAPLES: Array<{ id: string; key: string; category: StapleCategory; main?: boolean }> = [
  { id: 'com_1', key: 'riceLow1', category: 'rice' },
  { id: 'com_2', key: 'riceLow2', category: 'rice' },
  { id: 'com_3', key: 'riceMedium1', category: 'rice', main: true },
  { id: 'com_4', key: 'riceMedium2', category: 'rice' },
  { id: 'com_5', key: 'riceSuper1', category: 'rice' },
  { id: 'com_6', key: 'riceSuper2', category: 'rice' },
  { id: 'com_7', key: 'chicken', category: 'chicken', main: true },
  { id: 'com_8', key: 'beef1', category: 'beef', main: true },
  { id: 'com_9', key: 'beef2', category: 'beef' },
  { id: 'com_10', key: 'eggs', category: 'eggs', main: true },
  { id: 'com_11', key: 'shallot', category: 'shallot', main: true },
  { id: 'com_12', key: 'garlic', category: 'garlic', main: true },
  { id: 'com_13', key: 'chiliBig', category: 'chili' },
  { id: 'com_14', key: 'chiliCurly', category: 'chili', main: true },
  { id: 'com_15', key: 'birdChiliGreen', category: 'birdChili' },
  { id: 'com_16', key: 'birdChiliRed', category: 'birdChili', main: true },
  { id: 'com_17', key: 'oilBulk', category: 'oil' },
  { id: 'com_18', key: 'oilBrand1', category: 'oil', main: true },
  { id: 'com_19', key: 'oilBrand2', category: 'oil' },
  { id: 'com_20', key: 'sugarPremium', category: 'sugar' },
  { id: 'com_21', key: 'sugarLocal', category: 'sugar', main: true },
];

/** [YYYY-MM-DD, Rp per kg] */
export type StaplePoint = [string, number];

export interface StapleProvince {
  name: string;
  price: number;
  /** Price at the start of the fetched window (about 3 weeks earlier), when known. */
  earlier: number | null;
}

export interface StapleItem {
  id: string;
  /** National average, oldest first. */
  points: StaplePoint[];
  /** Latest price per province (latest day of the last update). */
  provinces: StapleProvince[];
  updatedAt: number;
  /** The history reaches back as far as it will (a year, or the start of PIHPS data). */
  backfilled: boolean;
}

export interface StaplesPayload {
  items: StapleItem[];
  news: Array<{ title: string; link: string; source: string; publishedAt: string; publishedAtMs?: number }>;
  checkedAt: number;
  source: string;
  sourceUrl: string;
  /** Items still filling their one-year history (a little more on each update). */
  filling: number;
}

/** "16,400" / "16.400" → 16400; empty, "-" or zero → null. */
export function parsePihpsPrice(v: unknown): number | null {
  if (typeof v === 'number') return v > 0 ? v : null;
  const digits = String(v ?? '').replace(/[^\d]/g, '');
  const n = digits ? Number(digits) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "22/10/2026" → "2026-10-22" (null for other keys). */
export function pihpsDate(key: string): string | null {
  const m = key.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** National series and provinces (first and last price in the window) from one PIHPS grid answer. */
export function parsePihpsGrid(json: unknown): { national: StaplePoint[]; provinces: StapleProvince[] } {
  const rows = ((json as { data?: unknown[] })?.data ?? []) as Array<Record<string, unknown>>;
  const series = (row: Record<string, unknown>): StaplePoint[] =>
    Object.entries(row)
      .map(([k, v]) => [pihpsDate(k), parsePihpsPrice(v)] as const)
      .filter((p): p is [string, number] => p[0] !== null && p[1] !== null)
      .sort((a, b) => a[0].localeCompare(b[0]));
  const nationalRow = rows.find((r) => r.level === 0);
  const provinces: StapleProvince[] = [];
  for (const r of rows) {
    if (r.level !== 1 || typeof r.name !== 'string') continue;
    const s = series(r);
    if (!s.length) continue;
    provinces.push({ name: r.name.trim(), price: s[s.length - 1][1], earlier: s.length > 1 ? s[0][1] : null });
  }
  return { national: nationalRow ? series(nationalRow) : [], provinces };
}

/** Old and new points by date (new wins), oldest first, only the last `keepDays` days. */
export function mergeStaplePoints(old: StaplePoint[], fresh: StaplePoint[], keepDays = 400): StaplePoint[] {
  const byDate = new Map(old);
  for (const [d, v] of fresh) byDate.set(d, v);
  const all = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (!all.length) return all;
  const cut = new Date(Date.parse(`${all[all.length - 1][0]}T00:00:00Z`) - keepDays * 86_400_000).toISOString().slice(0, 10);
  return all.filter(([d]) => d >= cut);
}

/** YYYY-MM-DD shifted by whole days. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export interface StapleSummary {
  latest: StaplePoint | null;
  /** % change against the last price on or before 7 / 30 / 91 / 365 days earlier (null when the history is shorter). */
  change: { w1: number | null; m1: number | null; m3: number | null; y1: number | null };
  cheapest: StapleProvince[];
  dearest: StapleProvince[];
  /** Highest and lowest national price in the history. */
  high: number | null;
  low: number | null;
}

export function stapleSummary(item: Pick<StapleItem, 'points' | 'provinces'>, top = 3): StapleSummary {
  const pts = item.points;
  const latest = pts.length ? pts[pts.length - 1] : null;
  const at = (days: number): number | null => {
    if (!latest) return null;
    const target = addDays(latest[0], -days);
    // Allow a few days of slack for weekends and holidays
    if (!pts.length || pts[0][0] > addDays(target, 5)) return null;
    let found: number | null = null;
    for (const [d, v] of pts) {
      if (d > target) break;
      found = v;
    }
    return found ?? pts[0][1];
  };
  const pct = (days: number) => {
    const base = at(days);
    return latest && base ? ((latest[1] - base) / base) * 100 : null;
  };
  const byPrice = [...item.provinces].sort((a, b) => a.price - b.price);
  const values = pts.map((p) => p[1]);
  return {
    latest,
    change: { w1: pct(7), m1: pct(30), m3: pct(91), y1: pct(365) },
    cheapest: byPrice.slice(0, top),
    dearest: byPrice.slice(-top).reverse(),
    high: values.length ? Math.max(...values) : null,
    low: values.length ? Math.min(...values) : null,
  };
}

/** Average % change of the main item of each category over a period ("kitchen basket"). */
export function basketChange(items: StapleItem[], period: keyof StapleSummary['change']): number | null {
  const mains = new Set(STAPLES.filter((s) => s.main).map((s) => s.id));
  const changes = items
    .filter((i) => mains.has(i.id))
    .map((i) => stapleSummary(i).change[period])
    .filter((v): v is number => v !== null);
  return changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : null;
}
