import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  equirectangularKm,
  gridToLocation,
  locationToGrid,
  placeLabel,
  searchPlaces,
  selectedDestination,
} from '../../app/tvLocation/offlineMapSelection.ts';

const jsonPath = path.resolve(
  import.meta.dirname,
  '../../app/assets/offline-us-map.json',
);
const data = JSON.parse(await readFile(jsonPath, 'utf8'));
const places = data.places;
const stateNames = data.stateNames;

assert.equal(data.gridMax, 65535);
assert.equal(places.length, 32350);

const tripoli = { latitude: 42.808371, longitude: -92.2578433 };
const tripoliRoundtrip = gridToLocation(
  locationToGrid(tripoli.latitude, tripoli.longitude).x,
  locationToGrid(tripoli.latitude, tripoli.longitude).y,
);
assert.ok(equirectangularKm(tripoli, tripoliRoundtrip) < 0.001);

const quantized = locationToGrid(tripoli.latitude, tripoli.longitude);
const afterQuantize = gridToLocation(
  Math.round(quantized.x),
  Math.round(quantized.y),
);
assert.ok(equirectangularKm(tripoli, afterQuantize) < 1);

const cases = [
  ['Tripoli, Iowa', 42.808371, -92.2578433],
  ['Cleveland, Ohio', 41.4993, -81.6944],
  ['New York, New York', 40.7128, -74.006],
  ['Los Angeles, California', 34.0522, -118.2437],
  ['Honolulu, Hawaii', 21.3069, -157.8583],
  ['Anchorage, Alaska', 61.2181, -149.9003],
  ['Miami, Florida', 25.7617, -80.1918],
  ['Seattle, Washington', 47.6062, -122.3321],
  ['Chicago, Illinois', 41.8781, -87.6298],
  ['Denver, Colorado', 39.7392, -104.9903],
  ['Boston, Massachusetts', 42.3601, -71.0589],
  ['El Paso, Texas', 31.7619, -106.485],
  ['San Francisco, California', 37.7749, -122.4194],
];

for (const [label, latitude, longitude] of cases) {
  const selected = selectedDestination(places, stateNames, {
    latitude,
    longitude,
  });
  assert.equal(selected.label, label, `${label} pin labeled ${selected.label}`);
  assert.equal(selected.latitude, latitude);
  assert.equal(selected.longitude, longitude);
}

const randomPoints = [
  [42.85, -92.31],
  [41.54, -81.7],
  [32.8, -112.1],
  [46.5, -87.4],
  [31.4, -103.5],
  [30.4, -86.6],
  [38.5, -98.3],
  [38.4, -80.3],
  [46.8639, -67.998],
  [24.5551, -81.78],
];

for (const [latitude, longitude] of randomPoints) {
  const selected = selectedDestination(places, stateNames, {
    latitude,
    longitude,
  });
  assert.match(selected.label, /^.+, .+$/);
  assert.notEqual(selected.label, 'Selected map location');
  assert.equal(selected.latitude, latitude);
  assert.equal(selected.longitude, longitude);
}

const washington = searchPlaces(places, 'washington').map((place) =>
  placeLabel(place, stateNames),
);
assert.equal(washington[0], 'Washington, District of Columbia');
assert.ok(!washington.includes('Seattle, Washington'));

const newYork = searchPlaces(places, 'new york').map((place) =>
  placeLabel(place, stateNames),
);
assert.equal(newYork[0], 'New York, New York');
assert.ok(!newYork.includes('Rome, New York'));

const tripoliHits = searchPlaces(places, 'tripoli').map((place) =>
  placeLabel(place, stateNames),
);
assert.equal(tripoliHits[0], 'Tripoli, Iowa');

const cleveland = searchPlaces(places, 'cleveland').map((place) =>
  placeLabel(place, stateNames),
);
assert.equal(cleveland[0], 'Cleveland, Ohio');

console.log('Offline map selection passed.');
