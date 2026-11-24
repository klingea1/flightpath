import { test } from 'node:test';
import assert from 'node:assert/strict';
import { birdOutline, traceBird } from '../js/fx/shapes.js';

const points = (cmds) => cmds.flatMap((c) => { const n = c.slice(1); const out = []; for (let i = 0; i < n.length; i += 2) out.push([n[i], n[i + 1]]); return out; });

test('a bird is head first, mirror-symmetric, with a forked tail behind its wings', () => {
  const cmds = birdOutline(10, 1);
  const pts = points(cmds);
  const head = Math.max(...pts.map((p) => p[0]));
  assert.equal(cmds[0][0], 'M');
  assert.deepEqual(cmds[0].slice(1), [head, 0], 'starts at the head, on the centre line');
  for (const [u, v] of pts) assert.ok(pts.some(([u2, v2]) => Math.abs(u2 - u) < 1e-9 && Math.abs(v2 + v) < 1e-9), `mirror of ${u},${v}`);
  assert.ok(cmds.some((c) => c[0] === 'Q'), 'curved wings, not straight edges');
  const tail = Math.min(...pts.map((p) => p[0]));
  assert.ok(tail < -0.4 * 10, 'a tail behind the body');
});

test('wings spread on the flap and fold between beats', () => {
  const width = (flap) => Math.max(...points(birdOutline(10, flap)).map((p) => Math.abs(p[1])));
  assert.ok(width(1) >= 9.5 && width(1) <= 10.5);
  assert.ok(width(0) < width(1) / 2);
});

test('traceBird turns the outline to the heading', () => {
  const calls = [];
  const path = new Proxy({}, { get: (_, k) => (...a) => calls.push([k, ...a]) });
  traceBird(path, 100, 50, 0, 1, 10, 1); // heading straight down the screen
  assert.deepEqual(calls[0].slice(0, 1), ['moveTo']);
  assert.ok(Math.abs(calls[0][1] - 100) < 1e-9 && calls[0][2] > 50, 'head is below the centre');
  assert.equal(calls.at(-1)[0], 'closePath');
});
