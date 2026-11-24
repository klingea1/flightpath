// The layer above the deck where the flock and each scene's particles fly.
// Canvas 2D: up to 600 birds and ~200 particles is well within budget, and one
// renderer serves every mode. It never takes pointer events and never reaches
// a card image (only the .card element is captured).
import { createFlock, setTargets, stepFlock, resizeFlock } from './flock.js';
import { rng } from './seed.js';
import { traceBird, strokeSnowflake, fillBlossom } from './shapes.js';

const OVER_CARD = 0.25; // most any bird or particle may show over a card

export function createOverlay(canvas, { mode, seed }) {
  if (mode === 'calm' || mode === 'off') {
    const noop = () => {};
    return { setFlock: noop, burst: noop, setParticles: noop, flyTo: noop, release: noop, birdColor: noop,
      setCardRect: noop, start: noop, stop: noop, resize: noop, solid: noop, get flock() { return null; } };
  }

  const ctx = canvas.getContext('2d');
  const random = rng(seed ^ 0x5eed);
  let w = 0, h = 0, dpr = 1;
  let flock = createFlock(0, seed, { w: 1, h: 1 });
  let color = 'rgba(255, 246, 232, 0.85)';
  let solid = false; // murmuration: birds may cover the card at full strength
  let card = null;   // the active card's rect on screen
  let particles = [];
  let kind = null;
  let budget = 1;    // the frame-time watchdog lowers this
  let pointer = null;
  let raf = 0, last = 0;
  let slow = 0, frames = 0, spent = 0, work = 0;
  let owl = null;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    flock.bounds = { w, h };
  }

  const maxParticles = () => Math.round((w < 700 ? 120 : 220) * budget);

  function spawn(name, anywhere) {
    const p = { x: random() * w, y: anywhere ? random() * h : -20, r: 0, a: random() * Math.PI * 2, s: random(), t: random() * 10 };
    switch (name) {
      case 'snow': p.r = 3 + p.s * 4.5; p.vy = 22 + p.s * 30; break;
      case 'blossoms': p.r = 4 + p.s * 3.5; p.vy = 20 + p.s * 20; break;
      case 'leaves': p.r = 5 + p.s * 4; p.vy = 35 + p.s * 30; break;
      case 'stars': p.y = random() * h * 0.7; p.r = 0.6 + p.s * 1.4; break;
      case 'fireflies': p.y = h * 0.3 + random() * h * 0.7; p.r = 2 + p.s * 1.5; break;
      case 'mist': p.y = h * (0.7 + random() * 0.35); p.r = 120 + p.s * 160; break;
      case 'haze': p.y = random() * h; p.r = 160 + p.s * 200; break;
    }
    return p;
  }

  function setParticles(name) {
    if (name === kind) return;
    kind = name;
    // Mist and haze are a few big soft shapes; snow and blossoms are fewer than
    // the rest, being bigger; "eyes" is just the owl.
    const n = !name || name === 'eyes' ? 0
      : name === 'mist' || name === 'haze' ? Math.round(10 * budget)
      : name === 'snow' || name === 'blossoms' ? Math.round(maxParticles() * 0.45)
      : maxParticles();
    particles = Array.from({ length: n }, () => spawn(name, true));
    owl = name === 'stars' || name === 'eyes' ? { x: 0, y: 0, next: 1.2, left: 0, size: 6 } : null;
  }

  const fade = (x, y, a) => (!solid && card && x > card.left && x < card.right && y > card.top && y < card.bottom ? Math.min(a, OVER_CARD) : a);

  function drawParticles(dt, time) {
    for (const p of particles) {
      p.t += dt;
      let alpha = 0.2;
      ctx.save();
      switch (kind) {
        case 'snow':
          p.y += p.vy * dt; p.x += Math.sin(p.t * 0.8 + p.a) * 12 * dt; p.a += dt * (p.s - 0.5) * 0.8;
          ctx.translate(p.x, p.y); ctx.rotate(p.a);
          ctx.strokeStyle = `rgba(240,248,255,${fade(p.x, p.y, 0.4 + 0.3 * p.s)})`;
          ctx.lineWidth = 0.8 + p.s * 0.6;
          ctx.lineCap = 'round';
          strokeSnowflake(ctx, p.r);
          break;
        case 'blossoms': {
          p.y += p.vy * dt; p.x += Math.sin(p.t * 0.9 + p.a) * 22 * dt; p.a += dt * (0.6 + p.s);
          ctx.translate(p.x, p.y); ctx.rotate(p.a);
          ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.cos(p.t * 1.3 + p.a))); // tumbling as it falls
          const a = fade(p.x, p.y, 0.7);
          fillBlossom(ctx, p.r, `rgba(255,196,216,${a})`, `rgba(214,96,140,${a})`);
          break;
        }
        case 'leaves': {
          p.y += p.vy * dt; p.x += Math.sin(p.t * 0.9 + p.a) * 22 * dt; p.a += dt * (0.8 + p.s);
          const tint = p.s < 0.5 ? '230,120,50' : '200,70,40';
          ctx.translate(p.x, p.y); ctx.rotate(p.a);
          ctx.fillStyle = `rgba(${tint},${fade(p.x, p.y, 0.25)})`;
          ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.5, 0, 0, 7); ctx.fill();
          break;
        }
        case 'stars':
          alpha = 0.12 + 0.13 * (0.5 + 0.5 * Math.sin(p.t * (1 + p.s * 2) + p.a));
          ctx.fillStyle = `rgba(255,248,230,${fade(p.x, p.y, alpha)})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
          break;
        case 'fireflies': {
          p.x += Math.cos(p.t * 0.4 + p.a) * 14 * dt; p.y += Math.sin(p.t * 0.33 + p.a * 2) * 10 * dt;
          alpha = 0.25 * Math.max(0, Math.sin(p.t * 0.9 + p.a));
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
          g.addColorStop(0, `rgba(255,236,140,${fade(p.x, p.y, alpha)})`);
          g.addColorStop(1, 'rgba(255,236,140,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4, 0, 7); ctx.fill();
          break;
        }
        case 'mist':
        case 'haze': {
          p.x += (kind === 'mist' ? 10 : 5) * (p.s - 0.3) * dt;
          if (p.x - p.r > w) p.x = -p.r; if (p.x + p.r < 0) p.x = w + p.r;
          const tint = kind === 'mist' ? '255,214,170' : '255,200,140'; // dawn mist catches the sun
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
          g.addColorStop(0, `rgba(${tint},${kind === 'mist' ? 0.09 : 0.07})`);
          g.addColorStop(1, `rgba(${tint},0)`);
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
          break;
        }
      }
      ctx.restore();
      if (p.y - p.r > h + 20) Object.assign(p, spawn(kind, false));
    }
    if (owl) drawOwl(dt);
  }

  // Where the owl can sit: the widest margin round the card (left, right, or
  // the strip below it, above the buttons). With no room, over the card's edge.
  function owlSpot() {
    if (!card) return { x: w * (random() < 0.5 ? 0.12 : 0.88), y: h * (0.25 + random() * 0.4) };
    const spots = [
      { room: card.left, x: card.left / 2, y: card.top + (card.bottom - card.top) * (0.2 + random() * 0.5) },
      { room: w - card.right, x: (card.right + w) / 2, y: card.top + (card.bottom - card.top) * (0.2 + random() * 0.5) },
      { room: (h - card.bottom - 70) * 1.5, x: w * (0.2 + random() * 0.6), y: card.bottom + (h - card.bottom - 70) / 2 },
    ];
    const best = spots.reduce((a, b) => (b.room > a.room ? b : a));
    if (best.room >= 44) return best;
    return { x: card.left + (card.right - card.left) * (random() < 0.5 ? 0.12 : 0.88), y: card.top + (card.bottom - card.top) * 0.18 };
  }

  const OWL_STARE = 3.4; // seconds the eyes are open

  // A pair of owl eyes that blink open somewhere in the margin, now and then:
  // they open slowly, blink twice, and close.
  function drawOwl(dt) {
    owl.next -= dt;
    if (owl.next <= 0 && owl.left <= 0) {
      Object.assign(owl, owlSpot());
      owl.size = w < 700 ? 6 : 8;
      owl.left = OWL_STARE;
      owl.next = OWL_STARE + 3 + random() * 3;
    }
    if (owl.left <= 0) return;
    owl.left -= dt;
    const t = OWL_STARE - owl.left;
    const ease = (x) => Math.max(0, Math.min(1, x));
    let lid = Math.min(ease(t / 0.35), ease(owl.left / 0.3));          // opening and closing
    for (const b of [1.2, 2.3]) if (Math.abs(t - b) < 0.09) lid = Math.min(lid, Math.abs(t - b) / 0.09); // blinks
    const e = owl.size, a = fade(owl.x, owl.y, 1);
    for (const dx of [-1.35 * e, 1.35 * e]) {
      const x = owl.x + dx, y = owl.y;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, e * 2.4);
      glow.addColorStop(0, `rgba(255,180,60,${0.35 * a * Math.max(lid, 0.2)})`);
      glow.addColorStop(1, 'rgba(255,180,60,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, e * 2.4, 0, 7); ctx.fill();
      if (lid < 0.04) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, lid);
      ctx.fillStyle = `rgba(255,184,48,${a})`;
      ctx.beginPath(); ctx.arc(0, 0, e, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(20,10,4,${a})`;
      ctx.beginPath(); ctx.arc(0, 0, e * 0.52, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(255,255,240,${0.8 * a})`;
      ctx.beginPath(); ctx.arc(-e * 0.25, -e * 0.3, e * 0.16, 0, 7); ctx.fill();
      ctx.restore();
    }
  }

  // All birds in two paths (clear of the card, and faded over it), so 600
  // birds cost two fills rather than 600.
  function drawBirds() {
    const near = new Path2D(), over = new Path2D();
    for (let i = 0; i < flock.n; i++) {
      const x = flock.x[i], y = flock.y[i];
      if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue;
      const s = Math.hypot(flock.vx[i], flock.vy[i]) || 1;
      const flap = Math.sin(flock.phase[i]) * 0.5 + 0.5;
      const span = solid ? 7 : 5 + (i % 3) * 0.7; // half wingspan
      traceBird(fade(x, y, 1) < 1 ? over : near, x, y, flock.vx[i] / s, flock.vy[i] / s, span, flap);
    }
    ctx.fill(near);
    ctx.globalAlpha = OVER_CARD;
    ctx.fill(over);
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    const t0 = performance.now();
    ctx.clearRect(0, 0, w, h);
    drawParticles(dt, now / 1000);
    stepFlock(flock, dt, { bounds: { w, h }, pointer });
    ctx.fillStyle = color;
    drawBirds();
    const cost = performance.now() - t0;
    work = work * 0.95 + cost * 0.05;
    watchdog(Math.max(cost, dt * 1000));
  }

  // Two seconds of slow frames: halve the particles, then drop mist and haze.
  function watchdog(ms) {
    frames++; spent += ms;
    if (frames < 120) return;
    const avg = spent / frames;
    frames = 0; spent = 0;
    if (avg <= 20) return;
    slow++;
    budget = slow === 1 ? 0.5 : 0.25;
    particles.length = Math.min(particles.length, Math.max(1, Math.round(particles.length / 2)));
    if (slow >= 2 && (kind === 'mist' || kind === 'haze')) { particles = []; }
  }

  const onPointer = (e) => { pointer = { x: e.clientX, y: e.clientY }; };
  const onLeave = () => { pointer = null; };

  resize();
  return {
    setFlock(n) { resizeFlock(flock, n, seed); },
    /** The flock bursts out of (x, y): n birds, flung up and out. */
    burst(x, y, n) {
      flock = createFlock(n, seed, { w, h });
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (random() - 0.5) * 2.2, s = 180 + random() * 260;
        flock.x[i] = x + (random() - 0.5) * 20; flock.y[i] = y + (random() - 0.5) * 10;
        flock.vx[i] = Math.cos(a) * s; flock.vy[i] = Math.sin(a) * s;
      }
    },
    setParticles,
    flyTo(points, pull = 1) { setTargets(flock, points, pull); },
    release() { setTargets(flock, null); solid = false; },
    birdColor(css) { color = css; },
    /** solid: the birds are the number, so they may cover the card fully. */
    solid(on) { solid = on; },
    setCardRect(rect) { card = rect; },
    start() {
      if (raf) return;
      last = 0;
      window.addEventListener('pointermove', onPointer, { passive: true });
      window.addEventListener('pointerleave', onLeave);
      raf = requestAnimationFrame(frame);
    },
    stop() {
      cancelAnimationFrame(raf); raf = 0;
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerleave', onLeave);
      ctx.clearRect(0, 0, w, h);
    },
    resize,
    get flock() { return flock; },
    /** Smoothed script time per frame, ms. */
    get workMs() { return work; },
  };
}
