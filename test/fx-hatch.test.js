import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hatchPhase, hatchEvents, HATCH_MS } from '../js/fx/hatch.js';

test('before it starts nothing has cracked', () => {
  const p = hatchPhase(0);
  assert.deepEqual(p.pips, [0, 0, 0]);
  assert.deepEqual(p.holes, [0, 0, 0]);
  assert.equal(p.seam, 0);
  assert.equal(p.open, 0);
  assert.equal(p.done, false);
});

test('three pecks crack in turn, each then flakes open, before the seam runs', () => {
  const mid = hatchPhase(1300);
  assert.equal(mid.pips[0], 1);
  assert.equal(mid.holes[0], 1);
  assert.ok(mid.pips[1] > 0, 'second peck under way');
  assert.equal(mid.pips[2], 0);
  assert.equal(mid.seam, 0);
  const late = hatchPhase(2300);
  assert.deepEqual(late.pips, [1, 1, 1]);
  assert.deepEqual(late.holes, [1, 1, 1]);
  assert.ok(late.seam > 0 && late.seam < 1);
  assert.equal(late.open, 0);
});

test('the shell bursts open and the hatch ends', () => {
  assert.ok(hatchPhase(HATCH_MS - 100).open > 0.9);
  assert.equal(hatchPhase(HATCH_MS - 100).done, false);
  assert.equal(hatchPhase(HATCH_MS).open, 1);
  assert.equal(hatchPhase(HATCH_MS).done, true);
  assert.ok(HATCH_MS >= 3000 && HATCH_MS <= 3600, `a little more dramatic, not slow: ${HATCH_MS}`);
});

test('events fire once each, in order, however the frames fall', () => {
  const all = hatchEvents(-1, HATCH_MS).map((e) => e.type + (e.i ?? ''));
  assert.deepEqual(all, ['pip0', 'flake0', 'pip1', 'flake1', 'pip2', 'flake2', 'seam', 'burst']);
  const stepped = [];
  for (let t = 0, prev = -1; t <= HATCH_MS; prev = t, t += 16) stepped.push(...hatchEvents(prev, t).map((e) => e.type + (e.i ?? '')));
  assert.deepEqual(stepped, all);
  assert.deepEqual(hatchEvents(500, 500), []);
});

test('pecks sit on the seam, spread across the egg front, the same for the same seed', async () => {
  const { pipPoints, seamHeight } = await import('../js/fx/hatch.js');
  const { crackSeam } = await import('../js/fx/seed.js');
  const seam = crackSeam(42);
  const pips = pipPoints(42, seam);
  assert.equal(pips.length, 3);
  for (const p of pips) {
    assert.ok(Math.abs(p.a) < 0.95, `angle ${p.a} faces the camera`);
    assert.ok(Math.abs(p.y - seamHeight(seam, p.a)) < 1e-9);
  }
  assert.ok(pips[0].a < pips[1].a && pips[1].a < pips[2].a, 'left to right');
  assert.deepEqual(pipPoints(42, seam), pips);
  assert.notDeepEqual(pipPoints(43, crackSeam(43)), pips);
});
