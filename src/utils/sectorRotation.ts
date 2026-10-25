/**
 * sectorRotation.ts — Pure logic for the IDX "Sector Rotation" page: groups the screener rows of
 * every listed stock by IDX-IC sector and computes, per period (1 day and 1 week), the
 * market-cap-weighted and equal-weight change, breadth (% of stocks up), the top gainers and
 * losers, a rotation quadrant (Leading / Improving / Weakening / Lagging, relative to the whole
 * market, like a simple RRG) and a short rule-based reason built from translation keys
 * (TextPart[]): who led the move, how broad it was, and the macro driver that fits the sector
 * (oil/coal for energy, nickel/gold for basic materials, BI rate for property, …).
 * A summary of reported prices, not a buy/sell signal.
 */
import { part, type TextPart } from '../i18n/textParts.ts';
import type { ScreenerRow } from './screener.ts';

export type RotationPeriod = 'd1' | 'w1';
export type RotationQuadrant = 'leading' | 'improving' | 'weakening' | 'lagging';

/** Live drivers: % change over the period (oil, gold, copper, natural gas, USD/IDR, Nasdaq 100). */
export type LiveDriver = 'oil' | 'gold' | 'copper' | 'natgas' | 'usdIdr' | 'nasdaq';
/** Monthly World Bank Pink Sheet drivers: % change of the latest month. */
export type MonthlyDriver = 'coal' | 'nickel' | 'palmOil';

export interface SectorDrivers {
  live: Record<RotationPeriod, Partial<Record<LiveDriver, number | null>>>;
  monthly: Partial<Record<MonthlyDriver, number | null>>;
  /** Latest BI-Rate decision: level and change from the previous decision (percentage points). */
  biRate?: { level: number; change: number; date: string } | null;
  /** Latest quarter of foreign net buying of Indonesian stocks (sign matters only). */
  foreignStockFlow?: number | null;
}

export interface SectorMover {
  symbol: string;
  code: string;
  name: string;
  chg: number;
}

export interface SectorPeriodStats {
  /** Market-cap-weighted change (%); null when no stock has both a change and a market cap. */
  capWeighted: number | null;
  equalWeighted: number | null;
  /** Share of stocks with a change that rose (0–100). */
  breadth: number | null;
  up: number;
  down: number;
  /** Stocks with a change for this period. */
  counted: number;
  gainers: SectorMover[];
  losers: SectorMover[];
  /** Performance minus the whole market's cap-weighted change (percentage points). */
  relative: number | null;
  reason: TextPart[];
}

export interface SectorSummary {
  sector: string;
  /** Translation key suffix for the sector name (rotation.sector.<slug>). */
  slug: string;
  stocks: number;
  valueTraded: number | null;
  marketCap: number | null;
  d1: SectorPeriodStats;
  w1: SectorPeriodStats;
  quadrant: RotationQuadrant | null;
}

export interface SectorRotationResult {
  sectors: SectorSummary[];
  market: Record<RotationPeriod, number | null>;
}

/** IDX-IC sector names (as in idxStocks.json) → translation slug. */
export const SECTOR_SLUGS: Record<string, string> = {
  Energy: 'energy',
  'Basic Materials': 'basicMaterials',
  Industrials: 'industrials',
  'Consumer Non-Cyclicals': 'consumerNonCyclicals',
  'Consumer Cyclicals': 'consumerCyclicals',
  Healthcare: 'healthcare',
  Financials: 'financials',
  'Properties & Real Estate': 'property',
  Technology: 'technology',
  Infrastructures: 'infrastructures',
  'Transportation & Logistic': 'transportation',
};

export const sectorSlug = (sector: string) => SECTOR_SLUGS[sector] ?? 'other';

type DriverRef =
  | { kind: 'live'; id: LiveDriver; effect: 1 | -1 }
  | { kind: 'monthly'; id: MonthlyDriver; effect: 1 | -1 }
  | { kind: 'biRate'; effect: -1 }
  | { kind: 'foreignFlow'; effect: 1 };

/**
 * Drivers that usually move each sector; effect +1 = the driver rising helps the sector.
 * USD/IDR rising = a weaker rupiah: good for exporters (coal, nickel), bad for importers.
 */
