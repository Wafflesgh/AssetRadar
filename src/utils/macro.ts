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
