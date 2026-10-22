/** xls.test.ts — Tests for the .xls (BIFF8) reader on a small workbook built in memory. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readXls } from './xls.ts';

const rec = (type: number, data: Buffer) => {
  const h = Buffer.alloc(4);
  h.writeUInt16LE(type, 0);
  h.writeUInt16LE(data.length, 2);
  return Buffer.concat([h, data]);
};
const u16 = (...v: number[]) => Buffer.from(new Uint16Array(v).buffer);
const u32 = (...v: number[]) => Buffer.from(new Uint32Array(v).buffer);
const f64 = (v: number) => {
  const b = Buffer.alloc(8);
  b.writeDoubleLE(v);
  return b;
};
const rk = (n: number) => ((n << 2) | 2) >>> 0; // integer RK

/** A compound file holding one "Workbook" stream (regular sectors only, ≥ 4096 bytes). */
function cfb(stream: Buffer): Buffer {
  const size = Math.max(4096, Math.ceil(stream.length / 512) * 512);
  const data = Buffer.concat([stream, Buffer.alloc(size - stream.length)]);
  const n = size / 512;
  const header = Buffer.alloc(512, 0);
  Buffer.from('d0cf11e0a1b11ae1', 'hex').copy(header, 0);
  header.writeUInt16LE(0x3e, 0x18);
  header.writeUInt16LE(3, 0x1a);
  header.writeUInt16LE(0xfffe, 0x1c);
  header.writeUInt16LE(9, 0x1e);
  header.writeUInt16LE(6, 0x20);
  header.writeUInt32LE(1, 0x2c);
  header.writeUInt32LE(1, 0x30);
  header.writeUInt32LE(4096, 0x38);
  header.writeUInt32LE(0xfffffffe, 0x3c);
  header.writeUInt32LE(0xfffffffe, 0x44);
  for (let i = 0; i < 109; i++) header.writeUInt32LE(i === 0 ? 0 : 0xffffffff, 0x4c + i * 4);
  const fat = Buffer.alloc(512, 0xff);
  fat.writeUInt32LE(0xfffffffd, 0);
  fat.writeUInt32LE(0xfffffffe, 4);
  for (let i = 0; i < n; i++) fat.writeUInt32LE(i === n - 1 ? 0xfffffffe : 3 + i, (2 + i) * 4);
  const dir = Buffer.alloc(512, 0);
  const entry = (at: number, name: string, type: number, start: number, len: number) => {
    dir.write(name, at, 'utf16le');
    dir.writeUInt16LE((name.length + 1) * 2, at + 64);
    dir[at + 66] = type;
    dir.writeUInt32LE(0xffffffff, at + 68);
    dir.writeUInt32LE(0xffffffff, at + 72);
    dir.writeUInt32LE(type === 5 ? 1 : 0xffffffff, at + 76);
    dir.writeUInt32LE(start, at + 116);
    dir.writeUInt32LE(len, at + 120);
  };
  entry(0, 'Root Entry', 5, 0xfffffffe, 0);
  entry(128, 'Workbook', 2, 2, size);
  return Buffer.concat([header, fat, dir, data]);
}

function workbook(): Buffer {
  const bof = rec(0x0809, Buffer.concat([u16(0x0600, 0x0005), Buffer.alloc(12)]));
  // Shared strings: "Q1", "Hello" split over a CONTINUE record (new flags byte at the break)
  const sst = rec(0x00fc, Buffer.concat([u32(3, 2), u16(2), Buffer.from([0]), Buffer.from('Q1'), u16(5), Buffer.from([0]), Buffer.from('Hel')]));
  const cont = rec(0x003c, Buffer.concat([Buffer.from([0]), Buffer.from('lo')]));
  const sheetName = Buffer.from('5.7', 'latin1');
  const bound = (offset: number) => rec(0x0085, Buffer.concat([u32(offset), Buffer.from([0, 0, sheetName.length, 0]), sheetName]));
  const eof = rec(0x000a, Buffer.alloc(0));
  const globalsLen = bof.length + sst.length + cont.length + bound(0).length + eof.length;
  const globals = Buffer.concat([bof, sst, cont, bound(globalsLen), eof]);
  const sheet = Buffer.concat([
    rec(0x0809, Buffer.concat([u16(0x0600, 0x0010), Buffer.alloc(12)])),
    rec(0x00fd, Buffer.concat([u16(0, 1, 0), u32(0)])),
    rec(0x00fd, Buffer.concat([u16(1, 0, 0), u32(1)])),
    rec(0x0203, Buffer.concat([u16(1, 1, 0), f64(-1234.5)])),
    rec(0x027e, Buffer.concat([u16(1, 2, 0), u32(rk(42))])),
    rec(0x00bd, Buffer.concat([u16(2, 1), u16(0), u32(rk(7)), u16(0), u32((rk(250) | 1) >>> 0), u16(2)])),
    eof,
  ]);
  return Buffer.concat([globals, sheet]);
}

test('reads sheet names, shared strings across CONTINUE, numbers and RK values', () => {
  const sheets = readXls(cfb(workbook()));
  assert.equal(sheets.length, 1);
  assert.equal(sheets[0].name, '5.7');
  const rows = sheets[0].rows;
  assert.equal(rows[0][1], 'Q1');
  assert.equal(rows[1][0], 'Hello');
  assert.equal(rows[1][1], -1234.5);
  assert.equal(rows[1][2], 42);
  assert.equal(rows[2][1], 7);
  assert.equal(rows[2][2], 2.5);
});

test('rejects files that are not OLE2 compound files', () => {
  assert.throws(() => readXls(Buffer.alloc(1024)), /OLE2/);
});
