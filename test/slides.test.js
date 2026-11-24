import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEbirdExport } from '../js/parse.js';
import { computeYear } from '../js/stats.js';
import { pickPersona } from '../js/persona.js';
import { buildCards } from '../js/slides.js';
import { buildPlaces } from '../js/places.js';

const demo = parseEbirdExport(readFileSync(new URL('../samples/demo.csv', import.meta.url), 'utf8'));

test('clock card shows the peak hour and only appears with enough timed checklists', () => {
  const s = computeYear(demo, 2026);
  const cards = buildCards(s, pickPersona(s), null).join('');
  assert.match(cards, /card-clock/);
  assert.match(cards, /was your hour/);
  const few = { ...s, startHours: [9, ...Array(23).fill(0)] };
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

test('a one-checklist cover says "1 checklist"', () => {
  const s = computeYear(demo, 2026);
  const html = buildCards({ ...s, checklists: 1 }, pickPersona(s), null)[0];
  assert.match(html, /1 checklist &middot;/);
});

test('the common-bird quip names no place and goes to anyone with a common No. 1', () => {
  const s = computeYear(demo, 2026);
  const p = pickPersona(s);
  const top = (name) => [{ name, checklists: 20, share: 0.5 }, { name: 'Blue Jay', checklists: 10, share: 0.25 }];
  const quip = /<p class="quip"[^>]*>Same as basically everyone\.<\/p>/;
  assert.match(buildCards({ ...s, kentShare: 0, topSpeciesList: top('American Robin') }, p, null).join(''), quip);
  assert.doesNotMatch(buildCards({ ...s, topSpeciesList: top('Canada Goose') }, p, null).join(''), /Kent County\.<\/p>/);
  assert.doesNotMatch(buildCards({ ...s, topSpeciesList: top('Snowy Owl') }, p, null).join(''), quip);
  assert.doesNotMatch(buildCards({ ...s, checklists: 3, topSpeciesList: top('American Robin') }, p, null).join(''), quip);
});

test('a tie for top bird is named and shares its rank', () => {
  const s = computeYear(demo, 2026);
  const top = [
    { name: 'Canada Goose', checklists: 29, share: 0.4 },
    { name: 'Mallard', checklists: 29, share: 0.4 },
    { name: 'Blue Jay', checklists: 12, share: 0.2 },
  ];
  const html = buildCards({ ...s, topSpeciesList: top }, pickPersona(s), null).join('');
  assert.match(html, /tied with Mallard/);
  assert.match(html, /<span class="rank">1<\/span><span class="rank-name">Mallard/);
  assert.match(html, /<span class="rank">3<\/span><span class="rank-name">Blue Jay/);
});

test('a first year on eBird skips the lifers card', () => {
  const s = computeYear(demo, 2026);
  const p = pickPersona(s);
  const lifers = [{ name: 'Snowy Owl', date: '2026-01-04' }];
  assert.match(buildCards({ ...s, liferList: lifers, firstYearOnEbird: false }, p, null).join(''), /card-lifers/);
  assert.doesNotMatch(buildCards({ ...s, liferList: lifers, firstYearOnEbird: true }, p, null).join(''), /card-lifers/);
});

test('the summary shows three highlights and the effort line', () => {
  const s = computeYear(demo, 2026);
  const cards = buildCards(s, pickPersona(s), null);
  const summary = cards[cards.length - 1];
  assert.match(summary, /card-summary/);
  assert.equal(summary.match(/class="sum-label"/g).length, 3);
  assert.match(summary, /class="sum-effort"/);
});

test('the Summary path connects the dots: dots land first, then each arc draws in turn', () => {
  const s = computeYear(demo, 2026);
  const places = buildPlaces(s.lists);
  const cards = buildCards(s, pickPersona(s), places);
  const summary = cards.at(-1);
  assert.match(summary, /card-summary/);
  const dots = [...summary.matchAll(/<circle data-fx="dot" style="--d:(\d+)ms" data-pins="([\d ]+)"/g)];
  const arcs = [...summary.matchAll(/data-fx="draw" style="--d:(\d+)ms;--dur:(\d+)ms"/g)].map((m) => [+m[1], +m[2]]);
  assert.ok(dots.length >= 2 && arcs.length >= 1, `${dots.length} dots, ${arcs.length} arcs`);
  const named = dots.flatMap((d) => d[2].split(' ').map(Number));
  assert.deepEqual(named.sort((a, b) => a - b), places.pins.map((_, i) => i), 'every map pin lands on exactly one dot');
  const lastDot = Math.max(...dots.map((d) => +d[1]));
  assert.ok(lastDot < arcs[0][0], 'every dot is in place before the first arc draws');
  for (let i = 1; i < arcs.length; i++) assert.ok(arcs[i][0] > arcs[i - 1][0], 'arcs draw one after another');
  const end = Math.max(...arcs.map(([d, dur]) => d + dur));
  assert.ok(end <= 2700, `the path is drawn by ${end} ms`);
  // The cover keeps its quick all-at-once drawing.
  const cover = cards[0];
  assert.ok(+cover.match(/data-fx="draw" style="--d:(\d+)ms/)[1] < 300);
});
