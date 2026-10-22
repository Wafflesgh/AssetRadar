/**
 * macro.ts — Indonesia macro data helpers: parse FRED CSV downloads, Bank Indonesia's BI-Rate
 * and inflation tables (bi.go.id), and World Bank JSON; merge series; month-over-month change
 * from an index; and the release-lag shift that makes a monthly value "known" only after it was
 * published (so the AI never uses numbers before their release date).
 */

export interface MacroPoint {
  /** YYYY-MM-DD (period start for monthly/quarterly data, decision date for BI-Rate). */
  date: string;
  value: number;
}

export interface MacroSeries {
  id: string;
  label: string;
  unit: string;
  frequency: 'decision' | 'monthly' | 'quarterly' | 'annual';
  source: string;
  sourceUrl: string;
  points: MacroPoint[];
  note?: string;
}

/** FRED "fredgraph.csv": header line, then DATE,VALUE ("." = missing). */
export function parseFredCsv(csv: string): MacroPoint[] {
  const out: MacroPoint[] = [];
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const [date, raw] = line.split(',');
    const value = Number(raw);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') && raw !== '.' && Number.isFinite(value)) out.push({ date, value });
  }
  return out;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  januari: 1, februari: 2, maret: 3, mei: 5, juni: 6, juli: 7, agustus: 8, oktober: 10, desember: 12,
};

function cellTexts(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
}

function parsePercent(s: string): number | null {
  const m = s.match(/(-?\d+(?:[.,]\d+)?)\s*%/);
  return m ? Number(m[1].replace(',', '.')) : null;
}

/** "23 September 2026" → 2026-09-23 ; "August 2026" → 2026-08-01. */
function parseDateText(s: string): string | null {
  const full = s.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (full && MONTHS[full[2].toLowerCase()]) return `${full[3]}-${String(MONTHS[full[2].toLowerCase()]).padStart(2, '0')}-${full[1].padStart(2, '0')}`;
  const month = s.match(/([A-Za-z]+)\s+(\d{4})/);
  if (month && MONTHS[month[1].toLowerCase()]) return `${month[2]}-${String(MONTHS[month[1].toLowerCase()]).padStart(2, '0')}-01`;
  return null;
}

