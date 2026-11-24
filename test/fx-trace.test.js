import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArc, traceAt } from '../js/fx/trace.js';

const arcs = [
  { ...parseArc('M0 0 Q50 -50 100 0'), start: 1000, ms: 200 },
  { ...parseArc('M100 0 Q150 50 200 0'), start: 1150, ms: 200 },
];

test('parseArc reads a quadratic path', () => {
  assert.deepEqual(parseArc('M10.5 20 Q30 -40.5 50 60'), { x1: 10.5, y1: 20, cx: 30, cy: -40.5, x2: 50, y2: 60 });
  assert.equal(parseArc('M1 2 L3 4'), null);
});

test('the bird waits for the first arc, flies each in turn, and is gone at the end', () => {
  assert.equal(traceAt(arcs, 999), null);
  const a = traceAt(arcs, 1000);
  assert.ok(Math.abs(a.x) < 1e-9 && Math.abs(a.y) < 1e-9, 'starts on the first dot');
  const mid = traceAt(arcs, 1080);
  assert.ok(mid.x > 0 && mid.x < 100 && mid.y < 0, 'over the first arc, which bends up');
  const b = traceAt(arcs, 1150);
  assert.ok(Math.abs(b.x - 100) < 1e-9 && Math.abs(b.y) < 1e-9, 'the second arc starts from the second dot');
  const end = traceAt(arcs, 1349);
  assert.ok(end.x > 190);
  assert.equal(traceAt(arcs, 1351), null);
});

test('the heading is a unit vector along the flight', () => {
  const p = traceAt(arcs, 1100);
  assert.ok(Math.abs(Math.hypot(p.hx, p.hy) - 1) < 1e-9);
  assert.ok(p.hx > 0, 'flying left to right');
});
