import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  equirectangularKm,
  gridToLocation,
  locationToGrid,
  matchLabel,
  placeLabel,
  searchPlaces,
  searchSelection,
  selectedDestination,
  selectedMatch,
} from '../../app/tvLocation/offlineMapSelection.ts';

const assetsPath = path.resolve(import.meta.dirname, '../../app/assets');
const data = JSON.parse(
  await readFile(path.join(assetsPath, 'offline-us-map.json'), 'utf8'),
);
const places = data.places;
const stateNames = data.stateNames;

assert.equal(data.gridMax, 65535);
assert.equal(places.length, 32350);

// The bundled map page carries its own copy of the data and selection rules.
const html = await readFile(path.join(assetsPath, 'offline-us-map.html'), 'utf8');
const dataLine = html
  .split('\n')
  .find((line) => line.trimStart().startsWith('const DATA = '));
assert.ok(dataLine, 'offline-us-map.html has no DATA line');
const htmlData = JSON.parse(
  dataLine.trim().replace(/^const DATA = /, '').replace(/;$/, ''),
);
assert.deepEqual(htmlData, data, 'offline-us-map.html data differs from offline-us-map.json');

const rulesStart = html.indexOf('// BEGIN SELECTION RULES');
const rulesEnd = html.indexOf('// END SELECTION RULES');
assert.ok(rulesStart > 0 && rulesEnd > rulesStart, 'selection rules markers missing');
const shipped = new Function(
  'DATA',
  'GRID',
  `${html.slice(rulesStart, rulesEnd)}
  return { DEFAULT_START, locationToGrid, gridPointToLocation, selectedMatch, matchLabel, placeLabel, searchPlaces, searchSelection };`,
)(htmlData, htmlData.gridMax);

const tripoliDefault = { label: 'Tripoli, Iowa', latitude: 42.808371, longitude: -92.2578433 };
assert.deepEqual(shipped.DEFAULT_START, tripoliDefault);

const shippedLabel = (latitude, longitude) =>
  shipped.matchLabel(shipped.selectedMatch({ latitude, longitude }));
const moduleLabel = (latitude, longitude) =>
  matchLabel(selectedMatch(places, { latitude, longitude }), stateNames);

const tripoli = { latitude: 42.808371, longitude: -92.2578433 };
const tripoliRoundtrip = gridToLocation(
  locationToGrid(tripoli.latitude, tripoli.longitude).x,
  locationToGrid(tripoli.latitude, tripoli.longitude).y,
);
assert.ok(equirectangularKm(tripoli, tripoliRoundtrip) < 0.001);
const shippedGrid = shipped.locationToGrid(tripoli.latitude, tripoli.longitude);
assert.deepEqual(shippedGrid, locationToGrid(tripoli.latitude, tripoli.longitude));
assert.deepEqual(
  shipped.gridPointToLocation(shippedGrid.x, shippedGrid.y),
  tripoliRoundtrip,
);

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
  ['Omaha, Nebraska', 41.2565, -95.9345],
  ['Portland, Oregon', 45.5152, -122.6784],
  ['Des Moines, Iowa', 41.5868, -93.625],
  ['Waterloo, Iowa', 42.4928, -92.3426],
  ['Detroit, Michigan', 42.3314, -83.0458],
  ['Las Vegas, Nevada', 36.1699, -115.1398],
  ['New Orleans, Louisiana', 29.9511, -90.0715],
  // Suburbs next to major places keep their own names.
  ['Council Bluffs, Iowa', 41.2611, -95.8611],
  ['Cedar Falls, Iowa', 42.5281, -92.4456],
  ['Vancouver, Washington', 45.6389, -122.6611],
  ['West Des Moines, Iowa', 41.5775, -93.7453],
];

