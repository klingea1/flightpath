// The hatch's timeline, shared by the WebGL and painted eggs. While the page
// fades and the egg zooms in, the chick pecks three times: each peck cracks a
// small star, then a flake chips off and leaves a hole. Then a crack runs round
// the seam and the shell bursts open. Times in ms from the start.

import { rng } from './seed.js';

export const PIPS = [500, 1000, 1500];  // each peck starts
const PIP_MS = 300;                      // a peck's star crack spreads
const FLAKE_AFTER = 400;                 // from a peck to its flake chipping off
const HOLE_MS = 200;                     // the hole opening as the flake goes
export const SEAM = [2000, 2450];        // the crack round the seam
export const OPEN_MS = 800;              // cap off, shards out, the flock bursts
export const HATCH_MS = SEAM[1] + OPEN_MS;

const clamp = (x) => Math.max(0, Math.min(1, x));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const ramp = (t, start, ms) => easeOut(clamp((t - start) / ms));

/** Where every part of the hatch is at time t; each value runs 0..1. */
export function hatchPhase(t) {
  return {
    pips: PIPS.map((p) => ramp(t, p, PIP_MS)),
    holes: PIPS.map((p) => ramp(t, p + FLAKE_AFTER, HOLE_MS)),
    seam: ramp(t, SEAM[0], SEAM[1] - SEAM[0]),
    open: ramp(t, SEAM[1], OPEN_MS),
    done: t >= HATCH_MS,
  };
}

const EVENTS = [
  ...PIPS.flatMap((p, i) => [{ type: 'pip', i, at: p }, { type: 'flake', i, at: p + FLAKE_AFTER }]),
  { type: 'seam', at: SEAM[0] },
  { type: 'burst', at: SEAM[1] },
].sort((a, b) => a.at - b.at);

/** The moments passed in (prev, t]: pip, flake, seam, burst. */
export function hatchEvents(prev, t) {
  return EVENTS.filter((e) => e.at > prev && e.at <= t).map(({ type, i }) => (i === undefined ? { type } : { type, i }));
}

/** The seam's height (fraction of the egg's height) at angle a, 0 facing the camera. */
export function seamHeight(seam, a) {
  const f = (((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * (seam.length - 1);
  const j = Math.floor(f), t = f - j;
  return seam[j].y + (seam[Math.min(seam.length - 1, j + 1)].y - seam[j].y) * t;
}

/** Where the three pecks land: on the seam, left, middle and right of the front. */
export function pipPoints(seed, seam) {
  const random = rng(seed ^ 0x9eed);
  return [-0.6, 0.05, 0.62].map((base) => {
    const a = base + (random() - 0.5) * 0.3;
    return { a, y: seamHeight(seam, a) };
  });
}
