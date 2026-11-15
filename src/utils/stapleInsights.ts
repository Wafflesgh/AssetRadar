/**
 * stapleInsights.ts — Pure calculations on staple price histories for Kitchen Radar: monthly
 * averages, the seasonal pattern (average month-on-month change per calendar month and how often
 * it rose), the usual price run-up before Eid al-Fitr, unusual price moves in one province
 * (compared with that province's own habits, plus one-day spikes that look like data errors),
 * the cost of a personal monthly basket now / a month ago / a year ago, monthly prices per province
 * for the map animation, and matching news headlines to an unusual move. No numbers are made up:
 * every function returns null (or leaves a gap) when the history is too short.
 */
import { addDays, denseToPoints, priceDaysAgo, type StapleCategory, type StapleDetail, type StaplePoint } from './staples.ts';

/** [YYYY-MM, average price], oldest first. */
export function monthlyAverages(points: StaplePoint[]): Array<[string, number]> {
  const sums = new Map<string, [number, number]>();
  for (const [d, v] of points) {
    const s = sums.get(d.slice(0, 7)) ?? [0, 0];
    s[0] += v;
    s[1] += 1;
    sums.set(d.slice(0, 7), s);
  }
  return [...sums.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([m, [sum, n]]) => [m, sum / n]);
}

const nextMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
};

export interface SeasonStat {
  /** Average % change (this month's average price against the month before). */
  avg: number;
  /** Years in which the price rose, out of `n` years with data. */
  up: number;
  n: number;
}

/** One entry per calendar month (index 0 = January); null when fewer than `minYears` years cover every month. */
export function seasonalPattern(points: StaplePoint[], minYears = 3): SeasonStat[] | null {
  const monthly = monthlyAverages(points);
  const byMonth: number[][] = Array.from({ length: 12 }, () => []);
  for (let i = 1; i < monthly.length; i++) {
    if (nextMonth(monthly[i - 1][0]) !== monthly[i][0]) continue;
    byMonth[Number(monthly[i][0].slice(5)) - 1].push(((monthly[i][1] - monthly[i - 1][1]) / monthly[i - 1][1]) * 100);
  }
  if (byMonth.some((list) => list.length < minYears)) return null;
  return byMonth.map((list) => ({ avg: list.reduce((a, b) => a + b, 0) / list.length, up: list.filter((v) => v > 0).length, n: list.length }));
}

/** Eid al-Fitr (first day, Indonesia). Dates from 2027 on are estimates: update each year. */
export const EID_FITR = ['2018-06-15', '2019-06-05', '2020-05-24', '2021-05-13', '2022-05-02', '2023-04-22', '2024-04-10', '2025-03-31', '2026-03-20', '2027-03-10', '2028-02-27'];

const averageBetween = (points: StaplePoint[], from: string, to: string): number | null => {
  const hit = points.filter(([d]) => d >= from && d <= to);
  return hit.length ? hit.reduce((s, p) => s + p[1], 0) / hit.length : null;
};

/** Price in the week before Eid against 5–6 weeks before it, averaged over the years in the history. */
export function eidEffect(points: StaplePoint[], minYears = 3): SeasonStat | null {
  const moves: number[] = [];
  for (const eid of EID_FITR) {
    const before = averageBetween(points, addDays(eid, -42), addDays(eid, -29));
    const peak = averageBetween(points, addDays(eid, -7), eid);
    if (before && peak) moves.push(((peak - before) / before) * 100);
  }
  if (moves.length < minYears) return null;
  return { avg: moves.reduce((a, b) => a + b, 0) / moves.length, up: moves.filter((v) => v > 0).length, n: moves.length };
}

