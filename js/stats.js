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
export function speciesKey(commonName) {
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
  const bigDay = topBy(new Map([...daySpecies].map(([d, s]) => [d, s.size])));

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
  let patchOnly = [];
  if (topLoc) {
    const elsewhere = new Set();
    for (const c of lists) if (c.locationId !== topLoc[0]) for (const sp of c.species) elsewhere.add(sp);
    patchOnly = [...locationSpecies.get(topLoc[0])].filter((sp) => !elsewhere.has(sp)).sort(byTaxon);
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

  const monthly = Array(12).fill(0);
  for (const c of lists) monthly[Number(c.date.slice(5, 7)) - 1]++;

  const timed = lists.filter((c) => c.startMin !== null);
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
    seenOnce,
    grind,
    firstYearOnEbird: earliestEver.startsWith(prefix),
    hours: minutes / 60,
    miles,
    daysAfield: daySpecies.size,
    locations: locationLists.size,
    counties: new Set(lists.map((c) => `${c.state}|${c.county}`)).size,
    longestStreak: longestStreak(lists.map((c) => c.date)),
    topLocation: topLoc && {
      name: locationNames.get(topLoc[0]),
      checklists: topLoc[1],
      species: locationSpecies.get(topLoc[0]).size,
      share: topLoc[1] / lists.length,
      only: patchOnly,
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
    },
    avgTravelMiles: traveling.length
      ? traveling.reduce((sum, c) => sum + (c.distanceMi || 0), 0) / traveling.length
      : 0,
    lists,
  };
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
