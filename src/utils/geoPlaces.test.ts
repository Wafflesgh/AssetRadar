/** geoPlaces.test.ts — conflict headlines are placed on the map by the places they name. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { locateHeadline } from './geoPlaces.ts';

test('a headline is placed where it happens, in English and Indonesian', () => {
  assert.deepEqual(locateHeadline('Iran launches missiles at Israel').map((p) => p.id), ['iran', 'israel']);
  assert.deepEqual(locateHeadline('Rusia serang Kyiv dengan drone').map((p) => p.id), ['ukraine', 'russia']);
  assert.deepEqual(locateHeadline('Korea Utara tembakkan rudal balistik').map((p) => p.id), ['nkorea']);
  assert.deepEqual(locateHeadline('Houthi attack ship in Red Sea', 1).map((p) => p.id), ['yemen']);
});

test('a headline naming no known place gets no dot, and short words do not match inside others', () => {
  assert.deepEqual(locateHeadline('Markets fall as war fears grow'), []);
  assert.deepEqual(locateHeadline('Indian Ocean storm hits Iranian-flagged bus'), []);
});
