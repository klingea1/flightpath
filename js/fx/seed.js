// Seeded randomness for the effects, so the same deck always hatches the same way.

/** Mulberry32: a small seeded generator returning values in [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function deckSeed(stats) {
  return stats.year * 100003 + stats.checklists;
}

const smooth = (t) => t * t * (3 - 2 * t);

// Periodic 1-D value noise: `count` lattice values in [-1, 1], sampled with
// wrap-around so the seam meets itself at the back of the egg.
function loopNoise(random, count) {
  const values = Array.from({ length: count }, () => random() * 2 - 1);
  return (t) => {
    const x = t * count;
    const i = Math.floor(x);
    const f = smooth(x - i);
    const a = values[((i % count) + count) % count];
    const b = values[(((i + 1) % count) + count) % count];
    return a + (b - a) * f;
  };
}

/**
 * The crack's path around the egg: `segments + 1` points, `a` the angle in
 * [0, 2π] and `y` the height as a fraction of the egg's height. Two octaves of
 * value noise around 0.62, within ±0.06.
 */
export function crackSeam(seed, segments = 64) {
  const random = rng(seed);
  const coarse = loopNoise(random, 6);
  const fine = loopNoise(random, 17);
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i % segments) / segments;
    const y = 0.62 + 0.06 * (0.7 * coarse(t) + 0.3 * fine(t));
    points.push({ a: (i / segments) * 2 * Math.PI, y });
  }
  return points;
}
