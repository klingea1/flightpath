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

export function mapCardHtml(s, places) {
  const n = places.pins.length;
  return `
  <section class="card card-map">
    <div class="map-host"></div>
    <div class="map-head">
      <p class="eyebrow">Where your year took you</p>
      <h2 class="card-title">${n} ${n === 1 ? 'place' : 'places'}</h2>
      <p class="card-sub">${esc(subtitle(places))}</p>
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
  for (const p of [...pins].sort((a, b) => b.visits - a.visits)) {
    L.circleMarker([p.lat, p.lng], {
      renderer,
      radius: pinRadius(p.visits, scale),
      color: COLORS.pinStroke,
      weight: 2.5 * scale,
      fillColor: COLORS.pin,
      fillOpacity: 0.9,
      interactive: false,
    }).addTo(map);
  }
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

// Draws the final, zoomed-out frame. Resolves once everything is on screen.
export async function mountMap(card, places, stats) {
  await Promise.all([loadCss('vendor/leaflet/leaflet.css'), loadScript('vendor/leaflet/leaflet.js')]);
  const layers = await loadOutlines();
  const L = window.L;
  const visitedCounties = new Set(stats.lists.filter((c) => c.state === 'US-MI').map((c) => c.county));

  const map = newMap(L, card.querySelector('.map-host'));
  fit(map, places.allBounds, [110, 360], [110, places.needsInset ? 520 : 200], 160);
  drawPins(L, map, places.pins, drawBase(L, map, layers, visitedCounties));

  const insetHost = card.querySelector('.map-inset-host');
  if (insetHost) {
    const inset = newMap(L, insetHost);
    const home = places.pins.filter((p) =>
      p.lat >= places.homeBounds[0][0] && p.lat <= places.homeBounds[1][0] &&
      p.lng >= places.homeBounds[0][1] && p.lng <= places.homeBounds[1][1]);
    fit(inset, places.homeBounds, [40, 50], [40, 30], 120);
    drawPins(L, inset, home, drawBase(L, inset, layers, visitedCounties), 0.6);
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return map;
}
