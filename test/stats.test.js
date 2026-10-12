import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv, parseEbirdExport, parseTime, normalizeDate } from '../js/parse.js';
import { speciesKey, computeYear, availableYears } from '../js/stats.js';
import { pickPersona } from '../js/persona.js';
import { isZip, csvFromZip } from '../js/unzip.js';

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
  assert.equal(s.checklists, 49);
  assert.equal(s.species, 14);
  assert.deepEqual(s.seenOnce.map((b) => b.name), ['Baltimore Oriole', 'Yellow Warbler', 'Scarlet Tanager', 'Sandhill Crane']);
  assert.equal(s.grind.durationMin, 160);
  assert.equal(pickPersona(s).id, 'generalist');
});

test('reads the CSV out of eBird zips, deflated or stored', async () => {
  const demo = readFileSync(new URL('fixtures/small.csv', import.meta.url), 'utf8');
  for (const name of ['ebird-deflated.zip', 'ebird-stored.zip']) {
    const bytes = new Uint8Array(readFileSync(new URL(`fixtures/${name}`, import.meta.url)));
    assert.ok(isZip(bytes));
    assert.equal(await csvFromZip(bytes), demo, name);
  }
  assert.equal(isZip(new TextEncoder().encode(demo)), false);
});

test('a zip without a CSV gives a friendly error', async () => {
  const bytes = new Uint8Array(readFileSync(new URL('fixtures/no-csv.zip', import.meta.url)));
  await assert.rejects(csvFromZip(bytes), /no CSV/);
});

test('first checklist, top birds, spot-only species, and months', () => {
  const rows = parseEbirdExport(csv([
    'S2,Mallard,b,452,1,US-MI,Kent,L1,Home,42.9,-85.6,2026-01-01,09:00,Stationary,30,1,',
    'S1,Blue Jay,a,19500,1,US-MI,Kent,L1,Home,42.9,-85.6,2026-01-01,07:00,Stationary,30,1,',
    'S1,Canada Goose,c,390,1,US-MI,Kent,L1,Home,42.9,-85.6,2026-01-01,07:00,Stationary,30,1,',
    'S3,Blue Jay,a,19500,1,US-MI,Kent,L1,Home,42.9,-85.6,2026-05-04,07:00,Stationary,30,1,',
    'S3,Snowy Owl,d,11500,1,US-MI,Kent,L1,Home,42.9,-85.6,2026-05-04,07:00,Stationary,30,1,',
    'S4,Blue Jay,a,19500,1,US-MI,Kent,L2,Away,43.0,-85.7,2026-05-05,07:00,Stationary,30,1,',
    'S4,Mallard,b,452,1,US-MI,Kent,L2,Away,43.0,-85.7,2026-05-05,07:00,Stationary,30,1,',
  ]));
  const s = computeYear(rows, 2026);
  // Earliest by time, species in taxonomic order.
  assert.equal(s.firstList.startMin, 7 * 60);
  assert.deepEqual(s.firstList.species, ['Canada Goose', 'Blue Jay']);
  assert.deepEqual(s.topSpeciesList.map((b) => b.name), ['Blue Jay', 'Mallard', 'Canada Goose', 'Snowy Owl']);
  assert.equal(s.topSpecies.name, 'Blue Jay');
  assert.equal(s.topLocation.name, 'Home');
  assert.deepEqual(s.topLocation.only, ['Canada Goose', 'Snowy Owl']);
  assert.equal(s.monthly[0], 2);
  assert.equal(s.monthly[4], 2);
});

test('grind skips incomplete, short, and incidental lists', () => {
  const rows = parseEbirdExport(csv([
    // Incomplete stakeout: long, one species, but not all birds reported.
    'S1,Snowy Owl,a,1,1,US-MI,Kent,L1,A,42.9,-85.6,2026-01-03,10:00,Stationary,240,0,',
    // Short and slow, but under an hour.
    'S2,Blue Jay,b,2,1,US-MI,Kent,L1,A,42.9,-85.6,2026-01-04,10:00,Stationary,50,1,',
    // The real grind: 120 minutes for 2 species.
    'S3,Blue Jay,b,2,1,US-MI,Kent,L1,A,42.9,-85.6,2026-01-05,10:00,Traveling,120,1,1',
    'S3,Mallard,c,3,1,US-MI,Kent,L1,A,42.9,-85.6,2026-01-05,10:00,Traveling,120,1,1',
    // A faster list: 90 minutes for 3 species.
    'S4,Blue Jay,b,2,1,US-MI,Kent,L1,A,42.9,-85.6,2026-01-06,10:00,Traveling,90,1,1',
    'S4,Mallard,c,3,1,US-MI,Kent,L1,A,42.9,-85.6,2026-01-06,10:00,Traveling,90,1,1',
    'S4,Canada Goose,d,1,1,US-MI,Kent,L1,A,42.9,-85.6,2026-01-06,10:00,Traveling,90,1,1',
  ]));
  const s = computeYear(rows, 2026);
  assert.equal(s.grind.date, '2026-01-05');
  assert.deepEqual(s.seenOnce.map((b) => b.name), ['Snowy Owl', 'Canada Goose']);
});

