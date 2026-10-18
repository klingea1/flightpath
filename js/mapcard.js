// The map card: outlines of land, Michigan counties, and the Great Lakes,
// with a pin per (grid-snapped) place, drawn on a canvas. The outlines are
// turned into Path2D shapes once; every frame just redraws those shapes
// under the camera's transform, so flights stay smooth on phones. The
// outline data loads only when this card is first shown.

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

import { buildMonths } from './places.js';
import { project, fitBounds, flight, toScreen, scaleForZoom } from './camera.js';

// Closest zoom: about 60 km across the card. Keeps pins from reading as addresses.
const MAX_SCALE = scaleForZoom(11);

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
  return `
  <section class="card card-map" data-announce="${esc(`Where your year took you: ${placesText(places.pins.length)}. ${subtitle(places)}.`)}">
    <div class="map-host"></div>
    <div class="map-head">
      <p class="eyebrow">Where your year took you</p>
      <h2 class="card-title map-count">&nbsp;</h2>
      <p class="card-sub map-sub">&nbsp;</p>
    </div>
    ${places.needsInset ? `<div class="map-inset"><div class="map-inset-host"></div><span>Home</span></div>` : ''}
    <footer class="card-foot"><span>Flight Path</span><span>${s.year}</span></footer>
  </section>`;
}


// ---- Shapes ---------------------------------------------------------------

// Each outline becomes Path2D shapes in world coordinates, at a few levels
// of detail, with a bounding box so shapes outside the view can be skipped.
// Zoomed out, a coarse copy looks identical and draws many times faster.
const DETAIL = [0, 0.15, 0.6, 2.4];   // point spacing in world units

function toShapes(collection) {
  return collection.features.map((f) => {
    const rings = [];
    const g = f.geometry;
    const polys = !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    // A ring that crosses the date line is split there, so it can't draw an
    // edge across the whole map.
    for (const poly of polys) {
      for (const ring of poly) {
        let part = [];
        ring.forEach(([lng, lat], i) => {
          if (i && Math.abs(lng - ring[i - 1][0]) > 180) { if (part.length > 1) rings.push(part); part = []; }
          part.push(project(lat, lng));
        });
        if (part.length > 1) rings.push(part);
      }
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rings) for (const [x, y] of r) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const paths = DETAIL.map((tol) => {
      const path = new Path2D();
      for (const r of rings) {
        let kept = [r[0]];
        let [lx, ly] = r[0];
        for (let i = 1; i < r.length; i++) {
          const [x, y] = r[i];
          if (tol && Math.abs(x - lx) + Math.abs(y - ly) < tol && i < r.length - 1) continue;
          kept.push(r[i]);
          lx = x; ly = y;
        }
        // Small islands get simpler but never vanish, so pins on them (Hawaii,
        // say) don't float in open water.
        if (kept.length < 4) kept = r.filter((_, i) => i % Math.max(1, Math.floor(r.length / 6)) === 0);
        kept.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
        path.closePath();
      }
      return path;
    });
    return { paths, box: [x0, y0, x1, y1], name: f.properties?.name };
  });
}

// The coarsest detail level whose spacing stays under a pixel on screen.
function detailFor(scale) {
  let level = 0;
  DETAIL.forEach((tol, i) => { if (tol * scale <= 0.8) level = i; });
  return level;
}

function loadShapes() {
  return loadOnce('shapes', async () => {
    const layers = await loadOutlines();
    return {
      countries: toShapes(layers.countries),
      states: toShapes(layers.states),
      counties: toShapes(layers.counties),
      lakes: toShapes(layers.lakes),
    };
  });
}

// ---- Drawing --------------------------------------------------------------

function pinRadius(visits, scale = 1) {
  return Math.min(30, 7 + 4 * Math.sqrt(visits)) * scale;
}

