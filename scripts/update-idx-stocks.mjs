/**
 * update-idx-stocks.mjs — Rebuilds src/config/idxStocks.json, the list of every stock listed on
 * the Indonesia Stock Exchange (code, name, shares outstanding, listing board, IDX-IC sector and
 * industry in English, plus the Indonesian industry name for search).
 *
 * idx.co.id blocks scripted downloads, so the data is exported from a normal browser:
 *   1. Open https://www.idx.co.id/primary/StockData/GetSecuritiesStock?start=0&length=9999&code=&sector=&board=&language=en-us
 *      and save the page as securities.json
 *   2. Open https://www.idx.co.id/primary/ListedCompany/GetCompanyProfiles?emitenType=s&start=0&length=9999
 *      and save the page as profiles.json
 *   3. Run: node scripts/update-idx-stocks.mjs securities.json profiles.json
 * (A pipe-separated file "CODE|Name|Shares|Board|Sektor|Industri" per line is also accepted:
 *  node scripts/update-idx-stocks.mjs --pipe stocks.txt)
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SECTORS = {
  Energi: 'Energy',
  'Barang Baku': 'Basic Materials',
  Perindustrian: 'Industrials',
  'Barang Konsumen Primer': 'Consumer Non-Cyclicals',
  'Barang Konsumen Non-Primer': 'Consumer Cyclicals',
  Kesehatan: 'Healthcare',
  Keuangan: 'Financials',
  'Properti & Real Estat': 'Properties & Real Estate',
  Teknologi: 'Technology',
  Infrastruktur: 'Infrastructures',
  'Transportasi & Logistik': 'Transportation & Logistic',
};

const INDUSTRIES = {
  'Aplikasi & Jasa Internet': 'Internet Applications & Services',
  Asuransi: 'Insurance',
  Bank: 'Banks',
  'Barang Elektronik Konsumen': 'Consumer Electronics',
  'Barang Kimia': 'Chemicals',
  'Barang Rumah Tangga': 'Household Goods',
  'Batu Bara': 'Coal',
  'Department Store': 'Department Stores',
  'Distributor Barang Konsumen': 'Consumer Distributors',
  Farmasi: 'Pharmaceuticals',
  'Hiburan & Film': 'Entertainment & Movie Production',
  'Jasa & Konsultan TI': 'IT Services & Consulting',
  'Jasa Investasi': 'Investment Services',
  'Jasa Komersial': 'Commercial Services',
  'Jasa Profesional': 'Professional Services',
  'Jasa Telekomunikasi Nirkabel': 'Wireless Telecommunication Services',
  'Jasa Telekomunikasi': 'Telecommunication Services',
  Kelistrikan: 'Electrical',
  'Komponen Otomotif': 'Automobile Components',
  'Konstruksi Bangunan': 'Heavy Constructions & Civil Engineering',
  'Logam & Mineral': 'Metals & Minerals',
  'Logistik & Pengantaran': 'Logistics & Deliveries',
  'Makanan Olahan': 'Processed Foods',
  'Maskapai Penerbangan': 'Airlines',
  'Material Konstruksi': 'Construction Materials',
  Media: 'Media',
  Mesin: 'Machinery',
  Minuman: 'Beverages',
  'Minyak & Gas': 'Oil & Gas',
  'Operator Infrastruktur Transportasi': 'Transport Infrastructure Operators',
  'Pakaian & Barang Mewah': 'Apparel & Luxury Goods',
  'Pariwisata & Rekreasi': 'Tourism & Recreation',
  'Pembiayaan Konsumen': 'Consumer Financing',
  'Pendidikan & Jasa Penunjang': 'Education & Support Services',
  'Pendukung Minyak, Gas & Batu Bara': 'Oil, Gas & Coal Supports',
  'Pengangkutan Darat Penumpang': 'Passenger Land Transportation',
  'Pengelola & Pengembang Real Estat': 'Real Estate Management & Development',
  'Penyedia Jasa Kesehatan': 'Healthcare Providers',
  'Peralatan & Perlengkapan Kesehatan': 'Healthcare Equipment & Supplies',
  'Peralatan Energi Alternatif': 'Alternative Energy Equipment',
  'Peralatan Jaringan': 'Networking Equipment',
  'Peralatan Olah Raga & Barang Hobi': 'Leisure Products',
  'Perangkat Komputer': 'Computer Hardware',
  'Perangkat Lunak': 'Software',
  'Perangkat, Instrumen & Komponen Elektronik': 'Electronic Equipment & Components',
  'Perdagangan Aneka Barang Perindustrian': 'Diversified Industrial Trading',
  'Perdagangan Ritel Barang Primer': 'Food & Staples Retailing',
  'Perhutanan & Kertas': 'Forestry & Paper',
  'Perusahaan Holding & Investasi': 'Holding & Investment Companies',
  'Perusahaan Holding Multi-sektor': 'Multi-sector Holdings',
  'Produk & Perlengkapan Bangunan': 'Building Products',
  'Produk Makanan Pertanian': 'Agricultural Products',
  'Produk Perawatan Tubuh': 'Personal Care Products',
  'Ritel Khusus': 'Specialty Retail',
  Rokok: 'Tobacco',
  'Utilitas Gas': 'Gas Utilities',
  'Utilitas Listrik': 'Electric Utilities',
  'Wadah & Kemasan': 'Containers & Packaging',
};

const BOARDS = { 'Ekonomi Baru': 'New Economy', Utama: 'Main', Pengembangan: 'Development', Akselerasi: 'Acceleration', 'Pemantauan Khusus': 'Watchlist' };

/** "PT Bank Central Asia Tbk." → "Bank Central Asia"; ALL CAPS names → Title Case. */
function cleanName(raw) {
  let s = String(raw || '')
    .replace(/\s+/g, ' ')
    .replace(/^PT\.?\s+/i, '')
    .replace(/\s*\(Persero\)\s*/i, ' ')
    .replace(/,?\s*Tbk\.?$/i, '')
    .trim();
  if (s === s.toUpperCase() && /[A-Z]{5,}/.test(s)) {
    s = s
      .split(' ')
      .map((w) => (w.length > 3 ? w[0] + w.slice(1).toLowerCase() : w))
      .join(' ');
  }
  return s;
}

