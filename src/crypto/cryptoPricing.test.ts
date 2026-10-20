/** cryptoPricing.test.ts — Tests for the crypto price-source choice, futures multipliers and USDT → IDR conversion. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSETS, getAssetByCode, universeCryptoAsset } from '../config/assets.ts';
import { convertedTick, perCoin, pickUsdQuote, priceSourceOf, usdtToIdr, type UsdQuote } from './cryptoPricing.ts';

const q = (price: number, extra: Partial<UsdQuote> = {}): UsdQuote => ({ price, updatedAt: 1, source: 'Binance', ...extra });

test('universe merge keeps the original 20 crypto ids and adds the rest with one price source each', () => {
  const crypto = ASSETS.filter((a) => a.group === 'crypto');
  assert.equal(crypto.length, 50);
  assert.equal(crypto[0].id, 'btc');
  // Toncoin keeps id "ton" and answers to its new code GRAM
  const ton = getAssetByCode('GRAM');
  assert.equal(ton?.id, 'ton');
  assert.equal(ton?.binanceSpot, 'GRAMUSDT');
  assert.equal(getAssetByCode('PEPE')?.futuresMultiplier, 1000);
  assert.equal(priceSourceOf(getAssetByCode('ZEC')!), 'binance-spot');
  assert.equal(priceSourceOf(getAssetByCode('XMR')!), 'binance-futures');
  assert.equal(priceSourceOf(getAssetByCode('WBT')!), 'coingecko');
  assert.equal(priceSourceOf(getAssetByCode('HYPE')!), 'indodax');
  assert.equal(getAssetByCode('HYPE')?.indodaxPair, 'hypeidr');
  // No asset without a pair claims a TradingView chart it cannot have
  assert.equal(getAssetByCode('WBT')?.tvWidgetUnsupported, true);
  assert.equal(getAssetByCode('XMR')?.tvSymbol, 'BINANCE:XMRUSDT.P');
});

test('quote choice falls back spot → futures (per coin) → CoinGecko', () => {
  const asset = universeCryptoAsset({
    rank: 99, code: 'TST', name: 'Test Coin', coingeckoId: 'test-coin', binanceSpot: 'TSTUSDT', binanceFutures: '1000TSTUSDT',
    futuresMultiplier: 1000, indodaxPair: null, priceSource: 'binance-spot', circulatingSupply: 1,
  });
  const spot = new Map<string, UsdQuote>();
  const futures = new Map([['1000TSTUSDT', q(2.5, { high24h: 3, low24h: 2 })]]);
  const coingecko = new Map([['test-coin', q(0.0024, { source: 'CoinGecko' })]]);
  const fromFutures = pickUsdQuote(asset, { spot, futures, coingecko });
  assert.equal(fromFutures?.price, 0.0025);
  assert.equal(fromFutures?.high24h, 0.003);
  spot.set('TSTUSDT', q(0.0026));
  assert.equal(pickUsdQuote(asset, { spot, futures, coingecko })?.price, 0.0026);
  assert.equal(pickUsdQuote({ ...asset, binanceSpot: undefined, binanceFutures: undefined }, { spot, futures, coingecko })?.source, 'CoinGecko');
  assert.equal(pickUsdQuote({ ...asset, coingeckoId: undefined, binanceSpot: undefined, binanceFutures: undefined }, { spot, futures, coingecko }), null);
  assert.equal(perCoin(10, undefined), 10);
});

test('USDT → IDR conversion marks the tick as converted; missing rate gives an error tick', () => {
  assert.equal(usdtToIdr(2, 16_000), 32_000);
  assert.ok(Number.isNaN(usdtToIdr(2, 0)));
  const asset = { symbol: 'ZEC/IDR', group: 'crypto' as const };
  const t = convertedTick(asset, q(50, { changePct24h: 3, high24h: 55, low24h: 45, quoteVolume: 1e6 }), 16_000, 5);
  assert.equal(t.price, 800_000);
  assert.equal(t.priceUsdt, 50);
  assert.equal(t.converted, true);
  assert.equal(t.high24h, 880_000);
  assert.equal(t.status, 'live');
  assert.equal(convertedTick(asset, q(50), 0, 5).status, 'error');
  assert.equal(convertedTick(asset, null, 16_000, 5).errorMessage, 'Data unavailable');
});
