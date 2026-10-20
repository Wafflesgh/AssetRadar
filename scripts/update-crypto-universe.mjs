/**
 * update-crypto-universe.mjs — Rebuilds src/config/cryptoUniverse.json: the top crypto assets by
 * market cap (CoinGecko), without stablecoins, wrapped/staked/bridged copies and tokenized
 * funds or gold, each mapped to its Binance Spot pair (USDT), Binance USDⓈ-M perpetual (incl.
 * "1000"-prefixed contracts) and Indodax Rupiah pair when they exist. A pair is only accepted
 * when its price is within 5% of CoinGecko's, so a ticker that means a different coin on the
 * exchange is not mapped. Public endpoints only, no API keys.
 *
 * Usage: node scripts/update-crypto-universe.mjs [count=50]
 */
import { writeFileSync } from 'node:fs';

const COUNT = Number(process.argv[2]) || 50;

// Not tracked as separate assets: stablecoins, wrapped / staked / bridged versions of other coins,
// tokenized funds and gold tokens (gold is already in the app)
const EXCLUDE_IDS = new Set([
  'tether', 'usd-coin', 'dai', 'ethena-usde', 'first-digital-usd', 'usds', 'paypal-usd', 'true-usd',
  'usd1-wlfi', 'ripple-usd', 'binance-usd', 'usdd', 'frax', 'gho', 'falcon-finance', 'global-dollar',
  'wrapped-bitcoin', 'weth', 'staked-ether', 'wrapped-steth', 'wrapped-eeth', 'coinbase-wrapped-btc',
  'rocket-pool-eth', 'binance-bridged-usdt-bnb-smart-chain', 'jito-staked-sol', 'lombard-staked-btc',
  'solv-btc', 'mantle-staked-ether', 'wrapped-beacon-eth', 'binance-staked-sol', 'liquid-staked-ethereum',
  'renzo-restaked-eth', 'kelp-dao-restaked-eth', 'ethena-staked-usde', 'susds', 'blackrock-usd-institutional-digital-liquidity-fund',
  'usyc', 'ousg', 'tether-gold', 'pax-gold', 'bridged-usdc-polygon-pos-bridge', 'wbnb', 'wrapped-solana',
  'clbtc', 'lbtc', 'savings-dai', 'usual-usd', 'stakewise-v3-oseth', 'coinbase-wrapped-staked-eth',
  // Tokenized loans, treasury and money-market funds
  'figure-heloc', 'ondo-us-dollar-yield', 'hashnote-usyc', 'spiko-amundi-overnight-swap-fund-eur', 'united-stables',
]);
// Older tickers still used by an exchange after a rename (CoinGecko id → extra symbols to try)
const ALIASES = { 'the-open-network': ['TON'] };
const looksStable = (c) => /usd|eur|gbp/i.test(c.symbol) && Math.abs((c.current_price ?? 0) - 1) < 0.05;
const looksWrapped = (c) => /^(wrapped|bridged|staked|liquid staked|restaked)\b/i.test(c.name) || /\b(staked|wrapped|bridged)\b/i.test(c.name);

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': 'AssetRadar personal research app (non-commercial)', ...headers } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

const near = (a, b) => a > 0 && b > 0 && Math.abs(a / b - 1) <= 0.05;

const [markets, spotInfo, spotTickers, futInfo, futTickers, indodaxPairs, indodaxTickers, usdIdr] = await Promise.all([
  getJson('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=150&page=1'),
  getJson('https://data-api.binance.vision/api/v3/exchangeInfo?permissions=SPOT&symbolStatus=TRADING'),
  getJson('https://data-api.binance.vision/api/v3/ticker/price'),
  getJson('https://fapi.binance.com/fapi/v1/exchangeInfo').catch((e) => (console.warn('futures info unavailable:', e.message), null)),
  getJson('https://fapi.binance.com/fapi/v1/ticker/price').catch(() => []),
  getJson('https://indodax.com/api/pairs'),
  getJson('https://indodax.com/api/summaries'),
  getJson('https://query1.finance.yahoo.com/v8/finance/chart/IDR=X?range=1d&interval=1d').then((j) => j.chart.result[0].meta.regularMarketPrice),
]);

