// A bird that flies the Summary's flight path as it draws: arc by arc, in
// the order the year went. Arcs are the card's quadratic paths, in screen
// pixels, each with the time its drawing starts and how long it takes.

const NUM = /-?\d+(?:\.\d+)?/g;

/** 'M x1 y1 Q cx cy x2 y2' → { x1, y1, cx, cy, x2, y2 }; anything else → null. */
export function parseArc(d) {
  if (!/^\s*M[^Q]*Q[^A-Za-z]*$/.test(d)) return null;
  const n = d.match(NUM)?.map(Number);
  if (!n || n.length !== 6) return null;
  const [x1, y1, cx, cy, x2, y2] = n;
  return { x1, y1, cx, cy, x2, y2 };
}

const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

/**
 * Where the bird is at time t: on the latest arc that has started, as far
 * along as that arc has drawn. { x, y, hx, hy } with (hx, hy) the unit
 * heading; null before the first arc and once the last one has drawn.
 */
export function traceAt(arcs, t) {
  let a = null;
  for (const arc of arcs) if (arc.start <= t) a = arc; else break;
  if (!a) return null;
  const last = arcs[arcs.length - 1];
  if (a === last && t > a.start + a.ms) return null;
  const u = ease(Math.min(1, (t - a.start) / a.ms)), v = 1 - u;
  const x = v * v * a.x1 + 2 * v * u * a.cx + u * u * a.x2;
  const y = v * v * a.y1 + 2 * v * u * a.cy + u * u * a.y2;
  // The tangent of the curve; at a sharp end it can vanish, so fall back to the chord.
  let hx = 2 * v * (a.cx - a.x1) + 2 * u * (a.x2 - a.cx);
  let hy = 2 * v * (a.cy - a.y1) + 2 * u * (a.y2 - a.cy);
  let len = Math.hypot(hx, hy);
  if (len < 1e-9) { hx = a.x2 - a.x1; hy = a.y2 - a.y1; len = Math.hypot(hx, hy) || 1; }
  return { x, y, hx: hx / len, hy: hy / len };
}
