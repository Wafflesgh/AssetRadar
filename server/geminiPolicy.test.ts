/**
 * geminiPolicy.test.ts — Tests for the Gemini fallback rules: model chain from env, error
 * classification (429 / quota, 503, 404, bad key), quota rest time from retryDelay, and the
 * cooldown table that skips resting models.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyGeminiError, DEFAULT_GEMINI_MODELS, geminiModels, ModelCooldown, quotaRestMs } from './geminiPolicy.ts';

test('model chain: default, or GEMINI_MODELS without junk or duplicates', () => {
  assert.deepEqual(geminiModels({}), DEFAULT_GEMINI_MODELS);
  assert.deepEqual(geminiModels({ GEMINI_MODELS: ' gemini-a , gemini-b,gemini-a,, bad model! ' }), ['gemini-a', 'gemini-b']);
});

test('errors are classified so the next model is tried only when it can help', () => {
  assert.equal(classifyGeminiError({ status: 429, message: 'Too many requests' }), 'quota');
  assert.equal(classifyGeminiError(new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}')), 'quota');
  assert.equal(classifyGeminiError(new Error('You exceeded your current quota')), 'quota');
  assert.equal(classifyGeminiError({ status: 503, message: 'The model is overloaded' }), 'overloaded');
  assert.equal(classifyGeminiError(new Error('models/x is not found for API version v1beta')), 'notFound');
  assert.equal(classifyGeminiError(new Error('API key not valid. Please pass a valid API key.')), 'auth');
  assert.equal(classifyGeminiError({ status: 400, message: 'INVALID_ARGUMENT' }), 'badRequest');
  assert.equal(classifyGeminiError(new Error('socket hang up')), 'other');
});

test('quota rest time follows retryDelay, daily quotas rest an hour', () => {
  assert.equal(quotaRestMs(new Error('"retryDelay": "37s"')), 37_000);
  assert.equal(quotaRestMs(new Error('Please retry in 2.5s')), 5000); // at least 5 s
  assert.equal(quotaRestMs(new Error('Quota exceeded for metric generate_requests_per_model_per_day (PerDay)')), 3600_000);
  assert.equal(quotaRestMs(new Error('429')), 60_000);
});

test('cooldown skips resting models and frees them later', () => {
  const c = new ModelCooldown();
  const models = ['a', 'b', 'c'];
  c.rest('a', 60_000, 1000);
  assert.deepEqual(c.order(models, 2000), ['b', 'c']);
  assert.deepEqual(c.order(models, 62_000), ['a', 'b', 'c']);
  c.rest('b', 10_000, 0);
  c.rest('c', 10_000, 0);
  c.rest('a', 10_000, 0);
  assert.deepEqual(c.order(models, 5000), []); // all resting → caller uses its non-AI text
  assert.deepEqual(c.snapshot(5000).map((x) => x.model).sort(), ['a', 'b', 'c']);
});
