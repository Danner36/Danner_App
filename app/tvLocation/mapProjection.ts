export const MAP_TILE_SIZE = 256;
const MAP_MAX_LATITUDE = 85.05112878;

export function locationToWorld(
  latitude: number,
  longitude: number,
  zoom: number,
): { x: number; y: number } {
  const worldSize = MAP_TILE_SIZE * 2 ** zoom;
  const limitedLatitude = Math.max(
    -MAP_MAX_LATITUDE,
    Math.min(MAP_MAX_LATITUDE, latitude),
  );
  const latitudeRadians = (limitedLatitude * Math.PI) / 180;

  return {
    x: ((longitude + 180) / 360) * worldSize,
    y:
      ((1 -
        Math.log(Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians)) /
          Math.PI) /
        2) *
      worldSize,
  };
}

export function worldToLocation(
  x: number,
  y: number,
  zoom: number,
): { latitude: number; longitude: number } {
  const worldSize = MAP_TILE_SIZE * 2 ** zoom;
  const wrappedX = ((x % worldSize) + worldSize) % worldSize;
  const limitedY = Math.max(0, Math.min(worldSize, y));
  const longitude = (wrappedX / worldSize) * 360 - 180;
  const mercatorY = Math.PI * (1 - (2 * limitedY) / worldSize);
  const latitude = (Math.atan(Math.sinh(mercatorY)) * 180) / Math.PI;

  return { latitude, longitude };
}
