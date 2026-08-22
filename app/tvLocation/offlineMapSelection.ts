export const MAP_GRID_MAX = 65_535;
const MAX_MERCATOR_LATITUDE = 85.05112878;
const MAJOR_PLACE_SCORE = 1_000_000_000_000;
const MAJOR_PLACE_RADIUS_KM = 18;

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

export function placeRadiusKm(place: OfflineMapPlace): number {
  if (place[4] > MAJOR_PLACE_SCORE) {
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

export function selectedPlace(
  places: OfflineMapPlace[],
  point: OfflineMapPoint,
): OfflineMapPlace | undefined {
  let nearest: OfflineMapPlace | undefined;
  let nearestKm = Infinity;
  let covering: OfflineMapPlace | undefined;
  let coveringScore = -1;

  for (const place of places) {
    const location = gridToLocation(place[2], place[3]);
    const kilometers = equirectangularKm(point, location);
    if (kilometers < nearestKm) {
      nearest = place;
      nearestKm = kilometers;
    }
    if (kilometers <= placeRadiusKm(place) && place[4] > coveringScore) {
      covering = place;
      coveringScore = place[4];
    }
  }

  return covering ?? nearest;
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

  return nameStarts.concat(nameContains).slice(0, limit);
}

export function selectedDestination(
  places: OfflineMapPlace[],
  stateNames: Array<[string, string]>,
  point: OfflineMapPoint,
): { label: string; latitude: number; longitude: number } {
  const place = selectedPlace(places, point);
  return {
    label: place ? placeLabel(place, stateNames) : 'Selected map location',
    latitude: point.latitude,
    longitude: point.longitude,
  };
}