test('location names lose coordinates and get readable separators', async () => {
  const { displayLocation } = await import('../js/stats.js');
  assert.equal(displayLocation('Michigan 66 (42.766, -85.074)'), 'Michigan 66');
  assert.equal(displayLocation('Inspiration Point Trailhead (45.219, -84.389)'), 'Inspiration Point Trailhead');
  assert.equal(displayLocation('Sax-Zim Bog--Correction Line Rd. lek'), 'Sax-Zim Bog – Correction Line Rd. lek');
  assert.equal(displayLocation('42.9485, -85.5921', 'Kent'), 'Somewhere in Kent County');
  assert.equal(displayLocation('Grand Rapids, Kent County, Michigan, US (42.948, -85.592)'), 'Grand Rapids, Kent County, Michigan, US');
  assert.equal(displayLocation('stakeout Crested Caracara, Olivet (2026)'), 'stakeout Crested Caracara, Olivet (2026)');
  assert.equal(displayLocation('Kanaha Beach Park (20.9, -156.441)'), 'Kanaha Beach Park');
  assert.equal(displayLocation('Free Soil Road towards Campground (44.142, -86.4)'), 'Free Soil Road towards Campground');
  assert.equal(displayLocation('Trail mile 1.5'), 'Trail mile 1.5');
});

test('persona: a three-week streak is not enough for Daily Devotee', () => {
  const lines = [];
  for (let i = 1; i <= 21; i++) {
    lines.push(`S${i},Blue Jay,a,1,1,US-MI,Kent,L${i % 3},Spot ${i % 3},42.9,-85.6,2026-03-${String(i).padStart(2, '0')},12:00,Traveling,30,1,1`);
  }
  assert.notEqual(pickPersona(computeYear(parseEbirdExport(csv(lines)), 2026)).id, 'streak');
});

test('same-day lifers are ordered by checklist time', () => {
  const rows = parseEbirdExport(csv([
    'S2,Vermilion Flycatcher,a,30000,1,US-AZ,Pima,L2,B,32.2,-110.9,2026-10-10,04:30 PM,Traveling,60,1,1',
    'S1,Cactus Wren,b,35000,1,US-AZ,Pima,L1,A,32.2,-110.9,2026-10-10,08:00 AM,Traveling,60,1,1',
  ]));
  assert.deepEqual(computeYear(rows, 2026).lifers, ['Cactus Wren', 'Vermilion Flycatcher']);
});

const OBS_HEADER = 'Submission ID,Common Name,Scientific Name,Taxonomic Order,Count,State/Province,County,Location ID,Location,Latitude,Longitude,Date,Time,Protocol,Duration (Min),All Obs Reported,Distance Traveled (km),Number of Observers';
function partyYear(sizes) {
  // Varied times and three spots, so no other persona stands out.
  const times = ['07:30', '12:00', '18:30'];
  const lines = sizes.map((n, i) =>
    `S${i},Blue Jay,a,1,1,US-MI,Kent,L${i % 3},Spot ${i % 3},42.9,-85.6,2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + 2 * Math.floor(i / 12)).padStart(2, '0')},${times[i % 3]},Traveling,30,1,1,${n}`);
  return computeYear(parseEbirdExport([OBS_HEADER, ...lines].join('\n')), 2026);
}

test('party size: solo birders are Lone Wanderers, group birders Field Trip Regulars', () => {
  assert.equal(pickPersona(partyYear(Array(20).fill(1))).id, 'lone');
  assert.equal(pickPersona(partyYear([...Array(10).fill(6), ...Array(10).fill(1)])).id, 'flock');
  const s = partyYear([1, 1, 2, 5]);
  assert.equal(s.shares.solo, 0.5);
  assert.equal(s.shares.company, 0.5);
  assert.equal(s.shares.group, 0.25);
});

test('exports without party size never trigger the party personas', () => {
  const s = computeYear(parseEbirdExport(readFileSync(new URL('../samples/demo.csv', import.meta.url), 'utf8')), 2026);
  assert.equal(s.shares.observersKnown, 0);
  assert.ok(!['lone', 'flock'].includes(pickPersona(s).id));
});
