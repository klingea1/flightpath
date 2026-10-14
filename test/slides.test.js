import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEbirdExport } from '../js/parse.js';
import { computeYear } from '../js/stats.js';
import { pickPersona } from '../js/persona.js';
import { buildCards } from '../js/slides.js';

const demo = parseEbirdExport(readFileSync(new URL('../samples/demo.csv', import.meta.url), 'utf8'));

test('clock card shows the peak hour and only appears with enough timed checklists', () => {
  const s = computeYear(demo, 2026);
  const cards = buildCards(s, pickPersona(s), null).join('');
  assert.match(cards, /card-clock/);
  assert.match(cards, /was your hour/);
  const few = { ...s, lists: s.lists.slice(0, 9) };
  assert.doesNotMatch(buildCards(few, pickPersona(s), null).join(''), /card-clock/);
});

test('arrivals and welcome back cards need enough entries', () => {
  const s = computeYear(demo, 2026);
  const p = pickPersona(s);
  const arrivals = [
    { name: 'Gray Catbird', date: '2026-04-27', lastYear: '2025-04-30', shift: -3 },
    { name: 'Red-eyed Vireo', date: '2026-05-06', lastYear: '2025-05-10', shift: -4 },
    { name: 'Common Grackle', date: '2026-03-11', lastYear: '2025-03-06', shift: 5 },
  ];
  const html = buildCards({ ...s, arrivals, homeRegionName: 'Michigan' }, p, null).join('');
  assert.match(html, /card-arrivals/);
  assert.match(html, /4 days earlier/);
  assert.match(html, /5 days later/);
  assert.doesNotMatch(buildCards({ ...s, arrivals: arrivals.slice(0, 2) }, p, null).join(''), /card-arrivals/);

  const welcomeBack = [
    { name: 'Snowy Owl', date: '2026-12-20', since: '2022-06-01' },
    { name: 'Red Crossbill', date: '2026-02-03', since: '2023-02-01' },
  ];
  const wb = buildCards({ ...s, welcomeBack }, p, null).join('');
  assert.match(wb, /2 old friends returned/);
  assert.match(wb, /first since Jun 2022/);
  assert.doesNotMatch(buildCards({ ...s, welcomeBack: welcomeBack.slice(0, 1) }, p, null).join(''), /card-welcome/);
});
