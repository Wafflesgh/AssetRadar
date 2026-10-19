/** riskProfiles.test.ts — Tests for questionnaire scoring, profile thresholds, allocations and the capital split. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RISK_QUESTIONS,
  PROFILE_ALLOCATIONS,
  PROFILE_IDS,
  scoreAnswers,
  profileForScore,
  profileForAnswers,
  isCompleteAnswers,
  allocationTotal,
  parseCustomAllocation,
  splitCapital,
  parseAmountInput,
  formatAmountInput,
} from './riskProfiles.ts';

test('there are 7 questions with 4 options each', () => {
  assert.equal(RISK_QUESTIONS.length, 7);
  for (const q of RISK_QUESTIONS) assert.equal(q.options.length, 4);
});

test('scoreAnswers sums complete answers and rejects incomplete or invalid ones', () => {
  assert.equal(scoreAnswers([1, 1, 1, 1, 1, 1, 1]), 7);
  assert.equal(scoreAnswers([4, 4, 4, 4, 4, 4, 4]), 28);
  assert.equal(scoreAnswers([2, 3, 1, 4, 2, 3, 1]), 16);
  assert.equal(scoreAnswers([1, 1, 1, 1, 1, 1]), null);
  assert.equal(scoreAnswers([1, 1, 1, 1, 1, 1, null]), null);
  assert.equal(scoreAnswers([1, 1, 1, 1, 1, 1, 5]), null);
  assert.equal(scoreAnswers([1, 1, 1, 1, 1, 1, 0]), null);
  assert.equal(scoreAnswers([1, 1, 1, 1, 1, 1, 2.5]), null);
  assert.equal(isCompleteAnswers([1, 2, 3, 4, 1, 2, 3]), true);
});

test('profileForScore uses the 7–13 / 14–20 / 21–28 thresholds', () => {
  assert.equal(profileForScore(7), 'conservative');
  assert.equal(profileForScore(13), 'conservative');
  assert.equal(profileForScore(14), 'moderate');
  assert.equal(profileForScore(20), 'moderate');
  assert.equal(profileForScore(21), 'aggressive');
  assert.equal(profileForScore(28), 'aggressive');
});

test('profileForAnswers maps answers to a profile', () => {
  assert.equal(profileForAnswers([2, 2, 2, 2, 2, 2, 1]), 'conservative'); // 13
  assert.equal(profileForAnswers([2, 2, 2, 2, 2, 2, 2]), 'moderate'); // 14
  assert.equal(profileForAnswers([3, 3, 3, 3, 3, 3, 3]), 'aggressive'); // 21
  assert.equal(profileForAnswers([3, 3]), null);
});

test('every sample allocation sums to 100% and matches the spec', () => {
  for (const id of PROFILE_IDS) assert.equal(allocationTotal(PROFILE_ALLOCATIONS[id]), 100);
  assert.deepEqual(PROFILE_ALLOCATIONS.moderate, { moneyMarket: 20, bonds: 25, gold: 15, stocks: 35, crypto: 5 });
  assert.equal(PROFILE_ALLOCATIONS.conservative.crypto, 0);
});

test('parseCustomAllocation accepts only valid 100% allocations', () => {
  const ok = { moneyMarket: 30, bonds: 30, gold: 20, stocks: 20, crypto: 0 };
  assert.deepEqual(parseCustomAllocation(ok), ok);
  assert.equal(parseCustomAllocation({ ...ok, crypto: 5 }), null);
  assert.equal(parseCustomAllocation({ ...ok, gold: -10, stocks: 50 }), null);
  assert.equal(parseCustomAllocation({ moneyMarket: 100 }), null);
  assert.equal(parseCustomAllocation(null), null);
});

test('splitCapital splits by percentage and always adds up to the capital', () => {
  const split = splitCapital(10_000_000, PROFILE_ALLOCATIONS.moderate);
  assert.deepEqual(split, { moneyMarket: 2_000_000, bonds: 2_500_000, gold: 1_500_000, stocks: 3_500_000, crypto: 500_000 });
  const odd = splitCapital(1_000_001, PROFILE_ALLOCATIONS.aggressive);
  assert.equal(Object.values(odd).reduce((s, v) => s + v, 0), 1_000_001);
  assert.equal(splitCapital(999, PROFILE_ALLOCATIONS.conservative).crypto, 0);
  assert.equal(Object.values(splitCapital(0, PROFILE_ALLOCATIONS.moderate)).every((v) => v === 0), true);
});

test('amount input keeps digits only and formats thousands', () => {
  assert.equal(parseAmountInput('Rp1,500,000'), 1_500_000);
  assert.equal(parseAmountInput(''), 0);
  assert.equal(formatAmountInput(1_500_000), '1,500,000');
  assert.equal(formatAmountInput(0), '');
});
