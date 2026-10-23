/**
 * stapleDrivers.ts — "Why does the price move?" for Kitchen Radar: per staple category, the
 * factors that usually push its price (rupiah/dollar, yuan, world rice and palm-oil prices, oil
 * prices for transport and fertiliser, El Niño / La Niña, the rainy and dry seasons and harvests,
 * holiday demand, school holidays that pause the free school meals programme MBG) read from live data where there is a source, each marked as pushing the price up,
 * easing it, or neutral right now. Cause-and-effect texts are in i18n `kitchen.why.<category>.*`
 * and `kitchen.f.<factor>.<state>`; politics and government policy per category in
 * `kitchen.why.<category>.policy`. Also parses NOAA's Oceanic Niño Index (ONI). Education only:
 * real prices depend on many conditions at once.
 */
import type { MacroPoint } from './macro.ts';
import type { StapleCategory } from './staples.ts';

export type DriverFactor = 'usdIdr' | 'cny' | 'riceThai' | 'palmOil' | 'brent' | 'enso' | 'season' | 'holiday' | 'school';

/** Factors that matter for each category, most important first. */
export const STAPLE_FACTORS: Record<StapleCategory, DriverFactor[]> = {
  rice: ['season', 'enso', 'riceThai', 'usdIdr', 'brent', 'holiday', 'school'],
  chicken: ['usdIdr', 'holiday', 'school', 'brent'],
  beef: ['usdIdr', 'holiday'],
  eggs: ['usdIdr', 'holiday', 'school', 'brent'],
  shallot: ['season', 'enso', 'holiday', 'brent'],
  garlic: ['cny', 'usdIdr', 'holiday'],
  chili: ['season', 'enso', 'holiday', 'brent'],
  birdChili: ['season', 'enso', 'holiday', 'brent'],
  oil: ['palmOil', 'usdIdr', 'brent'],
  sugar: ['season', 'enso', 'usdIdr', 'holiday'],
};

/** Effect on the staple's price right now. */
export type DriverEffect = 'raises' | 'eases' | 'neutral' | 'unknown';

export interface DriverReading {
  factor: DriverFactor;
  effect: DriverEffect;
  /** i18n key suffix of the reading text: kitchen.f.<factor>.<state> */
  state: string;
  params: Record<string, string | number>;
}

export interface EnsoReading {
  /** Three-month season code, e.g. "JAS" (Jul–Sep). */
  season: string;
  year: number;
  anomaly: number;
}

/** NOAA ONI text table ("SEAS YR TOTAL ANOM") → readings, oldest first. */
export function parseOni(text: string): EnsoReading[] {
  const out: EnsoReading[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^([A-Z]{3})\s+(\d{4})\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/);
    if (m) out.push({ season: m[1], year: Number(m[2]), anomaly: Number(m[4]) });
  }
  return out;
}

/** El Niño from +0.5, La Niña from −0.5 (NOAA's threshold); strong from ±1.5. */
export function ensoPhase(anomaly: number): 'elNino' | 'laNina' | 'neutral' {
  return anomaly >= 0.5 ? 'elNino' : anomaly <= -0.5 ? 'laNina' : 'neutral';
}

/** Indonesia's seasons, roughly (they differ by region): rainy Nov–Mar, dry Jun–Sep, transitions between. */
export function seasonOf(month: number): 'rainy' | 'toDry' | 'dry' | 'toRainy' {
  if (month >= 11 || month <= 3) return 'rainy';
  if (month <= 5) return 'toDry';
  if (month <= 9) return 'dry';
  return 'toRainy';
}

/**
 * School holidays (approximate national calendar; provinces differ by a few days). The free school
 * meals programme (Makan Bergizi Gratis, since January 2025) mostly pauses for students then, so
 * demand for eggs, chicken and rice falls, and comes back when school restarts.
 */