/** Rows of the first data table on a bi.go.id indicator page: [date, percent] pairs, oldest first. */
export function parseBiTable(html: string): MacroPoint[] {
  const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/i)?.[1] ?? '';
  const out: MacroPoint[] = [];
  for (const row of tbody.split(/<\/tr>/i)) {
    const cells = cellTexts(row);
    const date = cells.map(parseDateText).find((d): d is string => d !== null);
    const value = cells.map(parsePercent).find((v): v is number => v !== null);
    if (date && value !== undefined) out.push({ date, value });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** World Bank v2 JSON → yearly points dated YYYY-01-01. */
export function parseWorldBank(json: unknown): MacroPoint[] {
  const rows = Array.isArray(json) ? (json[1] as Array<{ date?: string; value?: number | null }>) : null;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && /^\d{4}$/.test(r.date ?? '') && typeof r.value === 'number')
    .map((r) => ({ date: `${r.date}-01-01`, value: r.value as number }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Union by date; later series win where both have a value. */
export function mergeSeries(...series: MacroPoint[][]): MacroPoint[] {
  const byDate = new Map<string, number>();
  for (const s of series) for (const p of s) byDate.set(p.date, p.value);
  return [...byDate.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}

/** % change from the previous point (month-over-month for a monthly index). */
export function periodChange(points: MacroPoint[]): MacroPoint[] {
  const out: MacroPoint[] = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i - 1].value !== 0) out.push({ date: points[i].date, value: (points[i].value / points[i - 1].value - 1) * 100 });
  }
  return out;
}

export function addMonthsToDate(date: string, months: number, days = 0): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Re-dates each point to when it became public (period start + lag), for look-ahead-free use. */
export function shiftToRelease(points: MacroPoint[], lagMonths: number, lagDays = 0): MacroPoint[] {
  return points.map((p) => ({ date: addMonthsToDate(p.date, lagMonths, lagDays), value: p.value }));
}

export function latest(points: MacroPoint[]): { date: string; value: number; change: number | null } | null {
  const last = points[points.length - 1];
  if (!last) return null;
  const prev = points[points.length - 2];
  return { date: last.date, value: last.value, change: prev ? last.value - prev.value : null };
}

// ---- Stage 4: categories, z-scores, staleness, Macro Pulse, BPS --------------------------------

export type MacroCategory = 'monetary' | 'inflation' | 'growth' | 'people' | 'external' | 'fiscal' | 'financial' | 'commodities' | 'global';

export const MACRO_CATEGORIES: MacroCategory[] = ['monetary', 'inflation', 'growth', 'people', 'external', 'fiscal', 'financial', 'commodities', 'global'];

/**
 * Extra annual World Bank indicators (WDI, no key) shown next to the monthly series: labour and
 * society, the structure of the economy, money and bank rates, capital flows. `scale` divides the
 * raw value (US$ → US$ bn, people → millions).
 */
export const WB_EXTRA: Array<{
  id: string;
  code: string;
  label: string;
  unit: string;
  category: MacroCategory;
  higherIsBetter: boolean | null;
  scale?: number;
}> = [
  { id: 'unemployment', code: 'SL.UEM.TOTL.ZS', label: 'Unemployment rate (ILO estimate)', unit: '%', category: 'people', higherIsBetter: false },
  { id: 'laborParticipation', code: 'SL.TLF.CACT.ZS', label: 'Labour force participation rate', unit: '%', category: 'people', higherIsBetter: true },
  { id: 'population', code: 'SP.POP.TOTL', label: 'Population', unit: 'million', category: 'people', higherIsBetter: null, scale: 1e6 },
  { id: 'poverty', code: 'SI.POV.NAHC', label: 'Poverty rate (national poverty line)', unit: '%', category: 'people', higherIsBetter: false },
  { id: 'gini', code: 'SI.POV.GINI', label: 'Gini index (income inequality)', unit: 'index', category: 'people', higherIsBetter: false },
  { id: 'gdpUsd', code: 'NY.GDP.MKTP.CD', label: 'GDP (current US$)', unit: 'US$ bn', category: 'growth', higherIsBetter: true, scale: 1e9 },
  { id: 'gdpPerCapita', code: 'NY.GDP.PCAP.CD', label: 'GDP per capita (current US$)', unit: 'US$', category: 'growth', higherIsBetter: true },
  { id: 'gdpPerCapitaPpp', code: 'NY.GDP.PCAP.PP.CD', label: 'GDP per capita, PPP (international $)', unit: 'US$', category: 'growth', higherIsBetter: true },
  { id: 'investmentGdp', code: 'NE.GDI.FTOT.ZS', label: 'Investment (gross fixed capital formation), % of GDP', unit: '%', category: 'growth', higherIsBetter: true },
  { id: 'householdConsumption', code: 'NE.CON.PRVT.ZS', label: 'Household consumption, % of GDP', unit: '%', category: 'growth', higherIsBetter: null },
  { id: 'agricultureShare', code: 'NV.AGR.TOTL.ZS', label: 'Agriculture, % of GDP', unit: '%', category: 'growth', higherIsBetter: null },
  { id: 'industryShare', code: 'NV.IND.TOTL.ZS', label: 'Industry incl. mining and construction, % of GDP', unit: '%', category: 'growth', higherIsBetter: null },
  { id: 'manufacturingShare', code: 'NV.IND.MANF.ZS', label: 'Manufacturing, % of GDP', unit: '%', category: 'growth', higherIsBetter: null },
  { id: 'servicesShare', code: 'NV.SRV.TOTL.ZS', label: 'Services, % of GDP', unit: '%', category: 'growth', higherIsBetter: null },
  { id: 'gdpDeflator', code: 'NY.GDP.DEFL.KD.ZG', label: 'GDP deflator (economy-wide inflation)', unit: '%', category: 'inflation', higherIsBetter: false },
  { id: 'm2Growth', code: 'FM.LBL.BMNY.ZG', label: 'Money supply M2, growth', unit: '%', category: 'monetary', higherIsBetter: null },
  { id: 'lendingRate', code: 'FR.INR.LEND', label: 'Bank lending rate', unit: '%', category: 'monetary', higherIsBetter: false },
  { id: 'depositRate', code: 'FR.INR.DPST', label: 'Bank deposit rate', unit: '%', category: 'monetary', higherIsBetter: null },
  { id: 'm2Gdp', code: 'FM.LBL.BMNY.GD.ZS', label: 'Money supply M2, % of GDP', unit: '%', category: 'financial', higherIsBetter: true },
  { id: 'fdiGdp', code: 'BX.KLT.DINV.WD.GD.ZS', label: 'Foreign direct investment, net inflows, % of GDP', unit: '%', category: 'external', higherIsBetter: true },
  { id: 'remittances', code: 'BX.TRF.PWKR.CD.DT', label: 'Remittances received (migrant workers)', unit: 'US$ bn', category: 'external', higherIsBetter: true, scale: 1e9 },
  { id: 'externalDebt', code: 'DT.DOD.DECT.CD', label: 'External debt, total', unit: 'US$ bn', category: 'external', higherIsBetter: false, scale: 1e9 },
  { id: 'tradeOpenness', code: 'NE.TRD.GNFS.ZS', label: 'Trade (exports + imports), % of GDP', unit: '%', category: 'external', higherIsBetter: null },
  { id: 'militarySpending', code: 'MS.MIL.XPND.GD.ZS', label: 'Military spending, % of GDP', unit: '%', category: 'fiscal', higherIsBetter: null },
];

/** World Bank central government debt (% of GDP): the fallback where the IMF series is blocked. */
export const WB_GOV_DEBT = 'GC.DOD.TOTL.GD.ZS';

/** A series placed in a category, with how to read its direction for Indonesia. */
export interface MacroIndicator extends MacroSeries {
  category: MacroCategory;
  /** true = higher is better for Indonesian assets, false = lower is better, null = neutral. */
  higherIsBetter: boolean | null;
  /** (last − 10-year mean) ÷ 10-year standard deviation. */
  zScore10y: number | null;
  /** Last data is older than the frequency allows: shown, never scored. */
  stale: boolean;
  /** Optional key the indicator needs (e.g. BPS_API_KEY) when it has no data without it. */
  requiresKey?: string;
}

/** z-score of the latest value against the previous 10 years of the series (null under 8 points). */
export function zScore10y(points: MacroPoint[]): number | null {
  if (!points.length) return null;
  const last = points[points.length - 1];
  const from = `${Number(last.date.slice(0, 4)) - 10}${last.date.slice(4)}`;
  const window = points.filter((p) => p.date >= from).map((p) => p.value);
  if (window.length < 8) return null;
  const mean = window.reduce((a, b) => a + b, 0) / window.length;
  const sd = Math.sqrt(window.reduce((a, b) => a + (b - mean) ** 2, 0) / (window.length - 1));
  return sd > 0 ? (last.value - mean) / sd : null;
}

/** Days after which the last value of a frequency counts as stale (publication delays included). */
export const STALE_AFTER_DAYS: Record<MacroSeries['frequency'], number> = { decision: 400, monthly: 150, quarterly: 270, annual: 600 };

export function isStale(series: Pick<MacroSeries, 'frequency' | 'points'>, today: string): boolean {
  const last = series.points[series.points.length - 1];
  if (!last) return true;
  // Annual points are dated 1 January but cover the whole year: age is counted from the year's end
  const from = Date.parse(last.date) + (series.frequency === 'annual' ? 365 * 86_400_000 : 0);
  return (Date.parse(today) - from) / 86_400_000 > STALE_AFTER_DAYS[series.frequency];
}

/** Adds category, direction, 10-year z-score and the stale flag to a series. */
export function toIndicator(series: MacroSeries, category: MacroCategory, higherIsBetter: boolean | null, today: string, requiresKey?: string): MacroIndicator {
  return { ...series, category, higherIsBetter, zScore10y: zScore10y(series.points), stale: isStale(series, today), requiresKey };
}

export type PulseLight = 'green' | 'amber' | 'red';

export interface PulseCategory {
  category: MacroCategory;
  light: PulseLight | null;
  /** Mean directional z-score (positive = better than usual for Indonesia). */
  score: number | null;
  used: number;
  stale: number;
}

/**
 * Indonesia Macro Pulse: per category, the mean of the direction-adjusted z-scores of its fresh
 * indicators (stale and neutral ones are left out): > +0.5 green, < −0.5 red, otherwise amber.
 */
export function macroPulse(indicators: MacroIndicator[]): PulseCategory[] {
  return MACRO_CATEGORIES.map((category) => {
    const inCat = indicators.filter((i) => i.category === category);
    const used = inCat.filter((i) => !i.stale && i.higherIsBetter !== null && i.zScore10y !== null);
    const score = used.length ? used.reduce((s, i) => s + (i.zScore10y as number) * (i.higherIsBetter ? 1 : -1), 0) / used.length : null;
    const light: PulseLight | null = score === null ? null : score > 0.5 ? 'green' : score < -0.5 ? 'red' : 'amber';
    return { category, light, score, used: used.length, stale: inCat.filter((i) => i.stale && i.points.length > 0).length };
  });
}

/** Yahoo monthly closes (YYYY-MM → close) as macro points (first day of the month). */
export function monthlyPoints(byMonth: Map<string, number>): MacroPoint[] {
  return [...byMonth.entries()]
    .filter(([, v]) => Number.isFinite(v))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([m, value]) => ({ date: `${m}-01`, value }));
}

