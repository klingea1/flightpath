// Small shapes the overlay draws: birds, snowflakes, blossoms.

/**
 * A bird seen from below, in its own frame: u forward, v to the side, head at
 * +u. span is the half wingspan with wings spread; flap 0..1 spreads them
 * (1 level, 0 folded up or down between beats). Swept-back pointed wings and a
 * forked tail, like a starling or swallow. Commands: ['M', u, v], ['L', u, v],
 * ['Q', cu, cv, u, v].
 */
export function birdOutline(span, flap) {
  const S = span;
  const w = (0.35 + 0.65 * flap) * S;    // how far each wingtip reaches out
  const sweep = -0.18 * S - 0.1 * (S - w); // wingtips swept back, more when folded
  const side = (m) => [
    ['L', 0.18 * S, m * 0.09 * S],                        // shoulder
    ['Q', 0.2 * S, m * 0.55 * w, sweep, m * w],           // leading edge to the tip
    ['Q', -0.05 * S, m * 0.45 * w, -0.12 * S, m * 0.08 * S], // trailing edge back in
    ['L', -0.5 * S, m * 0.13 * S],                        // tail fork
  ];
  const right = side(1);
  // The left side runs back the other way: tail fork, trailing edge, tip, shoulder.
  const l = side(-1);
  const left = [
    ['L', l[3][1], l[3][2]],
    ['L', l[2][3], l[2][4]],
    ['Q', l[2][1], l[2][2], l[1][3], l[1][4]],
    ['Q', l[1][1], l[1][2], l[0][1], l[0][2]],
  ];
  return [['M', 0.42 * S, 0], ...right, ['L', -0.42 * S, 0], ...left, ['L', 0.42 * S, 0]];
}

/** Adds a bird at (x, y) heading along unit (cx, cy) to a Path2D (or a 2D context). */
export function traceBird(path, x, y, cx, cy, span, flap) {
  const X = (u, v) => x + u * cx - v * cy;
  const Y = (u, v) => y + u * cy + v * cx;
  for (const c of birdOutline(span, flap)) {
    if (c[0] === 'M') path.moveTo(X(c[1], c[2]), Y(c[1], c[2]));
    else if (c[0] === 'L') path.lineTo(X(c[1], c[2]), Y(c[1], c[2]));
    else path.quadraticCurveTo(X(c[1], c[2]), Y(c[1], c[2]), X(c[3], c[4]), Y(c[3], c[4]));
  }
  path.closePath();
}

/** A six-armed snowflake of radius r at the origin, each arm with two pairs of barbs. */
export function strokeSnowflake(ctx, r) {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3, c = Math.cos(a), s = Math.sin(a);
    ctx.moveTo(0, 0);
    ctx.lineTo(c * r, s * r);
    for (const [at, len] of [[0.45, 0.32], [0.72, 0.22]]) {
      const bx = c * r * at, by = s * r * at;
      for (const turn of [-0.7, 0.7]) {
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(a + turn) * r * len, by + Math.sin(a + turn) * r * len);
      }
    }
  }
  ctx.stroke();
}

/** A five-petalled blossom of radius r at the origin, with a darker heart. */
export function fillBlossom(ctx, r, petal, heart) {
  ctx.fillStyle = petal;
  ctx.beginPath();
  for (let k = 0; k < 5; k++) {
    const a = (k * 2 * Math.PI) / 5;
    const px = Math.cos(a) * r * 0.55, py = Math.sin(a) * r * 0.55;
    ctx.moveTo(px + Math.cos(a) * r * 0.5, py + Math.sin(a) * r * 0.5); // the petal's tip, where its ellipse starts
    ctx.ellipse(px, py, r * 0.5, r * 0.32, a, 0, 2 * Math.PI);
  }
  ctx.fill();
  ctx.fillStyle = heart;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, 2 * Math.PI); ctx.fill();
}
