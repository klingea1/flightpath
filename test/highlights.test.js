import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickHighlights } from '../js/highlights.js';

const base = {
  year: 2026, species: 300, homeRegion: { code: 'US-MI', species: 240 }, previousYearSpecies: 0,
  regions: ['US-MI'], bigDay: { species: 10 }, longestStreak: 1,
  firstYearOnEbird: false, lifers: [], daysAfield: 50, locations: 12, counties: 3,
};
const labels = (s) => pickHighlights(s).map((h) => h.label);

test('home state year list leads, then the most notable achievements', () => {
  const h = labels({ ...base, longestStreak: 115, lifers: Array(132).fill('x'), previousYearSpecies: 290 });
  assert.deepEqual(h, ['Michigan year list', 'Longest streak', 'Lifers', 'Versus 2025']);
});

test('the state list is skipped when it equals the year total', () => {
  const h = labels({ ...base, homeRegion: { code: 'US-MI', species: 300 } });
  assert.ok(!h.includes('Michigan year list'));
  assert.equal(h.length, 4);
});

test('a light year still gets four lines from the fallbacks', () => {
  assert.deepEqual(labels({ ...base, species: 40, homeRegion: { code: 'US-MI', species: 40 } }),
    ['Biggest day', 'Days afield', 'Places birded', 'Counties birded']);
});

test('growth over last year shows as a gain', () => {
  const h = pickHighlights({ ...base, previousYearSpecies: 200 });
  assert.ok(h.some((x) => x.label === 'Versus 2025' && x.value === '+100 species'));
});
