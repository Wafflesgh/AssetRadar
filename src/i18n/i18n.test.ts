/**
 * i18n.test.ts — Tests for the two-language system: the Indonesian dictionary has exactly the
 * English keys, every {placeholder} appears in both languages, no empty texts, interpolation and
 * the English fallback.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { en } from './en.ts';
import { id } from './id.ts';
import { interpolate, translate, type TranslationKey } from './index.ts';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('Indonesian has exactly the English keys', () => {
  const enKeys = Object.keys(en).sort();
  const idKeys = Object.keys(id).sort();
  assert.deepEqual(idKeys.filter((k) => !(k in en)), [], 'extra keys in id.ts');
  assert.deepEqual(enKeys.filter((k) => !(k in id)), [], 'missing keys in id.ts');
});

test('placeholders match and no text is empty', () => {
  for (const key of Object.keys(en) as TranslationKey[]) {
    assert.ok(en[key].trim().length > 0, `empty English text: ${key}`);
    assert.ok(id[key].trim().length > 0, `empty Indonesian text: ${key}`);
    assert.deepEqual(placeholders(id[key]), placeholders(en[key]), `placeholders differ: ${key}`);
  }
});

test('interpolation and fallback', () => {
  assert.equal(interpolate('{a} and {b}', { a: 1, b: 'x' }), '1 and x');
  assert.equal(interpolate('{missing}', {}), '{missing}');
  assert.equal(translate('id', 'common.tryAgain'), 'Coba lagi');
  assert.equal(translate('en', 'common.tryAgain'), 'Try again');
  assert.equal(translate('id', 'nav.savedCount', { count: 3 }), '3 tersimpan');
  assert.equal(translate('id', 'no.such.key' as TranslationKey), 'no.such.key');
});
