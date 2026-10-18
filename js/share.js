// Shareable deck links. A deck packs down to just what its cards show, which
// is compressed into the link after the "#". Browsers never send that part to
// a server, so the link carries the deck without anything being uploaded:
// whoever opens it gets the same cards, rebuilt from the link alone.
//
// The deck on screen is always built from the packed form too (see app.js),
// so a link can't show anything the owner didn't see, and nothing beyond the
// cards (no raw checklists, no exact coordinates) is ever in it.

import { buildPlaces } from './places.js';
import { LIMITS } from './slides.js';

// Bump when the packed shape changes. Old links must keep opening, so an
// older version gets an upgrade path in unpack() rather than a rejection.
const VERSION = 1;

const round = (n, places = 0) => Number(n.toFixed(places));

// Dates are packed as days into the year: 1 is January 1.
const dayOf = (iso) => Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(iso.slice(0, 4) + '-01-01T00:00:00Z')) / 86400000) + 1;
const isoOf = (year, day) => new Date(Date.UTC(year, 0, day)).toISOString().slice(0, 10);

// A list cut to what its card shows, plus how long it really was.
const shown = (list, n) => [list.slice(0, n), list.length];
// Unpacked lists keep their real length so cards can say "and 12 more". The
// entries past what's shown were never in the link; they're empty.
const padded = ([items, total]) => [...items, ...Array(Math.max(0, total - items.length)).fill(null)];

// Places travel as grid cells with a visit count and the months they were
// visited, not as each checklist's place. The order of visits isn't in the
// link: it's regenerated from a seed, so the cover's flight path and the
// map's month-by-month tour are drawn the same way for everyone who opens it.
// Cells are coarser than the map's 2 km pins, which keeps links short and
// homes harder to place.
export const SHARE_GRID_DEG = 0.1; // about 10 km

// Small, fast, seeded random numbers (mulberry32).
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Packs places as [lat step, lng step, region, visits, month bits] per cell,
// with steps relative to the previous cell, and regions (state and county)
// in their own table.
export function packPlaces(places, step = SHARE_GRID_DEG) {
  if (!places) return null;
  const cells = new Map();
  places.sequence.forEach((v) => {
    const pin = places.pins[v.pin];
    const i = Math.round(pin.lat / step), j = Math.round(pin.lng / step);
    const key = `${i}:${j}`;
    let c = cells.get(key);
    if (!c) cells.set(key, (c = { i, j, visits: 0, months: 0, regions: new Map() }));
    c.visits++;
    c.months |= 1 << (Number(v.date.slice(5, 7)) - 1);
    // A cell takes the state and county most of its checklists were in.
    const region = `${pin.state || ''}|${pin.county || ''}`;
    c.regions.set(region, (c.regions.get(region) || 0) + 1);
  });
  const list = [...cells.values()].sort((a, b) => a.i - b.i || a.j - b.j);
  const regions = [];
  const flat = [];
  let [pi, pj] = [0, 0];
  for (const c of list) {
    const region = [...c.regions].sort((a, b) => b[1] - a[1])[0][0];
    if (!regions.includes(region)) regions.push(region);
    flat.push(c.i - pi, c.j - pj, regions.indexOf(region), c.visits, c.months);
    [pi, pj] = [c.i, c.j];
  }
  return { g: step, c: flat, r: regions.map((r) => r.split('|')) };
}

// Rebuilds places through the same code that made them, so home, trips, and
// the inset come out the same. Each cell's visits are spread over its months,
// and each month's visits are shuffled with the seed. Each place also sits at
// a seeded spot inside its cell, so a busy home area doesn't draw as a grid.
export function unpackPlaces(m, year, seed) {
  if (!m) return null;
  const random = seeded(seed);
  const nudge = () => (random() - 0.5) * 0.7 * m.g;
  const byMonth = Array.from({ length: 12 }, () => []);
  let [i, j] = [0, 0];
  for (let k = 0; k < m.c.length; k += 5) {
    i += m.c[k];
    j += m.c[k + 1];
    const [state, county] = m.r[m.c[k + 2]];
    const visits = m.c[k + 3];
    const months = [...Array(12).keys()].filter((mo) => m.c[k + 4] & (1 << mo));
    const place = { lat: i * m.g + nudge(), lng: j * m.g + nudge(), state, county };
    // Every visited month gets one visit; the rest go to the earliest months.
    months.forEach((mo, n) => {
      const share = Math.floor(visits / months.length) + (n < visits % months.length ? 1 : 0);
      for (let x = 0; x < share; x++) byMonth[mo].push(place);
    });
  }
  const visits = [];
  byMonth.forEach((list, mo) => {
    for (let k = list.length - 1; k > 0; k--) {
      const r = Math.floor(random() * (k + 1));
      [list[k], list[r]] = [list[r], list[k]];
    }
    const date = `${year}-${String(mo + 1).padStart(2, '0')}-01`;
    for (const p of list) visits.push({ ...p, date, startMin: 0 });
  });
  return buildPlaces(visits);
}

