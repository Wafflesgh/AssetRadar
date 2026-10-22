/**
 * xls.ts — Reads the old binary Excel format (.xls, BIFF8 inside a Compound File) with no extra
 * package: opens the compound file, takes the "Workbook" stream, and returns every worksheet's
 * cell values (shared strings, numbers, RK numbers, cached formula numbers). Enough for the plain
 * data tables Bank Indonesia publishes (SEKI); not a general spreadsheet engine.
 */

export type XlsCell = string | number | null;
export interface XlsSheet {
  name: string;
  /** rows[r][c]; missing cells are undefined/null */
  rows: XlsCell[][];
}

const FREE = 0xffffffff;
const END = 0xfffffffe;

/** The named stream of a Compound File Binary (OLE2) container. */
export function readCfbStream(buf: Buffer, wanted: string[]): Buffer | null {
  if (buf.length < 512 || buf.readUInt32LE(0) !== 0xe011cfd0) throw new Error('Not an OLE2 file');
  const sectorSize = 1 << buf.readUInt16LE(0x1e);
  const miniSize = 1 << buf.readUInt16LE(0x20);
  const firstDir = buf.readUInt32LE(0x30);
  const cutoff = buf.readUInt32LE(0x38);
  const firstMiniFat = buf.readUInt32LE(0x3c);
  let difatSector = buf.readUInt32LE(0x44);
  const sector = (id: number) => buf.subarray((id + 1) * sectorSize, (id + 2) * sectorSize);

  // FAT sector ids: 109 in the header, the rest in a chain of DIFAT sectors
  const fatIds: number[] = [];
  for (let i = 0; i < 109; i++) fatIds.push(buf.readUInt32LE(0x4c + i * 4));
  for (let guard = 0; difatSector !== END && difatSector !== FREE && guard < 10_000; guard++) {
    const s = sector(difatSector);
    for (let i = 0; i < sectorSize / 4 - 1; i++) fatIds.push(s.readUInt32LE(i * 4));
    difatSector = s.readUInt32LE(sectorSize - 4);
  }
  const fat: number[] = [];
  for (const id of fatIds) {
    if (id === FREE || id === END) continue;
    const s = sector(id);
    for (let i = 0; i < sectorSize / 4; i++) fat.push(s.readUInt32LE(i * 4));
  }
  const chain = (start: number, next: number[], read: (id: number) => Buffer) => {
    const parts: Buffer[] = [];
    for (let id = start, guard = 0; id !== END && id !== FREE && id < next.length && guard < 1_000_000; id = next[id], guard++) parts.push(read(id));
    return Buffer.concat(parts);
  };

  const dir = chain(firstDir, fat, sector);
  const entries: Array<{ name: string; type: number; start: number; size: number }> = [];
  for (let p = 0; p + 128 <= dir.length; p += 128) {
    const nameLen = dir.readUInt16LE(p + 64);
    entries.push({
      name: dir.toString('utf16le', p, p + Math.max(0, nameLen - 2)),
      type: dir[p + 66],
      start: dir.readUInt32LE(p + 116),
      size: dir.readUInt32LE(p + 120),
    });
  }
  const entry = entries.find((e) => e.type === 2 && wanted.includes(e.name));
  if (!entry) return null;
  if (entry.size >= cutoff) return chain(entry.start, fat, sector).subarray(0, entry.size);

  // Small streams live in the mini stream (root entry's chain), indexed by the mini FAT
  const root = entries.find((e) => e.type === 5);
  if (!root) return null;
  const miniStream = chain(root.start, fat, sector);
  const miniFatBuf = chain(firstMiniFat, fat, sector);
  const miniFat: number[] = [];
  for (let i = 0; i + 4 <= miniFatBuf.length; i += 4) miniFat.push(miniFatBuf.readUInt32LE(i));
  return chain(entry.start, miniFat, (id) => miniStream.subarray(id * miniSize, (id + 1) * miniSize)).subarray(0, entry.size);
}

function rkValue(rk: number): number {
  let v: number;
  if (rk & 2) v = rk >> 2;
  else {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(0, 0);
    b.writeUInt32LE((rk & 0xfffffffc) >>> 0, 4);
    v = b.readDoubleLE(0);
  }
  return rk & 1 ? v / 100 : v;
}

