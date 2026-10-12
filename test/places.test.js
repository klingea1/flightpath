import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snap, buildPlaces, regionName, distanceKm, tripLabel, buildLegs } from '../js/places.js';

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

test('trip labels never show coordinates or private place names', () => {
  assert.equal(tripLabel('Magee Marsh', 'US-OH'), 'Magee Marsh, Ohio');
  assert.equal(tripLabel('Grand Rapids, Kent County, Michigan, US (42.948, -85.592)', 'US-MI'), 'Michigan');
  assert.equal(tripLabel("Mom's backyard", 'US-OH'), 'Ohio');
  assert.equal(tripLabel('Lake cottage', 'CA-ON'), 'Ontario');
  assert.equal(tripLabel('', 'US-AZ'), 'Arizona');
});

test('legs split home stretches from trips and group nearby trip stops', () => {
  const lists = [
    list('2026-01-01', 42.95, -85.6),
    list('2026-01-02', 42.97, -85.65),
    list('2026-05-14', 41.6265, -83.1911, 'US-OH', 'Lucas'),
    list('2026-05-16', 41.9303, -82.5108, 'CA-ON', 'Essex'),
    list('2026-05-20', 42.95, -85.6),
    list('2026-08-03', 31.4485, -110.3036, 'US-AZ', 'Cochise'),
  ].map((c, i) => ({ ...c, location: ['A', 'B', 'Magee Marsh', 'Point Pelee', 'A', 'Ramsey Canyon'][i] }));
  const legs = buildLegs(buildPlaces(lists));
  assert.deepEqual(legs.map((l) => [l.home, l.visits.length, l.label]), [
    [true, 2, null],
    [false, 2, 'Magee Marsh, Ohio'],
    [true, 1, null],
    [false, 1, 'Ramsey Canyon, Arizona'],
  ]);
});
