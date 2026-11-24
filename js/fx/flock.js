// A starling-style flock (boids) on the CPU. Up to 600 birds is cheap enough
// that one simulation serves every mode and screen.
import { rng } from './seed.js';

const CELL = 40;          // neighbour grid, px
const SEPARATE = 18;      // personal space, px
const MIN_SPEED = 40;     // px/s, when flying free
const MAX_SPEED = 220;
const POINTER = 90;       // pointer scare radius, px
const MARGIN = 40;        // soft edge, px
const OMEGA = 8;          // target spring: critically damped, settles in well under 1 s
const GROUPS = 3;         // wandering centres that gather the flock into murmuration blobs

function place(f, i, random, b) {
  f.x[i] = random() * b.w;
  f.y[i] = random() * b.h;
  const a = random() * 2 * Math.PI, s = 60 + random() * 60;
  f.vx[i] = Math.cos(a) * s;
  f.vy[i] = Math.sin(a) * s;
  f.phase[i] = random() * 2 * Math.PI;
}

export function createFlock(n, seed, bounds) {
  const f = {
    n, bounds: { ...bounds }, targets: null, pull: 0, time: 0,
    x: new Float32Array(n), y: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n),
    phase: new Float32Array(n),
  };
  const random = rng(seed);
  for (let i = 0; i < n; i++) place(f, i, random, bounds);
  return f;
}

/** points: [x0, y0, …] with one point per bird, or null to fly free. pull 0..1. */
export function setTargets(f, points, pull = 1) {
  f.targets = points && points.length >= 2 * f.n ? points : null;
  f.pull = f.targets ? Math.max(0, Math.min(1, pull)) : 0;
}

/** Keeps the birds it has; new ones appear at random spots. */
export function resizeFlock(f, n, seed) {
  if (n === f.n) return;
  for (const k of ['x', 'y', 'vx', 'vy', 'phase']) {
    const next = new Float32Array(n);
    next.set(f[k].subarray(0, Math.min(n, f.n)));
    f[k] = next;
  }
  const random = rng(seed + f.n);
  for (let i = f.n; i < n; i++) place(f, i, random, f.bounds);
  f.n = n;
  setTargets(f, null);
}

function grid(f) {
  const cells = new Map();
  for (let i = 0; i < f.n; i++) {
    const key = Math.floor(f.x[i] / CELL) * 4096 + Math.floor(f.y[i] / CELL);
    let list = cells.get(key);
    if (!list) cells.set(key, (list = []));
    list.push(i);
  }
  return cells;
}

export function stepFlock(f, dt, { bounds, pointer }) {
  if (bounds) f.bounds = bounds;
  const b = f.bounds;
  const free = 1 - f.pull;
  const cells = free > 0 ? grid(f) : null;
  f.time += dt;
  // Each third of the flock follows its own slow Lissajous centre, so the
  // birds gather into a few swirling blobs instead of spreading evenly.
  const centres = [];
  for (let k = 0; k < GROUPS; k++) {
    const t = f.time * 0.11 + k * 2.1;
    centres.push([b.w * (0.5 + 0.34 * Math.sin(t * 1.3 + k)), b.h * (0.5 + 0.3 * Math.sin(t * 0.9 + k * 1.7))]);
  }
  for (let i = 0; i < f.n; i++) {
    let ax = 0, ay = 0;
    const x = f.x[i], y = f.y[i];
    if (free > 0) {
      let sx = 0, sy = 0, avx = 0, avy = 0, cx = 0, cy = 0, count = 0;
      const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const list = cells.get((gx + ox) * 4096 + gy + oy);
        if (!list) continue;
        for (const j of list) {
          if (j === i) continue;
          const dx = x - f.x[j], dy = y - f.y[j], d = Math.hypot(dx, dy);
          if (d > CELL || d === 0) continue;
          if (d < SEPARATE) { sx += dx / d * (SEPARATE - d); sy += dy / d * (SEPARATE - d); }
          avx += f.vx[j]; avy += f.vy[j]; cx += f.x[j]; cy += f.y[j]; count++;
        }
      }
      let bx = sx * 30, by = sy * 30;
      if (count) {
        bx += (avx / count - f.vx[i]) * 1.2 + (cx / count - x) * 0.9;
        by += (avy / count - f.vy[i]) * 1.2 + (cy / count - y) * 0.9;
      }
      const [gx0, gy0] = centres[i % GROUPS];
      bx += (gx0 - x) * 0.35; by += (gy0 - y) * 0.35;
      if (x < MARGIN) bx += (MARGIN - x) * 12;
      if (x > b.w - MARGIN) bx -= (x - b.w + MARGIN) * 12;
      if (y < MARGIN) by += (MARGIN - y) * 12;
      if (y > b.h - MARGIN) by -= (y - b.h + MARGIN) * 12;
      ax += bx * free; ay += by * free;
    }
    if (pointer) {
      const dx = x - pointer.x, dy = y - pointer.y, d = Math.hypot(dx, dy);
      if (d < POINTER && d > 0) { const k = 1800 * (1 - d / POINTER); ax += dx / d * k; ay += dy / d * k; }
    }
    if (f.pull > 0) {
      const tx = f.targets[2 * i], ty = f.targets[2 * i + 1];
      ax += f.pull * (OMEGA * OMEGA * (tx - x) - 2 * OMEGA * f.vx[i]);
      ay += f.pull * (OMEGA * OMEGA * (ty - y) - 2 * OMEGA * f.vy[i]);
    }
    let vx = f.vx[i] + ax * dt, vy = f.vy[i] + ay * dt;
    const s = Math.hypot(vx, vy);
    const max = f.pull > 0 ? MAX_SPEED * 3 : MAX_SPEED;
    if (s > max) { vx *= max / s; vy *= max / s; }
    else if (f.pull === 0 && s < MIN_SPEED) {
      if (s === 0) { vx = MIN_SPEED; vy = 0; } else { vx *= MIN_SPEED / s; vy *= MIN_SPEED / s; }
    }
    f.vx[i] = vx; f.vy[i] = vy;
    f.x[i] = x + vx * dt; f.y[i] = y + vy * dt;
    // A hard stop well outside the edge, in case a burst flings a bird out.
    if (f.pull === 0) {
      if (f.x[i] < -50) { f.x[i] = -50; f.vx[i] = Math.abs(vx); }
      if (f.x[i] > b.w + 50) { f.x[i] = b.w + 50; f.vx[i] = -Math.abs(vx); }
      if (f.y[i] < -50) { f.y[i] = -50; f.vy[i] = Math.abs(vy); }
      if (f.y[i] > b.h + 50) { f.y[i] = b.h + 50; f.vy[i] = -Math.abs(vy); }
    }
    f.phase[i] += dt * (10 + s * 0.04);
  }
}