export const SECTOR_DRIVERS: Record<string, DriverRef[]> = {
  energy: [
    { kind: 'monthly', id: 'coal', effect: 1 },
    { kind: 'live', id: 'oil', effect: 1 },
    { kind: 'live', id: 'natgas', effect: 1 },
    { kind: 'live', id: 'usdIdr', effect: 1 },
  ],
  basicMaterials: [
    { kind: 'monthly', id: 'nickel', effect: 1 },
    { kind: 'live', id: 'gold', effect: 1 },
    { kind: 'live', id: 'copper', effect: 1 },
  ],
  consumerNonCyclicals: [
    { kind: 'monthly', id: 'palmOil', effect: 1 },
    { kind: 'live', id: 'usdIdr', effect: -1 },
  ],
  consumerCyclicals: [
    { kind: 'live', id: 'usdIdr', effect: -1 },
    { kind: 'biRate', effect: -1 },
  ],
  financials: [
    { kind: 'biRate', effect: -1 },
    { kind: 'foreignFlow', effect: 1 },
    { kind: 'live', id: 'usdIdr', effect: -1 },
  ],
  property: [{ kind: 'biRate', effect: -1 }],
  infrastructures: [
    { kind: 'biRate', effect: -1 },
    { kind: 'live', id: 'usdIdr', effect: -1 },
  ],
  transportation: [{ kind: 'live', id: 'oil', effect: -1 }],
  industrials: [{ kind: 'live', id: 'usdIdr', effect: -1 }],
  technology: [{ kind: 'live', id: 'nasdaq', effect: 1 }],
  healthcare: [{ kind: 'live', id: 'usdIdr', effect: -1 }],
};

/** Moves smaller than this are "flat" (sector) or not worth mentioning (driver). */
const FLAT: Record<RotationPeriod, number> = { d1: 0.1, w1: 0.25 };
const DRIVER_MIN: Record<RotationPeriod, number> = { d1: 0.5, w1: 1 };
const MONTHLY_MIN = 2;
/** BI-Rate decisions older than this are no longer "news". */
const BI_RATE_FRESH_DAYS = 75;

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const chgOf = (r: ScreenerRow, p: RotationPeriod) => (p === 'd1' ? r.chg1d : r.chg1w);
const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/** Cap-weighted change of a set of rows. */
function capWeightedChange(rows: ScreenerRow[], p: RotationPeriod): number | null {
  let w = 0;
  let s = 0;
  for (const r of rows) {
    const c = chgOf(r, p);
    if (finite(c) && finite(r.marketCap) && r.marketCap > 0) {
      w += r.marketCap;
      s += r.marketCap * c;
    }
  }
  return w > 0 ? s / w : null;
}

const mover = (r: ScreenerRow, p: RotationPeriod): SectorMover => ({ symbol: r.symbol, code: r.code, name: r.name, chg: round(chgOf(r, p) as number) });

function periodStats(rows: ScreenerRow[], p: RotationPeriod, market: number | null): Omit<SectorPeriodStats, 'reason'> & { leader: SectorMover | null } {
  const withChg = rows.filter((r) => finite(chgOf(r, p)));
  const up = withChg.filter((r) => (chgOf(r, p) as number) > 0).length;
  const down = withChg.filter((r) => (chgOf(r, p) as number) < 0).length;
  const cap = capWeightedChange(rows, p);
  const equal = withChg.length ? withChg.reduce((a, r) => a + (chgOf(r, p) as number), 0) / withChg.length : null;
  const sorted = [...withChg].sort((a, b) => (chgOf(b, p) as number) - (chgOf(a, p) as number));
  const gainers = sorted.filter((r) => (chgOf(r, p) as number) > 0).slice(0, 3).map((r) => mover(r, p));
  const losers = sorted.filter((r) => (chgOf(r, p) as number) < 0).reverse().slice(0, 3).map((r) => mover(r, p));
  // Leader = largest cap-weighted contribution in the sector's direction (falls back to the biggest mover)
  const perf = cap ?? equal;
  let leader: SectorMover | null = null;
  if (perf !== null && Math.abs(perf) >= FLAT[p]) {
    const dir = Math.sign(perf);
    let best = 0;
    for (const r of withChg) {
      const c = chgOf(r, p) as number;
      const contrib = (finite(r.marketCap) ? r.marketCap : 0) * c * dir;
      if (Math.sign(c) === dir && contrib > best) {
        best = contrib;
        leader = mover(r, p);
      }
    }
    leader ??= dir > 0 ? gainers[0] ?? null : losers[0] ?? null;
  }
  return {
    capWeighted: cap === null ? null : round(cap),
    equalWeighted: equal === null ? null : round(equal),
    breadth: withChg.length ? round((up / withChg.length) * 100, 0) : null,
    up,
    down,
    counted: withChg.length,
    gainers,
    losers,
    relative: perf !== null && market !== null ? round(perf - market) : null,
    leader,
  };
}

