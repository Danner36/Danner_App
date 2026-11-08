import type { ImageSourcePropType } from 'react-native';
import type { TeamKey } from '../leagues/types.ts';

const PRESET_LOGOS: Readonly<Record<TeamKey, ImageSourcePropType>> = {
  'mlb-5': require('../assets/cleveland-guardians-logo.jpg'),
  'ncaa-66': require('../assets/iowa-state-cyclones-logo.jpg'),
  'nfl-17': require('../assets/new-england-patriots-logo.jpg'),
};

export function presetLogoFor(key: TeamKey): ImageSourcePropType | undefined {
  return PRESET_LOGOS[key];
}
