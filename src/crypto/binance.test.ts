/** binance.test.ts — Tests for the Binance parsers, universe filter, weight governor and client (fixtures only, no network). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BinanceClient,
  BinanceHttpError,
  parseMarkPrices,
  SPOT_BASES,
  WeightGovernor,
  buildQuery,
  closedKlines,
  futuresMultiplierOf,
  isLeveragedToken,
  parseExchangeInfo,
  parseKlines,
  parseMiniTickers,
  parsePremiumIndex,
  parseTicker24h,
  planRounds,
  rankUniverse,
  usdtPairs,
  weightLimitPerMinute,
} from './binance.ts';

const EXCHANGE_INFO = {
  rateLimits: [
    { rateLimitType: 'REQUEST_WEIGHT', interval: 'MINUTE', intervalNum: 1, limit: 6000 },
    { rateLimitType: 'ORDERS', interval: 'SECOND', intervalNum: 10, limit: 100 },
  ],
  symbols: [
    { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING' },
    { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', status: 'TRADING' },
    { symbol: 'USDCUSDT', baseAsset: 'USDC', quoteAsset: 'USDT', status: 'TRADING' },
    { symbol: 'FDUSDUSDT', baseAsset: 'FDUSD', quoteAsset: 'USDT', status: 'TRADING' },
    { symbol: 'BTCUPUSDT', baseAsset: 'BTCUP', quoteAsset: 'USDT', status: 'TRADING' },
    { symbol: 'JUPUSDT', baseAsset: 'JUP', quoteAsset: 'USDT', status: 'TRADING' },
    { symbol: '币安人生USDT', baseAsset: '币安人生', quoteAsset: 'USDT', status: 'TRADING' },
    { symbol: 'ETHBTC', baseAsset: 'ETH', quoteAsset: 'BTC', status: 'TRADING' },
    { symbol: 'OLDUSDT', baseAsset: 'OLD', quoteAsset: 'USDT', status: 'BREAK' },
  ],
};

test('exchangeInfo: symbols, rate limits and the USDT universe filter', () => {
  const info = parseExchangeInfo(EXCHANGE_INFO);
  assert.equal(info.symbols.length, 9);
  assert.equal(weightLimitPerMinute(info.rateLimits), 6000);
  assert.equal(weightLimitPerMinute([]), 6000);
  const pairs = usdtPairs(info.symbols).map((s) => s.symbol);
  // Stablecoins, leveraged tokens, non-USDT quotes and halted pairs are out; JUP and non-ASCII stay
  assert.deepEqual(pairs, ['BTCUSDT', 'ETHUSDT', 'JUPUSDT', '币安人生USDT']);
  assert.equal(isLeveragedToken('BTCUP', new Set(['BTC'])), true);
  assert.equal(isLeveragedToken('JUP', new Set(['BTC', 'J'])), false);
});

test('ticker/24hr parsing (FULL and MINI) and ranking by quote volume', () => {
  const tickers = parseTicker24h([
    { symbol: 'BTCUSDT', lastPrice: '67000.10', openPrice: '66000', highPrice: '68000', lowPrice: '65000', priceChangePercent: '1.515', volume: '100', quoteVolume: '6700000000', closeTime: 1 },
    { symbol: 'ETHUSDT', lastPrice: '2600', openPrice: '2500', highPrice: '2700', lowPrice: '2400', volume: '1000', quoteVolume: '2600000000', closeTime: 1 },
    { symbol: '币安人生USDT', lastPrice: '0.2', openPrice: '0.25', quoteVolume: '9000000', closeTime: 1 },
    { symbol: 'JUPUSDT', lastPrice: 'x' },
  ]);
  assert.equal(tickers.length, 3);
  assert.ok(Math.abs(tickers[1].priceChangePercent - 4) < 1e-9); // MINI: derived from open
  const info = parseExchangeInfo(EXCHANGE_INFO);
  const top = rankUniverse(usdtPairs(info.symbols), tickers, 2);
  assert.deepEqual(top.map((t) => [t.symbol, t.rank]), [['BTCUSDT', 1], ['ETHUSDT', 2]]);
});

test('klines: numbers, uniqueness by open time, and the unfinished last candle', () => {
  const now = 1_700_000_000_000;
  const row = (open: number, close: number) => [open, '1', '2', '0.5', '1.5', '10', close, '15', 7, '5', '7', '0'];
  const k = parseKlines([row(now - 7_200_000, now - 3_600_001), row(now - 3_600_000, now + 59_999), row(now - 7_200_000, now - 3_600_001)], now);
  assert.equal(k.length, 2);
  assert.equal(k[0].closed, true);
  assert.equal(k[1].closed, false);
  assert.equal(closedKlines(k).length, 1);
  assert.equal(k[0].close, 1.5);
});

test('miniTicker stream, premiumIndex and 1000-contract multipliers', () => {
  const m = parseMiniTickers([{ e: '24hrMiniTicker', E: 1, s: 'BTCUSDT', c: '67000', o: '66000', h: '68000', l: '65000', v: '1', q: '67000' }, { s: 'BAD' }]);
  assert.equal(m.length, 1);
  assert.equal(m[0].close, 67000);
  const p = parsePremiumIndex([{ symbol: '1000PEPEUSDT', markPrice: '0.0101', indexPrice: '0.0100', lastFundingRate: '0.0001', nextFundingTime: 5, time: 4 }]);
  assert.equal(p[0].lastFundingRate, 0.0001);
  assert.equal(futuresMultiplierOf('1000PEPEUSDT'), 1000);
  assert.equal(futuresMultiplierOf('1000000MOGUSDT'), 1000000);
  assert.equal(futuresMultiplierOf('BTCUSDT'), 1);
  assert.equal(buildQuery({ symbol: '币安人生USDT', limit: 5, x: undefined }), `?symbol=${encodeURIComponent('币安人生USDT')}&limit=5`);
});

test('weight governor: 20% budget, header usage, 429 / 418 / 451 with Retry-After', () => {
  const t0 = 1_700_000_020_000; // 40 s into a minute
  const g = new WeightGovernor(6000);
  assert.equal(g.budget(), 1200);
  assert.ok(g.canSpend(80, t0));
  g.record(80, '1150', t0); // another process on the same IP used more
  assert.equal(g.used(t0), 1150);
  assert.equal(g.canSpend(80, t0), false);
  assert.equal(g.waitMs(80, t0), 20_000);
  assert.ok(g.canSpend(80, t0 + 21_000)); // new minute
  g.onStatus(429, '30', t0);
  assert.equal(g.availability, 'rate-limited');
  assert.equal(g.canSpend(1, t0 + 29_000), false);
  assert.ok(g.canSpend(1, t0 + 31_000));
  g.onStatus(418, null, t0);
  assert.equal(g.availability, 'ip-banned');
  assert.equal(g.canSpend(1, t0 + 599_000), false);
  g.onStatus(451, null, t0 + 700_000);
  assert.equal(g.availability, 'region-blocked');
  assert.equal(g.canSpend(1, t0 + 700_000), false);
});

function fakeResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { ok: status >= 200 && status < 300, status, headers: { get: (n: string) => h.get(n.toLowerCase()) ?? null }, json: async () => body };
}

test('client: falls back to the next base on network errors, stops on 429, detects region blocks', async () => {
  const calls: string[] = [];
  let now = 1_700_000_000_000;
  const client = new BinanceClient({
    bases: SPOT_BASES.slice(0, 3),
    governor: new WeightGovernor(6000),
    now: () => now,
    fetch: async (url) => {
      calls.push(url);
      if (url.startsWith(SPOT_BASES[0])) throw new Error('ECONNRESET');
      return fakeResponse(200, { serverTime: 1 }, { 'X-MBX-USED-WEIGHT-1M': '3' });
    },
  });
  assert.deepEqual(await client.get('/api/v3/time', {}, 1), { serverTime: 1 });
  assert.equal(client.current, 1);
  assert.equal(calls.length, 2);

  const limited = new BinanceClient({
    bases: SPOT_BASES.slice(0, 3),
    governor: new WeightGovernor(6000),
    now: () => now,
    fetch: async () => fakeResponse(429, {}, { 'Retry-After': '45' }),
  });
  await assert.rejects(limited.get('/api/v3/ping', {}, 1), (e: unknown) => e instanceof BinanceHttpError && e.status === 429);
  // Paused: the next call fails fast without a request
  await assert.rejects(limited.get('/api/v3/ping', {}, 1), (e: unknown) => e instanceof BinanceHttpError && e.status === 0);
  now += 46_000;

  const blocked = new BinanceClient({
    bases: SPOT_BASES.slice(0, 2),
    governor: new WeightGovernor(6000),
    now: () => now,
    fetch: async () => fakeResponse(451, {}),
  });
  await assert.rejects(blocked.get('/api/v3/ping', {}, 1), (e: unknown) => e instanceof BinanceHttpError && e.status === 451);
  assert.equal(blocked.governor.availability, 'region-blocked');
});

test('planRounds keeps every round inside the weight budget', () => {
  const items = Array.from({ length: 300 }, (_, i) => i); // 100 pairs × 3 timeframes
  assert.equal(planRounds(items, 2, 1200).length, 1);
  const rounds = planRounds(items, 2, 400);
  assert.equal(rounds.length, 2);
  assert.ok(rounds.every((r) => r.length * 2 <= 400));
});

test('window changes from hourly candles and the derivatives snapshot', async () => {
  const { windowChanges, parseDerivatives } = await import('./binance.ts');
  const hourly = Array.from({ length: 170 }, (_, i) => ({ openTime: i, open: 100 + i, high: 0, low: 0, close: 0, volume: 0, closeTime: i, quoteVolume: 0, trades: 0, closed: true }));
  const c = windowChanges(hourly, 300);
  assert.ok(Math.abs((c.h1 ?? 0) - (300 / 269 - 1) * 100) < 1e-9);
  assert.ok(Math.abs((c.d7 ?? 0) - (300 / 102 - 1) * 100) < 1e-9);
  assert.equal(windowChanges(hourly.slice(0, 3), 300).h4, undefined);
  const d = parseDerivatives(
    'BTCUSDT',
    [{ sumOpenInterest: '100' }, { sumOpenInterest: '110' }],
    [{ longShortRatio: '1.8' }],
    [{ buySellRatio: '0.9' }],
    [{ annualizedBasisRate: '0.05' }],
    7
  );
  assert.equal(d.openInterest, 110);
  assert.ok(Math.abs((d.openInterestChange24h ?? 0) - 10) < 1e-9);
  assert.equal(d.longShortRatio, 1.8);
  assert.equal(d.basisRate, 5);
});

test('mark-price stream rows keep the index price', () => {
  const rows = parseMarkPrices([
    { e: 'markPriceUpdate', E: 1, s: 'XAUUSDT', p: '4140.6', i: '4139.38' },
    { s: 'BADUSDT', p: '1', i: '0' },
    { p: '1' },
  ]);
  assert.deepEqual(rows, [{ symbol: 'XAUUSDT', mark: 4140.6, index: 4139.38, eventTime: 1 }]);
  assert.deepEqual(parseMarkPrices(null), []);
});
