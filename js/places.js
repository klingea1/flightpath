// Turns checklists into map pins for the map card.
//
// Privacy: every location is snapped to a coarse grid before it reaches the
// map, so a pin shows the neighborhood someone birds in, never their yard.

// About 2.2 km north-south and 1.6 km east-west in Michigan.
export const GRID_DEG = 0.02;

const KM_PER_DEG = 111.32;

export function snap(lat, lng, step = GRID_DEG) {
  const r = (v) => Math.round(v / step);
  const i = r(lat);
  const j = r(lng);
  return { key: `${i}:${j}`, lat: +(i * step).toFixed(5), lng: +(j * step).toFixed(5) };
}

export function distanceKm(a, b) {
  const kx = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const dx = (a.lng - b.lng) * kx * KM_PER_DEG;
  const dy = (a.lat - b.lat) * KM_PER_DEG;
  return Math.hypot(dx, dy);
}

function boundsOf(points) {
  if (!points.length) return null;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
}

function spanKm(b) {
  return b ? distanceKm({ lat: b[0][0], lng: b[0][1] }, { lat: b[1][0], lng: b[1][1] }) : 0;
}

// Home is everything within this distance of the most-visited pin.
const HOME_RADIUS_KM = 100;

const REGION_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'Washington, D.C.', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

const PROVINCE_NAMES = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories', NU: 'Nunavut',
  ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec', SK: 'Saskatchewan', YT: 'Yukon',
};

// "US-OH" -> "Ohio", "CA-ON" -> "Ontario", "CR-P" -> "Costa Rica".
export function regionName(code) {
  const [country, sub] = String(code || '').split('-');
  if (country === 'US' && REGION_NAMES[sub]) return REGION_NAMES[sub];
  if (country === 'CA' && PROVINCE_NAMES[sub]) return PROVINCE_NAMES[sub];
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(country) || code;
  } catch {
    return code;
  }
}

export function buildPlaces(lists) {
  const visits = lists
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startMin ?? 0) - (b.startMin ?? 0));

  const pins = [];
  const byKey = new Map();
  const sequence = [];
  for (const c of visits) {
    const cell = snap(c.lat, c.lng);
    let pin = byKey.get(cell.key);
    if (!pin) {
      pin = { ...cell, visits: 0, firstDate: c.date, state: c.state, county: c.county };
      byKey.set(cell.key, pin);
      pins.push(pin);
    }
    pin.visits++;
    sequence.push({ pin: pins.indexOf(pin), date: c.date, location: c.location, state: c.state });
  }
  if (!pins.length) return null;

  // Home centers on the pin with the most birding within reach of it, so a
  // few checklists at one trip spot can't outweigh a spread-out home area.
  const nearbyVisits = (p) => pins.reduce((n, q) => n + (distanceKm(p, q) <= HOME_RADIUS_KM ? q.visits : 0), 0);
  let anchor = pins[0];
  let best = -1;
  for (const p of pins) {
    const n = nearbyVisits(p) * 1000 + p.visits;
    if (n > best) { best = n; anchor = p; }
  }
  for (const p of pins) p.home = distanceKm(p, anchor) <= HOME_RADIUS_KM;
  const home = pins.filter((p) => p.home);
  const homeBounds = boundsOf(home);
  const allBounds = boundsOf(pins);

  // Other states, provinces, or countries, by how many checklists each got.
  const homeRegion = anchor.state;
  const away = new Map();
  for (const c of visits) {
    if (c.state && c.state !== homeRegion) away.set(c.state, (away.get(c.state) || 0) + 1);
  }
  const trips = [...away]
    .sort((a, b) => b[1] - a[1])
    .map(([code, checklists]) => ({ code, name: regionName(code), checklists }));

  return {
    pins,
    sequence,
    homeBounds,
    allBounds,
    homeRegion: { code: homeRegion, name: regionName(homeRegion), county: anchor.county },
    trips,
    // When travel stretches the map far past home, home collapses to a dot.
    // The card then adds an inset of the home area.
    needsInset: home.length < pins.length && spanKm(allBounds) > Math.max(250, 4 * spanKm(homeBounds)),
  };
}

// Splits the year into months for the map card, from the first month with a
// checklist to the last. Each month knows its pins, its bounds, and which
// places away from home it reached.
export function buildMonths(places) {
  const months = Array.from({ length: 12 }, (_, month) => ({ month, visits: [], regions: [] }));
  for (const v of places.sequence) months[Number(v.date.slice(5, 7)) - 1].visits.push(v);
  const used = months.filter((m) => m.visits.length);
  if (!used.length) return [];
  const span = months.slice(used[0].month, used[used.length - 1].month + 1);
  for (const m of span) {
    m.bounds = boundsOf(m.visits.map((v) => places.pins[v.pin]));
    const away = new Map();
    for (const v of m.visits) {
      if (!places.pins[v.pin].home && v.state !== places.homeRegion.code) away.set(v.state, (away.get(v.state) || 0) + 1);
    }
    m.regions = [...away].sort((a, b) => b[1] - a[1]).map(([code]) => regionName(code));
  }
  return span;
}
