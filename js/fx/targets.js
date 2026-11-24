// Shapes the flock flies into: the species number, a ring around it, the cover's arc.
// Each returns a flat Float32Array [x0, y0, x1, y1, …] with one point per bird.
import { rng } from './seed.js';

/** Below this many species the flock rings the number instead of spelling it. */
export const useRing = (species) => species < 40;

/**
 * n points on the opaque pixels (alpha ≥ 128) of an RGBA mask, spread evenly
 * through it: one per equal slice of the opaque pixels, jittered by the seed.
 * With nothing opaque, every point sits in the centre.
 */
export function samplePoints(mask, w, h, n, seed) {
  const out = new Float32Array(2 * n);
  const solid = [];
  for (let i = 0; i < w * h; i++) if (mask[i * 4 + 3] >= 128) solid.push(i);
  if (!solid.length) {
    for (let k = 0; k < n; k++) { out[2 * k] = w / 2; out[2 * k + 1] = h / 2; }
    return out;
  }
  const random = rng(seed);
  for (let k = 0; k < n; k++) {
    const idx = solid[Math.min(solid.length - 1, Math.floor(((k + random()) / n) * solid.length))];
    out[2 * k] = (idx % w) + 0.5;
    out[2 * k + 1] = Math.floor(idx / w) + 0.5;
  }
  return out;
}

/** n points evenly round a circle, the first at the top. */
export function ringTargets(n, cx, cy, r) {
  const out = new Float32Array(2 * n);
  for (let k = 0; k < n; k++) {
    const a = -Math.PI / 2 + (k / n) * 2 * Math.PI;
    out[2 * k] = cx + r * Math.cos(a);
    out[2 * k + 1] = cy + r * Math.sin(a);
  }
  return out;
}

/** n points spread along a polyline by length, each nudged sideways by up to `spread`. */
export function arcTargets(n, points, spread = 18, seed = 1) {
  const out = new Float32Array(2 * n);
  if (!n || !points.length) return out;
  const lens = [0];
  for (let i = 1; i < points.length; i++) {
    lens.push(lens[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const total = lens.at(-1);
  const random = rng(seed);
  let seg = 1;
  for (let k = 0; k < n; k++) {
    const d = n === 1 ? 0 : (k / (n - 1)) * total;
    while (seg < points.length - 1 && lens[seg] < d) seg++;
    const [x0, y0] = points[Math.max(0, seg - 1)];
    const [x1, y1] = points[Math.min(points.length - 1, seg)];
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const t = Math.min(1, Math.max(0, (d - lens[Math.max(0, seg - 1)]) / len));
    const off = (random() * 2 - 1) * spread;
    out[2 * k] = x0 + (x1 - x0) * t - ((y1 - y0) / len) * off;
    out[2 * k + 1] = y0 + (y1 - y0) * t + ((x1 - x0) / len) * off;
  }
  return out;
}
