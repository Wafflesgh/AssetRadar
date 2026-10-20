/**
 * check-i18n.mjs — Lists visible English texts in the React components that do not go through
 * t() yet: JSX text nodes and common text attributes (aria-label, title, placeholder, alt).
 * Run: node scripts/check-i18n.mjs [--fail]   (--fail exits with 1 when something is found)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../src/', import.meta.url).pathname;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.tsx')) files.push(p);
  }
})(ROOT);

// A word of at least 3 letters makes it a sentence a person reads
const WORDY = /[A-Za-z]{3,}/;
const IGNORE = /^(AssetRadar|Radar|TradingView|IHSG|BEI|IDX|USD|IDR|WIB|EN|ID|OK|CSV|JSON|PWA|SSE|BTC|ETH|AI|\W+)$/;
let total = 0;
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const hits = [];
  src.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line) || /^\s*import /.test(line)) return;
    // Text between > and < on one line, not inside {...}
    for (const m of line.matchAll(/>([^<>{}]+)</g)) {
      const text = m[1].trim();
      if (text && WORDY.test(text) && !IGNORE.test(text) && !/=>|&&|\|\||\?\s|^\)|\(\s*$/.test(text)) hits.push([i + 1, text]);
    }
    // Lines that are only text (multi-line JSX text)
    const bare = line.trim();
    if (/^[A-Z][^<>{}=;()]*[a-z][^<>{}=;]*$/.test(bare) && / /.test(bare) && !/,$/.test(bare) && WORDY.test(bare) && !/^(import|export|const|let|return|type|interface|case|default)\b/.test(bare) && !/[:]\s*$/.test(bare)) hits.push([i + 1, bare]);
    for (const m of line.matchAll(/\b(aria-label|title|placeholder|alt)="([^"]*[A-Za-z]{3,}[^"]*)"/g)) if (!IGNORE.test(m[2])) hits.push([i + 1, `${m[1]}="${m[2]}"`]);
  });
  if (hits.length) {
    total += hits.length;
    console.log(`\n${file.replace(ROOT, 'src/')} (${hits.length})`);
    for (const [n, text] of hits.slice(0, 400)) console.log(`  ${n}: ${text.slice(0, 100)}`);
  }
}
console.log(`\n${total} untranslated text(s) found.`);
if (process.argv.includes('--fail') && total > 0) process.exit(1);
