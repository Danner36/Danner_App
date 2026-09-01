export const DESTINATION_STORAGE_KEY = 'danner.destination.v1';

export type Destination = {
  label: string;
  latitude: number;
  longitude: number;
};

export const TRIPOLI_DESTINATION: Destination = {
  label: 'Tripoli, Iowa',
  latitude: 42.808371,
  longitude: -92.2578433,
};

function hasValidCoordinates(
  value: unknown,
): value is { latitude: number; longitude: number; label?: unknown } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const latitude = 'latitude' in value ? value.latitude : undefined;
  const longitude = 'longitude' in value ? value.longitude : undefined;

  return (
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function isTripoli(destination: Destination): boolean {
  return (
    Math.abs(destination.latitude - TRIPOLI_DESTINATION.latitude) < 0.0000001 &&
    Math.abs(destination.longitude - TRIPOLI_DESTINATION.longitude) < 0.0000001
  );
}

export function destinationFromStored(value: unknown): Destination | undefined {
  if (!hasValidCoordinates(value)) {
    return undefined;
  }

  const provisional = {
    label: '',
    latitude: value.latitude,
    longitude: value.longitude,
  };

  if (isTripoli(provisional)) {
    return TRIPOLI_DESTINATION;
  }

  return {
    ...provisional,
    label:
      typeof value.label === 'string' && value.label.trim()
        ? value.label.trim()
        : 'Saved map location',
  };
}
