import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFlock, setTargets, stepFlock, resizeFlock, startle } from '../js/fx/flock.js';
import { samplePoints, ringTargets, arcTargets, useRing } from '../js/fx/targets.js';

const B = { w: 400, h: 300 };

test('flock birds stay in bounds and keep moving', () => {
  const f = createFlock(200, 1, B);
  for (let i = 0; i < 600; i++) stepFlock(f, 1 / 60, { bounds: B, pointer: null });
  for (let i = 0; i < f.n; i++) {
    assert.ok(f.x[i] > -60 && f.x[i] < 460 && f.y[i] > -60 && f.y[i] < 360, `bird ${i} at ${f.x[i]},${f.y[i]}`);
    assert.ok(Math.hypot(f.vx[i], f.vy[i]) >= 39);
  }
});

test('with full pull the flock settles on its targets', () => {
  const f = createFlock(30, 2, B);
  setTargets(f, ringTargets(30, 200, 150, 80), 1);
  for (let i = 0; i < 180; i++) stepFlock(f, 1 / 60, { bounds: B, pointer: null });
  for (let i = 0; i < f.n; i++) assert.ok(Math.hypot(f.x[i] - f.targets[2 * i], f.y[i] - f.targets[2 * i + 1]) < 4);
});

test('the pointer pushes birds away', () => {
  const f = createFlock(1, 3, B);
  f.x[0] = 200; f.y[0] = 150; f.vx[0] = 0; f.vy[0] = 60;
  stepFlock(f, 1 / 60, { bounds: B, pointer: { x: 230, y: 150 } });
  assert.ok(f.vx[0] < 0);
});

test('empty and single-bird flocks are fine', () => {
  const f0 = createFlock(0, 3, { w: 100, h: 100 });
  stepFlock(f0, 1 / 60, { bounds: { w: 100, h: 100 }, pointer: null });
  assert.equal(ringTargets(0, 0, 0, 10).length, 0);
  assert.deepEqual([...ringTargets(1, 50, 50, 10)], [50, 40]);
});

test('samplePoints lands only on the mask', () => {
  const w = 20, h = 10, mask = new Uint8ClampedArray(w * h * 4);
  for (let y = 2; y < 8; y++) for (let x = 5; x < 9; x++) mask[(y * w + x) * 4 + 3] = 255;
  const p = samplePoints(mask, w, h, 12, 4);
  assert.equal(p.length, 24);
  for (let i = 0; i < 12; i++) {
    const x = Math.floor(p[2 * i]), y = Math.floor(p[2 * i + 1]);
    assert.ok(x >= 5 && x < 9 && y >= 2 && y < 8);
  }
  assert.equal(samplePoints(mask, w, h, 0, 4).length, 0);
  assert.deepEqual([...samplePoints(new Uint8ClampedArray(w * h * 4), w, h, 2, 4)], [10, 5, 10, 5]);
});

test('arcTargets spreads birds along the path', () => {
  const p = arcTargets(10, [[0, 0], [100, 0]], 0, 1);
  assert.equal(p.length, 20);
  assert.equal(p[0], 0);
  assert.equal(p[18], 100);
  for (let i = 0; i < 10; i++) assert.equal(p[2 * i + 1], 0);
});

test('ring for fewer than 40 species', () => {
  assert.equal(useRing(39), true);
  assert.equal(useRing(40), false);
});

test('resizeFlock keeps the birds it has', () => {
  const f = createFlock(10, 5, { w: 100, h: 100 });
  const x0 = f.x[3];
  resizeFlock(f, 20, 5);
  assert.equal(f.n, 20);
  assert.equal(f.x[3], x0);
  resizeFlock(f, 4, 5);
  assert.equal(f.n, 4);
  assert.equal(f.x[3], x0);
});

test('a thud startles every bird away from it, faster than they normally fly', () => {
  const f = createFlock(40, 7, B);
  startle(f, 200, 280);
  stepFlock(f, 1 / 60, { bounds: B, pointer: null });
  let fast = 0;
  for (let i = 0; i < f.n; i++) {
    const dx = f.x[i] - 200, dy = f.y[i] - 280;
    assert.ok(f.vx[i] * dx + f.vy[i] * dy > 0, `bird ${i} flies away from the thud`);
    if (Math.hypot(f.vx[i], f.vy[i]) > 300) fast++;
  }
  assert.ok(fast > f.n / 2, `${fast} of ${f.n} burst past normal speed`);
});

test('the panic wears off within about a second', () => {
  const f = createFlock(40, 8, B);
  startle(f, 200, 280);
  for (let i = 0; i < 75; i++) stepFlock(f, 1 / 60, { bounds: B, pointer: null });
  for (let i = 0; i < f.n; i++) assert.ok(Math.hypot(f.vx[i], f.vy[i]) <= 221, `bird ${i} calmed down`);
});
