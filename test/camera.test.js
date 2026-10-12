import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project, fitBounds, flight, toScreen, WORLD, scaleForZoom } from '../js/camera.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('projection puts 0,0 at the world center and north up', () => {
  const [x, y] = project(0, 0);
  near(x, WORLD / 2); near(y, WORLD / 2);
  assert.ok(project(43, -85)[1] < project(30, -85)[1]);
});

test('fitBounds centers the bounds inside the padded area', () => {
  const b = [[42.8, -85.8], [43.1, -85.4]];
  const pad = [360, 110, 200, 110];
  const cam = fitBounds(b, 1080, 1350, pad, Infinity);
  const [x0, y1] = project(b[0][0], b[0][1]);
  const [x1, y0] = project(b[1][0], b[1][1]);
  const [sx0, sy0] = toScreen(cam, x0, y0, 1080, 1350);
  const [sx1, sy1] = toScreen(cam, x1, y1, 1080, 1350);
  assert.ok(sx0 >= 110 - 1e-6 && sx1 <= 970 + 1e-6, 'inside left/right padding');
  assert.ok(sy0 >= 360 - 1e-6 && sy1 <= 1150 + 1e-6, 'inside top/bottom padding');
  near((sx0 + sx1) / 2, 540, 1e-6);
  near((sy0 + sy1) / 2, 360 + (1350 - 560) / 2, 1e-6);
});

test('fitBounds respects the zoom cap', () => {
  const cam = fitBounds([[42.95, -85.6], [42.95, -85.6]], 1080, 1350, [0, 0, 0, 0], scaleForZoom(11));
  near(cam.s, scaleForZoom(11));
});

test('flights start and end exactly on their cameras and zoom out in between', () => {
  const a = { x: 1000, y: 1500, s: 40 };
  const b = { x: 1600, y: 1400, s: 30 };
  const f = flight(a, b, 1080);
  for (const k of ['x', 'y', 's']) { near(f.at(0)[k], a[k], 1e-6); near(f.at(1)[k], b[k], 1e-6); }
  assert.ok(f.at(0.5).s < Math.min(a.s, b.s), 'zooms out mid-flight');
  assert.ok(f.length > 0);
});
