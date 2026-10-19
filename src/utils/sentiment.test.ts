import test from 'node:test';
import assert from 'node:assert/strict';
import { isIdxMarketOpen, formatRelativeTimeId } from './marketHours.ts';
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

test('formatRelativeTimeId formats elapsed seconds and minutes in Indonesian', () => {
  const now = 1_000_000;
  assert.equal(formatRelativeTimeId(now - 1000, now), 'diperbarui baru saja');
  assert.equal(formatRelativeTimeId(now - 5000, now), 'diperbarui 5 detik lalu');
  assert.equal(formatRelativeTimeId(now - 120_000, now), 'diperbarui 2 menit lalu');
});

test('classifyHeadlineSentiment uses word boundaries and excludes inflasi, risk, and high', () => {
  assert.equal(
    classifyHeadlineSentiment('Harga Bitcoin Menguat dan Cetak Rekor Baru'),
    'Bullish'
  );
  assert.equal(
    classifyHeadlineSentiment('IHSG Melemah di Tengah Koreksi Pasar Global'),
    'Bearish'
  );
  // "highlight", "inflasi", "risk", and "high" must not trigger false sentiment
  assert.equal(
    classifyHeadlineSentiment('Market Highlight: Data Inflasi dan Risk Appetite di Level High'),
    'Netral'
  );
  // Partial substring like "naikkan" should not match whole word "naik"
  assert.equal(
    classifyHeadlineSentiment('Bank Sentral Kenaikan Suku Bunga Acuan'),
    'Netral'
  );

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
        title: 'Bitcoin Menguat Tajam Didorong Arus Inflow',
        link: 'https://example.com/1',
        source: 'Kompas',
        publishedAt: 'Hari ini',
        sentiment: 'Bullish',
      },
    ],
  });

  assert.equal(result.label, 'Bullish');
  assert.ok(result.score >= 58);
});

test('parseRssItems parses RSS XML feed into structured MarketNewsItem array', () => {
  const sampleXml = `
    <rss version="2.0">
      <channel>
        <item>
          <title>Harga Emas Menguat Hari Ini - Kontan.co.id</title>
          <link>https://news.example.com/emas-1</link>
          <pubDate>Mon, 19 Oct 2026 02:00:00 GMT</pubDate>
          <source>Kontan.co.id</source>
        </item>
      </channel>
    </rss>
  `;
  const parsed = parseRssItems(sampleXml);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].title, 'Harga Emas Menguat Hari Ini');
  assert.equal(parsed[0].source, 'Kontan.co.id');
  assert.equal(parsed[0].sentiment, 'Bullish');
});
