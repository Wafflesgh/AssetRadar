/**
 * sekiTable.ts — Reads quarterly series out of Bank Indonesia's SEKI tables (Indonesian Financial
 * and Economic Statistics, .xls files read by server/xls.ts). The quarter columns are found from the
 * "Q1…Q4" header row (the year labels sit in merged cells and are often shifted, so the years are
 * counted from the first year instead), and a row is found by a path of labels top-down, e.g.
 * ['B. Kewajiban', '2. Sektor swasta', 'a. Modal ekuitas'].
 */
import type { MacroPoint } from './macro.ts';

export type SekiCell = string | number | null | undefined;

const norm = (v: SekiCell) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** Column index → first day of its quarter ("2026-04-01"), from the "Qn" header row. */
export function sekiQuarterColumns(rows: SekiCell[][]): Map<number, string> {
  const out = new Map<number, string>();
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = rows[r] ?? [];
    const quarters = row.map((v, c) => [c, norm(v).match(/^q([1-4])\b/)] as const).filter(([, m]) => m);
    if (quarters.length < 4) continue;
    // First year: the smallest 4-digit year in the rows above
    let firstYear = Infinity;
    for (let k = 0; k < r; k++) {
      for (const v of rows[k] ?? []) {
        const y = typeof v === 'number' ? v : Number(String(v ?? '').trim());
        if (Number.isInteger(y) && y >= 1990 && y <= 2100) firstYear = Math.min(firstYear, y);
      }
    }
    if (!Number.isFinite(firstYear)) return out;
    let year = firstYear;
    let prev = 0;
    for (const [c, m] of quarters) {
      const q = Number(m![1]);
      if (q <= prev) year++;
      prev = q;
      out.set(c, `${year}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`);
    }
    return out;
  }
  return out;
}

/** Row index found by following the labels in order (each searched below the previous one). */
export function sekiFindRow(rows: SekiCell[][], path: string[]): number {
  let from = 0;
  let found = -1;
  for (const label of path) {
    const want = norm(label);
    found = -1;
    for (let r = from; r < rows.length; r++) {
      if ((rows[r] ?? []).slice(0, 5).some((v) => typeof v === 'string' && norm(v).startsWith(want))) {
        found = r;
        break;
      }
    }
    if (found < 0) return -1;
    from = found + 1;
  }
  return found;
}

/** Quarterly points of the row at `path`, multiplied by `scale` (e.g. 0.001: US$ mn → US$ bn). */
export function sekiSeries(rows: SekiCell[][], path: string[], scale = 1): MacroPoint[] {
  const cols = sekiQuarterColumns(rows);
  const r = sekiFindRow(rows, path);
  if (r < 0 || !cols.size) return [];
  const row = rows[r] ?? [];
  const pts: MacroPoint[] = [];
  for (const [c, date] of cols) {
    const v = row[c];
    if (typeof v === 'number' && Number.isFinite(v)) pts.push({ date, value: Math.round(v * scale * 1000) / 1000 });
  }
  return pts.sort((a, b) => a.date.localeCompare(b.date));
}
