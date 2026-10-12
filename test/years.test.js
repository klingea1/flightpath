import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportYear, defaultYear } from '../js/years.js';

const day = (iso) => new Date(iso + 'T12:00:00');

test('January and February report on the year that just ended', () => {
  assert.equal(reportYear(day('2027-01-05')), 2026);
  assert.equal(reportYear(day('2027-02-28')), 2026);
  assert.equal(reportYear(day('2027-03-01')), 2027);
  assert.equal(reportYear(day('2026-12-31')), 2026);
});

test('an export with a few days of the new year still opens on last year', () => {
  assert.equal(defaultYear([2027, 2026, 2025], day('2027-01-05')), 2026);
  assert.equal(defaultYear([2026, 2025], day('2026-10-12')), 2026);
});

test('falls back to the newest year at or before the target', () => {
  assert.equal(defaultYear([2027, 2024], day('2027-01-05')), 2024);
  assert.equal(defaultYear([2027], day('2027-01-05')), 2027);
});
