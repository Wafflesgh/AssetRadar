/** newsTags.test.ts — Tests for headline asset tagging and live news merging. */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { MarketNewsItem } from '../config/assets.ts';
import {
  GEO_TAG,
  MACRO_TAG,
  detectGeoAlert,
  mergeNewsItems,
  newsKey,
  selectGeoAlert,
  tagHeadline,
} from './newsTags.ts';

test('tagHeadline finds assets in English and Indonesian headlines', () => {
  assert.deepEqual(tagHeadline('Bitcoin and Ether slide as ETF outflows grow'), ['BTC', 'ETH']);
  assert.deepEqual(tagHeadline('IHSG Anjlok 5%, Rupiah Melemah ke 18.000'), ['JCI', 'USD']);
  assert.deepEqual(tagHeadline('Harga emas Antam naik hari ini'), ['GOLD']);
  assert.deepEqual(tagHeadline('Gold rangebound as Fed rate cut bets fade'), ['GOLD', MACRO_TAG]);
  assert.deepEqual(tagHeadline('Solana network upgrade goes live'), ['SOL']);
  // Partial words must not match ("bethany", "golden", "solar")
  assert.deepEqual(tagHeadline('Bethany opens golden solar farm'), []);
});

test('newsKey ignores case and punctuation', () => {
  assert.equal(newsKey({ title: 'Bitcoin Surges!' }), newsKey({ title: 'bitcoin   surges' }));
});

const item = (id: string, title: string, publishedAtMs: number, tags: string[]): MarketNewsItem => ({
  id,
  title,
  link: `https://example.com/${id}`,
  source: 'Test',
  publishedAt: '',
  publishedAtMs,
  assetTags: tags,
  sentiment: 'Neutral',
});

test('mergeNewsItems reports only new stories and unions duplicate tags', () => {
  const now = 10_000_000;
  const first = mergeNewsItems([], [item('a', 'Gold climbs', now - 60_000, ['GOLD'])], now);
  assert.equal(first.added.length, 1);
  assert.equal(first.items[0].firstSeenAt, now);

  const second = mergeNewsItems(
    first.items,
    [
      item('a2', 'Gold climbs', now - 60_000, [MACRO_TAG]),
      item('b', 'Bitcoin jumps', now + 5_000, ['BTC']),
    ],
    now + 1000
  );
  assert.deepEqual(second.added.map((i) => i.id), ['b']);
  assert.deepEqual(second.items.map((i) => i.id), ['b', 'a']);
  assert.deepEqual(second.items[1].assetTags, ['GOLD', MACRO_TAG]);
  // Future timestamps are clamped to "now"
  assert.equal(second.items[0].publishedAtMs, now + 1000);
});

test('mergeNewsItems drops old items and caps the list', () => {
  const now = 100 * 3600_000;
  const res = mergeNewsItems(
    [],
    [item('old', 'Old story', now - 49 * 3600_000, ['BTC']), item('x', 'Fresh one', now, ['BTC']), item('y', 'Fresh two', now - 1, ['BTC'])],
    now,
    { maxItems: 1 }
  );
  assert.deepEqual(res.items.map((i) => i.id), ['x']);
  assert.deepEqual(res.added.map((i) => i.id), ['x']);
});

test('detectGeoAlert flags a new war or escalation as high', () => {
  for (const t of [
    'Egypt enters the war',
    'Country X declares war on neighbour after border clash',
    'Russia launches full-scale invasion',
    'Troops invade northern province overnight',
    'Perang pecah di perbatasan, ribuan warga mengungsi',
    'Militer melancarkan invasi ke wilayah tetangga',
    'Darurat militer diberlakukan setelah kudeta',
  ]) {
    assert.equal(detectGeoAlert(t), 'high', t);
  }
});

test('detectGeoAlert marks strikes by major actors as elevated', () => {
  assert.equal(detectGeoAlert('Russian ballistic missile strike on Kyiv kills one'), 'elevated');
  assert.equal(detectGeoAlert('Arab Saudi tembak jatuh drone Houthi, serangan rudal berlanjut'), 'elevated');
  assert.equal(GEO_TAG, 'GEO');
});

test('detectGeoAlert ignores ongoing-war commentary and figurative wars', () => {
  for (const t of [
    'Trump accuses Zelenskyy of not wanting to end the war',
    'US-China trade war escalates with new tariffs',
    'Perang harga mobil listrik makin panas',
    'Serangan jantung saat olahraga, ini gejalanya',
    'Hackers launch 51% attack on small blockchain',
    'Spirit, Naagzilla to Love & War: Bollywood releases in 2027',
    'Bitcoin price war among exchanges cuts fees',
  ]) {
    assert.equal(detectGeoAlert(t), null, t);
  }
});

test('selectGeoAlert shows the newest recent high alert that was not dismissed', () => {
  const now = 50 * 3600_000;
  const geo = (id: string, ageMin: number, level: 'high' | 'elevated', source = 'S') => ({
    ...item(id, `story ${id}`, now - ageMin * 60_000, [GEO_TAG]),
    geoAlert: level,
    source,
  });
  const items = [geo('a', 5, 'high', 'BBC'), geo('b', 30, 'high', 'Reuters'), geo('c', 2, 'elevated'), geo('old', 200, 'high')];
  const alert = selectGeoAlert(items, now);
  assert.equal(alert?.lead.id, 'a');
  assert.deepEqual(alert?.related.map((i) => i.id), ['b']);
  assert.deepEqual(alert?.sources, ['BBC', 'Reuters']);
  assert.equal(selectGeoAlert(items, now, new Set(['a', 'b'])), null);
  assert.equal(selectGeoAlert([geo('c', 2, 'elevated')], now), null);
});

test('tagHeadline covers global indices and currencies', () => {
  assert.deepEqual(tagHeadline('S&P 500 and Nasdaq hit records as Wall Street rallies'), ['SPX', 'NDX']);
  assert.deepEqual(tagHeadline('Nikkei slides as yen strengthens after BoJ comments'), [
    'N225',
    'JPY',
    MACRO_TAG,
  ]);
  assert.deepEqual(tagHeadline('Sterling and the euro weaken against the greenback'), ['DXY', 'EUR', 'GBP']);
  assert.deepEqual(tagHeadline('Hang Seng jumps; Straits Times Index flat'), ['HSI', 'STI']);
});

test('detectGeoAlert treats questions and speculation as elevated, not high', () => {
  assert.equal(detectGeoAlert('Mengapa Kanada bersiap menghadapi invasi militer AS?'), 'elevated');
  assert.equal(detectGeoAlert('Could China invade Taiwan next year?'), 'elevated');
  assert.equal(detectGeoAlert('Analysts warn of full-scale invasion risk'), 'elevated');
  assert.equal(detectGeoAlert('Russia launches full-scale invasion'), 'high');
});
