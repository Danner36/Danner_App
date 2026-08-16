import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const GAZETTEER_URL =
  'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_place_national.zip';
const ROADS_URL =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer/0/query?where=1%3D1&outFields=NAME&returnGeometry=true&outSR=4326&geometryPrecision=3&maxAllowableOffset=0.02&f=geojson';
const STATES_URL =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0/query?where=1%3D1&outFields=STUSAB&returnGeometry=true&outSR=4326&geometryPrecision=3&maxAllowableOffset=0.02&f=geojson';
const MAP_GRID_MAX = 65535;
const MAX_MERCATOR_LATITUDE = 85.05112878;
const MAJOR_PLACE_ORDER = [
  'New York|NY',
  'Los Angeles|CA',
  'Chicago|IL',
  'Houston|TX',
  'Phoenix|AZ',
  'Philadelphia|PA',
  'San Antonio|TX',
  'San Diego|CA',
  'Dallas|TX',
  'San Jose|CA',
  'Austin|TX',
  'Jacksonville|FL',
  'Fort Worth|TX',
  'Columbus|OH',
  'Indianapolis|IN',
  'Charlotte|NC',
  'Seattle|WA',
  'Denver|CO',
  'Washington|DC',
  'Boston|MA',
  'Nashville|TN',
  'Detroit|MI',
  'Portland|OR',
  'Las Vegas|NV',
  'Miami|FL',
  'Atlanta|GA',
  'Minneapolis|MN',
  'New Orleans|LA',
  'Salt Lake City|UT',
  'Kansas City|MO',
  'St. Louis|MO',
  'Baltimore|MD',
  'Milwaukee|WI',
  'Albuquerque|NM',
  'Omaha|NE',
  'Raleigh|NC',
  'Sacramento|CA',
  'San Francisco|CA',
  'Oklahoma City|OK',
  'Memphis|TN',
  'Louisville|KY',
  'Cleveland|OH',
  'Cincinnati|OH',
  'Pittsburgh|PA',
  'Orlando|FL',
  'Tampa|FL',
  'Honolulu|HI',
  'Anchorage|AK',
  'Des Moines|IA',
  'Cedar Rapids|IA',
  'Waterloo|IA',
];
const MAJOR_PLACE_RANK = new Map(
  MAJOR_PLACE_ORDER.map((place, index) => [place, index]),
);

const STATE_NAMES = [
  ['AL', 'Alabama'],
  ['AK', 'Alaska'],
  ['AZ', 'Arizona'],
  ['AR', 'Arkansas'],
  ['CA', 'California'],
  ['CO', 'Colorado'],
  ['CT', 'Connecticut'],
  ['DE', 'Delaware'],
  ['DC', 'District of Columbia'],
  ['FL', 'Florida'],
  ['GA', 'Georgia'],
  ['HI', 'Hawaii'],
  ['ID', 'Idaho'],
  ['IL', 'Illinois'],
  ['IN', 'Indiana'],
  ['IA', 'Iowa'],
  ['KS', 'Kansas'],
  ['KY', 'Kentucky'],
  ['LA', 'Louisiana'],
  ['ME', 'Maine'],
  ['MD', 'Maryland'],
  ['MA', 'Massachusetts'],
  ['MI', 'Michigan'],
  ['MN', 'Minnesota'],
  ['MS', 'Mississippi'],
  ['MO', 'Missouri'],
  ['MT', 'Montana'],
  ['NE', 'Nebraska'],
  ['NV', 'Nevada'],
  ['NH', 'New Hampshire'],
  ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'],
  ['NY', 'New York'],
  ['NC', 'North Carolina'],
  ['ND', 'North Dakota'],
  ['OH', 'Ohio'],
  ['OK', 'Oklahoma'],
  ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'],
  ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'],
  ['SD', 'South Dakota'],
  ['TN', 'Tennessee'],
  ['TX', 'Texas'],
  ['UT', 'Utah'],
  ['VT', 'Vermont'],
  ['VA', 'Virginia'],
  ['WA', 'Washington'],
  ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'],
  ['WY', 'Wyoming'],
  ['PR', 'Puerto Rico'],
];

