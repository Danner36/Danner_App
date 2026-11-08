import type { AdapterKey, TeamKey } from '../leagues/types.ts';
import type { ProTile, SchoolTile, Tile } from './types.ts';

const GUARDIANS_ACCENT = '#E31937';
const PATRIOTS_ACCENT = '#E31937';
const CYCLONES_ACCENT = '#AE192D';

export const GUARDIANS_TILE: ProTile = {
  key: 'mlb-5',
  kind: 'pro',
  league: 'mlb',
  team: {
    abbreviation: 'CLE',
    espnId: '5',
    location: 'Cleveland',
    name: 'Cleveland Guardians',
    nickname: 'Guardians',
    statsapi: { leagueId: 103, teamId: 114 },
  },
};

export const PATRIOTS_TILE: ProTile = {
  key: 'nfl-17',
  kind: 'pro',
  league: 'nfl',
  team: {
    abbreviation: 'NE',
    espnId: '17',
    location: 'New England',
    name: 'New England Patriots',
    nickname: 'Patriots',
  },
};

export const CYCLONES_TILE: SchoolTile = {
  key: 'ncaa-66',
  kind: 'school',
  league: 'ncaa',
  sports: ['football', 'mens-basketball', 'womens-basketball'],
  team: {
    abbreviation: 'ISU',
    conference: 'Big 12',
    espnId: '66',
    location: 'Iowa State',
    name: 'Iowa State Cyclones',
    nickname: 'Cyclones',
  },
};

export const PRESET_TILES: readonly Tile[] = [
  GUARDIANS_TILE,
  PATRIOTS_TILE,
  CYCLONES_TILE,
];

const PRESET_ACCENTS: Readonly<Record<TeamKey, string>> = {
  [GUARDIANS_TILE.key]: GUARDIANS_ACCENT,
  [PATRIOTS_TILE.key]: PATRIOTS_ACCENT,
  [CYCLONES_TILE.key]: CYCLONES_ACCENT,
};

export function presetAccent(key: TeamKey): string | undefined {
  return PRESET_ACCENTS[key];
}

export function adapterKeysForTile(tile: Tile): AdapterKey[] {
  return tile.kind === 'school'
    ? tile.sports.map((sport): AdapterKey => `ncaa/${sport}`)
    : [tile.league];
}
