/**
 * bpsInflation.ts — Reads BPS static table 908 ("Inflasi Umum, Inti, Harga Diatur Pemerintah, dan
 * Bergejolak Nasional (M-to-M dan Y-to-D)", 2009 onwards) from the BPS web API. The table is HTML
 * (escaped) with a year row followed by month rows; the month rows hold month-on-month inflation
 * for headline, core, administered and volatile food. Year-on-year is compounded from the last 12
 * monthly figures. Pure parsing; the server fetches with the BPS key.
 */
import type { MacroPoint } from './macro.ts';

export const BPS_INFLATION_TABLE_ID = 908;

const MONTHS: Record<string, number> = {
  januari: 1,
  februari: 2,
  maret: 3,
  april: 4,
  mei: 5,
  juni: 6,
  juli: 7,
  agustus: 8,
  september: 9,
  oktober: 10,
  november: 11,
  desember: 12,
};

export interface BpsInflationComponents {
  headline: MacroPoint[];
  core: MacroPoint[];
  administered: MacroPoint[];
  volatile: MacroPoint[];
}

/** "0,30" / "0.21" / "-1,68" / "~ 0" (BPS's mark for a value that rounds to zero) → number. */
function bpsNumber(cell: string): number | null {
  const s = cell.replace(/\s/g, '');
  if (/^~0$/.test(s)) return 0;
  const v = Number(s.replace(',', '.'));
  return s !== '' && Number.isFinite(v) ? v : null;
}

const decode = (html: string) =>
  html.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

/** Month-on-month series per component, oldest first. */
export function parseBpsInflationTable(table: string): BpsInflationComponents {
  const html = decode(table).replace(/<style[\s\S]*?<\/style>/gi, '');
  const out: BpsInflationComponents = { headline: [], core: [], administered: [], volatile: [] };
  let year: number | null = null;
  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => decode(c[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim());
    if (cells.length < 6) continue;
    if (/^\d{4}$/.test(cells[0])) year = Number(cells[0]);
    const month = MONTHS[cells[1].toLowerCase()];
    if (!year || !month) continue;
    const date = `${year}-${String(month).padStart(2, '0')}-01`;
    const keys: Array<keyof BpsInflationComponents> = ['headline', 'core', 'administered', 'volatile'];
    keys.forEach((k, i) => {
      const v = bpsNumber(cells[2 + i]);
      if (v !== null) out[k].push({ date, value: v });
    });
  }
  for (const k of Object.keys(out) as Array<keyof BpsInflationComponents>) out[k].sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/** Year-on-year % compounded from 12 consecutive month-on-month figures (skips gaps). */
export function yoyFromMonthly(mom: MacroPoint[]): MacroPoint[] {
  const out: MacroPoint[] = [];
  for (let i = 11; i < mom.length; i++) {
    const window = mom.slice(i - 11, i + 1);
    const first = new Date(`${window[0].date}T00:00:00Z`);
    const last = new Date(`${window[11].date}T00:00:00Z`);
    const months = (last.getUTCFullYear() - first.getUTCFullYear()) * 12 + last.getUTCMonth() - first.getUTCMonth();
    if (months !== 11) continue;
    const factor = window.reduce((f, p) => f * (1 + p.value / 100), 1);
    out.push({ date: mom[i].date, value: Math.round((factor - 1) * 10000) / 100 });
  }
  return out;
}
