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

import { buildMonths } from './places.js';

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

// Grows bounds to at least minKm across, so a single spot still shows its
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

// Pacing: one beat per month, so every year plays in about 12 seconds
// however much someone traveled.
const MONTH_MS = 1000;
const MONTH_FLY_S = 0.45;
const FINAL_FLY_S = 0.9;
const BLOOM_MS = 380;
const BLOOM_STAGGER_MS = 160;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

function monthLabel(m) {
  const away = m.regions.slice(0, 2);
  if (m.regions.length > 2) away.push(`${m.regions.length - 2} more`);
  return away.length ? `${MONTH_NAMES[m.month]} \u00b7 ${away.join(', ')}` : MONTH_NAMES[m.month];
}

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

const SKIPPED = Symbol('skipped');

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
  const months = buildMonths(places);

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
  function fly(bounds, minKm, duration, token) {
    return new Promise((resolve, reject) => {
      if (token.skipped) return reject(SKIPPED);
      const target = atLeast(bounds, minKm);
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
  // All of a month's visits bloom together: new places pop in, places
  // visited again grow.
  function bloom(visits) {
    const added = new Map();
    for (const v of visits) added.set(v.pin, (added.get(v.pin) || 0) + 1);
    for (const [i, n] of added) {
      const total = (visitCounts.get(i) || 0) + n;
      visitCounts.set(i, total);
      const pin = places.pins[i];
      const delay = Math.random() * BLOOM_STAGGER_MS;
      let m = markers.get(i);
      if (!m) {
        m = L.circleMarker([pin.lat, pin.lng], {
          renderer, radius: 0, color: COLORS.pinStroke, weight: 2.5,
          fillColor: COLORS.pin, fillOpacity: 0.9, interactive: false,
        }).addTo(map);
        markers.set(i, m);
      }
      const from = m.getRadius();
      setTimeout(() => animateRadius(m, from, pinRadius(total), BLOOM_MS), delay);
    }
    countEl.textContent = placesText(markers.size);
  }

  // Flies only when the month's places aren't already well framed.
  function needsMove(target) {
    const b = L.latLngBounds(target);
    const zoomFor = map.getBoundsZoom(b, false, L.point(220, 560));
    return !map.getBounds().contains(b) || zoomFor - map.getZoom() > 0.8;
  }

  async function playMonths(token) {
    clearPins();
    visitCounts.clear();
    if (insetBox) insetBox.classList.remove('shown');
    const first = months.find((m) => m.visits.length);
    fit(map, first.bounds, PAD_TL, padBR(places), 70);
    renderer._reset();

    for (const m of months) {
      const start = performance.now();
      subEl.textContent = monthLabel(m);
      if (m.visits.length) {
        const target = atLeast(m.bounds, 70);
        if (needsMove(target)) await fly(target, 70, MONTH_FLY_S, token);
        bloom(m.visits);
      }
      await wait(Math.max(0, MONTH_MS - (performance.now() - start)), token);
    }
    subEl.textContent = '';
    await fly(places.allBounds, 160, FINAL_FLY_S, token);
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
      controller.done = playMonths(token)
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
