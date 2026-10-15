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
  assert.deepEqual(h, ['Michigan year list', 'Longest streak', 'Lifers']);
});

test('the state list is skipped when it equals the year total', () => {
  const h = labels({ ...base, homeRegion: { code: 'US-MI', species: 300 } });
  assert.ok(!h.includes('Michigan year list'));
  assert.equal(h.length, 3);
});

test('a light year still gets three lines from the fallbacks', () => {
  assert.deepEqual(labels({ ...base, species: 40, homeRegion: { code: 'US-MI', species: 40 } }),
    ['Biggest day', 'Days afield', 'Places birded']);
});

test('a biggest day that was the whole year is left out', () => {
  assert.ok(!labels({ ...base, species: 10, homeRegion: null }).includes('Biggest day'));
});

test('a single county is never a highlight', () => {
  const light = { ...base, species: 40, homeRegion: null, bigDay: null, counties: 1, longestStreak: 3 };
  assert.ok(!labels(light).includes('Counties birded'));
  assert.equal(labels(light).length, 3);
});

test('growth over last year shows as a gain', () => {
  const h = pickHighlights({ ...base, previousYearSpecies: 200 });
  assert.ok(h.some((x) => x.label === 'Versus 2025' && x.value === '+100 species'));
});
