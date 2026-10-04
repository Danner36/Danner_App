// app/scripts/offline-us-map.template.html embeds the same selection rules for the
// bundled map page; tests/offline-map/run.mjs checks that both agree.
export const MAP_GRID_MAX = 65_535;
const MAX_MERCATOR_LATITUDE = 85.05112878;
const MAJOR_PLACE_SCORE = 1_000_000_000_000;
const MAJOR_PLACE_RADIUS_KM = 18;
const NEAR_LABEL_KM = 80;

export type OfflineMapPlace = [
  name: string,
  stateIndex: number,
  x: number,
  y: number,
  sortScore: number,
];

export type OfflineMapPoint = {
  latitude: number;
  longitude: number;
};

export type OfflineMapMatch = {
  place: OfflineMapPlace;
  near: boolean;
};

export function locationToGrid(
  latitude: number,
  longitude: number,
  gridMax = MAP_GRID_MAX,
): { x: number; y: number } {
  const limitedLatitude = Math.max(
    -MAX_MERCATOR_LATITUDE,
    Math.min(MAX_MERCATOR_LATITUDE, latitude),
  );
  const radians = (limitedLatitude * Math.PI) / 180;
  return {
    x: ((longitude + 180) / 360) * gridMax,
    y:
      ((1 -
        Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) /
        2) *
      gridMax,
  };
}

export function gridToLocation(
  x: number,
  y: number,
  gridMax = MAP_GRID_MAX,
): OfflineMapPoint {
  const longitude = (x / gridMax) * 360 - 180;
  const mercatorY = Math.PI * (1 - (2 * y) / gridMax);
  return {
    latitude: (Math.atan(Math.sinh(mercatorY)) * 180) / Math.PI,
    longitude,
  };
}

export function placeLabel(
  place: OfflineMapPlace,
  stateNames: Array<[string, string]>,
): string {
  return `${place[0]}, ${stateNames[place[1]][1]}`;
}

function isMajorPlace(place: OfflineMapPlace): boolean {
  return place[4] > MAJOR_PLACE_SCORE;
}

// Major places carry a rank instead of a land area, so they use a fixed radius.
export function placeRadiusKm(place: OfflineMapPlace): number {
  if (isMajorPlace(place)) {
    return MAJOR_PLACE_RADIUS_KM;
  }
  return Math.max(
    1.5,
    Math.min(40, Math.sqrt(Math.max(place[4], 0) / Math.PI) / 1_000),
  );
}

function longitudeDifference(first: number, second: number): number {
  let difference = second - first;
  if (difference > 180) {
    difference -= 360;
  }
  if (difference < -180) {
    difference += 360;
  }
  return difference;
}

export function equirectangularKm(
  first: OfflineMapPoint,
  second: OfflineMapPoint,
): number {
  const x =
    longitudeDifference(first.longitude, second.longitude) *
    Math.cos((first.latitude * Math.PI) / 180);
  const y = second.latitude - first.latitude;
  return Math.sqrt(x * x + y * y) * 111.32;
}

// A point takes the name of a place whose area-sized radius covers it, choosing the
// place whose center is closest relative to its radius. Major places cover only
// points that no other place covers. Without a covering place the nearest place is
// used, marked `near` when it is farther than NEAR_LABEL_KM.
export function selectedMatch(
  places: OfflineMapPlace[],
  point: OfflineMapPoint,
): OfflineMapMatch | undefined {
  let nearest: OfflineMapPlace | undefined;
  let nearestKm = Infinity;
  let covering: OfflineMapPlace | undefined;
  let coveringMajor = true;
  let coveringRatio = Infinity;

  for (const place of places) {
    const location = gridToLocation(place[2], place[3]);
    const kilometers = equirectangularKm(point, location);
    if (kilometers < nearestKm) {
      nearest = place;
      nearestKm = kilometers;
    }
    const radius = placeRadiusKm(place);
    if (kilometers > radius) {
      continue;
    }
    const major = isMajorPlace(place);
    const ratio = kilometers / radius;
    if (
      !covering ||
      (coveringMajor && !major) ||
      (major === coveringMajor && ratio < coveringRatio)
    ) {
      covering = place;
      coveringMajor = major;
      coveringRatio = ratio;
    }
  }

  if (covering) {
    return { place: covering, near: false };
  }
  return nearest ? { place: nearest, near: nearestKm > NEAR_LABEL_KM } : undefined;
}

export function searchPlaces(
  places: OfflineMapPlace[],
  query: string,
  limit = 8,
): OfflineMapPlace[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) {
    return [];
  }

  const nameStarts: OfflineMapPlace[] = [];
  const nameContains: OfflineMapPlace[] = [];
  for (const place of places) {
    const name = place[0].toLowerCase();
    if (name.startsWith(needle)) {
      nameStarts.push(place);
    } else if (name.includes(needle)) {
      nameContains.push(place);
    }
  }

  const seen = new Set<string>();
  const matches: OfflineMapPlace[] = [];
  for (const place of nameStarts.concat(nameContains)) {
    const key = `${place[0]}|${place[1]}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    matches.push(place);
    if (matches.length === limit) {
      break;
    }
  }
  return matches;
}

export function matchLabel(
  match: OfflineMapMatch | undefined,
  stateNames: Array<[string, string]>,
): string {
  if (!match) {
    return 'Selected map location';
  }
  const label = placeLabel(match.place, stateNames);
  return match.near ? `Near ${label}` : label;
}

export function selectedDestination(
  places: OfflineMapPlace[],
  stateNames: Array<[string, string]>,
  point: OfflineMapPoint,
): { label: string; latitude: number; longitude: number } {
  return {
    label: matchLabel(selectedMatch(places, point), stateNames),
    latitude: point.latitude,
    longitude: point.longitude,
  };
}

// Tripoli, Iowa from search selects the exact default point and label rather than the
// quantized Census point.
export function searchSelection(
  place: OfflineMapPlace,
  stateNames: Array<[string, string]>,
  defaultStart: { label: string; latitude: number; longitude: number },
): { label: string; latitude: number; longitude: number } {
  if (placeLabel(place, stateNames) === defaultStart.label) {
    return { ...defaultStart };
  }
  const location = gridToLocation(place[2], place[3]);
  return {
    label: placeLabel(place, stateNames),
    latitude: location.latitude,
    longitude: location.longitude,
  };
}