const spotPrice = new Map(spotTickers.map((t) => [t.symbol, Number(t.price)]));
const spotPairs = new Map(spotInfo.symbols.filter((s) => s.quoteAsset === 'USDT').map((s) => [s.baseAsset.toUpperCase(), s.symbol]));
const futPrice = new Map(futTickers.map((t) => [t.symbol, Number(t.price)]));
const futPairs = new Map();
for (const s of futInfo?.symbols ?? []) {
  if (s.contractType !== 'PERPETUAL' || s.status !== 'TRADING' || s.quoteAsset !== 'USDT') continue;
  const m = s.baseAsset.match(/^(1000000|1000)?(.+)$/);
  futPairs.set(m[2].toUpperCase(), { symbol: s.symbol, multiplier: m[1] ? Number(m[1]) : 1 });
}
const idxIds = new Set(indodaxPairs.map((p) => String(p.id).toLowerCase()));
const idxLast = (pair) => Number(indodaxTickers.tickers?.[pair.replace('idr', '_idr')]?.last);

const out = [];
const skipped = [];
for (const c of markets) {
  if (out.length >= COUNT) break;
  if (EXCLUDE_IDS.has(c.id) || looksStable(c) || looksWrapped(c)) {
    skipped.push(`${c.symbol.toUpperCase()} (${c.id})`);
    continue;
  }
  const base = c.symbol.toUpperCase();
  const usd = c.current_price;
  const names = [base, ...(ALIASES[c.id] ?? [])];
  const spot = names.map((n) => spotPairs.get(n)).find((p) => p && near(spotPrice.get(p), usd));
  const fut = names.map((n) => futPairs.get(n)).find((p) => p && near(futPrice.get(p.symbol) / p.multiplier, usd));
  const idxPair = names.map((n) => `${n.toLowerCase()}idr`).find((p) => idxIds.has(p) && near(idxLast(p) / usdIdr, usd));
  const spotOk = Boolean(spot);
  const futOk = Boolean(fut);
  const idxOk = Boolean(idxPair);
  out.push({
    rank: out.length + 1,
    marketCapRank: c.market_cap_rank,
    code: base,
    name: c.name,
    coingeckoId: c.id,
    binanceSpot: spotOk ? spot : null,
    binanceFutures: futOk ? fut.symbol : null,
    futuresMultiplier: futOk && fut.multiplier !== 1 ? fut.multiplier : undefined,
    indodaxPair: idxOk ? idxPair : null,
    priceSource: idxOk ? 'indodax' : spotOk ? 'binance-spot' : futOk ? 'binance-futures' : 'coingecko',
    circulatingSupply: c.circulating_supply ?? null,
  });
}

const doc = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'CoinGecko /coins/markets (rank), Binance Spot exchangeInfo + ticker/price, Binance USDⓈ-M exchangeInfo + ticker/price, Indodax pairs + summaries',
  note: 'Ranking changes daily; the app re-ranks at runtime and uses this file as the starting list and fallback.',
  excluded: skipped,
  assets: out,
};
writeFileSync(new URL('../src/config/cryptoUniverse.json', import.meta.url), JSON.stringify(doc, null, 1) + '\n');
const count = (k) => out.filter((a) => a[k]).length;
console.log(`${out.length} assets — Binance spot ${count('binanceSpot')}, futures ${count('binanceFutures')}, Indodax ${count('indodaxPair')}`);
console.log('excluded:', skipped.join(', '));
for (const a of out) console.log(a.rank, a.code, a.name, a.coingeckoId, `$${markets.find((m) => m.id === a.coingeckoId).current_price}`, '|', a.binanceSpot ?? '-', '|', a.binanceFutures ?? '-', '|', a.indodaxPair ?? '-');
