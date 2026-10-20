/**
 * sbnRetail.test.ts — Tests for the SBN Ritel page reader with text shaped like the official
 * DJPPR pages: series codes (old typo numbers ignored), fixed and floating coupons, maturity,
 * offering period from the structure table or the timeline, min / max order, tradability,
 * distribution partners, offering status and the saved history.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentCodes, extractCms, mergeSbnHistory, parseDateRange, parseSbnPage, partnerHosts, sbnStatus, SBN_PAGES } from './sbnRetail.ts';

const page = (type: string) => SBN_PAGES.find((p) => p.type === type)!;

const ORI_LINES = [
  'Pemerintah kembali menawarkan ORI dengan seri ORI030T3 dan ORI030T6.',
  'Berbentuk tanpa warkat (scripless) dan dapat diperdagangkan antar Investor Domestik',
  'Kupon tetap (fixed rate)',
  'Tenor, Jatuh Tempo ORI030T3, 3 Tahun, 15 Juli 2029 ORI030T6, 6 Tahun, 15 Juli 2032',
  'Masa Penawaran 6 Juli - 30 Juli 2026',
  'Maksimum Pemesanan ORI030T3 Rp5 miliar ORI030T6 Rp10 miliar',
  'Minimum Pemesanan Rp1 juta dan kelipatan Rp1 juta',
  'Setelmen/Penerbitan 5 Agustus 2026',
  'Kupon ORI030T3',
  '6,90% p.a.',
  'Kupon ORI030T6',
  '7,00% p.a.',
  '6 Juli 2026 (09.00 WIB) Pembukaan Masa Penawaran ORI029T3 dan ORI029T6',
  '30 Juli 2026 (10.00 WIB) Penutupan',
];

test('ORI page: fixed coupons, maturities, period, orders, tradable', () => {
  const [t3, t6] = parseSbnPage(page('ORI'), ORI_LINES);
  assert.equal(t3.code, 'ORI030T3'); // the ORI029 typo in the timeline is ignored
  assert.equal(t3.couponPct, 6.9);
  assert.equal(t6.couponPct, 7);
  assert.equal(t3.couponType, 'fixed');
  assert.equal(t3.tenorYears, 3);
  assert.equal(t6.maturity, '2032-07-15');
  assert.deepEqual([t3.offerStart, t3.offerEnd, t3.closeTime], ['2026-07-06', '2026-07-30', '10.00 WIB']);
  assert.equal(t3.settlement, '2026-08-05');
  assert.equal(t3.minOrder, 1_000_000);
  assert.equal(t3.maxOrder, 5e9);
  assert.equal(t6.maxOrder, 10e9);
  assert.equal(t3.tradable, true);
});

test('Sukuk Tabungan page: floating with floor, "Rp5 miliar (ST016T2)", timeline period', () => {
  const lines = [
    'Tidak dapat diperdagangkan / dialihkan',
    'Kupon Imbalan ST016 bersifat Mengambang (floating with floor) sebesar 6,05% p.a. (ST016T2) dan 6,25% p.a. (ST016T4)',
    'Maksimum Pemesanan Rp5 miliar (ST016T2) Rp10 miliar (ST016T4)',
    'Minimum Pemesanan Rp1 juta',
    'Tenor, Jatuh Tempo ST016T2, 10 Juni 2028 ST016T4, 10 Mei 2030',
    '8 Mei - 3 Juni 2026 Masa Penawaran',
    '10 Juni 2026 Setelmen/Penerbitan',
    'Early redemption tanpa dikenakan biaya oleh pemerintah',
  ];
  const [t2, t4] = parseSbnPage(page('ST'), lines);
  assert.equal(t2.couponPct, 6.05);
  assert.equal(t4.couponPct, 6.25);
  assert.equal(t2.couponType, 'floatingFloor');
  assert.equal(t2.maxOrder, 5e9);
  assert.equal(t4.maxOrder, 10e9);
  assert.equal(t4.maturity, '2030-05-10');
  assert.deepEqual([t2.offerStart, t2.offerEnd], ['2026-05-08', '2026-06-03']);
  assert.equal(t2.tradable, false);
  assert.equal(t2.earlyRedemption, true);
  assert.equal(t2.sharia, true);
});

test('single-series page (waqf sukuk): unlimited maximum, maturity without the code', () => {
  const lines = ['Minimum pemesanan Rp1 Juta Maksimum pemesanan tidak terbatas', 'Tenor 2 tahun', 'Imbalan floating with floor', 'Imbalan SWR007', '6,70%', '4 September - 21 Oktober 2026 Masa Penawaran', '10 Oktober 2028 Jatuh tempo'];
  const [s] = parseSbnPage(page('SWR'), lines);
  assert.equal(s.code, 'SWR007');
  assert.equal(s.couponPct, 6.7);
  assert.equal(s.tenorYears, 2);
  assert.equal(s.maxUnlimited, true);
  assert.equal(s.maxOrder, null);
  assert.equal(s.maturity, '2028-10-10');
});

test('missing fields stay empty; no series → nothing', () => {
  const [s] = parseSbnPage(page('SR'), ['Imbalan SR025T3', 'SR025T3 memiliki tenor 3 tahun']);
  assert.equal(s.couponPct, null);
  assert.equal(s.maturity, null);
  assert.equal(s.offerStart, null);
  assert.deepEqual(parseSbnPage(page('SR'), ['Tidak ada seri']), []);
  assert.deepEqual(currentCodes('SBR', 'SBR015T2 SBR015T4 SBR014T2'), ['SBR015T2', 'SBR015T4']);
});

test('date ranges, CMS text, partners, status and history', () => {
  assert.deepEqual(parseDateRange('28 September 2026 - 22 Oktober 2026'), { start: '2026-09-28', end: '2026-10-22' });
  assert.equal(parseDateRange('22 Oktober 2026'), null);
  const cms = JSON.stringify([{ rows: [{ modules: [{ htmlContent: '<p>Kupon&nbsp;<b>ORI030T3</b></p>', linkUrl: 'https://bibit.id/' }, { text: 'x', url: 'https://www.youtube.com/watch?v=1' }] }] }]);
  const { lines, links } = extractCms(cms);
  assert.deepEqual(lines, ['Kupon ORI030T3', 'x']);
  assert.deepEqual(partnerHosts([...links, 'https://www.bca.co.id/', 'https://djppr.kemenkeu.go.id/x', 'not a url']), ['bca.co.id', 'bibit.id']);
  const s = { offerStart: '2026-09-28', offerEnd: '2026-10-22' };
  assert.equal(sbnStatus(s, '2026-10-20'), 'open');
  assert.equal(sbnStatus(s, '2026-09-01'), 'upcoming');
  assert.equal(sbnStatus(s, '2026-10-23'), 'closed');
  assert.equal(sbnStatus({ offerStart: null, offerEnd: null }, '2026-10-20'), 'unknown');
  const [a] = parseSbnPage(page('ORI'), ORI_LINES);
  const old = { ...a, code: 'ORI029T3', offerStart: '2026-01-05' };
  const merged = mergeSbnHistory([old, { ...a, couponPct: 1 }], [a]);
  assert.deepEqual(merged.map((x) => x.code), ['ORI030T3', 'ORI029T3']);
  assert.equal(merged[0].couponPct, 6.9); // the fresh reading wins
});
