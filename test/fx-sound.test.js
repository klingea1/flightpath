import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMuted, setMuted, createSound } from '../js/fx/sound.js';

const memory = () => {
  const mem = new Map();
  return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
};

test('mute is remembered and survives broken storage', () => {
  const storage = memory();
  assert.equal(isMuted(storage), false);
  setMuted(true, storage);
  assert.equal(isMuted(storage), true);
  setMuted(false, storage);
  assert.equal(isMuted(storage), false);
  const broken = { getItem() { throw new Error(); }, setItem() { throw new Error(); } };
  assert.equal(isMuted(broken), false);
  setMuted(true, broken);
});

test('hiding the tab suspends audio and showing resumes it', () => {
  const calls = [];
  globalThis.AudioContext = class {
    constructor() { this.state = 'running'; this.destination = {}; this.currentTime = 0; }
    createGain() { return { gain: { value: 1, setTargetAtTime() {} }, connect() {}, disconnect() {} }; }
    suspend() { calls.push('suspend'); return Promise.resolve(); }
    resume() { calls.push('resume'); return Promise.resolve(); }
    close() { return Promise.resolve(); }
  };
  const listeners = {};
  const doc = { hidden: false, addEventListener: (t, f) => (listeners[t] = f), removeEventListener() {} };
  try {
    const s = createSound({ doc, storage: memory() });
    s.unlock();
    doc.hidden = true; listeners.visibilitychange();
    doc.hidden = false; listeners.visibilitychange();
    assert.deepEqual(calls.slice(-2), ['suspend', 'resume']);
  } finally {
    delete globalThis.AudioContext;
  }
});

test('a muted visitor is not resumed when the tab comes back', () => {
  const calls = [];
  globalThis.AudioContext = class {
    constructor() { this.state = 'running'; this.destination = {}; this.currentTime = 0; }
    createGain() { return { gain: { value: 1, setTargetAtTime() {} }, connect() {}, disconnect() {} }; }
    suspend() { calls.push('suspend'); return Promise.resolve(); }
    resume() { calls.push('resume'); return Promise.resolve(); }
    close() { return Promise.resolve(); }
  };
  const listeners = {};
  const doc = { hidden: false, addEventListener: (t, f) => (listeners[t] = f), removeEventListener() {} };
  try {
    const storage = memory();
    const s = createSound({ doc, storage });
    s.unlock();
    s.setMuted(true);
    calls.length = 0;
    doc.hidden = true; listeners.visibilitychange();
    doc.hidden = false; listeners.visibilitychange();
    assert.deepEqual(calls, ['suspend']);
    assert.equal(isMuted(storage), true);
  } finally {
    delete globalThis.AudioContext;
  }
});

test('without Web Audio every call is a quiet no-op', () => {
  const s = createSound({ doc: { addEventListener() {}, removeEventListener() {} }, storage: memory() });
  s.unlock(); s.play('crack'); s.ambient('wind'); s.setMuted(true); s.dispose();
});
