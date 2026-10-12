import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv, parseEbirdExport, parseTime, normalizeDate } from '../js/parse.js';
import { speciesKey, computeYear, availableYears } from '../js/stats.js';
import { pickPersona } from '../js/persona.js';

const HEADER =
  'Submission ID,Common Name,Scientific Name,Taxonomic Order,Count,State/Province,County,Location ID,Location,Latitude,Longitude,Date,Time,Protocol,Duration (Min),All Obs Reported,Distance Traveled (km)';

function csv(lines) {
  return [HEADER, ...lines].join('\r\n');
}

test('parseCsv handles quoted commas, escaped quotes, and CRLF', () => {
  const rows = parseCsv('a,b\r\n"x, y","say ""hi"""\r\n');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'say "hi"']]);
});

test('time and date formats', () => {
  assert.equal(parseTime('06:45 PM'), 18 * 60 + 45);
  assert.equal(parseTime('12:10 AM'), 10);
  assert.equal(parseTime('07:30'), 450);
  assert.equal(parseTime(''), null);
  assert.equal(normalizeDate('04/07/2026'), '2026-04-07');
});

test('speciesKey drops spuhs, slashes, hybrids, domestics and merges subspecies groups', () => {
  assert.equal(speciesKey('gull sp.'), null);
  assert.equal(speciesKey('Downy/Hairy Woodpecker'), null);
  assert.equal(speciesKey('Mallard x American Black Duck (hybrid)'), null);
  assert.equal(speciesKey('Mallard (Domestic type)'), null);
  assert.equal(speciesKey('Yellow-rumped Warbler (Myrtle)'), 'Yellow-rumped Warbler');
  assert.equal(speciesKey('Blue Jay'), 'Blue Jay');
});

test('missing columns give a friendly error', () => {
  assert.throws(() => parseEbirdExport('foo,bar\n1,2'), /eBird data export/);
});

test('km distances convert to miles; X counts parse as null', () => {
  const rows = parseEbirdExport(csv([
    'S1,Blue Jay,Cyanocitta cristata,1,X,US-MI,Kent,L1,Spot,42.9,-85.6,2026-05-01,07:00 AM,eBird - Traveling Count,60,1,10',
  ]));
  assert.equal(rows[0].count, null);
  assert.ok(Math.abs(rows[0].distanceMi - 6.21371) < 1e-6);
  assert.equal(rows[0].protocol, 'traveling');
});

test('lifers count only species first seen in the chosen year', () => {
  const rows = parseEbirdExport(csv([
    'S1,Blue Jay,a,1,1,US-MI,Kent,L1,Spot,42.9,-85.6,2025-05-01,07:00,Stationary,30,1,',
    'S2,Blue Jay,a,1,1,US-MI,Kent,L1,Spot,42.9,-85.6,2026-05-01,07:00,Stationary,30,1,',
    'S2,Snowy Owl,b,2,1,US-MI,Kent,L1,Spot,42.9,-85.6,2026-05-01,07:00,Stationary,30,1,',
    'S2,gull sp.,c,3,1,US-MI,Kent,L1,Spot,42.9,-85.6,2026-05-01,07:00,Stationary,30,1,',
  ]));
  assert.deepEqual(availableYears(rows), [2026, 2025]);
  const s = computeYear(rows, 2026);
  assert.equal(s.species, 2);
  assert.deepEqual(s.lifers, ['Snowy Owl']);
  assert.equal(s.firstYearOnEbird, false);
});

test('streaks, big day, and effort totals', () => {
  const rows = parseEbirdExport(csv([
    'S1,Blue Jay,a,1,1,US-MI,Kent,L1,A,42.9,-85.6,2026-05-01,07:00,Traveling,60,1,1.609344',
    'S2,Blue Jay,a,1,1,US-MI,Kent,L1,A,42.9,-85.6,2026-05-02,07:00,Traveling,30,1,',
    'S2,Mallard,b,2,1,US-MI,Kent,L1,A,42.9,-85.6,2026-05-02,07:00,Traveling,30,1,',
    'S3,Blue Jay,a,1,1,US-MI,Kent,L2,B,43.0,-85.7,2026-05-03,18:00,Stationary,30,1,',
    'S4,Blue Jay,a,1,1,US-MI,Kent,L2,B,43.0,-85.7,2026-05-10,18:00,Stationary,30,1,',
  ]));
  const s = computeYear(rows, 2026);
  assert.equal(s.checklists, 4);
  assert.equal(s.hours, 2.5);
  assert.ok(Math.abs(s.miles - 1) < 1e-6);
  assert.equal(s.longestStreak, 3);
  assert.deepEqual(s.bigDay, { date: '2026-05-02', species: 2 });
  assert.equal(s.locations, 2);
});

test('persona: lakeshore trips win when they dominate', () => {
  const lines = [];
  for (let i = 1; i <= 10; i++) {
    const county = i <= 4 ? 'Ottawa' : 'Kent';
    lines.push(`S${i},Blue Jay,a,1,1,US-MI,${county},L${i},Spot ${i},42.9,-85.6,2026-05-${String(i).padStart(2, '0')},12:00,Stationary,30,1,`);
  }
  const p = pickPersona(computeYear(parseEbirdExport(csv(lines)), 2026));
  assert.equal(p.id, 'lakeshore');
  assert.equal(p.evidence.length, 3);
});

test('persona: fewer than five checklists is a Fledgling', () => {
  const rows = parseEbirdExport(csv([
    'S1,Blue Jay,a,1,1,US-MI,Kent,L1,A,42.9,-85.6,2026-05-01,07:00,Traveling,60,1,',
  ]));
  assert.equal(pickPersona(computeYear(rows, 2026)).id, 'fledgling');
});

test('demo export parses end to end', () => {
  const rows = parseEbirdExport(readFileSync(new URL('../samples/demo.csv', import.meta.url), 'utf8'));
  const s = computeYear(rows, 2026);
  assert.equal(s.checklists, 45);
  assert.equal(s.species, 10);
  assert.equal(pickPersona(s).id, 'generalist');
});