/** Reads the shared-string table, whose strings may continue across CONTINUE records. */
function readSst(segments: Buffer[]): string[] {
  let seg = 0;
  let pos = 0;
  const ensure = () => {
    while (seg < segments.length && pos >= segments[seg].length) {
      seg++;
      pos = 0;
    }
    if (seg >= segments.length) throw new Error('SST overrun');
  };
  const byte = () => {
    ensure();
    return segments[seg][pos++];
  };
  const u16 = () => byte() | (byte() << 8);
  const u32 = () => (u16() | (u16() << 16)) >>> 0;
  const skip = (n: number) => {
    for (let i = 0; i < n; i++) byte();
  };
  u32();
  const unique = u32();
  const out: string[] = [];
  for (let k = 0; k < unique; k++) {
    const cch = u16();
    const flags = byte();
    const runs = flags & 8 ? u16() : 0;
    const ext = flags & 4 ? u32() : 0;
    let wide = (flags & 1) === 1;
    let s = '';
    for (let i = 0; i < cch; i++) {
      // At a CONTINUE boundary inside the characters, a new flags byte says the width
      if (pos >= segments[seg].length) {
        seg++;
        pos = 0;
        wide = (byte() & 1) === 1;
      }
      s += String.fromCharCode(wide ? u16() : byte());
    }
    skip(runs * 4 + ext);
    out.push(s);
  }
  return out;
}

/** All worksheets of a BIFF8 .xls workbook with their cell values. */
export function readXls(buf: Buffer): XlsSheet[] {
  const wb = readCfbStream(buf, ['Workbook', 'Book']);
  if (!wb) throw new Error('No Workbook stream');
  const records: Array<{ type: number; at: number; data: Buffer }> = [];
  for (let p = 0; p + 4 <= wb.length; ) {
    const type = wb.readUInt16LE(p);
    const len = wb.readUInt16LE(p + 2);
    records.push({ type, at: p, data: wb.subarray(p + 4, p + 4 + len) });
    p += 4 + len;
  }

  const sheetsAt = new Map<number, string>();
  let sst: string[] = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.type === 0x0085) {
      const cch = r.data[6];
      const wide = r.data[7] & 1;
      const name = wide ? r.data.toString('utf16le', 8, 8 + cch * 2) : r.data.toString('latin1', 8, 8 + cch);
      if (r.data[5] === 0) sheetsAt.set(r.data.readUInt32LE(0), name);
    } else if (r.type === 0x00fc) {
      const segs = [r.data];
      for (let j = i + 1; j < records.length && records[j].type === 0x003c; j++) segs.push(records[j].data);
      sst = readSst(segs);
    }
  }

  const sheets: XlsSheet[] = [];
  let current: XlsSheet | null = null;
  const set = (row: number, col: number, v: XlsCell) => {
    if (!current) return;
    (current.rows[row] ??= [])[col] = v;
  };
  for (const r of records) {
    const d = r.data;
    if (r.type === 0x0809) {
      const name = sheetsAt.get(r.at);
      current = name !== undefined ? { name, rows: [] } : null;
      if (current) sheets.push(current);
      continue;
    }
    if (!current || d.length < 6) continue;
    const row = d.readUInt16LE(0);
    const col = d.readUInt16LE(2);
    if (r.type === 0x00fd) set(row, col, sst[d.readUInt32LE(6)] ?? null);
    else if (r.type === 0x0203) set(row, col, d.readDoubleLE(6));
    else if (r.type === 0x027e) set(row, col, rkValue(d.readUInt32LE(6)));
    else if (r.type === 0x00bd) {
      const n = (d.length - 6) / 6;
      for (let k = 0; k < n; k++) set(row, col + k, rkValue(d.readUInt32LE(4 + k * 6 + 2)));
    } else if (r.type === 0x0006) {
      if (d.readUInt16LE(12) !== 0xffff) set(row, col, d.readDoubleLE(6));
    } else if (r.type === 0x0204) {
      const cch = d.readUInt16LE(6);
      set(row, col, d[8] & 1 ? d.toString('utf16le', 9, 9 + cch * 2) : d.toString('latin1', 9, 9 + cch));
    }
  }
  return sheets;
}
