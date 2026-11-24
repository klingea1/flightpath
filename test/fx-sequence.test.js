import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSequence } from '../js/fx/sequence.js';

test('reveal happens once when the run finishes', async () => {
  let n = 0;
  const s = createSequence({ run: () => Promise.resolve(), reveal: () => n++ });
  await s.start();
  assert.equal(n, 1);
  assert.equal(s.running, false);
});

test('skip reveals at once and the finished run does not reveal again', async () => {
  let n = 0, done;
  const s = createSequence({ run: () => new Promise((r) => (done = r)), reveal: () => n++ });
  const p = s.start();
  assert.equal(s.running, true);
  s.skip(); s.skip();
  assert.equal(n, 1);
  done();
  await p;
  assert.equal(n, 1);
});

test('a failed run still reveals', async () => {
  let n = 0;
  const s = createSequence({ run: () => Promise.reject(new Error('context lost')), reveal: () => n++ });
  await s.start();
  assert.equal(n, 1);
});

test('a run that throws right away still reveals', async () => {
  let n = 0;
  const s = createSequence({ run: () => { throw new Error('no shader'); }, reveal: () => n++ });
  await s.start();
  assert.equal(n, 1);
});

test('starting twice while running is one sequence', async () => {
  let runs = 0, reveals = 0;
  const s = createSequence({ run: async () => { runs++; }, reveal: () => reveals++ });
  await Promise.all([s.start(), s.start()]);
  assert.equal(runs, 1);
  assert.equal(reveals, 1);
});
