import { regionName } from './places.js';

// Turns normalized observation rows into the numbers behind each slide.

// eBird names many personal locations after their coordinates, e.g.
// "Michigan 66 (42.766, -85.074)". Cards are shared publicly, so coordinates
// are stripped from every name, and eBird's "--" separator becomes an en dash.
// In parentheses, any precision counts ("(20.9, -156.441)"); bare pairs need
// two decimals so names like "Route 1.5" survive.
const COORDS = /\s*\(\s*-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?\s*\)|\s*-?\d{1,3}\.\d{2,}\s*,\s*-?\d{1,3}\.\d{2,}/g;

export function displayLocation(name, county) {
  const clean = String(name || '')
    .replace(COORDS, '')
    .replace(/\s*--\s*/g, ' \u2013 ')
    .replace(/[\s,\u2013-]+$/, '')
    .trim();
  if (clean) return clean;
  return county ? `Somewhere in ${county} County` : 'An unnamed spot';
}

// Collapses an eBird common name to a countable species, or null when the
// entry isn't a full species (spuhs, slashes, hybrids, domestics).
// Subspecies groups like "Yellow-rumped Warbler (Myrtle)" count as the parent.
// A bundled eBird taxonomy file would make this exact; this covers the
// common cases without one.
const speciesKeys = new Map();
export function speciesKey(commonName) {
  let key = speciesKeys.get(commonName);
  if (key === undefined) {
    key = toSpeciesKey(commonName);
    speciesKeys.set(commonName, key);
  }
  return key;
}

function toSpeciesKey(commonName) {
  const name = commonName.trim();
  if (/\bsp\.$/.test(name) || / sp\. /.test(name)) return null;
  if (name.includes('/')) return null;
  if (/ x /i.test(name) || /\(hybrid\)/i.test(name)) return null;
  if (/domestic/i.test(name)) return null;
  return name.replace(/\s*\(.*\)\s*$/, '').trim() || null;
}

export function availableYears(rows) {
  return [...new Set(rows.map((r) => Number(r.date.slice(0, 4))))].sort((a, b) => b - a);
}

// One entry per checklist, with its species set and effort fields.
export function groupChecklists(rows) {
  const lists = new Map();
  for (const r of rows) {
    let c = lists.get(r.submissionId);
    if (!c) {
      c = {
        id: r.submissionId,
        date: r.date,
        startMin: r.startMin,
        protocol: r.protocol,
        durationMin: r.durationMin,
        distanceMi: r.distanceMi,
        location: displayLocation(r.location, r.county),
        locationId: r.locationId,
        county: r.county,
        state: r.state,
        lat: r.lat,
        lng: r.lng,
        allObs: r.allObs,
        observers: r.observers,
        species: new Set(),
      };
      lists.set(r.submissionId, c);
    }
    const key = speciesKey(r.commonName);
    if (key) c.species.add(key);
  }
  return [...lists.values()];
}

function dayNumber(isoDate) {
  return Math.round(Date.parse(isoDate + 'T00:00:00Z') / 86400000);
}

