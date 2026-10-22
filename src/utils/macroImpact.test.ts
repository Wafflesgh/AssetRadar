/** macroImpact.test.ts — Tests for the macro "what does it mean" readings and their texts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { IMPACT_BY_SERIES, IMPACT_CONCEPTS, impactBullets, impactReading } from './macroImpact.ts';
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