export const SCHOOL_HOLIDAYS: Array<{ from: string; to: string }> = [
  { from: '2026-06-27', to: '2026-07-12' },
  { from: '2026-12-21', to: '2027-01-03' },
  { from: '2027-03-04', to: '2027-03-16' },
  { from: '2027-06-26', to: '2027-07-11' },
  { from: '2027-12-20', to: '2028-01-02' },
  { from: '2028-02-21', to: '2028-03-03' },
  { from: '2028-06-24', to: '2028-07-09' },
];

/** School calendar state on a day: in a holiday, holiday soon, school just restarted, or term time. */
export function schoolState(today: string): { state: 'holiday' | 'soon' | 'restart' | 'term'; days: number } {
  const t = Date.parse(`${today}T00:00:00Z`);
  const day = (d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - t) / 86_400_000);
  for (const h of SCHOOL_HOLIDAYS) {
    if (day(h.from) <= 0 && day(h.to) >= 0) return { state: 'holiday', days: day(h.to) + 1 };
    if (day(h.from) > 0 && day(h.from) <= 14) return { state: 'soon', days: day(h.from) };
    if (day(h.to) < 0 && day(h.to) >= -14) return { state: 'restart', days: -day(h.to) };
  }
  return { state: 'term', days: 0 };
}

/** Big demand peaks (approximate dates; Islamic holidays follow the moon and may shift a day). */
export const DEMAND_EVENTS: Array<{ id: 'christmas' | 'ramadan' | 'eidFitr' | 'eidAdha'; date: string }> = [
  { id: 'christmas', date: '2026-12-25' },
  { id: 'ramadan', date: '2027-02-08' },
  { id: 'eidFitr', date: '2027-03-10' },
  { id: 'eidAdha', date: '2027-05-17' },
  { id: 'christmas', date: '2027-12-25' },
  { id: 'ramadan', date: '2028-01-28' },
  { id: 'eidFitr', date: '2028-02-26' },
  { id: 'eidAdha', date: '2028-05-05' },
  { id: 'christmas', date: '2028-12-25' },
];

/** The next demand peak within `days` days of `today` (YYYY-MM-DD), with how many days away. */
export function nextDemandEvent(today: string, days = 45): { id: (typeof DEMAND_EVENTS)[number]['id']; date: string; inDays: number } | null {
  const t = Date.parse(`${today}T00:00:00Z`);
  for (const e of DEMAND_EVENTS) {
    const inDays = Math.round((Date.parse(`${e.date}T00:00:00Z`) - t) / 86_400_000);
    if (inDays >= -3 && inDays <= days) return { ...e, inDays: Math.max(0, inDays) };
  }
  return null;
}

/** % change of a monthly series over the last `months` observations (null when too short). */
export function changeOver(points: MacroPoint[] | undefined, months = 3): { latest: number; pct: number } | null {
  if (!points || points.length <= months) return null;
  const last = points[points.length - 1].value;
  const base = points[points.length - 1 - months].value;
  if (!base) return null;
  return { latest: last, pct: ((last - base) / Math.abs(base)) * 100 };
}

export interface DriverInputs {
  /** YYYY-MM-DD (Jakarta). */
  today: string;
  /** Monthly macro series by id (usdIdr, fx-cny, riceThai, palmOil, brent). */
  series: Record<string, MacroPoint[] | undefined>;
  enso: EnsoReading | null;
}

const SERIES_OF: Partial<Record<DriverFactor, string>> = { usdIdr: 'usdIdr', cny: 'fx-cny', riceThai: 'riceThai', palmOil: 'palmOil', brent: 'brent' };

function moveReading(factor: DriverFactor, c: { latest: number; pct: number } | null, threshold: number): DriverReading {
  if (!c) return { factor, effect: 'unknown', state: 'unknown', params: {} };
  const params = { pct: `${c.pct > 0 ? '+' : ''}${c.pct.toFixed(1)}`, value: c.latest };
  // A higher price of these inputs (or a weaker rupiah) makes the staple dearer
  if (c.pct >= threshold) return { factor, effect: 'raises', state: 'up', params };
  if (c.pct <= -threshold) return { factor, effect: 'eases', state: 'down', params };
  return { factor, effect: 'neutral', state: 'flat', params };
}

