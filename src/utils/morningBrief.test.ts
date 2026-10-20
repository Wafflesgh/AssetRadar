/**
 * morningBrief.test.ts — Tests for the morning brief: assembly from sample data (in tests only,
 * never in the app), headline selection (geo alerts and policy news over price reports,
 * duplicates removed, old news dropped), the 07:30 WIB schedule and the Telegram text.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { briefDateFor, briefToText, buildBrief, pickTopNews, type BriefInput, type BriefQuote } from './morningBrief.ts';
import type { MarketNewsItem } from '../config/assets.ts';

const NOW = Date.UTC(2026, 9, 21, 0, 40); // 07:40 WIB, Wed 21 Oct 2026
const q = (code: string, changePct: number | null, group: BriefQuote['group'] = 'index'): BriefQuote => ({ code, name: code, group, price: 100, changePct, display: '100.00' });
const news = (id: string, title: string, hoursAgo: number, over: Partial<MarketNewsItem> = {}): MarketNewsItem => ({
  id,
  title,
  link: `https://example.com/${id}`,
  source: 'Example',
  publishedAt: '',
  publishedAtMs: NOW - hoursAgo * 3600_000,
  assetTags: [],
  sentiment: 'Neutral',
  ...over,
});

test('top news: geo alerts and policy news first, duplicates and old stories dropped', () => {
  const items = [
    news('1', 'Bitcoin price rises 2% today', 1, { assetTags: ['BTC'] }),
    news('2', 'Bank Indonesia cuts interest rate to 5.5%', 3, { assetTags: ['MACRO', 'JCI'] }),
    news('3', 'Bank Indonesia cuts interest rate to 5.5% - Reuters', 2, { assetTags: ['MACRO'] }),
    news('4', 'War breaks out as army invades neighbour', 5, { geoAlert: 'high' }),
    news('5', 'Fed raises rates again', 30),
  ];
  const top = pickTopNews(items, NOW, 5);
  assert.equal(top[0].id, '4');
  assert.ok(['2', '3'].includes(top[1].id));
  assert.equal(top.filter((n) => n.id === '2' || n.id === '3').length, 1, 'one copy of the same story');
  assert.ok(!top.some((n) => n.id === '5'), 'older than 18 h');
});

test('schedule: today from 07:30 WIB, yesterday before', () => {
  assert.deepEqual(briefDateFor(NOW), { date: '2026-10-21', ready: true });
  assert.deepEqual(briefDateFor(Date.UTC(2026, 9, 21, 0, 29)), { date: '2026-10-20', ready: false });
  assert.deepEqual(briefDateFor(Date.UTC(2026, 9, 20, 18, 0)), { date: '2026-10-20', ready: false }, '01:00 WIB on the 21st');
});

test('brief assembly from sample data', () => {
  const input: BriefInput = {
    date: '2026-10-21',
    generatedAt: NOW,
    wallStreet: [q('SPX', 1.0), q('NDX', 1.4)],
    asia: [q('N225', -0.2)],
    ihsg: q('JCI', 0.5),
    movers: [q('BTC', 5, 'crypto'), q('ETH', -4, 'crypto'), q('BBCA', 1, 'idStock'), q('X', null)],
    rates: [q('USD', 0.1, 'forex')],
    gold: q('GOLD', -0.3, 'commodity'),
    events: [
      { symbol: 'TLKM.JK', type: 'earnings', date: '2026-10-21' },
      { symbol: 'BBCA.JK', type: 'exDividend', date: '2026-10-21', amount: 50 },
    ],
    priority: ['BBCA.JK'],
    codeOf: (s) => s.replace('.JK', ''),
    macro: [{ label: 'BI-Rate', value: '5.50%', date: '2026-10-15' }],
    news: [news('2', 'Bank Indonesia cuts interest rate', 3, { assetTags: ['MACRO'] })],
    forward: { saved: 330, evaluated: 0, lastRunDate: '2026-10-20' },
  };
  const b = buildBrief(input);
  assert.equal(b.sections[0].id, 'overview');
  // Same facts in Indonesian
  const id = buildBrief({ ...input, lang: 'id' });
  assert.match(id.sections[0].lines[0], /^Wall Street ditutup naik tajam. Pasar Asia sejauh ini turun./);
  assert.equal(id.sections.find((s) => s.id === 'calendar')?.lines[0], '★ BBCA: ex-dividen (50 per saham)');
  assert.match(briefToText(id), /^Ringkasan pagi AssetRadar/);
  assert.match(b.sections[0].lines[0], /Wall Street closed strongly higher\. Asian markets are lower so far\. The IHSG ended the last session higher/);
  const cal = b.sections.find((s) => s.id === 'calendar');
  assert.deepEqual(cal?.lines, ['★ BBCA: ex-dividend (50 per share)', 'TLKM: earnings report'], 'watchlist/portfolio first');
  const movers = b.sections.find((s) => s.id === 'movers');
  assert.equal(movers?.lines[0], 'Up: BTC +5.00%, BBCA +1.00%, ETH -4.00%');
  assert.equal(b.headline, 'IHSG +0.50% · Wall Street strongly higher · 2026-10-21');
  const text = briefToText(b, 'https://example.run.app/');
  assert.ok(text.startsWith('AssetRadar morning brief — 2026-10-21'));
  assert.ok(text.includes('https://example.run.app/#/brief'));
  assert.ok(text.endsWith(b.disclaimer));
});

test('empty data still gives a readable brief', () => {
  const b = buildBrief({
    date: '2026-10-21',
    generatedAt: NOW,
    wallStreet: [],
    asia: [],
    ihsg: null,
    movers: [],
    rates: [],
    gold: null,
    events: [],
    priority: [],
    codeOf: (s) => s,
    macro: [],
    news: [],
    forward: null,
  });
  assert.equal(b.sections[0].lines[0], 'Market data is unavailable right now.');
  assert.equal(b.headline, 'Morning brief · 2026-10-21');
});
