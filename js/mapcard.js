// The map card: outlines of land, Michigan counties, and the Great Lakes,
// with a pin per (grid-snapped) place. Leaflet and the outline data load
// only when this card is first shown.

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const COLORS = {
  water: '#0e1630',
  land: '#252a4c',
  border: '#4a5089',
  county: '#363c69',
  visitedCounty: '#2d3360',
  pin: '#ffc979',
  pinStroke: '#fff6e8',
};

// Closest zoom: about 60 km across the card. Keeps pins from reading as addresses.
const MAX_ZOOM = 11;

import { buildLegs } from './places.js';

const loaded = new Map();
function loadOnce(key, fn) {
  if (!loaded.has(key)) loaded.set(key, fn());
  return loaded.get(key);
}

function loadScript(src) {
  return loadOnce(src, () => new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error(`Couldn't load ${src}`));
    document.head.appendChild(el);
  }));
}

function loadCss(href) {
  return loadOnce(href, () => new Promise((resolve) => {
    const el = document.createElement('link');
    el.rel = 'stylesheet';
    el.href = href;
    el.onload = resolve;
    el.onerror = resolve;
    document.head.appendChild(el);
  }));
}

function loadOutlines() {
  return loadOnce('outlines', async () => {
    await loadScript('vendor/topojson-client-3.1.0.min.js');
    const topo = await (await fetch('data/map.topo.json')).json();
    const layers = {};
    for (const name of Object.keys(topo.objects)) layers[name] = window.topojson.feature(topo, topo.objects[name]);
    return layers;
  });
}

