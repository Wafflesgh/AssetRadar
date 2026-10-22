/** macroImpact.test.ts — Tests for the macro "what does it mean" readings and their texts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { IMPACT_BY_SERIES, IMPACT_CONCEPTS, IMPACT_INFO, IMPACT_RELATED, IMPACT_RELATED_BY_SERIES, impactBullets, impactReading } from './macroImpact.ts';
import { en } from '../i18n/en.ts';
import { id } from '../i18n/id.ts';

const monthly = (values: number[]) => values.map((value, i) => ({ date: `20${String(16 + Math.floor(i / 12)).padStart(2, '0')}-${String((i % 12) + 1).padStart(2, '0')}-01`, value }));

test('every concept has both chains in English and Indonesian with the same number of bullets', () => {
  for (const c of IMPACT_CONCEPTS) {
    for (const dir of ['up', 'down']) {
      const key = `impact.${c}.${dir}` as keyof typeof en;
      assert.ok(en[key], `missing en ${key}`);
      assert.ok(id[key], `missing id ${key}`);
      assert.equal(impactBullets(en[key]).length, impactBullets(id[key]!).length, key);
    }
  }
  for (const c of Object.values(IMPACT_BY_SERIES)) assert.ok(IMPACT_CONCEPTS.includes(c));
  for (const c of IMPACT_CONCEPTS) {
    for (const field of ['what', 'scopeWhy', 'up.sum', 'down.sum']) {
      const key = `impact.${c}.${field}` as keyof typeof en;
      assert.ok(en[key] && id[key], `missing ${key}`);
    }
    assert.ok(IMPACT_INFO[c], `no info for ${c}`);
  }
});

test('every concept has dated links and a chain to other cards that exist', () => {
  const known = new Set([...Object.keys(IMPACT_BY_SERIES), 'riceThai', 'coalAustralia']);
  for (const c of IMPACT_CONCEPTS) {
    for (const field of ['link', 'chain']) {
      const key = `impact.${c}.${field}` as keyof typeof en;
      assert.ok(en[key] && id[key], `missing ${key}`);
    }
    assert.equal(impactBullets(en[`impact.${c}.link` as keyof typeof en]).length, impactBullets(id[`impact.${c}.link` as keyof typeof en]!).length, c);
    for (const target of IMPACT_RELATED[c]) assert.ok(known.has(target), `${c} links to unknown card ${target}`);
  }
  for (const [seriesId, targets] of Object.entries(IMPACT_RELATED_BY_SERIES)) {
    assert.ok(en[`impact.s.${seriesId}.chain` as keyof typeof en] && seriesId in IMPACT_BY_SERIES, seriesId);
    for (const target of targets) assert.ok(known.has(target), `${seriesId} links to unknown card ${target}`);
  }
});

test('every foreign-funds indicator has an explanation whose good direction matches the server', async () => {
  const { SEKI_FLOWS } = await import('./macro.ts');
  for (const x of SEKI_FLOWS) {
    const c = IMPACT_BY_SERIES[x.id];
    assert.ok(c, `no concept for ${x.id}`);
    assert.equal(IMPACT_INFO[c].good, x.higherIsBetter === null ? null : x.higherIsBetter ? 'up' : 'down', x.id);
    assert.ok(en[`macro.s.${x.id}` as keyof typeof en] && id[`macro.s.${x.id}` as keyof typeof en], `no label for ${x.id}`);
  }
});

test('every extra World Bank indicator has an explanation whose good direction matches the server', async () => {
  const { WB_EXTRA } = await import('./macro.ts');
  for (const x of WB_EXTRA) {
    const c = IMPACT_BY_SERIES[x.id];
    assert.ok(c, `no concept for ${x.id}`);
    const good = IMPACT_INFO[c].good;
    const expected = x.higherIsBetter === null ? null : x.higherIsBetter ? 'up' : 'down';
    if (c !== 'inflation') assert.equal(good, expected, x.id);
    assert.ok(en[`macro.s.${x.id}` as keyof typeof en] && id[`macro.s.${x.id}` as keyof typeof en], `no label for ${x.id}`);
  }
});

test('sentiment for Indonesia follows the direction that is good for Indonesia', () => {
  const high = monthly([...Array(40).fill(4), ...Array(10).fill(6), 6]);
  // High BI-Rate: tight money is unfavourable for growth
  assert.equal(impactReading('biRate', high)?.sentiment, 'strongNegative');
  // High nickel price: good for Indonesia
  assert.equal(impactReading('nickel', high)?.sentiment, 'strongPositive');
  // Imports and gold have good and bad sides
  assert.equal(impactReading('imports', high)?.sentiment, 'mixed');
  assert.equal(impactReading('goldMonthly', high)?.sentiment, 'mixed');
  // Near average and unchanged: no clear effect
  const flat = monthly(Array.from({ length: 41 }, (_, i) => (i >= 39 ? 3 : 3 + (i % 2 ? 0.2 : -0.2))));
  assert.equal(impactReading('gdpYoy', flat)?.sentiment, 'neutral');
  assert.equal(IMPACT_INFO.fedFunds.scope, 'global');
  assert.equal(IMPACT_INFO.rate.scope, 'indonesia');
});

test('a high level picks the "up" chain even when the latest move is down', () => {
  const r = impactReading('biRate', monthly([...Array(40).fill(4), ...Array(10).fill(6), 5.9]));
  assert.equal(r?.concept, 'rate');
  assert.equal(r?.level, 'high');
  assert.equal(r?.trend, 'falling');
  assert.equal(r?.active, 'up');
});

test('a normal level follows the latest move; unknown ids have no reading', () => {
  const vals = Array.from({ length: 40 }, (_, i) => 3 + (i % 2 ? 0.2 : -0.2));
  const r = impactReading('inflationYoy', monthly([...vals, 2.9, 3.0]));
  assert.equal(r?.level, 'normal');
  assert.equal(r?.active, 'up');
  assert.equal(impactReading('unknownSeries', monthly([1, 2])), null);
  assert.equal(impactReading('usdIdr', [])?.active, null);
});
