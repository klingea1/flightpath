import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEbirdExport } from '../js/parse.js';
import { computeYear, availableYears } from '../js/stats.js';
import { pickPersona } from '../js/persona.js';
import { buildPlaces } from '../js/places.js';
import { buildCards } from '../js/slides.js';
import { pack, unpack, deckHash, decodeDeck, hashPayload } from '../js/share.js';

const fixture = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

function packed(text) {
  const rows = parseEbirdExport(text);
  const s = computeYear(rows, Math.max(...availableYears(rows)));
  return pack(s, buildPlaces(s.lists), pickPersona(s));
}

const render = (deck) => buildCards(deck.stats, deck.persona, deck.places).join('');
const LINK_BASE = 'https://klingea1.github.io/flightpath/';

test('a deck link rebuilds exactly the cards its owner sees', async () => {
  const files = ['../samples/demo.csv', '../test/fixtures/travel.csv',
    ...readdirSync(new URL('./fixtures/edge/', import.meta.url))
      .filter((f) => !['header-only.csv', 'not-ebird.csv'].includes(f))
      .map((f) => `./fixtures/edge/${f}`)];
  for (const f of files) {
    const p = packed(fixture(f));
    const hash = await deckHash(p);
    const opened = await decodeDeck(hashPayload(hash));
    assert.deepEqual(opened, JSON.parse(JSON.stringify(p)), f);
    assert.equal(render(unpack(opened)), render(unpack(p)), f);
  }
});

test('the same deck always draws the same flight path', () => {
  const p = packed(fixture('../samples/demo.csv'));
  assert.deepEqual(unpack(p).places.sequence, unpack(p).places.sequence);
});

test('places keep their visit counts, months, and home', () => {
  const rows = parseEbirdExport(fixture('../test/fixtures/travel.csv'));
  const s = computeYear(rows, 2026);
  const places = buildPlaces(s.lists);
  const back = unpack(pack(s, places, pickPersona(s))).places;
  const total = (pl) => pl.pins.reduce((n, x) => n + x.visits, 0);
  assert.equal(total(back), total(places));
  assert.equal(back.homeRegion.code, places.homeRegion.code);
  assert.deepEqual(back.trips.map((t) => t.code), places.trips.map((t) => t.code));
  const months = (pl) => [...new Set(pl.sequence.map((v) => v.date.slice(5, 7)))].sort();
  assert.deepEqual(months(back), months(places));
});

test('a link carries no exact coordinates or raw checklists', async () => {
  const p = packed(fixture('../samples/demo.csv'));
  const text = JSON.stringify(await decodeDeck(hashPayload(await deckHash(p))));
  assert.doesNotMatch(text, /42\.9\d{2}|-85\.\d{3}/);
  assert.ok(!('lists' in p));
});

test('a heavy year still fits in a Discord message', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'flightpath-share-'));
  try {
    const out = join(dir, 'big.csv');
    execFileSync(process.execPath, [new URL('../tools/make-big-export.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), out, '2', '1000']);
    const link = LINK_BASE + await deckHash(packed(readFileSync(out, 'utf8')));
    assert.ok(link.length < 2000, `link is ${link.length} characters`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('broken links are refused', async () => {
  assert.equal(hashPayload('#other=1'), null);
  assert.equal(hashPayload(''), null);
  const hash = await deckHash(packed(fixture('../samples/demo.csv')));
  await assert.rejects(decodeDeck(hashPayload(hash).slice(0, 40)));
  assert.throws(() => unpack({ v: 99 }));
});