function fromIdxJson(securitiesPath, profilesPath) {
  const sec = JSON.parse(readFileSync(securitiesPath, 'utf8')).data;
  const prof = new Map(JSON.parse(readFileSync(profilesPath, 'utf8')).data.map((p) => [String(p.KodeEmiten).trim(), p]));
  return sec.map((s) => {
    const p = prof.get(String(s.Code).trim()) || {};
    return [String(s.Code).trim(), p.NamaEmiten || s.Name, Number(s.Shares), s.ListingBoard, (p.Sektor || '').trim(), (p.Industri || '').trim()];
  });
}

function fromPipe(path) {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      const f = l.split('|');
      return [f[0], f[1], Number(f[2]), f[3], f[4], f[5]];
    });
}

const args = process.argv.slice(2);
const rows = args[0] === '--pipe' ? fromPipe(args[1]) : fromIdxJson(args[0], args[1]);
const unknown = new Set();
const stocks = rows
  .map(([code, name, shares, board, sektor, industri]) => {
    if (sektor && !SECTORS[sektor]) unknown.add(`sector: ${sektor}`);
    if (industri && !INDUSTRIES[industri]) unknown.add(`industry: ${industri}`);
    return [code, cleanName(name), Number.isFinite(shares) ? shares : 0, BOARDS[board] ?? board, SECTORS[sektor] ?? sektor, INDUSTRIES[industri] ?? industri, industri];
  })
  .sort((a, b) => a[0].localeCompare(b[0]));
if (unknown.size) console.warn('Add English names for:', [...unknown].join('; '));

const out = new URL('../src/config/idxStocks.json', import.meta.url);
const lines = stocks.map((s) => '    ' + JSON.stringify(s));
writeFileSync(
  out,
  `{\n  "updated": "${new Date().toISOString().slice(0, 10)}",\n  "source": "Indonesia Stock Exchange (idx.co.id): listed securities and company profiles",\n  "fields": ["code", "name", "shares", "board", "sector", "industry", "industryId"],\n  "stocks": [\n${lines.join(',\n')}\n  ]\n}\n`
);
console.log(`wrote ${stocks.length} stocks to src/config/idxStocks.json`);
