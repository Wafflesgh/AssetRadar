/** portfolioChange.test.ts — Quote-change calculation and missing-data coverage. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { portfolioChange } from './portfolioChange.ts';
test('110 at +10% gives 10', () => assert.deepEqual(portfolioChange([{ valueIdr: 110, changePct24h: 10 }]), { total: 10, excluded: 0 }));
test('missing data is excluded', () => assert.deepEqual(portfolioChange([{ valueIdr: 110, changePct24h: 10 }, { valueIdr: 20 }, { changePct24h: 5 }]), { total: 10, excluded: 2 }));
test('no usable data returns null, including invalid denominators', () => assert.deepEqual(portfolioChange([{}, { valueIdr: 10, changePct24h: -100 }]), { total: null, excluded: 2 }));
