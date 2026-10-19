/** sentiment.test.ts — Tests for IDX trading hours, relative time, headline tone and RSS parsing. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isIdxMarketOpen, formatRelativeTime, formatAge } from './marketHours.ts';
import {
  classifyHeadlineSentiment,
  computeMarketSentiment,
  parseRssItems,
} from './sentiment.ts';

test('isIdxMarketOpen correctly identifies IDX trading hours (Mon-Fri 09:00-16:00 WIB)', () => {
  // Wednesday 10:30 WIB -> 03:30 UTC
  const wedOpen = Date.UTC(2026, 9, 21, 3, 30, 0);
  assert.equal(isIdxMarketOpen(wedOpen), true);

  // Wednesday 17:00 WIB -> 10:00 UTC (after close)
  const wedClosed = Date.UTC(2026, 9, 21, 10, 0, 0);
  assert.equal(isIdxMarketOpen(wedClosed), false);

  // Sunday 11:00 WIB -> 04:00 UTC (weekend)
  const sunClosed = Date.UTC(2026, 9, 18, 4, 0, 0);
  assert.equal(isIdxMarketOpen(sunClosed), false);
});

test('formatRelativeTime formats elapsed seconds and minutes in English', () => {
  const now = 1_000_000;
  assert.equal(formatRelativeTime(now - 1000, now), 'updated just now');
  assert.equal(formatRelativeTime(now - 5000, now), 'updated 5 seconds ago');
  assert.equal(formatRelativeTime(now - 60_000, now), 'updated 1 minute ago');
  assert.equal(formatRelativeTime(now - 120_000, now), 'updated 2 minutes ago');
});

test('classifyHeadlineSentiment uses whole words in English and Indonesian', () => {
  assert.equal(classifyHeadlineSentiment('Bitcoin Surges to a New Record High'), 'Bullish');
  assert.equal(classifyHeadlineSentiment('Harga Bitcoin Menguat dan Cetak Rekor Baru'), 'Bullish');
  assert.equal(classifyHeadlineSentiment('Jakarta Stocks Fall as Global Selloff Deepens'), 'Bearish');
  assert.equal(classifyHeadlineSentiment('IHSG Melemah di Tengah Koreksi Pasar Global'), 'Bearish');
  // "highlight", "inflation", "risk" and "high" must not trigger a tone
  assert.equal(
    classifyHeadlineSentiment('Market Highlight: Inflation Data and Risk Appetite at High Levels'),
    'Neutral'
  );
  // Partial words like "gainsay" / "kenaikan" must not match "gain" / "naik"
  assert.equal(classifyHeadlineSentiment('Analysts Gainsay Central Bank Kenaikan Plan'), 'Neutral');

  const result = computeMarketSentiment({
    assetName: 'Bitcoin',
    symbol: 'BTC/IDR',
    changePct24h: 4.2,
    price: 1500000000,
    high24h: 1510000000,
    low24h: 1420000000,
    news: [
      {
        id: '1',
        title: 'Bitcoin Rallies on Strong Inflows',
        link: 'https://example.com/1',
        source: 'Reuters',
        publishedAt: 'Today',
        sentiment: 'Bullish',
      },
    ],
  });

  assert.equal(result.label, 'Bullish');
  assert.ok(result.score >= 58);
  assert.match(result.summary, /^Market sentiment for Bitcoin/);
});

test('parseRssItems parses RSS XML feed into structured MarketNewsItem array', () => {
  const sampleXml = `
    <rss version="2.0">
      <channel>
        <item>
          <title>Gold Price Climbs to a Fresh Record Today - Reuters</title>
          <link>https://news.example.com/gold-1</link>
          <pubDate>Mon, 19 Oct 2026 02:00:00 GMT</pubDate>
          <source>Reuters</source>
        </item>
      </channel>
    </rss>
  `;
  const parsed = parseRssItems(sampleXml);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].title, 'Gold Price Climbs to a Fresh Record Today');
  assert.equal(parsed[0].source, 'Reuters');
  assert.equal(parsed[0].sentiment, 'Bullish');
  assert.match(parsed[0].publishedAt, /WIB$/);
});

test('formatAge gives a compact news age', () => {
  const now = 10_000_000;
  assert.equal(formatAge(now - 3000, now), 'now');
  assert.equal(formatAge(now - 45_000, now), '45s');
  assert.equal(formatAge(now - 3 * 60_000, now), '3m');
  assert.equal(formatAge(now - 2 * 3600_000, now), '2h');
  assert.equal(formatAge(now - 30 * 3600_000, now), '1d');
  assert.equal(formatAge(undefined, now), '—');
});

test('parseRssItems keeps the full title when the feed source is known', () => {
  const xml = `<rss><channel><item>
    <title><![CDATA[Gold rallies - analysts see more upside ahead]]></title>
    <link>https://feed.example.com/a</link>
    <pubDate>Mon, 19 Oct 2026 02:00:00 GMT</pubDate>
  </item></channel></rss>`;
  const [parsed] = parseRssItems(xml, 5, { sourceName: 'FXStreet' });
  assert.equal(parsed.title, 'Gold rallies - analysts see more upside ahead');
  assert.equal(parsed.source, 'FXStreet');
});

test('parseRssItems strips the Google News source suffix from short titles', () => {
  const xml = `<rss><channel><item>
    <title>Egypt enters the war - Arab News</title>
    <link>https://news.google.com/a</link>
    <source url="https://arabnews.com">Arab News</source>
  </item></channel></rss>`;
  assert.equal(parseRssItems(xml)[0].title, 'Egypt enters the war');
});
