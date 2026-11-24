import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rng, deckSeed, crackSeam } from '../js/fx/seed.js';

test('rng is repeatable and stays in [0, 1)', () => {
  const a = rng(9), b = rng(9);
  for (let i = 0; i < 100; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
});

test('same seed, same seam; different seed, different seam', () => {
  assert.deepEqual(crackSeam(7), crackSeam(7));
  assert.notDeepEqual(crackSeam(7), crackSeam(8));
});

test('seam is closed and stays in its band', () => {
  const s = crackSeam(42, 64);
  assert.equal(s.length, 65);
  assert.equal(s[0].a, 0);
  assert.ok(Math.abs(s.at(-1).a - 2 * Math.PI) < 1e-9);
  assert.ok(Math.abs(s[0].y - s.at(-1).y) < 1e-9);
  for (const p of s) assert.ok(p.y >= 0.56 - 1e-9 && p.y <= 0.68 + 1e-9);
});

test('deckSeed matches the spec formula', () => {
  assert.equal(deckSeed({ year: 2026, checklists: 12 }), 2026 * 100003 + 12);
});
