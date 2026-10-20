/**
 * newsHorizon.ts — News effect per horizon, from the event classifier in src/ai/newsDrivers.ts
 * (category, direction for this asset, source reliability) with a time decay per horizon:
 * Short: half-life 2 days, every category; Medium: 3 weeks, without headlines that only report a
 * price move; Long: 6 months, structural categories only (earnings & guidance, regulation,
 * corporate actions incl. M&A/management, legal, central bank & macro policy). The net direction
 * is shrunk toward zero when there is little news, then capped at ±15 / ±10 / ±5 points.
 */
import type { AssetGroup, MarketNewsItem } from '../config/assets.ts';
import { classifyDriver, sourceWeight, type DriverCategory } from '../ai/newsDrivers.ts';

export type Horizon = 'short' | 'medium' | 'long';
export const HORIZONS: Horizon[] = ['short', 'medium', 'long'];

export const NEWS_HALF_LIFE_DAYS: Record<Horizon, number> = { short: 2, medium: 21, long: 182 };
export const NEWS_CAP_POINTS: Record<Horizon, number> = { short: 15, medium: 10, long: 5 };
const STRUCTURAL: DriverCategory[] = ['earnings', 'regulation', 'corporate', 'legal', 'monetary', 'macro'];
/** Pseudo-weight of "no news": a single fresh, reliable headline moves the score about halfway. */
const PRIOR_WEIGHT = 1;

export interface HorizonHeadline {
  title: string;
  link: string;
  source: string;
  publishedAtMs?: number;
  category: DriverCategory;
  direction: -1 | 0 | 1;
  /** Signed points this headline adds to the horizon score. */
  points: number;
  ageDays: number;
}

export interface HorizonNews {
  horizon: Horizon;
  /** Signed points (−cap … +cap) added to the 0–100 horizon score. */
  points: number;
  cap: number;
  headlines: HorizonHeadline[];
  /** Number of headlines that counted for this horizon. */
  count: number;
}

const eligible = (h: Horizon, c: DriverCategory) => (h === 'short' ? true : h === 'medium' ? c !== 'price' : STRUCTURAL.includes(c));

export function newsByHorizon(
  news: Array<Pick<MarketNewsItem, 'title' | 'link' | 'source' | 'publishedAtMs'>>,
  group: AssetGroup,
  symbol: string,
  now: number,
  caps: Record<Horizon, number> = NEWS_CAP_POINTS
): Record<Horizon, HorizonNews> {
  const seen = new Set<string>();
  const items = news
    .filter((n) => {
      const key = n.title.toLowerCase().replace(/\W+/g, ' ').trim().slice(0, 80);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((n) => {
      const c = classifyDriver(n, group, symbol);
      const ageDays = n.publishedAtMs ? Math.max(0, (now - n.publishedAtMs) / 86_400_000) : 1;
      return { n, c, ageDays, base: c.baseWeight * sourceWeight(n.source, n.link) };
    });
  const out = {} as Record<Horizon, HorizonNews>;
  for (const h of HORIZONS) {
    const used = items
      .filter((x) => eligible(h, x.c.category))
      .map((x) => ({ ...x, w: x.base * Math.pow(0.5, x.ageDays / NEWS_HALF_LIFE_DAYS[h]) }))
      .filter((x) => x.w > 1e-4);
    const total = used.reduce((s, x) => s + x.w, 0) + PRIOR_WEIGHT;
    const headlines: HorizonHeadline[] = used
      .map((x) => ({
        title: x.n.title,
        link: x.n.link,
        source: x.n.source,
        publishedAtMs: x.n.publishedAtMs,
        category: x.c.category,
        direction: x.c.direction,
        points: (caps[h] * x.c.direction * x.w) / total,
        ageDays: x.ageDays,
      }))
      .sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
    const points = headlines.reduce((s, x) => s + x.points, 0);
    out[h] = { horizon: h, points: Math.max(-caps[h], Math.min(caps[h], points)), cap: caps[h], headlines: headlines.slice(0, 8), count: used.length };
  }
  return out;
}