function longestStreak(dates) {
  const days = [...new Set(dates)].map(dayNumber).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] === days[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

function topBy(map) {
  let best = null;
  for (const [key, value] of map) {
    if (!best || value > best[1]) best = [key, value];
  }
  return best;
}

export function computeYear(rows, year) {
  const prefix = String(year);
  const allLists = groupChecklists(rows);
  const lists = allLists.filter((c) => c.date.startsWith(prefix));

  // First date each species was ever recorded, across all years.
  const firstSeen = new Map();
  for (const c of allLists) {
    for (const s of c.species) {
      // Date plus start time, so same-day lifers keep the order you found them.
      const when = `${c.date} ${String(c.startMin ?? 0).padStart(4, '0')}`;
      const prev = firstSeen.get(s);
      if (!prev || when < prev) firstSeen.set(s, when);
    }
  }
  const earliestEver = allLists.reduce((m, c) => (c.date < m ? c.date : m), '9999');

  // History beyond this year: each species' first date this year, its last
  // date before this year, and (for arrivals) its first date this year and
  // last year in the home state. First-of-year only means something where
  // you live: a Florida trip in March isn't your catbird coming back.
  const lastYear = String(year - 1);
  const home = regionYearList(allLists.filter((c) => c.date.startsWith(prefix)))?.code;
  const firstThis = new Map();
  const lastBefore = new Map();
  const homeFirstThis = new Map();
  const homeFirstLast = new Map();
  for (const c of allLists) {
    const inThis = c.date.startsWith(prefix);
    const inLast = c.date.startsWith(lastYear);
    const atHome = c.state === home;
    for (const s of c.species) {
      if (inThis && !(firstThis.get(s) <= c.date)) firstThis.set(s, c.date);
      if (c.date < prefix && !(lastBefore.get(s) >= c.date)) lastBefore.set(s, c.date);
      if (atHome && inThis && !(homeFirstThis.get(s) <= c.date)) homeFirstThis.set(s, c.date);
      if (atHome && inLast && !(homeFirstLast.get(s) <= c.date)) homeFirstLast.set(s, c.date);
    }
  }

  const species = new Set();
  const speciesLists = new Map();
  const locationLists = new Map();
  const locationSpecies = new Map();
  const locationNames = new Map();
  const daySpecies = new Map();
  let minutes = 0;
  let miles = 0;

  for (const c of lists) {
    minutes += c.durationMin || 0;
    miles += c.distanceMi || 0;
    locationNames.set(c.locationId, c.location);
    locationLists.set(c.locationId, (locationLists.get(c.locationId) || 0) + 1);
    if (!locationSpecies.has(c.locationId)) locationSpecies.set(c.locationId, new Set());
    if (!daySpecies.has(c.date)) daySpecies.set(c.date, new Set());
    for (const s of c.species) {
      species.add(s);
      speciesLists.set(s, (speciesLists.get(s) || 0) + 1);
      locationSpecies.get(c.locationId).add(s);
      daySpecies.get(c.date).add(s);
    }
  }

  // Taxonomic order lets species lists read the way a field guide does.
  const taxon = new Map();
  for (const r of rows) {
    const key = speciesKey(r.commonName);
    if (key && r.taxonOrder !== null && !(taxon.get(key) <= r.taxonOrder)) taxon.set(key, r.taxonOrder);
  }
  const byTaxon = (a, b) => (taxon.get(a) ?? Infinity) - (taxon.get(b) ?? Infinity) || a.localeCompare(b);

  const lifers = [...species]
    .filter((s) => firstSeen.get(s).startsWith(prefix))
    .sort((a, b) => firstSeen.get(a).localeCompare(firstSeen.get(b)) || byTaxon(a, b));

  const topLoc = topBy(locationLists);
  const topDay = topBy(new Map([...daySpecies].map(([d, s]) => [d, s.size])));
  // A year of only spuhs has no biggest day worth naming.
  const bigDay = topDay && topDay[1] > 0 ? topDay : null;

  const chronological = [...lists].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.startMin ?? 0) - (b.startMin ?? 0)
  );
  const first = chronological[0];
  const firstDayLists = first ? lists.filter((c) => c.date === first.date) : [];
  const firstDaySpecies = new Set(firstDayLists.flatMap((c) => [...c.species]));

  const topSpeciesList = [...speciesLists]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([name, n]) => ({ name, checklists: n, share: n / lists.length }));

  // Species found at the top location and nowhere else this year.
  let spotOnly = [];
  if (topLoc) {
    const elsewhere = new Set();
    for (const c of lists) if (c.locationId !== topLoc[0]) for (const sp of c.species) elsewhere.add(sp);
    spotOnly = [...locationSpecies.get(topLoc[0])].filter((sp) => !elsewhere.has(sp)).sort(byTaxon);
  }

  // Birds that showed up on exactly one checklist, in the order you saw them.
  const onceList = new Map();
  for (const c of chronological) {
    for (const sp of c.species) if (speciesLists.get(sp) === 1) onceList.set(sp, c);
  }
  const seenOnce = [...onceList]
    .map(([name, c]) => ({ name, date: c.date, location: c.location }))
    .sort((a, b) => a.date.localeCompare(b.date) || byTaxon(a.name, b.name));

  // The grind: the complete checklist, an hour or longer, with the most
  // minutes per species. Incomplete lists are skipped, since a long list with
  // one target species is a stakeout, not a slow day.
  let grind = null;
  for (const c of lists) {
    if (!c.allObs || c.protocol === 'incidental' || !(c.durationMin >= 60) || !c.species.size) continue;
    const pace = c.durationMin / c.species.size;
    if (!grind || pace > grind.pace || (pace === grind.pace && c.durationMin > grind.durationMin)) {
      grind = { pace, durationMin: c.durationMin, date: c.date, location: c.location, species: [...c.species].sort(byTaxon) };
    }
  }

  // Spring arrivals: first-of-year dates for returning migrants, against last
  // year's. A species counts when its first date falls between March and June
  // both years, which leaves out residents seen all winter. That only means
  // something if the birder was out before March both years, so they'd have
  // seen residents early. The most-seen species make the fairest comparison.
  const spring = (d) => Boolean(d) && d.slice(5) >= '03-01' && d.slice(5) <= '06-30';
  const birdedInWinter = (y) => allLists.some((c) => c.state === home && c.date.startsWith(y) && c.date.slice(5) < '03-01');
  // Day of year on a fixed non-leap calendar, so a leap day doesn't read as a shift.
  const dayOfYear = (d) => Math.round((Date.parse('2001-' + d.slice(5) + 'T00:00:00Z') - Date.parse('2001-01-01T00:00:00Z')) / 86400000);
  const arrivals = birdedInWinter(prefix) && birdedInWinter(lastYear)
    ? [...homeFirstThis]
      .filter(([sp, d]) => spring(d) && spring(homeFirstLast.get(sp)) && speciesLists.get(sp) >= 2)
      .sort((a, b) => speciesLists.get(b[0]) - speciesLists.get(a[0]) || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([name, date]) => ({ name, date, lastYear: homeFirstLast.get(name), shift: dayOfYear(date) - dayOfYear(homeFirstLast.get(name)) }))
      .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  // Welcome back: birds seen again after missing at least one whole year.
  const welcomeBack = [...firstThis]
    .filter(([sp]) => lastBefore.has(sp) && Number(lastBefore.get(sp).slice(0, 4)) <= year - 2)
    .map(([name, date]) => ({ name, date, since: lastBefore.get(name) }))
    .sort((a, b) => a.since.localeCompare(b.since) || a.date.localeCompare(b.date))
    .slice(0, 5);

  const monthly = Array(12).fill(0);
  for (const c of lists) monthly[Number(c.date.slice(5, 7)) - 1]++;

  // Checklists by starting hour, for the clock card.
  const startHours = Array(24).fill(0);
  for (const c of lists) if (c.startMin !== null && c.startMin !== undefined) startHours[Math.floor(c.startMin / 60) % 24]++;

  const timed = lists.filter((c) => c.startMin !== null);
  const withObservers = lists.filter((c) => c.observers >= 1);
  const share = (pred, pool = lists) => (pool.length ? pool.filter(pred).length / pool.length : 0);
  const traveling = lists.filter((c) => c.protocol === 'traveling');
  const singleVisitLocs = [...locationLists.values()].filter((n) => n === 1).length;

  return {
    year,
    checklists: lists.length,
    species: species.size,
    lifers,
    liferList: lifers.map((name) => ({ name, date: firstSeen.get(name).slice(0, 10) })),
    firstList: first && {
      date: first.date,
      startMin: first.startMin,
      location: first.location,
      species: [...first.species].sort(byTaxon),
      dayChecklists: firstDayLists.length,
      daySpecies: firstDaySpecies.size,
    },
    topSpeciesList,
    monthly,
    startHours,
    // For the Kent County joke on the top birds card.
    kentShare: share((c) => c.state === 'US-MI' && c.county === 'Kent'),
    seenOnce,
    arrivals,
    welcomeBack,
    homeRegionName: home ? regionName(home) : '',
    grind,
    firstYearOnEbird: earliestEver.startsWith(prefix),
    homeRegion: regionYearList(lists),
    previousYearSpecies: new Set(
      allLists.filter((c) => c.date.startsWith(String(year - 1))).flatMap((c) => [...c.species])
    ).size,
    regions: [...new Set(lists.map((c) => c.state).filter(Boolean))],
    hours: minutes / 60,
    miles,
    daysAfield: daySpecies.size,
    locations: locationLists.size,
    counties: new Set(lists.map((c) => `${c.state}|${c.county}`)).size,
    // Named on the cover when every checklist was in one county.
    soleCounty: lists[0] ? { county: lists[0].county, state: lists[0].state } : null,
    longestStreak: longestStreak(lists.map((c) => c.date)),
    topLocation: topLoc && {
      name: locationNames.get(topLoc[0]),
      checklists: topLoc[1],
      species: locationSpecies.get(topLoc[0]).size,
      share: topLoc[1] / lists.length,
      only: spotOnly,
    },
    topSpecies: topSpeciesList[0] || null,
    bigDay: bigDay && { date: bigDay[0], species: bigDay[1] },
    // Shares feed the persona picker.
    shares: {
      dawn: share((c) => c.startMin < 8 * 60, timed),
      midday: share((c) => c.startMin >= 11 * 60 && c.startMin < 14 * 60, timed),
      evening: share((c) => c.startMin >= 17 * 60, timed),
      stationary: share((c) => c.protocol === 'stationary'),
      traveling: share((c) => c.protocol === 'traveling'),
      lakeshore: share(isLakeshore),
      singleVisit: locationLists.size ? singleVisitLocs / locationLists.size : 0,
      // Party size, from checklists that recorded it (older exports may not).
      solo: share((c) => c.observers === 1, withObservers),
      company: share((c) => c.observers >= 2, withObservers),
      group: share((c) => c.observers >= 4, withObservers),
      observersKnown: lists.length ? withObservers.length / lists.length : 0,
    },
    avgTravelMiles: traveling.length
      ? traveling.reduce((sum, c) => sum + (c.distanceMi || 0), 0) / traveling.length
      : 0,
    lists,
  };
}

// The state or province with the most checklists, and its year list.
function regionYearList(lists) {
  const counts = new Map();
  for (const c of lists) if (c.state) counts.set(c.state, (counts.get(c.state) || 0) + 1);
  const top = topBy(counts);
  if (!top) return null;
  const species = new Set(lists.filter((c) => c.state === top[0]).flatMap((c) => [...c.species]));
  return { code: top[0], species: species.size };
}

// Michigan counties on the Lake Michigan shore, the usual migration day trips
// out of Kent County.
const LAKESHORE_COUNTIES = new Set([
  'Berrien', 'Van Buren', 'Allegan', 'Ottawa', 'Muskegon', 'Oceana', 'Mason',
  'Manistee', 'Benzie', 'Leelanau', 'Grand Traverse', 'Antrim', 'Charlevoix', 'Emmet',
]);

function isLakeshore(c) {
  return c.state === 'US-MI' && LAKESHORE_COUNTIES.has(c.county);
}
