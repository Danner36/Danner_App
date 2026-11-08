import { updatedInPlace, type InstallTimes } from './installInfo.ts';

export const SEED_KEY = 'danner.seed.v1';

// Written by the v1 hub in v1.5.x builds. This app reads it and never writes or removes it.
const INSTALL_MARKER_KEY = 'danner.install.v1';
const DESTINATION_KEY = 'danner.destination.v1';

export const LEGACY_SOURCES_KEYS: readonly string[] = [
  'danner.guardians.sources.v2',
  'danner.patriots.sources.v1',
  'danner.cyclones.sources.v1',
];

// Any one of these proves a v1.x install.
export const LEGACY_SIGNAL_KEYS: readonly string[] = [
  INSTALL_MARKER_KEY,
  ...LEGACY_SOURCES_KEYS,
  DESTINATION_KEY,
];

export type SeedDecision = {
  decision: 'legacy-family' | 'fresh';
  signal: 'legacy-keys' | 'install-times' | 'none';
};

export type SeedRecord = SeedDecision & {
  appVersion: string;
  at: string;
};

// Layer 1 is the legacy keys, layer 2 the Android install times. Everything else is a fresh install.
export function decideSeed(
  legacyKeysPresent: boolean,
  installTimes: InstallTimes | undefined,
): SeedDecision {
  if (legacyKeysPresent) {
    return { decision: 'legacy-family', signal: 'legacy-keys' };
  }
  if (updatedInPlace(installTimes)) {
    return { decision: 'legacy-family', signal: 'install-times' };
  }
  return { decision: 'fresh', signal: 'none' };
}