/** The driver line: the first listed driver whose move fits the sector's direction, else none. */
function driverPart(slug: string, p: RotationPeriod, dir: number, drivers: SectorDrivers, today: string): TextPart | null {
  const refs = SECTOR_DRIVERS[slug] ?? [];
  for (const ref of refs) {
    if (ref.kind === 'live') {
      const v = drivers.live[p]?.[ref.id];
      if (!finite(v) || Math.abs(v) < DRIVER_MIN[p]) continue;
      if (Math.sign(v) * ref.effect !== dir) continue;
      return part(p === 'd1' ? 'rotation.reason.driverDay' : 'rotation.reason.driverWeek', { driver: `@rotation.driver.${ref.id}`, chgPct: round(v) });
    }
    if (ref.kind === 'monthly') {
      const v = drivers.monthly[ref.id];
      if (!finite(v) || Math.abs(v) < MONTHLY_MIN) continue;
      if (Math.sign(v) * ref.effect !== dir) continue;
      return part('rotation.reason.driverMonth', { driver: `@rotation.driver.${ref.id}`, chgPct: round(v, 1) });
    }
    if (ref.kind === 'biRate') {
      const b = drivers.biRate;
      if (!b || !finite(b.change) || b.change === 0) continue;
      const ageDays = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${b.date}T00:00:00Z`)) / 86_400_000;
      if (!(ageDays >= 0 && ageDays <= BI_RATE_FRESH_DAYS)) continue;
      if (Math.sign(b.change) * ref.effect !== dir) continue;
      return part(b.change < 0 ? 'rotation.reason.biCut' : 'rotation.reason.biHike', { level: b.level });
    }
    if (ref.kind === 'foreignFlow') {
      const v = drivers.foreignStockFlow;
      if (!finite(v) || v === 0) continue;
      if (Math.sign(v) * ref.effect !== dir) continue;
      return part(v > 0 ? 'rotation.reason.foreignBuy' : 'rotation.reason.foreignSell');
    }
  }
  return null;
}

/** One-line reason: leader · breadth · driver. */
export function sectorReason(
  slug: string,
  p: RotationPeriod,
  s: Omit<SectorPeriodStats, 'reason'> & { leader: SectorMover | null },
  drivers: SectorDrivers,
  today: string
): TextPart[] {
  const perf = s.capWeighted ?? s.equalWeighted;
  if (perf === null || s.counted === 0) return [part('rotation.reason.noData')];
  if (Math.abs(perf) < FLAT[p]) return [part('rotation.reason.flat', { pct: s.breadth ?? 0 })];
  const dir = Math.sign(perf);
  const out: TextPart[] = [];
  const movers = dir > 0 ? s.up : s.down;
  if (movers === 1 && s.leader) {
    out.push(part(dir > 0 ? 'rotation.reason.onlyUp' : 'rotation.reason.onlyDown', { code: s.leader.code, chgPct: s.leader.chg }));
  } else {
    if (s.leader) out.push(part(dir > 0 ? 'rotation.reason.led' : 'rotation.reason.dragged', { code: s.leader.code, chgPct: s.leader.chg }));
    const share = s.counted ? Math.round(((dir > 0 ? s.up : s.down) / s.counted) * 100) : 0;
    if (share >= 65) out.push(part(dir > 0 ? 'rotation.reason.broadUp' : 'rotation.reason.broadDown', { pct: share }));
    else if (share < 40) out.push(part(dir > 0 ? 'rotation.reason.narrowUp' : 'rotation.reason.narrowDown', { pct: share }));
  }
  const d = driverPart(slug, p, dir, drivers, today);
  if (d) out.push(d);
  // Join with a separator between the pieces
  return out.flatMap((x, i) => (i ? [part('rotation.reason.sep'), x] : [x]));
}

/** Quadrant from the 1W (trend) and 1D (latest) performance relative to the market. */
export function quadrant(rel1w: number | null, rel1d: number | null): RotationQuadrant | null {
  if (rel1w === null || rel1d === null) return null;
  if (rel1w >= 0) return rel1d >= 0 ? 'leading' : 'weakening';
  return rel1d > 0 ? 'improving' : 'lagging';
}

/** Groups the rows by sector; sectors sorted strongest → weakest by 1W (missing last). */
export function computeSectorRotation(rows: ScreenerRow[], drivers: SectorDrivers, today: string): SectorRotationResult {
  const market = { d1: capWeightedChange(rows, 'd1'), w1: capWeightedChange(rows, 'w1') };
  const bySector = new Map<string, ScreenerRow[]>();
  for (const r of rows) {
    const key = r.sector || 'Other';
    const list = bySector.get(key);
    if (list) list.push(r);
    else bySector.set(key, [r]);
  }
  const sectors: SectorSummary[] = [];
  for (const [sector, list] of bySector) {
    const slug = sectorSlug(sector);
    const stats = (p: RotationPeriod): SectorPeriodStats => {
      const { leader, ...s } = periodStats(list, p, market[p]);
      return { ...s, reason: sectorReason(slug, p, { ...s, leader }, drivers, today) };
    };
    const d1 = stats('d1');
    const w1 = stats('w1');
    const vt = list.filter((r) => finite(r.valueTraded));
    const mc = list.filter((r) => finite(r.marketCap));
    sectors.push({
      sector,
      slug,
      stocks: list.length,
      valueTraded: vt.length ? vt.reduce((a, r) => a + (r.valueTraded as number), 0) : null,
      marketCap: mc.length ? mc.reduce((a, r) => a + (r.marketCap as number), 0) : null,
      d1,
      w1,
      quadrant: quadrant(w1.relative, d1.relative),
    });
  }
  sortSectors(sectors, 'w1');
  return { sectors, market: { d1: market.d1 === null ? null : round(market.d1), w1: market.w1 === null ? null : round(market.w1) } };
}

/** Performance used for ranking: cap-weighted, else equal-weight. */
export const sectorPerf = (s: SectorSummary, p: RotationPeriod) => s[p].capWeighted ?? s[p].equalWeighted;

/** Sorts in place, strongest first; sectors without data last. */
export function sortSectors(sectors: SectorSummary[], p: RotationPeriod): SectorSummary[] {
  return sectors.sort((a, b) => {
    const x = sectorPerf(a, p);
    const y = sectorPerf(b, p);
    if (x === null) return y === null ? a.sector.localeCompare(b.sector) : 1;
    if (y === null) return -1;
    return y - x;
  });
}

/** Counts for the summary line: sectors up, down, flat and the strongest / weakest. */
export function rotationSummary(sectors: SectorSummary[], p: RotationPeriod) {
  const withPerf = sectors.filter((s) => sectorPerf(s, p) !== null);
  const up = withPerf.filter((s) => (sectorPerf(s, p) as number) >= FLAT[p]).length;
  const down = withPerf.filter((s) => (sectorPerf(s, p) as number) <= -FLAT[p]).length;
  const ranked = sortSectors([...withPerf], p);
  return { up, down, flat: withPerf.length - up - down, strongest: ranked[0] ?? null, weakest: ranked.length > 1 ? ranked[ranked.length - 1] : null };
}

/** % change between the last two points of a series (null under two points). */
export function lastChangePct(points: Array<{ value: number }> | undefined): number | null {
  if (!points || points.length < 2) return null;
  const a = points[points.length - 2].value;
  const b = points[points.length - 1].value;
  return finite(a) && finite(b) && a !== 0 ? round(((b - a) / Math.abs(a)) * 100, 1) : null;
}
