import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneFor, previewScene } from '../js/fx/scenes.js';

const hours = (h) => Array.from({ length: 24 }, (_, i) => (i === h ? 5 : 0));
const months = (m) => Array.from({ length: 12 }, (_, i) => (i === m ? 9 : 1));
const neutral = { sky: 'neutral', particles: null, sound: 'wind' };

test('cover and summary continue their own skies', () => {
  assert.deepEqual(sceneFor('cover', {}), { sky: 'dusk', particles: null, sound: 'wind' });
  assert.deepEqual(sceneFor('summary', {}), { sky: 'sunrise', particles: null, sound: 'wind' });
});

test('clock follows the peak hour', () => {
  assert.deepEqual(sceneFor('clock', { startHours: hours(6) }), { sky: 'dawn', particles: 'mist', sound: 'chorus' });
  assert.equal(sceneFor('clock', { startHours: hours(4) }).sky, 'dawn');
  assert.equal(sceneFor('clock', { startHours: hours(8) }).sky, 'dawn');
  assert.deepEqual(sceneFor('clock', { startHours: hours(9) }), { sky: 'day', particles: null, sound: 'wind' });
  assert.equal(sceneFor('clock', { startHours: hours(16) }).sky, 'day');
  assert.deepEqual(sceneFor('clock', { startHours: hours(17) }), { sky: 'golden', particles: 'eyes', sound: 'owl' });
  assert.equal(sceneFor('clock', { startHours: hours(19) }).sky, 'golden');
  assert.deepEqual(sceneFor('clock', { startHours: hours(21) }), { sky: 'night', particles: 'stars', sound: 'owl' });
  assert.equal(sceneFor('clock', { startHours: hours(20) }).sky, 'night');
  assert.equal(sceneFor('clock', { startHours: hours(3) }).sky, 'night');
});

test('persona picks its own scene, others are neutral', () => {
  assert.deepEqual(sceneFor('persona', {}, { id: 'dawn' }), { sky: 'dawn', particles: 'mist', sound: 'chorus' });
  assert.deepEqual(sceneFor('persona', {}, { id: 'evening' }), { sky: 'golden', particles: 'eyes', sound: 'owl' });
  assert.deepEqual(sceneFor('persona', {}, { id: 'sitspot' }), { sky: 'dusk', particles: 'fireflies', sound: 'wind' });
  assert.deepEqual(sceneFor('persona', {}, { id: 'lakeshore' }), { sky: 'lake', particles: null, sound: 'gulls' });
  assert.deepEqual(sceneFor('persona', {}, { id: 'trail' }), neutral);
});

test('months follows the busiest month; a quiet year is neutral', () => {
  assert.deepEqual(sceneFor('months', { monthly: months(0) }), { sky: 'winter', particles: 'snow', sound: 'wind' });
  assert.equal(sceneFor('months', { monthly: months(11) }).sky, 'winter');
  assert.equal(sceneFor('months', { monthly: months(1) }).sky, 'winter');
  assert.deepEqual(sceneFor('months', { monthly: months(3) }), { sky: 'spring', particles: 'blossoms', sound: 'wind' });
  assert.deepEqual(sceneFor('months', { monthly: months(6) }), { sky: 'summer', particles: 'haze', sound: 'wind' });
  assert.deepEqual(sceneFor('months', { monthly: months(9) }), { sky: 'autumn', particles: 'leaves', sound: 'wind' });
  assert.deepEqual(sceneFor('months', { monthly: Array(12).fill(0) }), neutral);
});

test('every other card is neutral', () => {
  assert.deepEqual(sceneFor('lifers', {}, { id: 'dawn' }), neutral);
  assert.deepEqual(sceneFor('headline', {}), neutral);
});

test('a preview name forces one scene; unknown names are ignored', () => {
  assert.deepEqual(previewScene('night'), { sky: 'night', particles: 'stars', sound: 'owl' });
  assert.deepEqual(previewScene('evening'), { sky: 'golden', particles: 'eyes', sound: 'owl' });
  assert.deepEqual(previewScene('winter'), { sky: 'winter', particles: 'snow', sound: 'wind' });
  assert.deepEqual(previewScene('spring'), { sky: 'spring', particles: 'blossoms', sound: 'wind' });
  assert.equal(previewScene('dawn').sky, 'dawn');
  assert.equal(previewScene('nonsense'), null);
  assert.equal(previewScene(null), null);
});

test('the dawn chorus is kept for dawn: the dawn hours and the dawn persona only', () => {
  const kinds = [];
  for (let h = 0; h < 24; h++) kinds.push(sceneFor('clock', { startHours: hours(h) }));
  for (let m = 0; m < 12; m++) kinds.push(sceneFor('months', { monthly: months(m) }));
  for (const id of ['dawn', 'evening', 'sitspot', 'lakeshore', 'trail']) kinds.push(sceneFor('persona', {}, { id }));
  kinds.push(sceneFor('cover', {}), sceneFor('summary', {}), sceneFor('headline', {}));
  for (const k of kinds) if (k.sound === 'chorus') assert.equal(k.sky, 'dawn');
});
