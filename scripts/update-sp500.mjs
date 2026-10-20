/**
 * update-sp500.mjs — Rebuilds src/config/sp500.json: the current S&P 500 constituents (ticker,
 * company, GICS sector and sub-industry, SEC CIK) from the Wikipedia API ("List of S&P 500
 * companies", text under CC BY-SA 4.0). Used only as the US peer group for the sentiment
 * percentiles and deciles — these stocks are scanned slowly in the background, they are not added
 * to the app's asset list. Tickers use Yahoo's form (BRK.B → BRK-B).
 *
 * Usage: node scripts/update-sp500.mjs
 */
import { writeFileSync } from 'node:fs';

const URL_ =
  'https://en.wikipedia.org/w/api.php?action=parse&page=List_of_S%26P_500_companies&prop=wikitext&section=1&format=json&formatversion=2';

const res = await fetch(URL_, { headers: { 'User-Agent': 'AssetRadar personal research app (non-commercial)' } });
if (!res.ok) throw new Error(`Wikipedia API HTTP ${res.status}`);
const wikitext = (await res.json()).parse?.wikitext ?? '';

/** "[[AMD|Advanced Micro Devices]]" → "Advanced Micro Devices"; "[[3M]]" → "3M". */
const plain = (cell) =>
  cell
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .trim();

const stocks = [];
for (const block of wikitext.split('\n|-').slice(1)) {
  // Cells start a line with "||" or "|", and some rows put several cells on one line ("|| a || b")
  const cells = block
    .replace(/\n\|(?!\|)/g, '\n||')
    .split('\n')
    .filter((l) => l.startsWith('||'))
    .flatMap((l) => l.slice(2).split('||'))
    .map((c) => c.trim());
  if (cells.length < 7) continue;
  const sym = cells[0].match(/\{\{\s*(?:Nyse|Nasdaq|Cboe|Bats)Symbol\s*\|\s*([A-Z.]+)\s*\}\}/i)?.[1] ?? cells[0].match(/^([A-Z.]{1,6})$/)?.[1];
  const cik = Number(cells[6].replace(/\D/g, ''));
  if (!sym || !cik) continue;
  stocks.push([sym.replace('.', '-'), plain(cells[1]), plain(cells[2]), plain(cells[3]), cik]);
}
if (stocks.length < 480) throw new Error(`Only ${stocks.length} rows parsed — the Wikipedia table layout may have changed`);

const doc = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'Wikipedia, "List of S&P 500 companies" (CC BY-SA 4.0), via the MediaWiki API',
  columns: ['yahooTicker', 'name', 'gicsSector', 'gicsSubIndustry', 'secCik'],
  stocks,
};
writeFileSync(new URL('../src/config/sp500.json', import.meta.url), JSON.stringify(doc) + '\n');
const sectors = new Map();
for (const s of stocks) sectors.set(s[2], (sectors.get(s[2]) ?? 0) + 1);
console.log(`${stocks.length} constituents written; sectors: ${[...sectors].map(([k, v]) => `${k} ${v}`).join(', ')}`);
