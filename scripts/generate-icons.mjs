/**
 * generate-icons.mjs — Renders the AssetRadar radar logo (same shapes as the favicon SVG in
 * index.html) into the PNG app icons used by the PWA manifest and iOS home screen:
 * public/icons/icon-192.png, icon-512.png, icon-maskable-512.png and apple-touch-icon.png.
 * Pure Node (zlib only, no image libraries): shapes are drawn with 4×4 supersampling.
 * Run with: node scripts/generate-icons.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x0b, 0x12, 0x20];
const GREEN = [0x10, 0xb9, 0x81];
const LIGHT_GREEN = [0x34, 0xd3, 0x99];

/** Logo in a 64×64 design space (matches the favicon). */
function shapes() {
  return [
    { kind: 'ring', cx: 32, cy: 32, r: 22, w: 2.5, color: GREEN, alpha: 0.35 },
    { kind: 'ring', cx: 32, cy: 32, r: 13, w: 2, color: GREEN, alpha: 0.55 },
    { kind: 'line', x1: 32, y1: 32, x2: 48, y2: 16, w: 3, color: LIGHT_GREEN, alpha: 1 },
    { kind: 'disc', cx: 44, cy: 20, r: 4, color: LIGHT_GREEN, alpha: 1 },
    { kind: 'disc', cx: 32, cy: 32, r: 3, color: GREEN, alpha: 1 },
  ];
}

function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function inside(s, x, y) {
  switch (s.kind) {
    case 'ring':
      return Math.abs(Math.hypot(x - s.cx, y - s.cy) - s.r) <= s.w / 2;
    case 'disc':
      return Math.hypot(x - s.cx, y - s.cy) <= s.r;
    case 'line':
      return segDist(x, y, s.x1, s.y1, s.x2, s.y2) <= s.w / 2;
    default:
      return false;
  }
}

function inRoundedRect(x, y, size, radius) {
  const cx = Math.min(Math.max(x, radius), size - radius);
  const cy = Math.min(Math.max(y, radius), size - radius);
  return Math.hypot(x - cx, y - cy) <= radius && x >= 0 && y >= 0 && x <= size && y <= size;
}

/**
 * @param size output pixels
 * @param opts.rounded draw the rounded tile (transparent corners) instead of a full square
 * @param opts.scale logo scale inside the tile (maskable icons keep the logo in the safe zone)
 */
function render(size, { rounded, scale }) {
  const SS = 4;
  const rgba = Buffer.alloc(size * size * 4);
  const list = shapes();
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          // Sample position in design space (0–64)
          const ux = ((px + (sx + 0.5) / SS) / size) * 64;
          const uy = ((py + (sy + 0.5) / SS) / size) * 64;
          if (rounded && !inRoundedRect(ux, uy, 64, 16)) continue;
          let col = [...BG];
          const lx = 32 + (ux - 32) / scale;
          const ly = 32 + (uy - 32) / scale;
          for (const s of list) {
            if (inside(s, lx, ly)) col = col.map((c, i) => c * (1 - s.alpha) + s.color[i] * s.alpha);
          }
          r += col[0];
          g += col[1];
          b += col[2];
          a += 1;
        }
      }
      const n = SS * SS;
      const o = (py * size + px) * 4;
      // Premultiplied average → straight alpha
      rgba[o] = a ? Math.round(r / a) : 0;
      rgba[o + 1] = a ? Math.round(g / a) : 0;
      rgba[o + 2] = a ? Math.round(b / a) : 0;
      rgba[o + 3] = Math.round((a / n) * 255);
    }
  }
  return rgba;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = new URL('../public/icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });
const icons = [
  { file: 'icon-192.png', size: 192, rounded: true, scale: 1 },
  { file: 'icon-512.png', size: 512, rounded: true, scale: 1 },
  // Maskable: full-bleed background, logo inside the 80% safe zone
  { file: 'icon-maskable-512.png', size: 512, rounded: false, scale: 0.78 },
  // iOS rounds the corners itself
  { file: 'apple-touch-icon.png', size: 180, rounded: false, scale: 0.9 },
];
for (const i of icons) {
  writeFileSync(new URL(i.file, outDir), png(i.size, render(i.size, i)));
  console.log(`wrote public/icons/${i.file}`);
}