for (const [label, latitude, longitude] of cases) {
  const selected = selectedDestination(places, stateNames, {
    latitude,
    longitude,
  });
  assert.equal(selected.label, label, `${label} pin labeled ${selected.label}`);
  assert.equal(selected.latitude, latitude);
  assert.equal(selected.longitude, longitude);
  assert.equal(
    shippedLabel(latitude, longitude),
    label,
    `${label} pin labeled ${shippedLabel(latitude, longitude)} by the map page`,
  );
}

// Mexico City is far from every bundled place, so the nearest one is marked as near.
const mexicoCity = selectedDestination(places, stateNames, {
  latitude: 19.4326,
  longitude: -99.1332,
});
assert.match(mexicoCity.label, /^Near .+, Texas$/);
assert.equal(shippedLabel(19.4326, -99.1332), mexicoCity.label);

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
  assert.ok(!selected.label.startsWith('Near '), `${selected.label} is inside the U.S.`);
  assert.equal(selected.latitude, latitude);
  assert.equal(selected.longitude, longitude);
}

// The module and the map page agree across the U.S. and beyond its borders.
let seed = 20260929;
const random = () => {
  seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
  return seed / 2_147_483_648;
};
const agreementPoints = [];
for (let index = 0; index < 240; index += 1) {
  agreementPoints.push([24 + random() * 26, -125 + random() * 58]);
}
for (let index = 0; index < 30; index += 1) {
  agreementPoints.push([54 + random() * 17, -170 + random() * 40]);
  agreementPoints.push([18 + random() * 5, -161 + random() * 7]);
}
for (const [latitude, longitude] of agreementPoints) {
  assert.equal(
    shippedLabel(latitude, longitude),
    moduleLabel(latitude, longitude),
    `map page and module disagree at ${latitude}, ${longitude}`,
  );
}

const searchLabels = (query) => {
  const moduleResults = searchPlaces(places, query).map((place) =>
    placeLabel(place, stateNames),
  );
  const shippedResults = shipped
    .searchPlaces(query)
    .map((place) => shipped.placeLabel(place));
  assert.deepEqual(shippedResults, moduleResults, `search "${query}" differs`);
  return moduleResults;
};

const washington = searchLabels('washington');
assert.equal(washington[0], 'Washington, District of Columbia');
assert.ok(!washington.includes('Seattle, Washington'));

const newYork = searchLabels('new york');
assert.equal(newYork[0], 'New York, New York');
assert.ok(!newYork.includes('Rome, New York'));

const tripoliHits = searchLabels('tripoli');
assert.equal(tripoliHits[0], 'Tripoli, Iowa');

const cleveland = searchLabels('cleveland');
assert.equal(cleveland[0], 'Cleveland, Ohio');

for (const query of ['louisville', 'waukesha', 'pewaukee', 'bayam', 'san juan', 'springfield']) {
  const labels = searchLabels(query);
  assert.equal(new Set(labels).size, labels.length, `search "${query}" repeats a place`);
}
assert.equal(
  searchLabels('louisville').filter((label) => label === 'Louisville, Kentucky').length,
  1,
);
assert.equal(searchLabels('bayam')[0], 'Bayamón, Puerto Rico');
assert.equal(searchLabels('san juan')[0], 'San Juan, Puerto Rico');
assert.ok(!places.some((place) => / zona$/i.test(place[0])));

// Tripoli from search selects the exact default rather than the Census point.
const tripoliPlace = searchPlaces(places, 'tripoli')[0];
assert.deepEqual(searchSelection(tripoliPlace, stateNames, tripoliDefault), tripoliDefault);
assert.deepEqual(shipped.searchSelection(shipped.searchPlaces('tripoli')[0]), tripoliDefault);
const clevelandPlace = searchPlaces(places, 'cleveland')[0];
assert.deepEqual(
  shipped.searchSelection(shipped.searchPlaces('cleveland')[0]),
  searchSelection(clevelandPlace, stateNames, tripoliDefault),
);

console.log('Offline map selection passed.');
