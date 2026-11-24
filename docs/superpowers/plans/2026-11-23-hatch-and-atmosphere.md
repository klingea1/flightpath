# Hatch, Flock and Atmosphere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An egg that hatches your year's flock when the deck opens, a flock that stays with you and becomes the species number on the Headline card, per-card skies and particles, and recorded sound, all on the page and never in a card image.

**Architecture:** Pure logic (seeded randomness, crack seam, scene choice, flock simulation, target shapes, hatch sequencing, effects mode) lives in small `js/fx/*.js` modules tested with `node --test`. Rendering is browser-only: the egg is an ogl (WebGL) scene with a Canvas 2D fallback; the flock and atmosphere particles share one full-viewport Canvas 2D overlay; skies are two stacked CSS gradient layers that cross-fade. `js/fx/index.js` is the only module `js/app.js` talks to.

**Tech Stack:** Plain ES modules, no build. ogl 1.0.11 (vendored subset). Web Audio. Canvas 2D. `node --test`. Chrome DevTools Protocol via `tools/check-cards.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-23-hatch-and-atmosphere-design.md`

## Global Constraints

- No build step; relative paths only (site is served from `/flightpath/`).
- ogl pinned at **1.0.11**, vendored under `vendor/ogl-1.0.11/` with its license (Unlicense); nothing fetched from outside the site at runtime.
- Effects never render inside `.card` (that element is what `htmlToImage` captures). The card HTML from `buildCards` is unchanged except where a task says so.
- No change to `pack`/`unpack` and no `VERSION` bump.
- Flock size = `Math.min(stats.species, 600)`. Fewer than **40** species → ring around the number instead of digits.
- Seed for everything seeded: `stats.year * 100003 + stats.checklists`.
- Over-card particles: sparse, small, opacity ≤ **0.25** over card text. Exception: the murmuration digits.
- 60 fps target on a mid-range phone; degrade (fewer particles, no mist) before dropping frames.
- Sound: never before a user gesture, gentle default volume (master gain **0.35**), on by default, mute remembered in `localStorage` key `flightpath:muted`. Files are MP3 in `sounds/`; a missing file is silent.
- Modes: `?fx=off` → today's behavior exactly; reduced motion → `calm` (no hatch motion, no flock, static skies, one cross-fade); no WebGL → `flat` (2D egg); else `full`.
- Overlay canvas: `position: fixed`, `pointer-events: none`, `aria-hidden="true"`.

## Review Focus

1. **Saving the Headline card during or right after the murmuration** must give an image with the number. The number is hidden with a class on `.card-frame` (`murmuring`), never on `.card`, so the capture can't see it; Task 8 verifies with a capture taken mid-murmuration.
2. **Tiny or empty years** (0 or 1 species, `test/fixtures/edge/one-checklist.csv`): the hatch still reveals the deck, the ring works for n = 0 and 1. Tests in Task 4 and Task 8's manual run.
3. **Double triggers:** tapping/pressing a key during the hatch, dropping a second file, or clicking the demo while hatching reveals the deck exactly once. Test in Task 7 (`createSequence`).
4. **WebGL failing mid-way** (context lost, shader compile error): the hatch promise rejects and the deck still appears. Test in Task 7.
5. **Tab hidden or phone locked** with ambient sound playing: sound pauses on `visibilitychange` and resumes on return, unless muted. Test in Task 5 via an injected document stub.

---

### Task 1: Vendor ogl, effects mode, and keep the card check stable

**Files:**
- Create: `vendor/ogl-1.0.11/` (copy of `node_modules/ogl/src/core/`, `src/math/`, `src/extras/Sphere.js`, same relative layout), `vendor/ogl.LICENSE`
- Create: `js/fx/mode.js`, `test/fx-mode.test.js`
- Modify: `package.json` (devDependency `"ogl": "1.0.11"`, exact), `tools/check-cards.mjs:105-107`

**Interfaces:**
- Produces: `effectsMode({ search: string, reduceMotion: boolean, webgl: boolean }) → 'off'|'calm'|'flat'|'full'`; `needsGate(mode) → boolean` (true unless `'off'`); `hasWebGL() → boolean` (browser only, not tested).