export interface StapleAnomaly {
  /** `move` = a 1-week change far outside this series' own habits; `glitch` = a one-day spike that went straight back. */
  kind: 'move' | 'glitch';
  /** % change (1 week for `move`, the one-day jump for `glitch`). */
  change: number;
  price: number;
  date: string;
  /** How many "usual deviations" away from the usual weekly change (robust z-score); 0 for a glitch. */
  score: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Unusual move in one daily series as of `today`, or null (also null when the series is stale or short). */
export function detectAnomaly(points: StaplePoint[], today: string, minScore = 4, minChange = 5): StapleAnomaly | null {
  const pts = points.filter(([d]) => d >= addDays(today, -400));
  const last = pts[pts.length - 1];
  if (!last || last[0] < addDays(today, -4)) return null;
  // A one-day spike in the last 10 days that returned to the earlier level: likely a typing error at the source
  for (let i = pts.length - 2; i > 0 && pts[i][0] >= addDays(today, -10); i--) {
    const jump = ((pts[i][1] - pts[i - 1][1]) / pts[i - 1][1]) * 100;
    const back = Math.abs((pts[i + 1][1] - pts[i - 1][1]) / pts[i - 1][1]) * 100;
    if (Math.abs(jump) > 25 && back < 5) return { kind: 'glitch', change: jump, price: pts[i][1], date: pts[i][0], score: 0 };
  }
  const weekly = (i: number): number | null => {
    const target = addDays(pts[i][0], -7);
    let base: number | null = null;
    for (let k = i - 1; k >= 0 && pts[k][0] >= addDays(target, -3); k--) {
      if (pts[k][0] <= target) {
        base = pts[k][1];
        break;
      }
    }
    return base ? ((pts[i][1] - base) / base) * 100 : null;
  };
  const now = weekly(pts.length - 1);
  if (now === null || Math.abs(now) < minChange) return null;
  const cut = addDays(last[0], -7);
  const past: number[] = [];
  for (let i = 0; i < pts.length && pts[i][0] <= cut; i++) {
    const w = weekly(i);
    if (w !== null) past.push(w);
  }
  if (past.length < 60) return null;
  const mid = median(past);
  // Floor of half a point: a price that never moves (regulated rice) would otherwise flag every small change
  const spread = Math.max(median(past.map((v) => Math.abs(v - mid))), 0.5);
  const score = (0.6745 * (now - mid)) / spread;
  return Math.abs(score) >= minScore ? { kind: 'move', change: now, price: last[1], date: last[0], score } : null;
}

export interface BasketCost {
  /** Rupiah per month at the latest prices. */
  now: number;
  /** % change against a month / a year ago, over the items that have both prices (null when none do). */
  m1: number | null;
  y1: number | null;
  /** Items with a quantity but no price at all. */
  missing: string[];
}

/** Cost of a monthly shopping list (staple id → kg or litres per month). */
export function basketCost(qty: Record<string, number>, series: Record<string, StaplePoint[]>): BasketCost | null {
  const rows = Object.entries(qty).filter(([, q]) => Number.isFinite(q) && q > 0);
  if (!rows.length) return null;
  let now = 0;
  const missing: string[] = [];
  const past = { m1: [0, 0], y1: [0, 0] };
  for (const [id, q] of rows) {
    const pts = series[id] ?? [];
    const latest = pts[pts.length - 1];
    if (!latest) {
      missing.push(id);
      continue;
    }
    now += q * latest[1];
    for (const [key, days] of [['m1', 30], ['y1', 365]] as const) {
      const old = priceDaysAgo(pts, days);
      if (old !== null) {
        past[key][0] += q * latest[1];
        past[key][1] += q * old;
      }
    }
  }
  if (!now) return null;
  const pct = ([a, b]: number[]) => (b ? ((a - b) / b) * 100 : null);
  return { now, m1: pct(past.m1), y1: pct(past.y1), missing };
}

/** Monthly average price of one staple in every province (GET /api/staples/map). */
export interface StapleMapPayload {
  id: string;
  months: string[];
  provinces: Record<string, Array<number | null>>;
}

export function provinceMonthly(id: string, detail: StapleDetail | null): StapleMapPayload {
  const per = Object.entries(detail?.provinces ?? {}).map(([name, s]) => [name, new Map(monthlyAverages(denseToPoints(s)))] as const);
  const all = per.flatMap(([, m]) => [...m.keys()]).sort();
  const months: string[] = [];
  if (all.length) for (let m = all[0]; m <= all[all.length - 1]; m = nextMonth(m)) months.push(m);
  return { id, months, provinces: Object.fromEntries(per.map(([name, m]) => [name, months.map((k) => (m.has(k) ? Math.round(m.get(k)!) : null))])) };
}

/** One unusual move with the headlines that name the staple and the place (GET /api/staples/anomalies). */
export interface StapleAnomalyRow extends StapleAnomaly {
  id: string;
  key: string;
  province: string;
  /** null = news not searched (glitches, or beyond the hourly search limit). */
  news: Array<{ title: string; link: string; source: string }> | null;
}

/** Indonesian search words per category (Google News). */
export const STAPLE_NEWS_TERM: Record<StapleCategory, string> = {
  rice: 'beras',
  chicken: 'ayam',
  beef: 'daging sapi',
  eggs: 'telur',
  shallot: 'bawang merah',
  garlic: 'bawang putih',
  chili: 'cabai',
  birdChili: 'cabai rawit',
  oil: 'minyak goreng',
  sugar: 'gula',
};

/** A headline is "related" when it names the staple and the province (or one of its cities). Keyword match only. */
export function matchesStapleNews(title: string, term: string, places: string[]): boolean {
  const text = title.toLowerCase().replace(/cabe/g, 'cabai');
  if (!term.split(' ').every((w) => text.includes(w))) return false;
  return places.some((p) => {
    const name = p.toLowerCase().replace(/^(kota|kab\.?|kabupaten|dki|di)\s+/, '').trim();
    return name.length >= 4 && text.includes(name);
  });
}