async function download(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'DannerApp offline map builder' },
  });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function readSingleFileZip(buffer) {
  let endOffset = -1;
  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      endOffset = index;
      break;
    }
  }
  if (endOffset < 0) {
    throw new Error('The Gazetteer ZIP end record was not found.');
  }

  const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16);
  if (buffer.readUInt32LE(centralDirectoryOffset) !== 0x02014b50) {
    throw new Error('The Gazetteer ZIP directory is invalid.');
  }

  const compressionMethod = buffer.readUInt16LE(centralDirectoryOffset + 10);
  const compressedSize = buffer.readUInt32LE(centralDirectoryOffset + 20);
  const localHeaderOffset = buffer.readUInt32LE(centralDirectoryOffset + 42);
  const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const dataOffset =
    localHeaderOffset + 30 + localNameLength + localExtraLength;
  const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);

  if (compressionMethod === 0) {
    return compressed.toString('utf8');
  }
  if (compressionMethod === 8) {
    return inflateRawSync(compressed).toString('utf8');
  }
  throw new Error(`Unsupported Gazetteer ZIP method ${compressionMethod}.`);
}

function quantizeCoordinate([longitude, latitude]) {
  const limitedLatitude = Math.max(
    -MAX_MERCATOR_LATITUDE,
    Math.min(MAX_MERCATOR_LATITUDE, latitude),
  );
  const radians = (limitedLatitude * Math.PI) / 180;
  const x = ((longitude + 180) / 360) * MAP_GRID_MAX;
  const y =
    ((1 -
      Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) /
      2) *
    MAP_GRID_MAX;
  return [Math.round(x), Math.round(y)];
}

function flattenLine(coordinates) {
  const flattened = [];
  let lastX;
  let lastY;
  for (const coordinate of coordinates) {
    const [x, y] = quantizeCoordinate(coordinate);
    if (x === lastX && y === lastY) {
      continue;
    }
    flattened.push(x, y);
    lastX = x;
    lastY = y;
  }
  return flattened;
}

function geometryLines(geometry) {
  if (!geometry) {
    return [];
  }
  if (geometry.type === 'LineString') {
    return [geometry.coordinates];
  }
  if (geometry.type === 'MultiLineString') {
    return geometry.coordinates;
  }
  return [];
}

function geometryOuterRings(geometry) {
  if (!geometry) {
    return [];
  }
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.length ? [geometry.coordinates[0]] : [];
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates
      .filter((polygon) => polygon.length)
      .map((polygon) => polygon[0]);
  }
  return [];
}

function cleanPlaceName(name) {
  const cleaned = name
    .replace(
      /\s+(city and borough|unified government \(balance\)|consolidated government \(balance\)|metropolitan government \(balance\)|metro government \(balance\)|city \(balance\)|city|town|village|borough|municipality|CDP|urbana|comunidad)$/i,
      '',
    )
    .trim();
  const preferredNames = {
    'Athens-Clarke County': 'Athens',
    'Augusta-Richmond County': 'Augusta',
    'Louisville/Jefferson County': 'Louisville',
    'Nashville-Davidson': 'Nashville',
    'Urban Honolulu': 'Honolulu',
  };
  return preferredNames[cleaned] ?? cleaned;
}

function buildPlaces(gazetteerText) {
  const stateIndexes = new Map(
    STATE_NAMES.map(([abbreviation], index) => [abbreviation, index]),
  );
  const lines = gazetteerText.trim().split(/\r?\n/);
  const headers = lines.shift().split('|');
  const field = (name) => headers.indexOf(name);
  const indexes = {
    land: field('ALAND'),
    latitude: field('INTPTLAT'),
    longitude: field('INTPTLONG'),
    name: field('NAME'),
    state: field('USPS'),
  };

  return lines
    .map((line) => {
      const values = line.split('|');
      const stateIndex = stateIndexes.get(values[indexes.state]);
      const latitude = Number(values[indexes.latitude]);
      const longitude = Number(values[indexes.longitude]);
      if (
        stateIndex === undefined ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        return undefined;
      }
      const [x, y] = quantizeCoordinate([longitude, latitude]);
      const name = cleanPlaceName(values[indexes.name]);
      const state = values[indexes.state];
      const majorRank = MAJOR_PLACE_RANK.get(`${name}|${state}`);
      const sortScore =
        majorRank === undefined
          ? Number(values[indexes.land]) || 0
          : 1_000_000_000_000_000 - majorRank;
      return [
        name,
        stateIndex,
        x,
        y,
        sortScore,
      ];
    })
    .filter(Boolean)
    .sort((left, right) => right[4] - left[4]);
}