/** Spread of two series on the dates both have (a − b), carrying b forward up to 45 days. */
export function spreadSeries(a: MacroPoint[], b: MacroPoint[]): MacroPoint[] {
  const sb = [...b].sort((x, y) => x.date.localeCompare(y.date));
  const out: MacroPoint[] = [];
  let j = 0;
  for (const p of [...a].sort((x, y) => x.date.localeCompare(y.date))) {
    while (j + 1 < sb.length && sb[j + 1].date <= p.date) j++;
    const q = sb[j];
    if (q && q.date <= p.date && (Date.parse(p.date) - Date.parse(q.date)) / 86_400_000 <= 45) out.push({ date: p.date, value: p.value - q.value });
  }
  return out;
}

/**
 * BPS WebAPI dynamic data ("list/model/data"): `datacontent` keys are vervar + var + turvar +
 * tahun + turtahun ids; `tahun` gives the year labels and `turtahun` the month (1–12) or 13 for
 * the annual figure. Returns monthly points for one vertical variable (vervar), oldest first.
 */
export function parseBpsDynData(json: unknown, vervar?: string): MacroPoint[] {
  const o = (json ?? {}) as {
    'data-availability'?: string;
    var?: Array<{ val: number | string }>;
    turvar?: Array<{ val: number | string }>;
    vervar?: Array<{ val: number | string; label?: string }>;
    tahun?: Array<{ val: number | string; label: string }>;
    turtahun?: Array<{ val: number | string; label: string }>;
    datacontent?: Record<string, number | string>;
  };
  if (o['data-availability'] && o['data-availability'] !== 'available') return [];
  const v = String(o.var?.[0]?.val ?? '');
  const vv = vervar ?? String(o.vervar?.[0]?.val ?? '');
  const tv = String(o.turvar?.[0]?.val ?? '0');
  const out: MacroPoint[] = [];
  for (const y of o.tahun ?? []) {
    const year = Number(String(y.label).match(/\d{4}/)?.[0]);
    if (!year) continue;
    for (const m of o.turtahun ?? []) {
      const month = Number(m.val);
      if (!(month >= 1 && month <= 12)) continue;
      // Month ids appear both as "1" and "01" depending on the table
      const key = `${vv}${v}${tv}${y.val}`;
      const raw = o.datacontent?.[`${key}${m.val}`] ?? o.datacontent?.[`${key}${String(m.val).padStart(2, '0')}`];
      const value = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(',', '.'));
      if (raw !== undefined && raw !== '' && Number.isFinite(value)) out.push({ date: `${year}-${String(month).padStart(2, '0')}-01`, value });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** First variable whose title matches the pattern in a BPS "list/model/var" search result. */
export function findBpsVar(json: unknown, pattern: RegExp): { id: string; title: string } | null {
  const list = ((json as { data?: unknown[] })?.data?.[1] ?? []) as Array<{ var_id?: number | string; title?: string }>;
  const hit = list.find((x) => typeof x.title === 'string' && pattern.test(x.title));
  return hit && hit.var_id !== undefined ? { id: String(hit.var_id), title: hit.title as string } : null;
}