/** One factor's reading for a category right now. */
export function readDriver(category: StapleCategory, factor: DriverFactor, inp: DriverInputs): DriverReading {
  const month = Number(inp.today.slice(5, 7));
  const seriesId = SERIES_OF[factor];
  if (seriesId) return moveReading(factor, changeOver(inp.series[seriesId]), factor === 'usdIdr' || factor === 'cny' ? 1.5 : 5);
  if (factor === 'enso') {
    if (!inp.enso) return { factor, effect: 'unknown', state: 'unknown', params: {} };
    const phase = ensoPhase(inp.enso.anomaly);
    const params = { anomaly: `${inp.enso.anomaly > 0 ? '+' : ''}${inp.enso.anomaly.toFixed(1)}`, season: inp.enso.season, year: String(inp.enso.year) };
    const strong = Math.abs(inp.enso.anomaly) >= 1.5 ? 'Strong' : '';
    // El Niño = drier Indonesia (smaller rice, sugar and water-hungry crops); La Niña = wetter (rot and
    // disease in chili and shallots, flooded fields)
    if (phase === 'elNino') return { factor, effect: 'raises', state: `elNino${strong}`, params };
    if (phase === 'laNina') {
      const wetHurts = category === 'chili' || category === 'birdChili' || category === 'shallot';
      return { factor, effect: wetHurts ? 'raises' : 'neutral', state: `laNina${strong}`, params };
    }
    return { factor, effect: 'neutral', state: 'neutral', params };
  }
  if (factor === 'season') {
    const s = seasonOf(month);
    if (category === 'rice') {
      // Main harvest Mar–May; lean season ("paceklik") roughly Nov–Feb
      if (month >= 3 && month <= 5) return { factor, effect: 'eases', state: 'riceHarvest', params: {} };
      if (month >= 11 || month <= 2) return { factor, effect: 'raises', state: 'riceLean', params: {} };
      return { factor, effect: 'neutral', state: 'riceSecond', params: {} };
    }
    if (category === 'sugar') {
      // Cane milling May–Oct adds local sugar; the rest of the year relies on stocks and imports
      return month >= 5 && month <= 10 ? { factor, effect: 'eases', state: 'sugarMilling', params: {} } : { factor, effect: 'raises', state: 'sugarOff', params: {} };
    }
    // Chili and shallots: rain brings disease and rot; the dry months usually bring big harvests
    if (s === 'rainy' || s === 'toRainy') return { factor, effect: 'raises', state: s, params: {} };
    return { factor, effect: s === 'dry' ? 'eases' : 'neutral', state: s, params: {} };
  }
  if (factor === 'school') {
    const sc = schoolState(inp.today);
    const effect: DriverEffect = sc.state === 'holiday' ? 'eases' : sc.state === 'restart' ? 'raises' : 'neutral';
    return { factor, effect, state: sc.state, params: { days: sc.days } };
  }
  // Holiday demand
  const e = nextDemandEvent(inp.today);
  if (!e) return { factor, effect: 'neutral', state: 'none', params: {} };
  return { factor, effect: 'raises', state: e.id, params: { days: e.inDays } };
}

export function readDrivers(category: StapleCategory, inp: DriverInputs): DriverReading[] {
  return STAPLE_FACTORS[category].map((f) => readDriver(category, f, inp));
}

/** Which chain applies now from the item's 1-month change (±2%), or null when stable/unknown. */
export function activeChain(m1: number | null): 'up' | 'down' | null {
  if (m1 === null) return null;
  return m1 >= 2 ? 'up' : m1 <= -2 ? 'down' : null;
}
