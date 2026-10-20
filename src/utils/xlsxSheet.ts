/**
 * xlsxSheet.ts — Reads the XML parts of an .xlsx workbook (no dependencies): the sheet list
 * (workbook.xml + its relationships), shared strings, and a worksheet's cells as rows. The zip
 * container itself is opened on the server (server/xlsx.ts, node:zlib). Used for the World Bank
 * "Pink Sheet" monthly commodity prices.
 */

export type CellValue = string | number;
/** Row number (1-based) → column letters ("A", "AB") → value. */
export type SheetRows = Map<number, Map<string, CellValue>>;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? m;
  });
}

/** Sheet name → path inside the zip (e.g. "Monthly Prices" → "xl/worksheets/sheet2.xml"). */
export function sheetPaths(workbookXml: string, relsXml: string): Map<string, string> {
  const targets = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/\bId="([^"]+)"/)?.[1];
    const target = m[0].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`);
  }
  const out = new Map<string, string>();
  for (const m of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = m[0].match(/\bname="([^"]+)"/)?.[1];
    const rid = m[0].match(/\br:id="([^"]+)"/)?.[1];
    if (name && rid && targets.has(rid)) out.set(decodeXml(name), targets.get(rid) as string);
  }
  return out;
}

/** Shared strings in order (rich text runs joined). */
export function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const parts = [...si[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1]));
    out.push(parts.join(''));
  }
  return out;
}

/** All cells of a worksheet: shared strings, inline strings and numbers. */
export function parseSheetRows(xml: string, shared: string[]): SheetRows {
  const rows: SheetRows = new Map();
  for (const row of xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = new Map<string, CellValue>();
    for (const c of row[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
      if (!ref || c[2] === undefined) continue;
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const v = c[2].match(/<v>([\s\S]*?)<\/v>/)?.[1];
      if (type === 's' && v !== undefined) cells.set(ref, shared[Number(v)] ?? '');
      else if (type === 'inlineStr') cells.set(ref, decodeXml([...c[2].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
      else if (type === 'str' && v !== undefined) cells.set(ref, decodeXml(v));
      else if (v !== undefined && v.trim() !== '') {
        const n = Number(v);
        cells.set(ref, Number.isFinite(n) ? n : decodeXml(v));
      }
    }
    if (cells.size) rows.set(Number(row[1]), cells);
  }
  return rows;
}
