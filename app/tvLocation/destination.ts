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

export async function nearestPlaceName(
  latitude: number,
  longitude: number,
): Promise<string> {
  const query = new URLSearchParams({
    addressdetails: '1',
    format: 'jsonv2',
    lat: String(latitude),
    lon: String(longitude),
    zoom: '10',
  });
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?${query.toString()}`,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DannerApp/1.0 (com.example.location_helper)',
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Place lookup failed with ${response.status}`);
  }

  const result = (await response.json()) as {
    address?: Record<string, string | undefined>;
    display_name?: string;
  };
  const address = result.address ?? {};
  const place =
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.hamlet ??
    address.county;
  const region = address.state_code?.toUpperCase() ?? address.state;

  if (place && region) {
    return `${place}, ${region}`;
  }
  if (place) {
    return place;
  }
  if (result.display_name) {
    return result.display_name.split(',').slice(0, 2).join(',').trim();
  }
  return 'Selected map location';
}
