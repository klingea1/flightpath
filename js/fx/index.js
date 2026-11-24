// The hatch, the flock, each card's sky and the sound: the one module app.js
// talks to. Every method is safe to call in any mode; with ?fx=off they do
// nothing and the deck behaves exactly as it did before effects existed.
import { effectsMode, needsGate, hasWebGL } from './mode.js';
import { deckSeed } from './seed.js';
import { sceneFor, previewScene } from './scenes.js';
import { samplePoints, ringTargets, arcTargets, useRing } from './targets.js';
import { createSequence } from './sequence.js';
import { createSky } from './sky.js';
import { createOverlay } from './overlay.js';
import { createSound } from './sound.js';
import { createEgg as createFlatEgg } from './egg-flat.js';

const MAX_BIRDS = 600;
const $ = (id) => document.getElementById(id);

export function initEffects({ search, reduceMotion }) {
  const mode = effectsMode({ search, reduceMotion, webgl: mode0WebGL(search, reduceMotion) });
  if (mode === 'off') return offEffects();

  document.documentElement.classList.add('fx-on');
  const sky = createSky($('fx-sky'));
  sky.set('neutral');
  const overlay = createOverlay($('fx-overlay'), { mode, seed: 1 });
  overlay.start();
  const sound = createSound();
  const host = $('egg-host');
  const home = { parent: host.parentElement, next: host.nextElementSibling };
  let seed = 1;
  let birds = 0;
  let egg = null;
  let sequence = null;
  let murmur = null; // { frame, timers }
  let hatching = false; // a hatch is running: new files and clicks wait
  let releaseTimer = 0;
  // ?scene=night (or dawn, evening, winter, spring, …) shows that scene on every card.
  const preview = previewScene(new URLSearchParams(search).get('scene'));

  // The WebGL egg when it starts cleanly; otherwise (or calm) the painted one.
  const eggReady = (async () => {
    if (mode === 'full') {
      try {
        const { createEgg } = await import('./egg.js');
        // A phone that sleeps can take the WebGL context away for good: carry on
        // with the painted egg rather than a blank one.
        egg = createEgg($('egg'), { seed, onLost: () => setTimeout(() => {
          egg.dispose();
          const fresh = $('egg').cloneNode();
          $('egg').replaceWith(fresh);
          egg = createFlatEgg(fresh, { seed });
        }) });
        return;
      } catch (e) {
        console.warn('WebGL egg unavailable, using the flat one:', e);
        // A canvas that already has a WebGL context can't give a 2D one.
        const fresh = $('egg').cloneNode();
        $('egg').replaceWith(fresh);
      }
    }
    try {
      egg = createFlatEgg($('egg'), { seed, still: mode === 'calm' });
    } catch (e) {
      // No canvas at all: the deck still opens, just without an egg.
      console.warn('No egg:', e);
      egg = null;
    }
  })();

  // Mute buttons: shown only when effects are on.
  const muteButtons = [...document.querySelectorAll('.mute-toggle')];
  // An action label, so a screen reader hears what a press will do.
  const paintMute = () => muteButtons.forEach((b) => {
    b.hidden = false;
    b.removeAttribute('aria-pressed');
    b.textContent = sound.muted ? 'Turn sound on' : 'Turn sound off';
  });
  muteButtons.forEach((b) => b.addEventListener('click', () => { sound.setMuted(!sound.muted); paintMute(); }));
  paintMute();

  // The cover's flight path in screen pixels, sampled along its arcs.
  function coverArc() {
    const svg = document.querySelector('.card-frame.active .card-cover .path-art');
    const pts = [];
    const m = svg?.getScreenCTM();
    if (m) {
      for (const p of svg.querySelectorAll('.arcs path')) {
        const n = p.getAttribute('d').match(/-?[\d.]+/g)?.map(Number);
        if (!n || n.length < 6) continue;
        const [x1, y1, cx, cy, x2, y2] = n;
        for (let i = 0; i <= 6; i++) {
          const t = i / 6, u = 1 - t;
          const x = u * u * x1 + 2 * u * t * cx + t * t * x2;
          const y = u * u * y1 + 2 * u * t * cy + t * t * y2;
          pts.push([m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
        }
      }
    }
    if (pts.length >= 2) return pts;
    // No places to draw (or no cover): a plain arc across the top of the screen.
    const w = window.innerWidth, h = window.innerHeight;
    return Array.from({ length: 12 }, (_, i) => [w * (0.15 + 0.7 * (i / 11)), h * (0.35 - 0.2 * Math.sin((i / 11) * Math.PI))]);
  }

  function cardRect() {
    const card = document.querySelector('.card-frame.active .card');
    return card ? card.getBoundingClientRect() : null;
  }

  // The page fades away and the egg glides to the middle of the screen and
  // grows, while the chick pecks. The transform is undone in resetForUpload.
  function zoomIn() {
    const box = host.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const scale = Math.max(1.5, Math.min(2.6, (0.95 * Math.min(vw, vh * 0.6)) / (box.height || 1)));
    const dx = vw / 2 - (box.left + box.width / 2);
    const dy = vh * 0.45 - (box.top + box.height * 0.56);
    host.style.setProperty('--zoom', `translate(${dx}px, ${dy}px) scale(${scale})`);
    host.classList.add('zooming');
    document.documentElement.classList.add('hatch-focus');
  }

  function zoomOut() {
    host.classList.remove('zooming');
    host.style.removeProperty('--zoom');
    document.documentElement.classList.remove('hatch-focus');
  }

  // burst: whether the shell already broke. Skipped earlier, the flock bursts
  // now, from where the egg was (measured before the upload screen hid).
  function afterReveal(burstAt, burst) {
    if (!burst) overlay.burst(burstAt.x, burstAt.y, birds);
    overlay.setCardRect(cardRect());
    overlay.flyTo(arcTargets(birds, coverArc(), 18, seed), 0.8);
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => overlay.release(), 1000);
  }

  // Ends a murmuration now (the number fades back in).
  function endMurmur() {
    if (!murmur) return;
    const { frame, timers } = murmur;
    murmur = null;
    timers.forEach(clearTimeout);
    frame.classList.remove('murmuring');
    overlay.release();
    overlay.birdColor('rgba(255, 246, 232, 0.85)');
  }

  // Before a card is saved: the capture copies computed styles, so the number
  // must be fully back, with no fade still running.
  function settleForSave(frame) {
    const el = frame.querySelector('[data-murmur]');
    if (murmur?.frame === frame) endMurmur();
    if (!el) return;
    el.style.transition = 'none';
    void el.offsetWidth;
    requestAnimationFrame(() => { el.style.transition = ''; });
  }

  // Where the number's glyphs are drawn on screen: the text's own box (the
  // element is a full-width block), the font at screen scale, and the baseline.
  function numberGlyphs(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const scale = el.getBoundingClientRect().width / (el.offsetWidth || 1);
    const font = `${cs.fontWeight} ${parseFloat(cs.fontSize) * scale}px ${cs.fontFamily}`;
    const text = el.dataset.final ?? el.textContent;
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = font;
    const m = ctx.measureText(text);
    const a = m.fontBoundingBoxAscent, d = m.fontBoundingBoxDescent;
    // The range box is the font's content area; the baseline sits at its ascent.
    const baseline = r.top + (a / (a + d)) * r.height;
    return { left: r.left, width: Math.max(r.width, m.width), font, text, baseline,
      inkTop: baseline - m.actualBoundingBoxAscent, inkBottom: baseline + m.actualBoundingBoxDescent };
  }

  // The birds become the species number, then lift off as it fades in.
  // Small years (under 40 birds) ring the number instead. The card is still
  // sliding in (220 ms), so the shape is aimed now and re-aimed once it lands.
  function murmuration(frame) {
    const el = frame.querySelector('[data-murmur]');
    const n = overlay.flock?.n ?? 0;
    // A card being saved right now keeps its number showing.
    if (!el || !n || mode === 'calm' || frame.capturing) return;
    const timers = [];
    murmur = { frame, timers };
    overlay.birdColor(getComputedStyle(el).color);
    overlay.solid(true);
    const ring = useRing(n);
    const aim = () => overlay.flyTo(ring ? ringShape(el, n) : digitShape(el, n), 1);
    aim();
    timers.push(setTimeout(aim, 250));
    if (ring) {
      timers.push(setTimeout(() => endMurmur(), 1800));
      return;
    }
    frame.classList.add('murmuring');
    timers.push(setTimeout(() => frame.classList.remove('murmuring'), 1300));
    timers.push(setTimeout(() => endMurmur(), 1500));
  }

  function ringShape(el, n) {
    const g = numberGlyphs(el);
    const radius = Math.max(g.width, g.inkBottom - g.inkTop) * 0.72;
    return ringTargets(n, g.left + g.width / 2, (g.inkTop + g.inkBottom) / 2, radius);
  }

  function digitShape(el, n) {
    const g = numberGlyphs(el);
    const pad = 4;
    const w = Math.ceil(g.width) + pad * 2, top = Math.floor(g.inkTop) - pad, h = Math.ceil(g.inkBottom - g.inkTop) + pad * 2;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.font = g.font;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(g.text, pad, g.baseline - top);
    const pts = samplePoints(ctx.getImageData(0, 0, w, h).data, w, h, n, seed);
    for (let i = 0; i < n; i++) { pts[2 * i] += g.left - pad; pts[2 * i + 1] += top; }
    return pts;
  }

  // On the Summary the flock forms a loose V and leaves off the top.
  function leave() {
    const n = overlay.flock?.n ?? 0;
    const w = window.innerWidth;
    const pts = new Float32Array(2 * n);
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1, k = Math.floor(i / 2);
      pts[2 * i] = w / 2 + side * k * 9;
      pts[2 * i + 1] = -80 - k * 6 + (k % 3) * 4;
    }
    overlay.flyTo(pts, 0.35);
  }

  return {
    mode,
    unlock() { sound.unlock(); },
    wobble(level) { egg?.wobble(level); },

    /** True while a hatch runs: the app ignores new files and clicks until the deck shows. */
    get busy() { return hatching; },

    /** Hatches the egg, then calls reveal() (exactly once) to show the deck. */
    async hatch(stats, reveal) {
      if (hatching) return;
      hatching = true;
      const screen = host.closest('.screen');
      let revealed = false;
      let burst = false;
      const burstAt = { x: 0, y: 0 };
      // While hatching, the invisible upload controls can't be reached, and a
      // tap, key press or stray drop only skips.
      const skip = (e) => { e.preventDefault(); e.stopPropagation(); sequence?.skip(); };
      const block = (e) => { e.preventDefault(); e.stopPropagation(); };
      const listen = (on) => {
        const f = on ? 'addEventListener' : 'removeEventListener';
        document[f]('pointerdown', skip, true);
        document[f]('keydown', skip, true);
        document[f]('dragover', block, true);
        document[f]('drop', block, true);
      };
      const show = (afterwards) => {
        if (revealed) return;
        revealed = true;
        hatching = false;
        listen(false);
        document.documentElement.classList.remove('hatch-focus');
        if (screen) { screen.classList.remove('hatching'); screen.inert = false; }
        reveal();
        afterwards?.();
      };
      try {
        sound.unlock();
        await eggReady;
        seed = deckSeed(stats);
        birds = Math.min(stats.species, MAX_BIRDS);
        const hostBox = host.getBoundingClientRect();
        Object.assign(burstAt, { x: hostBox.left + hostBox.width / 2, y: hostBox.top + hostBox.height * 0.35 });
        if (mode === 'calm' || !egg) {
          if (egg) {
            host.classList.add('fading');
            await new Promise((r) => setTimeout(r, 400));
          }
          show();
          return;
        }
        overlay.setFlock(0);
        if (screen) { screen.classList.add('hatching'); screen.inert = true; }
        zoomIn();
        sequence = createSequence({
          run: () => egg.hatch({
            // Each peck and the seam crack. After a skip the egg may still be
            // breaking off-screen: stay quiet.
            onCrack: () => { if (!revealed) sound.play('crack'); },
            onBurst: (p) => {
              if (revealed) return;
              burst = true;
              sound.play('flutter');
              Object.assign(burstAt, p);
              overlay.burst(p.x, p.y, birds);
            },
          }),
          reveal: () => show(() => afterReveal(burstAt, burst)),
        });
        listen(true);
        await sequence.start();
      } catch (e) {
        console.warn('Hatch failed, opening the deck:', e);
        show();
      }
    },

    /** The card now showing: its sky, particles, sound, and the Headline's murmuration. */
    onCard(frame, kind, stats, persona) {
      endMurmur();
      // The flock's flight in from the hatch mustn't cut across a new card's shape.
      if (kind !== 'cover') clearTimeout(releaseTimer);
      // Back from the Summary's exit (or any shape): the flock flies free again.
      overlay.release();
      const scene = preview ?? sceneFor(kind, stats, persona);
      sky.set(scene.sky);
      overlay.setParticles(scene.particles);
      sound.ambient(scene.sound);
      overlay.setCardRect(frame.querySelector('.card')?.getBoundingClientRect() ?? null);
      if (kind !== 'summary' && overlay.flock && overlay.flock.n < birds) overlay.setFlock(birds);
      if (kind === 'headline') murmuration(frame);
      if (kind === 'summary') leave();
    },

    settleForSave,

    /** A shared deck waits on "tap the egg"; resolves on the tap. */
    async gate(stats) {
      await eggReady;
      seed = deckSeed(stats);
      $('gate-year').textContent = stats.year;
      $('gate-open').prepend(host);
      $('upload').hidden = true;
      $('gate').hidden = false;
      egg.reset(seed);
      $('gate-open').focus();
      await new Promise((resolve) => $('gate-open').addEventListener('click', resolve, { once: true }));
      sound.unlock();
    },

    resetForUpload() {
      endMurmur();
      clearTimeout(releaseTimer);
      sequence = null;
      hatching = false;
      overlay.setFlock(0);
      overlay.setParticles(null);
      overlay.setCardRect(null);
      sky.set('neutral');
      sound.ambient(null);
      $('gate').hidden = true;
      home.parent.insertBefore(host, home.next);
      host.classList.remove('fading');
      zoomOut();
      egg?.reset(1);
    },

    resizeFlock(species) {
      birds = Math.min(species, MAX_BIRDS);
      overlay.setFlock(birds);
    },

    onResize() {
      overlay.resize();
      overlay.setCardRect(cardRect());
    },

    needsGate: needsGate(mode),
  };
}

// WebGL is only probed when it could matter (not with fx=off or reduced motion).
function mode0WebGL(search, reduceMotion) {
  if (reduceMotion || new URLSearchParams(search).get('fx') === 'off') return false;
  return hasWebGL();
}

function offEffects() {
  const noop = () => {};
  return {
    mode: 'off', busy: false, unlock: noop, wobble: noop, settleForSave: noop, resetForUpload: noop, resizeFlock: noop, onResize: noop, onCard: noop,
    async hatch(stats, reveal) { reveal(); },
    async gate() {},
    needsGate: false,
  };
}
