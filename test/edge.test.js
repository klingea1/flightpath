// Every odd export a member might bring either builds a full deck with no
// broken text, or fails with a readable message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseEbirdExport } from '../js/parse.js';
import { availableYears, computeYear } from '../js/stats.js';
import { pickPersona } from '../js/persona.js';
import { buildPlaces } from '../js/places.js';
import { buildCards } from '../js/slides.js';
import { defaultYear } from '../js/years.js';

const dir = new URL('fixtures/edge/', import.meta.url);
const EXPECTED_ERRORS = {
  'header-only.csv': /No observations/,
  'not-ebird.csv': /doesn't look like an eBird data export/,
};

for (const file of readdirSync(dir).filter((f) => f.endsWith('.csv'))) {
  test(`edge case: ${file}`, () => {
    const text = readFileSync(new URL(file, dir), 'utf8');
    if (EXPECTED_ERRORS[file]) {
      assert.throws(() => parseEbirdExport(text), EXPECTED_ERRORS[file]);
      return;
    }
    const rows = parseEbirdExport(text);
    const stats = computeYear(rows, defaultYear(availableYears(rows), new Date('2026-10-13T12:00:00')));
    const cards = buildCards(stats, pickPersona(stats), buildPlaces(stats.lists));
    assert.ok(cards.length >= 5, 'builds a deck');
    const visible = cards.join('\n').replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(visible, /NaN|undefined|Infinity|\bnull\b|\[object/);
  });
}
