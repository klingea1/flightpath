// The egg painted in 2D: the fallback when WebGL isn't there, and the still
// egg for reduced motion. Same API as egg.js.
import { crackSeam, rng } from './seed.js';

const WOBBLE = [
  { amp: 2, period: 4000, hop: 0 },
  { amp: 6, period: 800, hop: 0 },
  { amp: 10, period: 420, hop: 6 },
];
const CRACK_MS = 900, OPEN_MS = 800;

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export function createEgg(canvas, { seed, still = false }) {
  const ctx = canvas.getContext('2d');
  let seam = crackSeam(seed);
  let speckles = [];
  let level = 0;
  let raf = 0;
  let hatch = null; // { start, resolve, shards, onBurst, burst }
  let w = 0, h = 0, rx = 0, ry = 0, cx = 0, cy = 0;

  function layout() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // The canvas overflows its host (the nest box); the egg is placed by the host.
    const host = (canvas.parentElement ?? canvas).getBoundingClientRect();
    const box = canvas.getBoundingClientRect();
    w = box.width || 160; h = box.height || 160;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ry = (host.height || 160) * 0.32; rx = ry * 0.78;
    cx = host.left - box.left + (host.width || 160) / 2;
    cy = host.top - box.top + (host.height || 160) * 0.56;
  }

  function speckle(s) {
    const random = rng(s ^ 0x9e3779b9);
    speckles = Array.from({ length: 34 }, () => ({
      u: random() * 2 - 1, v: random() * 1.9 - 0.95, r: 0.6 + random() * 2.2, a: 0.25 + random() * 0.45,
    }));
  }

  // Egg outline: narrower towards the top. y in [-1 top, 1 bottom].
  function eggPath() {
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * Math.PI * 2;
      const y = -Math.cos(t);
      const x = Math.sin(t) * (1 + 0.12 * y);
      i ? ctx.lineTo(x * rx, y * ry) : ctx.moveTo(x * rx, y * ry);
    }
    ctx.closePath();
  }

  // The seam's height on the egg's front, at horizontal position u in [-1, 1].
  function seamAt(u) {
    const a = ((Math.asin(Math.max(-1, Math.min(1, u))) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI);
    const p = seam[Math.round(a * (seam.length - 1))];
    return (1 - p.y) * 2 - 1; // fraction of height from the bottom → y in [-1, 1]
  }

  function paintShell(part) {
    // part: 0 whole, 1 top cap only, -1 bottom only.
    ctx.save();
    if (part) {
      ctx.beginPath();
      ctx.moveTo(-rx * 1.3, part > 0 ? -ry * 1.3 : ry * 1.3);
      for (let i = 0; i <= 40; i++) { const u = -1 + i / 20; ctx.lineTo(u * rx * 1.3, seamAt(Math.max(-1, Math.min(1, u))) * ry); }
      ctx.lineTo(rx * 1.3, part > 0 ? -ry * 1.3 : ry * 1.3);
      ctx.closePath();
      ctx.clip();
    }
    eggPath();
    const g = ctx.createRadialGradient(-rx * 0.35, -ry * 0.4, ry * 0.1, 0, 0, ry * 1.15);
    g.addColorStop(0, '#fffaf0');
    g.addColorStop(0.55, '#efe1c7');
    g.addColorStop(1, '#b99c78');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.clip();
    for (const s of speckles) {
      ctx.fillStyle = `rgba(110, 70, 40, ${s.a})`;
      ctx.beginPath(); ctx.arc(s.u * rx, s.v * ry, s.r, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  function paintCrack(progress) {
    ctx.save();
    eggPath(); ctx.clip();
    ctx.strokeStyle = 'rgba(70, 45, 25, 0.9)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    // Spreads both ways from the front; a small zigzag makes it read as a crack.
    let started = false;
    for (let i = -20; i <= 20; i++) {
      const u = i / 20;
      if (Math.abs(u) > progress) continue;
      const y = seamAt(u) * ry + (i % 2 ? 1.5 : -1.5);
      if (started) ctx.lineTo(u * rx, y);
      else { ctx.moveTo(u * rx, y); started = true; }
    }
    ctx.stroke();
    ctx.restore();
  }

  function draw(now) {
    ctx.clearRect(0, 0, w, h);
    const wb = WOBBLE[level];
    let angle = still ? 0 : wb.amp * Math.sin((now / wb.period) * 2 * Math.PI) * (Math.PI / 180);
    let hop = still ? 0 : wb.hop * Math.abs(Math.sin((now / wb.period) * 2 * Math.PI));
    const t = hatch ? now - hatch.start : -1;
    if (t >= 0) { angle *= 0.3; hop = 0; }

    // Nest shadow.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath(); ctx.ellipse(cx, cy + ry * 0.98, rx * 1.1, ry * 0.14, 0, 0, 7); ctx.fill();

    const open = t > CRACK_MS ? easeOut(Math.min(1, (t - CRACK_MS) / OPEN_MS)) : 0;
    ctx.save();
    ctx.translate(cx, cy + ry - hop);
    ctx.rotate(angle);
    ctx.translate(0, -ry);
    if (!open) {
      paintShell(0);
      if (t >= 0) paintCrack(easeOut(Math.min(1, t / CRACK_MS)));
    } else {
      ctx.save();
      ctx.globalAlpha = 1 - open;
      ctx.translate(0, open * ry * 0.4);
      paintShell(-1);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 1 - open;
      ctx.translate(open * rx * 0.8, -open * ry * 1.6);
      ctx.rotate(open * 0.9);
      paintShell(1);
      ctx.restore();
      for (const s of hatch.shards) {
        const k = (t - CRACK_MS) / 1000;
        ctx.fillStyle = `rgba(239, 225, 199, ${1 - open})`;
        ctx.save();
        ctx.translate(s.x + s.vx * k, s.y + s.vy * k + 300 * k * k);
        ctx.rotate(s.spin * k);
        ctx.beginPath(); ctx.moveTo(-s.r, -s.r * 0.6); ctx.lineTo(s.r, 0); ctx.lineTo(-s.r * 0.4, s.r * 0.8); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();

    if (hatch && !hatch.burst && t >= CRACK_MS) {
      hatch.burst = true;
      const box = canvas.getBoundingClientRect();
      hatch.onBurst?.({ x: box.left + cx, y: box.top + cy - ry * 0.4 });
    }
    if (hatch && t >= CRACK_MS + OPEN_MS) {
      const done = hatch.resolve;
      hatch = null;
      ctx.clearRect(0, 0, w, h);
      cancelAnimationFrame(raf); raf = 0;
      done();
      return;
    }
    if (!still || hatch) raf = requestAnimationFrame(draw);
  }

  layout();
  speckle(seed);
  raf = requestAnimationFrame(draw);

  return {
    wobble(l) { level = Math.max(0, Math.min(2, l)); },
    hatch({ onCrack, onBurst } = {}) {
      const random = rng(seed ^ 0x51ab);
      return new Promise((resolve) => {
        hatch = {
          start: performance.now(), resolve, onBurst, burst: false,
          shards: Array.from({ length: 12 }, () => ({
            x: (random() - 0.5) * rx * 1.4, y: -ry * 0.1 + (random() - 0.5) * ry * 0.4, r: 3 + random() * 5,
            vx: (random() - 0.5) * 220, vy: -120 - random() * 160, spin: (random() - 0.5) * 12,
          })),
        };
        onCrack?.();
        if (!raf) raf = requestAnimationFrame(draw);
      });
    },
    reset(s = seed) {
      seed = s;
      seam = crackSeam(seed);
      speckle(seed);
      hatch = null;
      level = 0;
      layout();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    },
    dispose() { cancelAnimationFrame(raf); raf = 0; ctx.clearRect(0, 0, w, h); },
  };
}
