// Writes a large synthetic eBird export for performance testing, shaped like
// a real "Download My Data" file: two decades of heavy birding, mostly around
// Grand Rapids with trips elsewhere, quoted comments, "X" counts, and shared
// group checklists. No real person's data.
//
//   node tools/make-big-export.mjs <out.csv> [years=20] [checklistsPerYear=1000]

import { createWriteStream } from 'node:fs';

const [out, yearsArg = '20', perYearArg = '1000'] = process.argv.slice(2);
if (!out) {
  console.error('usage: node tools/make-big-export.mjs <out.csv> [years] [checklistsPerYear]');
  process.exit(1);
}
const YEARS = Number(yearsArg);
const PER_YEAR = Number(perYearArg);
const LAST_YEAR = 2026;

// Deterministic randomness, so runs are comparable.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rand() * a.length)];

const COMMON = [
  'Canada Goose', 'Mallard', 'American Robin', 'Northern Cardinal', 'Blue Jay', 'Black-capped Chickadee',
  'American Crow', 'Mourning Dove', 'European Starling', 'House Sparrow', 'Song Sparrow', 'Red-winged Blackbird',
  'American Goldfinch', 'Downy Woodpecker', 'Red-bellied Woodpecker', 'Ring-billed Gull', 'White-breasted Nuthatch',
  'Tufted Titmouse', 'Northern Flicker', 'Cedar Waxwing', 'House Finch', 'Common Grackle', 'Red-tailed Hawk',
  'Great Blue Heron', 'Turkey Vulture', 'Killdeer', 'Barn Swallow', 'Tree Swallow', 'Chipping Sparrow', 'Gray Catbird',
];
// A long tail of less common species, so lifers and one-offs keep appearing.
const TAIL = Array.from({ length: 520 }, (_, i) => `Synthetic Warbler ${String(i + 1).padStart(3, '0')}`);
const ODD = ['gull sp.', 'Downy/Hairy Woodpecker', 'Mallard (Domestic type)', 'Yellow-rumped Warbler (Myrtle)'];

const HOME = Array.from({ length: 180 }, (_, i) => ({
  id: `L${100000 + i}`,
  name: i % 7 === 0 ? `Backyard ${i} (${(42.9 + rand() * 0.3).toFixed(3)}, ${(-85.7 + rand() * 0.3).toFixed(3)})` : `Kent hotspot ${i}`,
  state: 'US-MI', county: 'Kent', lat: 42.8 + rand() * 0.4, lng: -85.9 + rand() * 0.5,
}));
const AWAY = [
  ['US-OH', 'Lucas', 41.63, -83.19], ['CA-ON', 'Essex', 41.93, -82.51], ['US-AZ', 'Cochise', 31.45, -110.3],
  ['US-FL', 'Monroe', 24.7, -81.1], ['US-TX', 'Hidalgo', 26.2, -98.2], ['US-MN', 'St. Louis', 47.2, -92.6],
].flatMap(([state, county, lat, lng], k) => Array.from({ length: 12 }, (_, i) => ({
  id: `L${200000 + k * 100 + i}`, name: `${county} spot ${i}`, state, county,
  lat: lat + (rand() - 0.5) * 0.6, lng: lng + (rand() - 0.5) * 0.6,
})));

const HEADER = 'Submission ID,Common Name,Scientific Name,Taxonomic Order,Count,State/Province,County,Location ID,Location,Latitude,Longitude,Date,Time,Protocol,Duration (Min),All Obs Reported,Distance Traveled (km),Area Covered (ha),Number of Observers,Breeding Code,Observation Details,Checklist Comments,ML Catalog Numbers';
const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

const stream = createWriteStream(out);
stream.write(HEADER + '\n');
let sub = 1;
let rows = 0;
for (let y = LAST_YEAR - YEARS + 1; y <= LAST_YEAR; y++) {
  for (let n = 0; n < PER_YEAR; n++) {
    const away = rand() < 0.08;
    const loc = away ? pick(AWAY) : pick(HOME);
    const month = 1 + Math.floor(rand() * 12);
    const dayOfMonth = 1 + Math.floor(rand() * 28);
    const date = `${y}-${String(month).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;
    const h = 5 + Math.floor(rand() * 14);
    const time = `${String(h % 12 || 12).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
    const traveling = rand() < 0.6;
    const protocol = traveling ? 'eBird - Traveling Count' : rand() < 0.8 ? 'eBird - Stationary Count' : 'eBird - Casual Observation';
    const dur = 10 + Math.floor(rand() * 180);
    const dist = traveling ? (rand() * 6).toFixed(3) : '';
    const observers = rand() < 0.6 ? 1 : 1 + Math.floor(rand() * 8);
    const comment = rand() < 0.3 ? q(`Windy, "quiet" morning, ${Math.floor(rand() * 40)}F`) : '';
    const count = 8 + Math.floor(rand() * 22);
    const species = new Set();
    while (species.size < count) species.add(rand() < 0.75 ? pick(COMMON) : rand() < 0.97 ? pick(TAIL) : pick(ODD));
    const id = `S${String(sub++).padStart(9, '0')}`;
    let chunk = '';
    let tax = 0;
    for (const sp of species) {
      const c = rand() < 0.05 ? 'X' : String(1 + Math.floor(rand() * 20));
      chunk += [id, q(sp), 'Synthetica avis', ++tax, c, loc.state, q(loc.county), loc.id, q(loc.name),
        loc.lat.toFixed(5), loc.lng.toFixed(5), date, time, protocol, dur, rand() < 0.9 ? 1 : 0, dist, '', observers,
        '', '', comment, ''].join(',') + '\n';
      rows++;
    }
    stream.write(chunk);
  }
}
stream.end(() => console.log(`wrote ${out}: ${rows.toLocaleString()} rows, ${(sub - 1).toLocaleString()} checklists`));