export function pack(stats, places, persona) {
  const s = stats;
  const day = dayOf;
  return {
    v: VERSION,
    y: s.year,
    c: s.checklists,
    sp: s.species,
    h: round(s.hours, 1),
    mi: round(s.miles, 1),
    da: s.daysAfield,
    lo: s.locations,
    co: s.counties,
    sc: s.soleCounty && [s.soleCounty.county || '', s.soleCounty.state || ''],
    st: s.longestStreak,
    py: s.previousYearSpecies,
    fy: s.firstYearOnEbird ? 1 : 0,
    rg: s.regions,
    hr: s.homeRegion && [s.homeRegion.code, s.homeRegion.species],
    hn: s.homeRegionName,
    sh: s.shares && [round(s.shares.company ?? 0, 2), round(s.shares.observersKnown ?? 0, 2)],
    bd: s.bigDay && [day(s.bigDay.date), s.bigDay.species],
    mo: s.monthly,
    hs: s.startHours,
    ks: round(s.kentShare, 2),
    ts: s.topSpeciesList.map((b) => [b.name, b.checklists, round(b.share, 3)]),
    fl: s.firstList && [day(s.firstList.date), s.firstList.startMin, s.firstList.location,
      ...shown(s.firstList.species, LIMITS.firstSpecies), s.firstList.dayChecklists, s.firstList.daySpecies],
    lf: shown(s.liferList.map((l) => [l.name, day(l.date)]), LIMITS.lifers),
    tl: s.topLocation && [s.topLocation.name, s.topLocation.checklists, s.topLocation.species, round(s.topLocation.share, 3),
      ...shown(s.topLocation.only, LIMITS.spotOnly)],
    so: shown(s.seenOnce.map((b) => [b.name, day(b.date), b.location]), LIMITS.seenOnce),
    gr: s.grind && [s.grind.durationMin, day(s.grind.date), s.grind.location, s.grind.species],
    ar: s.arrivals.map((a) => [a.name, day(a.date), a.shift]),
    wb: s.welcomeBack.map((b) => [b.name, day(b.date), b.since.slice(0, 7)]),
    p: [persona.id, persona.name, persona.blurb, persona.evidence],
    m: packPlaces(places),
  };
}

// Turns a packed deck back into the stats, places, and persona that
// buildCards and the map take. Only fields the cards read are filled in.
export function unpack(d) {
  if (!d || d.v !== VERSION) throw new Error("This link is from a newer Flight Path, or isn't a Flight Path link.");
  const y = d.y;
  const date = (n) => isoOf(y, n);
  const [lifers, liferCount] = d.lf;
  const stats = {
    year: y,
    checklists: d.c,
    species: d.sp,
    hours: d.h,
    miles: d.mi,
    daysAfield: d.da,
    locations: d.lo,
    counties: d.co,
    soleCounty: d.sc && { county: d.sc[0], state: d.sc[1] },
    longestStreak: d.st,
    previousYearSpecies: d.py,
    firstYearOnEbird: Boolean(d.fy),
    regions: d.rg,
    homeRegion: d.hr && { code: d.hr[0], species: d.hr[1] },
    homeRegionName: d.hn,
    shares: d.sh && { company: d.sh[0], observersKnown: d.sh[1] },
    bigDay: d.bd && { date: date(d.bd[0]), species: d.bd[1] },
    monthly: d.mo,
    startHours: d.hs,
    kentShare: d.ks,
    topSpeciesList: d.ts.map(([name, checklists, share]) => ({ name, checklists, share })),
    firstList: d.fl && {
      date: date(d.fl[0]), startMin: d.fl[1], location: d.fl[2],
      species: padded([d.fl[3], d.fl[4]]), dayChecklists: d.fl[5], daySpecies: d.fl[6],
    },
    liferList: padded([lifers.map(([name, n]) => ({ name, date: date(n) })), liferCount]),
    lifers: Array(liferCount).fill(null),
    topLocation: d.tl && {
      name: d.tl[0], checklists: d.tl[1], species: d.tl[2], share: d.tl[3], only: padded([d.tl[4], d.tl[5]]),
    },
    seenOnce: padded([d.so[0].map(([name, n, location]) => ({ name, date: date(n), location })), d.so[1]]),
    grind: d.gr && { durationMin: d.gr[0], date: date(d.gr[1]), location: d.gr[2], species: d.gr[3] },
    arrivals: d.ar.map(([name, n, shift]) => ({ name, date: date(n), shift })),
    welcomeBack: d.wb.map(([name, n, since]) => ({ name, date: date(n), since: `${since}-01` })),
  };
  const [id, name, blurb, evidence] = d.p;
  // The seed is just the year and checklist count: the same deck always draws the same way.
  return { stats, places: unpackPlaces(d.m, y, y * 100003 + d.c), persona: { id, name, blurb, evidence } };
}

// base64url, so the link needs no escaping.
function toBase64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const fromBase64Url = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

export async function encodeDeck(packed) {
  const json = new TextEncoder().encode(JSON.stringify(packed));
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeDeck(text) {
  const json = await pipe(fromBase64Url(text), new DecompressionStream('deflate-raw'));
  return JSON.parse(new TextDecoder().decode(json));
}

// The hash a deck link carries, and reading it back.
export const HASH_KEY = 'deck';
export const deckHash = async (packed) => `#${HASH_KEY}=${await encodeDeck(packed)}`;
export function hashPayload(hash) {
  const m = /^#deck=([A-Za-z0-9_-]+)$/.exec(hash || '');
  return m ? m[1] : null;
}