function buildRoads(geoJson) {
  const roads = [];
  for (const feature of geoJson.features ?? []) {
    const name = String(feature.properties?.NAME ?? '');
    for (const line of geometryLines(feature.geometry)) {
      const flattened = flattenLine(line);
      if (flattened.length < 4) {
        continue;
      }
      let minX = MAP_GRID_MAX;
      let minY = MAP_GRID_MAX;
      let maxX = 0;
      let maxY = 0;
      for (let index = 0; index < flattened.length; index += 2) {
        minX = Math.min(minX, flattened[index]);
        minY = Math.min(minY, flattened[index + 1]);
        maxX = Math.max(maxX, flattened[index]);
        maxY = Math.max(maxY, flattened[index + 1]);
      }
      roads.push([name, minX, minY, maxX, maxY, flattened]);
    }
  }
  return roads;
}

function buildStates(geoJson) {
  const includedStates = new Set(
    STATE_NAMES.map(([abbreviation]) => abbreviation),
  );
  return (geoJson.features ?? [])
    .map((feature) => {
      const abbreviation = String(feature.properties?.STUSAB ?? '');
      if (!includedStates.has(abbreviation)) {
        return undefined;
      }
      const rings = geometryOuterRings(feature.geometry)
        .map(flattenLine)
        .filter((ring) => ring.length >= 6);
      return rings.length ? [abbreviation, rings] : undefined;
    })
    .filter(Boolean);
}

async function main() {
  const [gazetteerZip, roadsBuffer, statesBuffer] = await Promise.all([
    download(GAZETTEER_URL),
    download(ROADS_URL),
    download(STATES_URL),
  ]);
  const gazetteerText = readSingleFileZip(gazetteerZip);
  const roadsGeoJson = JSON.parse(roadsBuffer.toString('utf8'));
  const statesGeoJson = JSON.parse(statesBuffer.toString('utf8'));

  if (roadsGeoJson.error || statesGeoJson.error) {
    throw new Error(
      `TIGERweb query failed: ${JSON.stringify(
        roadsGeoJson.error ?? statesGeoJson.error,
      )}`,
    );
  }

  const output = {
    version: 1,
    vintage: 2025,
    gridMax: MAP_GRID_MAX,
    stateNames: STATE_NAMES,
    states: buildStates(statesGeoJson),
    roads: buildRoads(roadsGeoJson),
    places: buildPlaces(gazetteerText),
  };
  const projectDirectory = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  );
  const assetsDirectory = path.join(projectDirectory, 'assets');
  const outputPath = path.join(assetsDirectory, 'offline-us-map.json');
  const serialized = JSON.stringify(output);
  await mkdir(assetsDirectory, { recursive: true });
  await writeFile(outputPath, serialized);

  const mapComponentPath = path.join(projectDirectory, 'OfflineUsMap.tsx');
  const mapComponent = await readFile(mapComponentPath, 'utf8');
  const templateMatch = mapComponent.match(
    /return `(<!doctype html>[\s\S]*?)`;\r?\n}/,
  );
  if (!templateMatch) {
    throw new Error('The offline map HTML template was not found.');
  }
  const bundledHtml = templateMatch[1]
    .replace('${OFFLINE_MAP_JSON}', serialized.replace(/</g, '\\u003c'))
    .replace('${initialLatitude}', '42.808371')
    .replace('${initialLongitude}', '-92.2578433')
    .replace('${initialLabel}', JSON.stringify('Tripoli, Iowa'));
  const htmlOutputPath = path.join(assetsDirectory, 'offline-us-map.html');
  await writeFile(htmlOutputPath, bundledHtml);
  process.stdout.write(
    `Wrote ${outputPath}\nWrote ${htmlOutputPath}\n` +
      `${output.states.length} states, ${output.roads.length} road lines, ` +
      `${output.places.length} places, ` +
      `${(Buffer.byteLength(serialized) / 1024 / 1024).toFixed(2)} MiB\n`,
  );
}

await main();