// Draws the outline map for one camera. lineScale thins lines when drawing
// at reduced resolution.
function drawBase(ctx, shapes, visitedCounties, cam, lineScale = 1) {
  const { width: W, height: H } = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COLORS.water;
  ctx.fillRect(0, 0, W, H);

  // World-space transform, and the visible world box for culling.
  ctx.setTransform(cam.s, 0, 0, cam.s, W / 2 - cam.x * cam.s, H / 2 - cam.y * cam.s);
  const vx0 = cam.x - W / 2 / cam.s, vx1 = cam.x + W / 2 / cam.s;
  const vy0 = cam.y - H / 2 / cam.s, vy1 = cam.y + H / 2 / cam.s;
  const visible = (b) => b[2] >= vx0 && b[0] <= vx1 && b[3] >= vy0 && b[1] <= vy1;
  const lod = detailFor(cam.s);
  const px = (n) => (n * lineScale) / cam.s;   // screen pixels to world units
  ctx.lineJoin = 'round';

  const fillAndStroke = (list, fill, stroke, width, fillFor) => {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = px(width);
    for (const sh of list) {
      if (!visible(sh.box)) continue;
      ctx.fillStyle = fillFor ? fillFor(sh) : fill;
      ctx.fill(sh.paths[lod], 'evenodd');
      if (stroke) ctx.stroke(sh.paths[lod]);
    }
  };
  fillAndStroke(shapes.countries, COLORS.land, COLORS.border, 1.5);
  fillAndStroke(shapes.states, COLORS.land, null, 0);
  // County lines only matter close in.
  if (cam.s > 6) {
    fillAndStroke(shapes.counties, null, COLORS.county, 1,
      (sh) => (visitedCounties.has(sh.name) ? COLORS.visitedCounty : COLORS.land));
  }
  // State lines over the county fills, then the lakes on top of everything.
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = px(1.5);
  for (const sh of shapes.states) if (visible(sh.box)) ctx.stroke(sh.paths[lod]);
  ctx.fillStyle = COLORS.water;
  for (const sh of shapes.lakes) if (visible(sh.box)) ctx.fill(sh.paths[lod], 'evenodd');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Pins in screen space, biggest first so small ones stay on top.
// pins: [{ wx, wy, r }].
function drawPins(ctx, cam, pins, pinScale = 1) {
  const { width: W, height: H } = ctx.canvas;
  ctx.fillStyle = COLORS.pin;
  ctx.strokeStyle = COLORS.pinStroke;
  ctx.lineWidth = 2.5 * pinScale;
  for (const p of [...pins].sort((a, b) => b.r - a.r)) {
    if (p.r <= 0.2) continue;
    const [x, y] = toScreen(cam, p.wx, p.wy, W, H);
    if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
    ctx.beginPath();
    ctx.arc(x, y, p.r, 0, Math.PI * 2);
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
  }
}

function makeCanvas(host, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  host.appendChild(canvas);
  return canvas.getContext('2d');
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

// ---- The tour -------------------------------------------------------------

// Pacing: one beat per month, so every year plays in about 12 seconds
// however much someone traveled.
const MONTH_MS = 1000;
const MONTH_FLY_MS = 450;
const FINAL_FLY_MS = 900;
const BLOOM_MS = 380;
const BLOOM_STAGGER_MS = 160;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

function monthLabel(m) {
  const away = m.regions.slice(0, 2);
  if (m.regions.length > 2) away.push(`${m.regions.length - 2} more`);
  return away.length ? `${MONTH_NAMES[m.month]} · ${away.join(', ')}` : MONTH_NAMES[m.month];
}

const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const SKIPPED = Symbol('skipped');

// Draws the map and returns a controller that plays the year month by month
// and always lands on the same final frame.
export async function mountMap(card, places, stats) {
  const shapes = await loadShapes();
  const visitedCounties = new Set(places.pins.filter((p) => p.state === 'US-MI').map((p) => p.county));
  const ctx = makeCanvas(card.querySelector('.map-host'), 1080, 1350);
  ctx.canvas.setAttribute('role', 'img');
  ctx.canvas.setAttribute('aria-label', `Map of the ${placesText(places.pins.length)} you birded this year. ${subtitle(places)}.`);
  const W = 1080, H = 1350;
  // The base map is cached while the camera holds still, so frames that
  // only grow pins just copy it and draw the pins.
  const base = document.createElement('canvas');
  base.width = W;
  base.height = H;
  const baseCtx = base.getContext('2d');
  let baseCam = null;
  // While the camera moves, the map draws at half resolution: a quarter of
  // the pixels, and the softness doesn't show in motion.
  const fast = document.createElement('canvas');
  fast.width = W / 2;
  fast.height = H / 2;
  const fastCtx = fast.getContext('2d');
  function paint(camera, pinList, moving = false) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (moving) {
      drawBase(fastCtx, shapes, visitedCounties, { ...camera, s: camera.s / 2 }, 0.5);
      ctx.drawImage(fast, 0, 0, W, H);
      baseCam = null;
    } else {
      if (!baseCam || baseCam.x !== camera.x || baseCam.y !== camera.y || baseCam.s !== camera.s) {
        drawBase(baseCtx, shapes, visitedCounties, camera);
        baseCam = camera;
      }
      ctx.drawImage(base, 0, 0);
    }
    drawPins(ctx, camera, pinList);
  }
  const padding = [360, 110, places.needsInset ? 520 : 200, 110];
  const camFor = (bounds, minKm) => fitBounds(atLeast(bounds, minKm), W, H, padding, MAX_SCALE);
  const finalCam = camFor(places.allBounds, 160);

  const worldPins = places.pins.map((p) => {
    const [wx, wy] = project(p.lat, p.lng);
    return { wx, wy, final: pinRadius(p.visits) };
  });

  const insetBox = card.querySelector('.map-inset');
  if (insetBox) {
    const ictx = makeCanvas(insetBox.querySelector('.map-inset-host'), 340, 340);
    ictx.canvas.setAttribute('aria-hidden', 'true');
    const icam = fitBounds(atLeast(places.homeBounds, 120), 340, 340, [50, 40, 30, 40], MAX_SCALE);
    const homePins = worldPins.filter((_, i) => places.pins[i].home).map((p) => ({ ...p, r: p.final * 0.6 }));
    drawBase(ictx, shapes, visitedCounties, icam);
    drawPins(ictx, icam, homePins, 0.6);
  }

  const countEl = card.querySelector('.map-count');
  const subEl = card.querySelector('.map-sub');
  const months = buildMonths(places);

  // Live tour state, drawn every animation frame while the tour runs.
  let cam = finalCam;
  let move = null;               // { path, start, ms, done }
  let pins = new Map();          // pin index -> { wx, wy, from, to, start, ms }
  let run = null;
  let frame = 0;

  const radiusAt = (p, now) => {
    if (now < p.start) return p.from;
    const t = Math.min(1, (now - p.start) / p.ms);
    return Math.max(0, p.from + (p.to - p.from) * easeOutBack(t));
  };

  function render(now = performance.now()) {
    let moving = false;
    if (move) {
      const t = Math.min(1, (now - move.start) / move.ms);
      cam = move.path.at(easeInOut(t));
      moving = t < 1;
      if (t >= 1) { const done = move.done; move = null; done(); }
    }
    paint(cam, [...pins.values()].map((p) => ({ wx: p.wx, wy: p.wy, r: radiusAt(p, now) })), moving);
  }

  function loop(now) {
    render(now);
    if (run) frame = requestAnimationFrame(loop);
  }

  function showFinal(instant = true) {
    cancelAnimationFrame(frame);
    move = null;
    cam = finalCam;
    pins = new Map();
    paint(cam, worldPins.map((p) => ({ ...p, r: p.final })));
    countEl.textContent = placesText(places.pins.length);
    subEl.textContent = subtitle(places);
    if (insetBox) {
      insetBox.style.transition = instant ? 'none' : '';
      insetBox.classList.add('shown');
    }
  }

  function wait(ms, token) {
    return new Promise((resolve, reject) => {
      if (token.skipped) return reject(SKIPPED);
      const t = setTimeout(resolve, ms);
      token.onSkip = () => { clearTimeout(t); reject(SKIPPED); };
    });
  }

  function fly(target, ms, token) {
    return new Promise((resolve, reject) => {
      if (token.skipped) return reject(SKIPPED);
      move = { path: flight(cam, target, W), start: performance.now(), ms, done: resolve };
      token.onSkip = () => { move = null; reject(SKIPPED); };
    });
  }

  // Flies only when the month's places aren't already well framed.
  function needsMove(target) {
    const zoomIn = Math.log2(target.s / cam.s);
    const halfW = W / 2 / target.s, halfH = H / 2 / target.s;
    const inView = Math.abs(target.x - cam.x) + halfW <= W / 2 / cam.s && Math.abs(target.y - cam.y) + halfH <= H / 2 / cam.s;
    return !inView || zoomIn > 0.8;
  }

  const visitCounts = new Map();
  // All of a month's visits bloom together: new places pop in, places
  // visited again grow.
  function bloom(visits) {
    const now = performance.now();
    const added = new Map();
    for (const v of visits) added.set(v.pin, (added.get(v.pin) || 0) + 1);
    for (const [i, n] of added) {
      const total = (visitCounts.get(i) || 0) + n;
      visitCounts.set(i, total);
      const prev = pins.get(i);
      pins.set(i, {
        wx: worldPins[i].wx, wy: worldPins[i].wy,
        from: prev ? radiusAt(prev, now) : 0,
        to: pinRadius(total),
        start: now + Math.random() * BLOOM_STAGGER_MS,
        ms: BLOOM_MS,
      });
    }
    countEl.textContent = placesText(pins.size);
  }

  function showStart() {
    const first = months.find((m) => m.visits.length);
    cam = first ? camFor(first.bounds, 70) : finalCam;
    pins = new Map();
    visitCounts.clear();
    move = null;
    countEl.textContent = ' ';
    subEl.textContent = first ? monthLabel(first) : ' ';
    if (insetBox) { insetBox.style.transition = ''; insetBox.classList.remove('shown'); }
    render();
  }

  async function playMonths(token) {
    showStart();
    frame = requestAnimationFrame(loop);
    for (const m of months) {
      const start = performance.now();
      subEl.textContent = monthLabel(m);
      if (m.visits.length) {
        const target = camFor(m.bounds, 70);
        if (needsMove(target)) await fly(target, MONTH_FLY_MS, token);
        bloom(m.visits);
      }
      await wait(Math.max(0, MONTH_MS - (performance.now() - start)), token);
    }
    subEl.textContent = ' ';
    await fly(finalCam, FINAL_FLY_MS, token);
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
      if (!run) showFinal();
    },
    skip() {
      if (!run) return controller.done;
      run.skipped = true;
      if (run.onSkip) run.onSkip();
      return controller.done;
    },
  };

  // The first frame on screen is the tour's first month, not the final map.
  if (reduceMotion) showFinal(); else showStart();
  return controller;
}
