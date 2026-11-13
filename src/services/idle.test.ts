/** idle.test.ts — The page counts as idle only after 30 minutes without input. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { IDLE_AFTER_MS, isIdleAt } from './idle.ts';

test('idle after 30 minutes without input, not before', () => {
  assert.equal(isIdleAt(0, IDLE_AFTER_MS - 1), false);
  assert.equal(isIdleAt(0, IDLE_AFTER_MS), true);
});
