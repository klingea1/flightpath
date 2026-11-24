import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectsMode, needsGate } from '../js/fx/mode.js';

test('fx=off wins over everything', () => {
  assert.equal(effectsMode({ search: '?fx=off', reduceMotion: false, webgl: true }), 'off');
  assert.equal(effectsMode({ search: '?persona=dawn&fx=off', reduceMotion: true, webgl: false }), 'off');
});

test('reduced motion is calm, no WebGL is flat, else full', () => {
  assert.equal(effectsMode({ search: '', reduceMotion: true, webgl: true }), 'calm');
  assert.equal(effectsMode({ search: '', reduceMotion: false, webgl: false }), 'flat');
  assert.equal(effectsMode({ search: '', reduceMotion: false, webgl: true }), 'full');
});

test('shared links get the tap-the-egg gate unless effects are off', () => {
  assert.equal(needsGate('off'), false);
  for (const m of ['calm', 'flat', 'full']) assert.equal(needsGate(m), true);
});