- [ ] **Step 1: Write the failing tests** in `test/fx-mode.test.js`:

```js
test('fx=off wins over everything', () => {
  assert.equal(effectsMode({ search: '?fx=off', reduceMotion: false, webgl: true }), 'off');
  assert.equal(effectsMode({ search: '?persona=dawn&fx=off', reduceMotion: true, webgl: false }), 'off');
});
test('reduced motion is calm, no WebGL is flat, else full', () => {
  assert.equal(effectsMode({ search: '', reduceMotion: true, webgl: true }), 'calm');
  assert.equal(effectsMode({ search: '', reduceMotion: false, webgl: false }), 'flat');
  assert.equal(effectsMode({ search: '', reduceMotion: false, webgl: true }), 'full');
});
test('shared links get the tap-the-egg gate unless effects are off', () => {
  assert.equal(needsGate('off'), false);
  for (const m of ['calm', 'flat', 'full']) assert.equal(needsGate(m), true);
});
```

- [ ] **Step 2:** Run `node --test test/fx-mode.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `js/fx/mode.js`. `hasWebGL` tries `canvas.getContext('webgl2') || getContext('webgl')` on a throwaway canvas.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5: Vendor ogl.** `npm install --save-dev --save-exact ogl@1.0.11`, then copy the three paths into `vendor/ogl-1.0.11/` (a `node -e "fs.cpSync(...)"` one-liner; PowerShell-safe). Write `vendor/ogl.LICENSE` with the Unlicense text and a header line `ogl 1.0.11 (https://github.com/oframe/ogl), subset: src/core, src/math, src/extras/Sphere.js`. Verify: `node -e "import('./vendor/ogl-1.0.11/core/Renderer.js').then(()=>console.log('ok'))"` prints `ok` or fails only on `document`/`window` (browser globals), not on a missing import.
- [ ] **Step 6: Card check runs with effects off.** In `tools/check-cards.mjs` navigate to `${url}?fx=off` and before navigating send `Emulation.setEmulatedMedia` with `features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]`. Run `node tools/check-cards.mjs <scratch>/before samples/demo.csv`. Expected: same pass result as on `main`.
- [ ] **Step 7: Commit** `Vendor ogl 1.0.11 and add the effects mode switch`.

### Task 2: Seeded randomness and the crack seam

**Files:**
- Create: `js/fx/seed.js`, `test/fx-seed.test.js`

**Interfaces:**
- Produces: `rng(seed) → () => number` in [0,1) (Mulberry32, copy from card-atlas `src/lib/ripped/tear/noise.js`); `deckSeed(stats) → number` = `stats.year * 100003 + stats.checklists`; `crackSeam(seed, segments = 64) → Array<{ a: number, y: number }>`: a closed seam around the egg, `a` the angle in [0, 2π] evenly stepped, `y` the height as a fraction of egg height, two octaves of seeded value noise around **0.62** with amplitude **0.06**.

- [ ] **Step 1: Write the failing tests:**

```js
test('same seed, same seam; different seed, different seam', () => {
  assert.deepEqual(crackSeam(7), crackSeam(7));
  assert.notDeepEqual(crackSeam(7), crackSeam(8));
});
test('seam is closed and stays in its band', () => {
  const s = crackSeam(42, 64);
  assert.equal(s.length, 65);
  assert.equal(s[0].a, 0);
  assert.ok(Math.abs(s.at(-1).a - 2 * Math.PI) < 1e-9);
  assert.ok(Math.abs(s[0].y - s.at(-1).y) < 1e-9);
  for (const p of s) assert.ok(p.y >= 0.56 - 1e-9 && p.y <= 0.68 + 1e-9);
});
test('deckSeed matches the spec formula', () => {
  assert.equal(deckSeed({ year: 2026, checklists: 12 }), 2026 * 100003 + 12);
});
```

- [ ] **Step 2:** Run, expect FAIL. **Step 3:** Implement (the noise wraps around: sample the lattice modulo its length so the last point equals the first). **Step 4:** `npm test` passes. **Step 5: Commit** `Add seeded crack seam for the egg`.

### Task 3: Which scene each card gets

**Files:**
- Create: `js/fx/scenes.js`, `test/fx-scenes.test.js`

**Interfaces:**
- Produces: `sceneFor(kind: string, stats, persona) → { sky: SkyName, particles: ParticleName|null, sound: SoundName|null }` where `kind` is the card's second class without the prefix (`'cover'`, `'headline'`, `'clock'`, `'persona'`, `'months'`, `'summary'`, …).
  - `SkyName`: `'dusk'|'sunrise'|'dawn'|'day'|'golden'|'night'|'lake'|'winter'|'spring'|'summer'|'autumn'|'neutral'`
  - `ParticleName`: `'mist'|'stars'|'fireflies'|'snow'|'blossoms'|'haze'|'leaves'`
  - `SoundName`: `'wind'|'chorus'|'owl'|'gulls'`

Table (from the spec):

| kind | rule | sky | particles | sound |
|---|---|---|---|---|
| cover | always | dusk | null | wind |
| summary | always | sunrise | null | chorus |
| clock | peak hour 4–8 | dawn | mist | chorus |
| clock | 9–16 | day | null | wind |
| clock | 17–19 | golden | null | wind |
| clock | 20–23, 0–3 | night | stars | owl |
| persona | id `dawn` | dawn | mist | chorus |
| persona | id `evening` | golden | null | wind |
| persona | id `sitspot` | dusk | fireflies | wind |
| persona | id `lakeshore` | lake | null | gulls |
| months | busiest Dec–Feb | winter | snow | wind |
| months | Mar–May | spring | blossoms | chorus |
| months | Jun–Aug | summer | haze | wind |
| months | Sep–Nov | autumn | leaves | wind |
| anything else, persona other ids, months with all zeros | | neutral | null | wind |

Peak hour = `startHours.indexOf(Math.max(...startHours))`; busiest month = same over `monthly` (ties: first, matching the cards).

- [ ] **Step 1: Write the failing tests:** one assertion per table row, e.g.

```js
const hours = (h) => Array.from({ length: 24 }, (_, i) => (i === h ? 5 : 0));
const months = (m) => Array.from({ length: 12 }, (_, i) => (i === m ? 9 : 1));
test('clock follows the peak hour', () => {
  assert.deepEqual(sceneFor('clock', { startHours: hours(6) }), { sky: 'dawn', particles: 'mist', sound: 'chorus' });
  assert.equal(sceneFor('clock', { startHours: hours(8) }).sky, 'dawn');
  assert.equal(sceneFor('clock', { startHours: hours(9) }).sky, 'day');
  assert.equal(sceneFor('clock', { startHours: hours(17) }).sky, 'golden');
  assert.deepEqual(sceneFor('clock', { startHours: hours(21) }), { sky: 'night', particles: 'stars', sound: 'owl' });
  assert.equal(sceneFor('clock', { startHours: hours(3) }).sky, 'night');
});
test('months follows the busiest month; a quiet year is neutral', () => {
  assert.equal(sceneFor('months', { monthly: months(0) }).particles, 'snow');
  assert.equal(sceneFor('months', { monthly: months(11) }).sky, 'winter');
  assert.equal(sceneFor('months', { monthly: months(9) }).particles, 'leaves');
  assert.equal(sceneFor('months', { monthly: Array(12).fill(0) }).sky, 'neutral');
});
```

plus the persona rows, cover, summary, and `sceneFor('lifers', s, p).sky === 'neutral'`.

- [ ] **Step 2:** expect FAIL. **Step 3:** implement as a lookup. **Step 4:** `npm test` passes. **Step 5: Commit** `Pick a sky, particles and sound for each card`.

### Task 4: The flock and the shapes it flies into

**Files:**
- Create: `js/fx/flock.js`, `js/fx/targets.js`, `test/fx-flock.test.js`

**Interfaces:**
- Produces (`flock.js`, CPU boids, the builder's call per spec: ≤ 600 birds is cheap on the CPU):
  - `createFlock(n, seed, bounds: {w, h}) → Flock` where `Flock = { x: Float32Array, y, vx, vy, n, targets: Float32Array|null, pull: number }`
  - `setTargets(flock, points: Float32Array|null, pull = 1)`: `points` is `[x0,y0,x1,y1,…]` of length `2n`; `pull` in [0,1] blends boid steering (0) to target seeking (1).
  - `stepFlock(flock, dt, { bounds, pointer: {x,y}|null })`: separation/alignment/cohesion with a uniform grid (cell 40 px), soft edge turn-back, pointer repulsion within 90 px, speed clamped to [40, 220] px/s when free; when `pull > 0`, each bird i steers to target i (critically damped spring) and may slow to 0.
  - `resizeFlock(flock, n, seed)`: keeps existing birds, adds or drops from the end.
- Produces (`targets.js`):
  - `samplePoints(mask: Uint8ClampedArray, w, h, n, seed) → Float32Array(2n)`: picks n pixel positions with alpha ≥ 128, spread evenly (stratified by row-major index, seeded jitter within each stratum). Returns empty array for n = 0; if the mask is empty, all points at the centre.
  - `ringTargets(n, cx, cy, r) → Float32Array(2n)`: evenly spaced, first point at the top.
  - `arcTargets(n, points: Array<[x,y]>, spread = 18, seed) → Float32Array(2n)`: birds spread along the polyline (the cover's flight path, in screen pixels), with seeded perpendicular offset up to `spread`.
  - `useRing(species) → boolean`: `species < 40`.

- [ ] **Step 1: Write the failing tests:**

```js
test('flock birds stay in bounds and keep moving', () => {
  const f = createFlock(200, 1, { w: 400, h: 300 });
  for (let i = 0; i < 600; i++) stepFlock(f, 1 / 60, { bounds: { w: 400, h: 300 }, pointer: null });
  for (let i = 0; i < f.n; i++) {
    assert.ok(f.x[i] > -60 && f.x[i] < 460 && f.y[i] > -60 && f.y[i] < 360);
    assert.ok(Math.hypot(f.vx[i], f.vy[i]) >= 39);
  }
});
test('with full pull the flock settles on its targets', () => {
  const f = createFlock(30, 2, { w: 400, h: 300 });
  setTargets(f, ringTargets(30, 200, 150, 80), 1);
  for (let i = 0; i < 180; i++) stepFlock(f, 1 / 60, { bounds: { w: 400, h: 300 }, pointer: null });
  for (let i = 0; i < f.n; i++) assert.ok(Math.hypot(f.x[i] - f.targets[2 * i], f.y[i] - f.targets[2 * i + 1]) < 4);
});
test('empty and single-bird flocks are fine', () => {
  const f0 = createFlock(0, 3, { w: 100, h: 100 });
  stepFlock(f0, 1 / 60, { bounds: { w: 100, h: 100 }, pointer: null });
  assert.equal(ringTargets(0, 0, 0, 10).length, 0);
  assert.deepEqual([...ringTargets(1, 50, 50, 10)], [50, 40]);
});
test('samplePoints lands only on the mask', () => {
  const w = 20, h = 10, mask = new Uint8ClampedArray(w * h * 4);
  for (let y = 2; y < 8; y++) for (let x = 5; x < 9; x++) mask[(y * w + x) * 4 + 3] = 255;
  const p = samplePoints(mask, w, h, 12, 4);
  assert.equal(p.length, 24);
  for (let i = 0; i < 12; i++) { const x = Math.floor(p[2 * i]), y = Math.floor(p[2 * i + 1]); assert.ok(x >= 5 && x < 9 && y >= 2 && y < 8); }
});
test('ring for fewer than 40 species', () => {
  assert.equal(useRing(39), true);
  assert.equal(useRing(40), false);
});
test('resizeFlock keeps the birds it has', () => {
  const f = createFlock(10, 5, { w: 100, h: 100 });
  const x0 = f.x[3];
  resizeFlock(f, 20, 5);
  assert.equal(f.n, 20);
  assert.equal(f.x[3], x0);
});
```

- [ ] **Step 2:** expect FAIL. **Step 3:** implement both modules. **Step 4:** `npm test` passes. **Step 5: Commit** `Add the flock simulation and its target shapes`.

### Task 5: Sound and the mute buttons

**Files:**
- Create: `js/fx/sound.js`, `test/fx-sound.test.js`, `sounds/NOTICE.md`
- Modify: `index.html` (a `<button class="link-button mute-toggle" type="button" aria-pressed="false">Sound on</button>` in `.upload-inner` after the privacy line and in `.deck-bar-end` before `#share-link`), `css/style.css` (place them)

**Interfaces:**
- Produces: `isMuted(storage)`, `setMuted(value, storage)` (key `flightpath:muted`, storage errors swallowed, like card-atlas `src/lib/ripped/sound.js`); `createSound({ doc = document, storage = localStorage, base = 'sounds/' }) → { unlock(), play(name), ambient(name|null), setMuted(bool), dispose() }`.
  - Files: `crack.mp3`, `flutter.mp3`, `wind.mp3`, `chorus.mp3`, `owl.mp3`, `gulls.mp3`. `play` is one-shot (`crack`, `flutter`, `owl`); `ambient` loops `wind`/`chorus`/`gulls` and cross-fades over **1.2 s**; `ambient('owl')` means wind ambience plus one `owl` play 1.5 s after the scene starts. Master gain 0.35.
  - `unlock()` creates/resumes the `AudioContext`; call it from the drop, file-change, demo click and gate tap handlers.
  - On `doc` `visibilitychange` to hidden: suspend the context; on visible: resume unless muted.
  - Missing/undecodable file → that sound is silent (fetch check as in card-atlas, minus `import.meta.env`).

- [ ] **Step 1: Write the failing tests** (no `AudioContext` in Node, so test storage and the visibility wiring with stubs):

```js
test('mute is remembered and survives broken storage', () => {
  const mem = new Map(), storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(isMuted(storage), false);
  setMuted(true, storage);
  assert.equal(isMuted(storage), true);
  const broken = { getItem() { throw new Error(); }, setItem() { throw new Error(); } };
  assert.equal(isMuted(broken), false);
  setMuted(true, broken);
});
test('hiding the tab suspends audio and showing resumes it', async () => {
  const calls = [];
  globalThis.AudioContext = class { constructor() { this.state = 'running'; this.destination = {}; }
    createGain() { return { gain: { value: 1, setTargetAtTime() {} }, connect() {} }; }
    suspend() { calls.push('suspend'); return Promise.resolve(); } resume() { calls.push('resume'); return Promise.resolve(); } };
  const listeners = {}, doc = { hidden: false, addEventListener: (t, f) => (listeners[t] = f), removeEventListener() {} };
  const s = createSound({ doc, storage: { getItem: () => null, setItem() {} } });
  s.unlock();
  doc.hidden = true; listeners.visibilitychange();
  doc.hidden = false; listeners.visibilitychange();
  assert.deepEqual(calls.slice(-2), ['suspend', 'resume']);
  delete globalThis.AudioContext;
});
```

- [ ] **Step 2:** expect FAIL. **Step 3:** implement. Mute buttons: wired in Task 8; here only the markup and styles. **Step 4:** `npm test` passes. **Step 5:** `sounds/NOTICE.md` lists the six expected file names with "source: (owner to fill in), license: CC0". **Step 6: Commit** `Add sound playback with a remembered mute`.

### Task 6: Skies and the overlay

**Files:**
- Create: `js/fx/sky.js`, `js/fx/overlay.js`, `css/fx.css`
- Modify: `index.html` (link `css/fx.css`; add `<div id="fx-sky" aria-hidden="true"><div></div><div></div></div>` first in `<body>` and `<canvas id="fx-overlay" aria-hidden="true"></canvas>` last before scripts)

**Interfaces:**
- Consumes: `sceneFor` (Task 3), flock functions (Task 4), `rng` (Task 2).
- Produces:
  - `createSky(el) → { set(sky: SkyName) }`: two child layers; the incoming one gets class `sky-<name>` and fades to opacity 1 over 1 s while the other fades out. `set` with the current sky is a no-op. `.sky-dusk` and `.sky-sunrise` reuse the Cover and Summary card gradients from `css/style.css`; the others are new gradients in `css/fx.css`, all dark enough that the deck bar text (`--fg` on `--bg`) still reads at 4.5:1. `#fx-sky` is `position: fixed; inset: 0; z-index: -1`; `body` background becomes transparent when `#fx-sky` is active (class `fx-on` on `<html>`).
  - `createOverlay(canvas, { mode, seed }) → { setFlock(n), setParticles(name|null), flyTo(points|null, pull), release(), birdColor(css), start(), stop(), resize() }`. Draws birds as small chevrons (5–7 px wing span, wings flap by a per-bird phase) in `birdColor` (default `rgba(255,255,255,0.85)` off-card; caller switches to the card's number colour for the murmuration), and particles per `ParticleName` with at most **120** particles on a phone (`innerWidth < 700`) and **220** otherwise, opacity ≤ 0.25. Owl eyes for `stars`: two soft amber dots in a random margin, blinking every 4–7 s. `resize` matches `devicePixelRatio` (capped at 2). Frame time watchdog: if the average frame over 2 s exceeds 20 ms, halve particles, then drop `mist`.
  - In `calm` mode `createOverlay` returns the same API but never draws and `start` is a no-op.

- [ ] **Step 1:** Implement `sky.js`, `fx.css`, `overlay.js`.
- [ ] **Step 2: Verify in the browser.** `npm start`, open `http://localhost:8000/?persona=dawn` and in DevTools console run a scratch import, `const { createOverlay } = await import('./js/fx/overlay.js')`, then `setFlock(150)` and `setParticles(name)` for each particle name. Expected: smooth motion, Performance panel shows under 16 ms per frame with 4× CPU throttling and 600 birds plus snow.
- [ ] **Step 3:** `npm test` still passes; `node tools/check-cards.mjs <scratch>/t6 samples/demo.csv` still passes (overlay not active with `fx=off`).
- [ ] **Step 4: Commit** `Add sky layers and the flock and particle overlay`.

### Task 7: The egg and the hatch sequence

**Files:**
- Create: `js/fx/sequence.js`, `test/fx-sequence.test.js`, `js/fx/egg.js` (ogl), `js/fx/egg-flat.js` (Canvas 2D)
- Modify: `index.html` (`<canvas id="egg" aria-hidden="true"></canvas>` inside `.upload-inner` above `#drop`), `css/fx.css` (egg size: 160 px tall on phones, 200 px on desktop)

**Interfaces:**
- Consumes: `crackSeam`, `rng` (Task 2).
- Produces:
  - `createSequence({ run: () => Promise<void>, reveal: () => void }) → { start(): Promise<void>, skip(): void, running: boolean }`. `reveal` is called **exactly once** per sequence: when `run` resolves, when `run` rejects, or on the first `skip()`, whichever is first. `start` a second time while running returns the same promise.
  - Egg scenes, both files, same API: `createEgg(canvas, { seed }) → { wobble(level: 0|1|2), hatch({ onCrack, onBurst }): Promise<void>, reset(seed), dispose() }`. `hatch` timeline: cracks spread along `crackSeam(seed)` 0–900 ms (`onCrack()` at 0), cap lifts off and shards fall 900–1700 ms (`onBurst({ x, y })` at 900 ms with the egg top's position in viewport pixels), resolves at 1700 ms. Rejects if the GL context is lost or a shader fails to compile.
  - `egg.js`: ogl `Renderer`/`Camera`/`Mesh`/`Program`, egg = `Sphere` scaled (x 0.78, y 1.0, z 0.78) with the top half squashed into an egg profile in the vertex shader; fragment shader: warm cream base, seeded brown speckles (value noise thresholded), Lambert + Blinn-Phong highlight, crack lines drawn where `abs(height - seam(angle)) < width` with width growing over the crack phase. Shards: 10–14 triangle fans cut from the shell above the seam, with seeded velocities, spin and gravity. Nest: a ring of dark brushed strokes drawn in the fragment shader of a quad below the egg. Imports from `../../vendor/ogl-1.0.11/core/*.js` and `../../vendor/ogl-1.0.11/extras/Sphere.js`.
  - `egg-flat.js`: the same look painted with 2D gradients; cracks drawn as the seam polyline; the shell splits into two halves along the seam that fall away.
  - Wobble: level 0 slow idle sway (±2°, 4 s), 1 on hover/dragover (±6°, 0.8 s), 2 while reading (±10° with small hops).

- [ ] **Step 1: Write the failing tests** in `test/fx-sequence.test.js`:

```js
test('reveal happens once when the run finishes', async () => {
  let n = 0; const s = createSequence({ run: () => Promise.resolve(), reveal: () => n++ });
  await s.start(); assert.equal(n, 1);
});
test('skip reveals at once and the finished run does not reveal again', async () => {
  let n = 0, done; const s = createSequence({ run: () => new Promise((r) => (done = r)), reveal: () => n++ });
  const p = s.start(); s.skip(); s.skip(); assert.equal(n, 1);
  done(); await p; assert.equal(n, 1);
});
test('a failed run still reveals', async () => {
  let n = 0; const s = createSequence({ run: () => Promise.reject(new Error('context lost')), reveal: () => n++ });
  await s.start(); assert.equal(n, 1);
});
test('starting twice while running is one sequence', async () => {
  let runs = 0; const s = createSequence({ run: async () => { runs++; }, reveal() {} });
  await Promise.all([s.start(), s.start()]); assert.equal(runs, 1);
});
```

- [ ] **Step 2:** expect FAIL. **Step 3:** implement `sequence.js`. **Step 4:** `npm test` passes.
- [ ] **Step 5:** Implement `egg.js` and `egg-flat.js`. Verify in the browser with a console import: `createEgg(document.getElementById('egg'), { seed: 1 })`, try wobble levels and `hatch()`; then the same with `egg-flat.js`. Expected: crack follows a jagged ring, shards tumble out of frame, promise resolves around 1.7 s; seeds 1 and 2 crack differently; seed 1 twice cracks the same.
- [ ] **Step 6: Commit** `Add the egg, its 2D fallback and the hatch sequence`.

### Task 8: Wire it into the app

**Files:**
- Create: `js/fx/index.js`
- Modify: `js/app.js` (`load`, `renderDeck`, `show`, `openSharedDeck`, `readFile`/`setBusy`, the demo, back and keydown handlers), `js/slides.js:130` (add `data-murmur` to the Headline `.big-number` only), `index.html` (a `#gate` screen: `<main id="gate" class="screen" hidden>` with the egg canvas moved into it when used, text "A <span id="gate-year"></span> Flight Path, shared with you", and a button "Tap the egg to open it"), `css/fx.css` (`.card-frame.murmuring [data-murmur] { opacity: 0 }`, gate layout)

**Interfaces:**
- Consumes: everything above.
- Produces: `initEffects({ search, reduceMotion }) → Fx` with
  - `fx.mode`
  - `fx.egg`: `wobble(level)`, `reset(seed)`
  - `fx.hatch(stats, reveal: () => void): Promise<void>`: unlocks sound, plays `crack` on crack and `flutter` on burst, `overlay.setFlock(Math.min(stats.species, 600))` with birds starting at the burst point, then `flyTo(arcTargets(n, coverArcOnScreen, 18, seed), 0.8)` once the deck is revealed (at 1700 ms), `release()` at 2700 ms. Any key or tap during the hatch calls `skip()`. In `calm`: no motion; the egg canvas cross-fades out over 400 ms, then `reveal`. In `off`: `reveal()` immediately.
  - `fx.onCard(frame, kind, stats, persona)`: `sky.set`, `overlay.setParticles`, `sound.ambient` from `sceneFor`; on `headline`, the murmuration: add `murmuring` to `frame`, set the bird colour to the computed colour of `[data-murmur]`, sample the number into points (draw `textContent` with the element's computed font, scaled by `--scale`, into an offscreen canvas sized to its `getBoundingClientRect()`, then `samplePoints`), `flyTo(points, 1)` for 0–700 ms, hold to 1300 ms, remove `murmuring` (the number fades in via a 300 ms opacity transition), `release()` and restore the colour at 1500 ms. Under 40 species: `flyTo(ringTargets(n, cx, cy, r), 1)` with `r` = 0.7 × the number's width, keep the count-up, release at 1800 ms. Leaving the card early ends the murmuration and removes `murmuring` immediately. Summary: `flyTo` a loose V that exits off the top edge, then `setFlock(0)`.
  - `fx.gate(stats): Promise<void>`: shows `#gate` with the egg; resolves on tap or Enter/Space on the button after `unlock()`.
  - `fx.resetForUpload()`: `overlay.setFlock(0)`, `sky.set('neutral')`, `sound.ambient(null)`, `egg.reset()`.
  - `fx.resizeFlock(species)` for the year picker.
- App changes:
  - `readFile`: `egg.wobble(2)` while busy; dragover/hover → `wobble(1)`; dragleave/mouseleave → `wobble(0)`.
  - `load(text)`: build the deck as today but keep `#deck` hidden; `fx.hatch(stats, reveal)` where `reveal` does today's "hide upload, show deck, `fit()`, focus `#next`". Remember `fit()` needs the deck visible, so it runs inside `reveal`.
  - Year picker: `render()` then `fx.resizeFlock(state.stats.species)`; no hatch.
  - `show()`: after `enter(...)`, `fx.onCard(frame, kindOf(frame), state.stats, state.persona)` where `kindOf` is the `.card`'s second class minus `card-`. Store `persona` on `state` in `renderDeck`.
  - `openSharedDeck`: if `needsGate(fx.mode)`, `await fx.gate(stats)` then `fx.hatch(...)`; else today's flow.
  - Back/"Start over": `fx.resetForUpload()`.
  - Mute buttons: toggle `sound.setMuted`, `aria-pressed`, label "Sound on"/"Sound off".
  - `settle()` is unchanged: the hidden number lives on the frame's class, and only `.card` is captured.

- [ ] **Step 1:** Implement `js/fx/index.js` and the app changes.
- [ ] **Step 2:** `npm test` passes (`slides.test.js` still matches; `data-murmur` is additive).
- [ ] **Step 3: Card check with effects off still passes:** `node tools/check-cards.mjs <scratch>/t8 samples/demo.csv` and `node tools/check-cards.mjs <scratch>/t8-one test/fixtures/edge/one-checklist.csv`.
- [ ] **Step 4: Review Focus 1, verify the capture.** In the browser with the demo: go to Headline and within 500 ms press Download. Expected: the saved PNG shows the species number.
- [ ] **Step 5: Manual passes**, each in Chrome with the demo, and once with `one-checklist.csv`: drop → hatch → deck; tap during hatch skips to deck once; drop a second file mid-hatch does not start a second hatch; demo button hatches; year picker resizes without hatch; Start over gives a fresh egg; a deck link opens on the gate and hatches on tap; DevTools "Emulate prefers-reduced-motion" gives the calm path; `?fx=off` behaves like `main`; with `chrome://flags` WebGL disabled (or `--disable-webgl`) the flat egg is used; mute persists across reload; switching tabs pauses ambient sound.
- [ ] **Step 6: Commit** `Hatch the deck from the egg and give each card its scene`.

### Task 9: Screenshots of the effects, docs, and handoff

**Files:**
- Modify: `tools/check-cards.mjs` (a `--fx` flag: skip contrast, load without `fx=off` and without reduced-motion emulation, and after each card's entrance save a full-viewport screenshot `fx-NN-<kind>.png`; to reach the night and winter scenes it also runs with `?persona=dawn` once), `README.md` (a "Hatch, flock and scenes" section: the experience, modes, `?fx=off`, sound files and `sounds/NOTICE.md`, the privacy note that nothing is fetched from elsewhere), `docs/decisions.md` (entry: ogl vendored subset; Canvas 2D for the overlay rather than WebGL because ≤ 600 birds is cheap on the CPU and one renderer serves every mode; hidden number on the frame so captures never see it), `docs/STATUS.md`, `CLAUDE.md` (Commands: `--fx`; Structure: `js/fx/`, `sounds/`)

- [ ] **Step 1:** Add `--fx`. Run `node tools/check-cards.mjs <scratch>/fx samples/demo.csv --fx`. Expected: one screenshot per card. Review by eye: Clock night (use a synthetic export from `node tools/make-big-export.mjs` if the demo's peak isn't at night) and Months winter, Headline mid-murmuration: deck bar, buttons and card text all readable.
- [ ] **Step 2:** Run axe by hand on the upload page, gate and two cards (the overlay and sky are `aria-hidden`, the mute and gate buttons have names).
- [ ] **Step 3:** Docs as listed. **Step 4:** `npm test` passes. **Step 5: Commit** `Document the hatch and add effect screenshots to the card check`.
