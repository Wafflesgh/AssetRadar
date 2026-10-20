/**
 * check-i18n.mjs — Lists visible English texts in the React components that do not go through
 * t() yet: JSX text nodes and common text attributes (aria-label, title, placeholder, alt).
 * Run: node scripts/check-i18n.mjs [--fail]   (--fail exits with 1 when something is found)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../src/', import.meta.url));
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
// Names and codes that read the same in both languages
// (brand names such as Antam and Pegadaian, indicator names such as RSI, "min"/"max" boxes, and
// Terminal commands or tickers written in capitals, e.g. "CMP BBCA BBRI")
const IGNORE = /^(AssetRadar|Radar|TradingView|IHSG|BEI|IDX|USD|IDR|WIB|EN|ID|OK|CSV|JSON|PWA|SSE|BTC|ETH|AI|BI-Rate|BI-RATE|Piotroski F-score|Antam|Pegadaian|RSI|min|max|[A-Z0-9][A-Z0-9 ./-]*|\W+)$/;
// TypeScript generics and comparisons on one line look like text between > and <
const CODE_LIKE = /=>|&&|\|\||\?\s|^\)|\(\s*$|\w\(|\s:\s|^[a-z]+[A-Z]\w*$/;
let total = 0;
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const hits = [];
  src.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line) || /^\s*import /.test(line)) return;
    // Text between > and < on one line, not inside {...}
    for (const m of line.matchAll(/>([^<>{}]+)</g)) {
      const text = m[1].trim();
      // An arrow's "=>" followed by a generic type ("=> Promise<T>") is code, not text
      if (line[m.index - 1] === '=') continue;
      if (text && WORDY.test(text) && !IGNORE.test(text) && !CODE_LIKE.test(text)) hits.push([i + 1, text]);
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
