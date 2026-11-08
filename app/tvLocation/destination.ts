export const DESTINATION_STORAGE_KEY = 'danner.destination.v1';
export const DEFAULT_LOCATION_STORAGE_KEY = 'danner.tv.default.v1';

export type Destination = {
  label: string;
  latitude: number;
  longitude: number;
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

export function sameCoordinates(first: Destination, second: Destination): boolean {
  return (
    Math.abs(first.latitude - second.latitude) < 0.0000001 &&
    Math.abs(first.longitude - second.longitude) < 0.0000001
  );
}

export function destinationFromStored(value: unknown): Destination | undefined {
  if (!hasValidCoordinates(value)) {
    return undefined;
  }

  return {
    label:
      typeof value.label === 'string' && value.label.trim()
        ? value.label.trim()
        : 'Saved map location',
    latitude: value.latitude,
    longitude: value.longitude,
  };
}

export type ResolvedTvLocation = {
  defaultLocation?: Destination;
  current?: Destination;
  // The current point became the default in memory and still has to be written.
  writeDefault: boolean;
  loadError: boolean;
};

export const TV_LOCATION_READ_FAILED: ResolvedTvLocation = {
  writeDefault: false,
  loadError: true,
};

function parseStoredPoint(raw: string | null | undefined): {
  point?: Destination;
  invalid: boolean;
} {
  if (raw === null || raw === undefined) {
    return { invalid: false };
  }
  try {
    const point = destinationFromStored(JSON.parse(raw));
    return { point, invalid: point === undefined };
  } catch {
    return { invalid: true };
  }
}

// An unreadable value counts as absent and sets loadError. A phone holding only the
// current point keeps it as the default; a phone holding only the default uses it as the
// current point for this session.
export function resolveTvLocation(
  defaultRaw: string | null | undefined,
  currentRaw: string | null | undefined,
): ResolvedTvLocation {
  const storedDefault = parseStoredPoint(defaultRaw);
  const storedCurrent = parseStoredPoint(currentRaw);
  const current = storedCurrent.point ?? storedDefault.point;

  return {
    defaultLocation: storedDefault.point ?? storedCurrent.point,
    current,
    writeDefault: !storedDefault.point && storedCurrent.point !== undefined,
    loadError: storedDefault.invalid || storedCurrent.invalid,
  };
}

export function defaultButtonLabel(defaultLocation: Destination): string {
  return `Use my default (${defaultLocation.label})`;
}

export type PickerControls = {
  primaryLabel: 'Save this location' | 'Use this map location';
  primaryEnabled: boolean;
  showUseDefault: boolean;
  showMakeDefault: boolean;
};

// Without a default the first save sets it, and nothing can be saved until the map page
// reports a selection.
export function pickerControls(
  draft: Destination | undefined,
  defaultLocation: Destination | undefined,
): PickerControls {
  if (!defaultLocation) {
    return {
      primaryLabel: 'Save this location',
      primaryEnabled: draft !== undefined,
      showUseDefault: false,
      showMakeDefault: false,
    };
  }

  const differs = draft !== undefined && !sameCoordinates(draft, defaultLocation);
  return {
    primaryLabel: 'Use this map location',
    primaryEnabled: draft !== undefined,
    showUseDefault: differs,
    showMakeDefault: differs,
  };
}

export function showUseDefaultOnStepOne(
  current: Destination | undefined,
  defaultLocation: Destination | undefined,
): boolean {
  return (
    current !== undefined &&
    defaultLocation !== undefined &&
    !sameCoordinates(current, defaultLocation)
  );
}

export type SessionState = 'signed-in' | 'signed-out' | 'unknown';

export function accountControls(session: SessionState): {
  signIn: boolean;
  switchAccount: boolean;
  signOut: boolean;
} {
  return {
    signIn: session !== 'signed-in',
    switchAccount: session !== 'signed-out',
    signOut: session !== 'signed-out',
  };
}

export function sessionStatusText(session: SessionState): string {
  if (session === 'signed-in') {
    return 'Signed in on this phone';
  }
  return session === 'signed-out'
    ? 'Not signed in on this phone'
    : 'Sign-in status is not available';
}
