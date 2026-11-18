/** sinceLastVisit.test.ts — Visit threshold, price gaps and relevant news. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sinceLastVisit, visitSnapshot, parseLastVisit } from './sinceLastVisit.ts';
import type { PriceTick, MarketNewsItem } from '../config/assets.ts';
const tick = (price: number, extra = {}) => ({ price, status: 'live', ...extra }) as PriceTick;
const previous = { at: 1000, prices: { 'BBCA.JK': 100, AAPL: 100 } };
test('first visit and visits under one hour stay hidden', () => {
  assert.equal(sinceLastVisit(null, 4000000, [], {}, []), null);
  assert.equal(sinceLastVisit(previous, 3600999, [], {}, []), null);
});
test('changes sort by absolute size; missing and stale quotes stay null', () => {
  const result = sinceLastVisit(previous, 3601000, ['BBCA.JK', 'AAPL', 'BTC/IDR'], { 'BBCA.JK': tick(110), AAPL: tick(80) }, [])!;
  assert.deepEqual(result.changes.map(c => c.symbol), ['AAPL', 'BBCA.JK', 'BTC/IDR']);
  assert.ok(Math.abs(result.changes[0].change! + 20) < 1e-9);
  assert.equal(result.changes[2].change, null);
  assert.deepEqual(visitSnapshot(['AAPL', 'BBCA.JK'], { AAPL: tick(10, { fromSnapshot: true }), 'BBCA.JK': tick(1, { status: 'error' }) }, 1000).prices, {});
});
test('headlines require a tracked code and publication since the visit', () => {
  const news = (id: string, at: number, tags: string[]) => ({ id, publishedAtMs: at, assetTags: tags }) as MarketNewsItem;
  const result = sinceLastVisit(previous, 3601000, ['AAPL'], {}, [news('old', 999, ['AAPL']), news('other', 2000, ['BTC']), news('yes', 1000, ['AAPL'])])!;
  assert.deepEqual(result.news.map(n => n.id), ['yes']);
  assert.equal(parseLastVisit({ at: 'bad', prices: {} }), null);
});
