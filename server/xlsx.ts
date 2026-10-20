/**
 * xlsx.ts — Opens an .xlsx file (a zip archive) with node:zlib only, no extra package: reads the
 * zip's central directory, inflates the needed XML parts, and returns one worksheet's cells by
 * sheet name (parsing in src/utils/xlsxSheet.ts). Enough for plain data workbooks such as the
 * World Bank Pink Sheet; not a general spreadsheet engine.
 */
import { inflateRawSync } from 'node:zlib';
import { parseSharedStrings, parseSheetRows, sheetPaths, type SheetRows } from '../src/utils/xlsxSheet.ts';

/** Files of a zip archive by name (lazily inflated). */
export function readZip(buf: Buffer): Map<string, () => Buffer> {
  // End of central directory record: search backwards for its signature
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map<string, () => Buffer>();
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Bad zip directory');
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    files.set(name, () => {
      if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error('Bad zip entry');
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + compressed);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data);
      throw new Error(`Unsupported zip method ${method}`);
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

/** One worksheet of an .xlsx file by its name, or null when the sheet does not exist. */
export function readXlsxSheet(buf: Buffer, sheetName: string): SheetRows | null {
  const zip = readZip(buf);
  const text = (name: string) => zip.get(name)?.().toString('utf8') ?? '';
  const sheets = sheetPaths(text('xl/workbook.xml'), text('xl/_rels/workbook.xml.rels'));
  const path = sheets.get(sheetName);
  if (!path || !zip.has(path)) return null;
  return parseSheetRows(text(path), parseSharedStrings(text('xl/sharedStrings.xml')));
}
