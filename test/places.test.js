import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snap, buildPlaces, regionName, distanceKm, buildMonths } from '../js/places.js';

const list = (date, lat, lng, state = 'US-MI', county = 'Kent') => ({ date, startMin: 480, lat, lng, state, county });

test('snapping hides exact locations', () => {
  const a = snap(42.9485, -85.5921);
  const b = snap(42.9431, -85.5967);
  assert.equal(a.key, b.key);
  assert.equal(a.lat, 42.94);
  assert.equal(a.lng, -85.6);
  assert.ok(distanceKm({ lat: 42.9485, lng: -85.5921 }, a) < 2);
});

test('repeat visits grow one pin, in first-visit order', () => {
  const p = buildPlaces([
    list('2026-03-01', 42.955, -85.595),
    list('2026-01-01', 42.94, -85.73),
    list('2026-02-01', 42.957, -85.597),
  ]);
  assert.equal(p.pins.length, 2);
  assert.deepEqual(p.pins.map((x) => x.visits), [1, 2]);
  assert.equal(p.pins[0].firstDate, '2026-01-01');
  assert.deepEqual(p.sequence.map((s) => s.pin), [0, 1, 1]);
  assert.equal(p.needsInset, false);
  assert.deepEqual(p.trips, []);
});

test('far trips are named and trigger the home inset', () => {
  const lists = [];
  for (let i = 0; i < 10; i++) lists.push(list(`2026-01-${String(i + 1).padStart(2, '0')}`, 42.95 + i * 0.03, -85.6));
  lists.push(list('2026-05-10', 41.63, -83.19, 'US-OH', 'Lucas'));
  lists.push(list('2026-05-11', 41.63, -83.19, 'US-OH', 'Lucas'));
  lists.push(list('2026-08-01', 31.5, -110.3, 'US-AZ', 'Cochise'));
  const p = buildPlaces(lists);
  assert.deepEqual(p.trips.map((t) => [t.name, t.checklists]), [['Ohio', 2], ['Arizona', 1]]);
  assert.equal(p.homeRegion.name, 'Michigan');
  assert.equal(p.needsInset, true);
});

test('region names cover states, provinces, and countries', () => {
  assert.equal(regionName('US-MI'), 'Michigan');
  assert.equal(regionName('CA-ON'), 'Ontario');
  assert.equal(regionName('CR-P'), 'Costa Rica');
});

test('months run from first to last active month, naming places away', () => {
  const lists = [
    list('2026-02-01', 42.95, -85.6),
    list('2026-02-20', 42.97, -85.65),
    list('2026-03-14', 27.9, -82.5, 'US-FL', 'Hillsborough'),
    list('2026-03-15', 42.95, -85.6),
    list('2026-05-03', 42.95, -85.6),
  ];
  const months = buildMonths(buildPlaces(lists));
  assert.deepEqual(months.map((m) => [m.month, m.visits.length, m.regions.join()]), [
    [1, 2, ''],
    [2, 2, 'Florida'],
    [3, 0, ''],
    [4, 1, ''],
  ]);
  assert.equal(months[1].bounds[0][0], 27.9);
  assert.equal(months[2].bounds, null);
});
