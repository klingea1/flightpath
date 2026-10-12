// Builds data/map.topo.json, the outline map behind the map card.
//
//   curl -o /tmp/ne_50m_lakes.geojson \
//     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_lakes.geojson
//   node tools/build-map.mjs /tmp/ne_50m_lakes.geojson
//
// Sources, all public domain: Natural Earth countries (via world-atlas) and
// lakes, and U.S. Census state and county outlines (via us-atlas). Michigan
// is the only state with county lines.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import { topology } from 'topojson-server';

const require = createRequire(import.meta.url);
const lakesPath = process.argv[2];
if (!lakesPath) {
  console.error('usage: node tools/build-map.mjs <ne_50m_lakes.geojson>');
  process.exit(1);
}

const world = require('world-atlas/countries-50m.json');
const us = require('us-atlas/states-10m.json');
const usCounties = require('us-atlas/counties-10m.json');
const lakes = JSON.parse(readFileSync(lakesPath, 'utf8'));

const slim = (f, props = {}) => ({ type: 'Feature', properties: props, geometry: f.geometry });

const layers = {
  countries: {
    type: 'FeatureCollection',
    features: feature(world, world.objects.countries).features.map((f) => slim(f, { name: f.properties.name })),
  },
  states: {
    type: 'FeatureCollection',
    features: feature(us, us.objects.states).features.map((f) => slim(f, { name: f.properties.name })),
  },
  counties: {
    type: 'FeatureCollection',
    features: feature(usCounties, usCounties.objects.counties).features
      .filter((f) => String(f.id).startsWith('26'))
      .map((f) => slim(f, { name: f.properties.name })),
  },
  lakes: {
    type: 'FeatureCollection',
    features: lakes.features.map((f) => slim(f)),
  },
};

// 1e6 quantization keeps shorelines smooth at county zoom (about 40 m).
const topo = topology(layers, 1e6);
const out = new URL('../data/map.topo.json', import.meta.url);
writeFileSync(out, JSON.stringify(topo));
console.log(`wrote ${out.pathname}: ${(JSON.stringify(topo).length / 1024).toFixed(0)} KB`);