function listNames(names) {
  if (names.length <= 1) return names.join('');
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function subtitle(places) {
  const home = places.homeRegion.name;
  if (!places.trips.length) return `All in ${home}`;
  const named = places.trips.slice(0, 3).map((t) => t.name);
  const more = places.trips.length - named.length;
  if (more > 0) named.push(`${more} more`);
  return `${home}, plus ${listNames(named)}`;
}

const placesText = (n) => `${n} ${n === 1 ? 'place' : 'places'}`;

export function mapCardHtml(s, places) {
  const n = places.pins.length;
  return `
  <section class="card card-map">
    <div class="map-host"></div>
    <div class="map-head">
      <p class="eyebrow">Where your year took you</p>
      <h2 class="card-title map-count">${placesText(n)}</h2>
      <p class="card-sub map-sub">${esc(subtitle(places))}</p>
    </div>
    ${places.needsInset ? `<div class="map-inset"><div class="map-inset-host"></div><span>Home</span></div>` : ''}
    <footer class="card-foot"><span>Flight Path</span><span>${s.year}</span></footer>
  </section>`;
}

function drawBase(L, map, layers, visitedCounties) {
  const renderer = L.svg({ padding: 0.3 });
  const land = { renderer, stroke: true, color: COLORS.border, weight: 1.5, fillColor: COLORS.land, fillOpacity: 1 };
  L.geoJSON(layers.countries, { style: land, interactive: false }).addTo(map);
  L.geoJSON(layers.states, { style: land, interactive: false }).addTo(map);
  L.geoJSON(layers.counties, {
    interactive: false,
    style: (f) => ({
      renderer,
      color: COLORS.county,
      weight: 1,
      fillColor: visitedCounties.has(f.properties.name) ? COLORS.visitedCounty : COLORS.land,
      fillOpacity: 1,
    }),
  }).addTo(map);
  // Re-stroke state lines over the county fills so they stay visible.
  L.geoJSON(layers.states, { style: { renderer, color: COLORS.border, weight: 1.5, fill: false }, interactive: false }).addTo(map);
  L.geoJSON(layers.lakes, { style: { renderer, stroke: false, fillColor: COLORS.water, fillOpacity: 1 }, interactive: false }).addTo(map);
  return renderer;
}

function pinRadius(visits, scale = 1) {
  return Math.min(30, 7 + 4 * Math.sqrt(visits)) * scale;
}

function drawPins(L, map, pins, renderer, scale = 1) {
  // Bigger pins first, so small ones stay visible on top.
  return [...pins].sort((a, b) => b.visits - a.visits).map((p) =>
    L.circleMarker([p.lat, p.lng], {
      renderer,
      radius: pinRadius(p.visits, scale),
      color: COLORS.pinStroke,
      weight: 2.5 * scale,
      fillColor: COLORS.pin,
      fillOpacity: 0.9,
      interactive: false,
    }).addTo(map));
}

const STATIC = {
  zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false,
  doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, tap: false,
  zoomSnap: 0, fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false, inertia: false,
};

function newMap(L, host) {
  host.style.background = COLORS.water;
  return L.map(host, { ...STATIC, maxZoom: MAX_ZOOM });
}

// Grows bounds to at least minKm across, so a single patch still shows its
// neighboring counties instead of filling the card with one county.
function atLeast(bounds, minKm) {
  const [[s, w], [n, e]] = bounds;
  const lat = (s + n) / 2;
  const lng = (w + e) / 2;
  const halfLat = Math.max((n - s) / 2, minKm / 2 / 111.32);
  const halfLng = Math.max((e - w) / 2, minKm / 2 / (111.32 * Math.cos((lat * Math.PI) / 180)));
  return [[lat - halfLat, lng - halfLng], [lat + halfLat, lng + halfLng]];
}

function fit(map, bounds, padTL, padBR, minKm) {
  map.fitBounds(atLeast(bounds, minKm), { paddingTopLeft: padTL, paddingBottomRight: padBR, maxZoom: MAX_ZOOM, animate: false });
}

// Padding keeps pins clear of the header and footer.
const PAD_TL = [110, 360];
const padBR = (places) => [110, places.needsInset ? 520 : 200];

// Pacing. Home visits share a fixed budget so a 400-checklist year and a
// 40-checklist year both play in about the same time.
const HOME_BUDGET_MS = 8000;
// Flights share a budget too, so a year with many trips flies faster
// instead of running long.
const FLIGHT_BUDGET_S = 7;
const FLIGHT_MIN_S = 0.7;
const STEP_MIN_MS = 35;
const STEP_MAX_MS = 350;
const TRIP_STEP_MS = 280;
const TRIP_HOLD_MS = 500;
const END_HOLD_MS = 400;

const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

function animateRadius(marker, from, to, ms, ease = easeOutBack) {
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / ms);
    marker.setRadius(Math.max(0, from + (to - from) * ease(t)));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function formatDay(iso) {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

const SKIPPED = Symbol('skipped');

const flightSeconds = (km) => 1.0 + Math.min(1.2, km / 1800);

// Draws the map and returns a controller that plays the year's flight and
// always lands on the same final frame.
export async function mountMap(card, places, stats) {
  await Promise.all([loadCss('vendor/leaflet/leaflet.css'), loadScript('vendor/leaflet/leaflet.js')]);
  const layers = await loadOutlines();
  const L = window.L;
  const visitedCounties = new Set(stats.lists.filter((c) => c.state === 'US-MI').map((c) => c.county));

  const map = newMap(L, card.querySelector('.map-host'));
  const finalView = () => fit(map, places.allBounds, PAD_TL, padBR(places), 160);
  finalView();
  const renderer = drawBase(L, map, layers, visitedCounties);

  // Leaflet stretches the old drawing while zooming. Redraw a few times a
  // second during flights so the edges never go blank.
  let lastRedraw = 0;
  map.on('zoom', () => {
    const now = performance.now();
    if (now - lastRedraw > 120) { lastRedraw = now; renderer._reset(); }
  });

  const insetBox = card.querySelector('.map-inset');
  if (insetBox) {
    const inset = newMap(L, insetBox.querySelector('.map-inset-host'));
    fit(inset, places.homeBounds, [40, 50], [40, 30], 120);
    drawPins(L, inset, places.pins.filter((p) => p.home), drawBase(L, inset, layers, visitedCounties), 0.6);
  }

  const countEl = card.querySelector('.map-count');
  const subEl = card.querySelector('.map-sub');
  const legs = buildLegs(places);
  const homeVisits = legs.filter((l) => l.home).reduce((n, l) => n + l.visits.length, 0);
  const homeStep = Math.max(STEP_MIN_MS, Math.min(STEP_MAX_MS, HOME_BUDGET_MS / Math.max(1, homeVisits)));

  // Estimate every flight up front to scale them into the budget.
  const centerOf = (b) => L.latLngBounds(b).getCenter();
  const homeCenter = centerOf(places.homeBounds);
  let flightTotal = 0;
  let at = legs[0].home ? homeCenter : centerOf(legs[0].bounds);
  for (const leg of legs.slice(1)) {
    const next = leg.home ? homeCenter : centerOf(leg.bounds);
    if (!next.equals(at)) flightTotal += flightSeconds(at.distanceTo(next) / 1000);
    at = next;
  }
  flightTotal += flightSeconds(at.distanceTo(centerOf(places.allBounds)) / 1000);
  const flightScale = Math.min(1, FLIGHT_BUDGET_S / flightTotal);

  let markers = new Map();
  let run = null;

  function clearPins() {
    for (const m of markers.values()) m.remove();
    markers = new Map();
  }

  // instant skips the inset's fade, so a save right after a skip includes it.
  function showFinal(instant = true) {
    map.stop();
    finalView();
    clearPins();
    drawPins(L, map, places.pins, renderer).forEach((m, i) => markers.set(`final-${i}`, m));
    countEl.textContent = placesText(places.pins.length);
    subEl.textContent = subtitle(places);
    if (insetBox) {
      insetBox.style.transition = instant ? 'none' : '';
      insetBox.classList.add('shown');
    }
  }

  // Leaflet's flyToBounds, awaited, and cancelled by a skip.
  function fly(bounds, minKm, token) {
    return new Promise((resolve, reject) => {
      if (token.skipped) return reject(SKIPPED);
      const target = atLeast(bounds, minKm);
      const from = map.getCenter();
      const to = L.latLngBounds(target).getCenter();
      const km = from.distanceTo(to) / 1000;
      const duration = Math.max(FLIGHT_MIN_S, flightSeconds(km) * flightScale);
      map.once('moveend', () => (token.skipped ? reject(SKIPPED) : resolve()));
      map.flyToBounds(target, { paddingTopLeft: PAD_TL, paddingBottomRight: padBR(places), maxZoom: MAX_ZOOM, duration });
      token.onSkip = () => reject(SKIPPED);
    });
  }

  function wait(ms, token) {
    return new Promise((resolve, reject) => {
      if (token.skipped) return reject(SKIPPED);
      const t = setTimeout(resolve, ms);
      token.onSkip = () => { clearTimeout(t); reject(SKIPPED); };
    });
  }

  const visitCounts = new Map();
  function visit(v, step) {
    const pin = places.pins[v.pin];
    const n = (visitCounts.get(v.pin) || 0) + 1;
    visitCounts.set(v.pin, n);
    const r = pinRadius(n);
    let m = markers.get(v.pin);
    if (!m) {
      m = L.circleMarker([pin.lat, pin.lng], {
        renderer, radius: 0, color: COLORS.pinStroke, weight: 2.5,
        fillColor: COLORS.pin, fillOpacity: 0.9, interactive: false,
      }).addTo(map);
      markers.set(v.pin, m);
      countEl.textContent = placesText(markers.size);
      animateRadius(m, 0, r, Math.min(420, Math.max(220, step * 3)));
    } else {
      animateRadius(m, m.getRadius(), r, 220);
    }
  }

  async function playLegs(token) {
    clearPins();
    visitCounts.clear();
    if (insetBox) insetBox.classList.remove('shown');
    const homeView = atLeast(places.homeBounds, 70);
    const first = legs[0];
    fit(map, first.home ? homeView : first.bounds, PAD_TL, padBR(places), first.home ? 70 : 60);
    renderer._reset();
    let atHome = first.home;
    let here = first;

    for (const leg of legs) {
      if (leg.home && !atHome) {
        subEl.textContent = 'Back home';
        await fly(homeView, 70, token);
      } else if (!leg.home && leg !== here) {
        subEl.textContent = leg.label;
        await fly(leg.bounds, 60, token);
        await wait(TRIP_HOLD_MS, token);
      }
      if (!leg.home) subEl.textContent = leg.label;
      atHome = leg.home;
      here = leg;
      const step = leg.home ? homeStep : Math.min(TRIP_STEP_MS, 1500 / leg.visits.length);
      for (const v of leg.visits) {
        if (leg.home) subEl.textContent = formatDay(v.date);
        visit(v, step);
        await wait(step, token);
      }
    }
    await wait(END_HOLD_MS, token);
    subEl.textContent = '';
    await fly(places.allBounds, 160, token);
  }

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const controller = {
    get running() { return Boolean(run); },
    done: Promise.resolve(),
    play() {
      if (run) return controller.done;
      if (reduceMotion) { showFinal(); return controller.done; }
      const token = { skipped: false, onSkip: null };
      run = token;
      controller.done = playLegs(token)
        .catch((e) => { if (e !== SKIPPED) console.error(e); })
        .finally(() => { run = null; showFinal(token.skipped); });
      return controller.done;
    },
    // Redraws the final frame, for when the card is shown again.
    refresh() {
      if (run) return;
      map.invalidateSize({ animate: false });
      showFinal();
    },
    skip() {
      if (!run) return controller.done;
      run.skipped = true;
      if (run.onSkip) run.onSkip();
      return controller.done;
    },
  };

  showFinal();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return controller;
}
