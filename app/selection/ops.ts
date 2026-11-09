import { SPORT_ORDER } from '../leagues/sports.ts';
import type { SportKey, TeamKey, TeamRef } from '../leagues/types.ts';
import { CYCLONES_TILE, PRESET_TILES } from './presets.ts';
import type { ModuleKey, ProTile, SchoolTile, SelectionV1, Tile } from './types.ts';

export const MAX_TEAM_TILES = 30;
export const YOUTUBE_TV_MODULE: ModuleKey = 'youtube-tv';

export type MoveDirection = 'front' | 'earlier' | 'later';

export function emptySelection(now: string): SelectionV1 {
  return { modules: [], schema: 1, tiles: [], updatedAt: now };
}

export function hasModule(selection: SelectionV1, key: ModuleKey): boolean {
  return selection.modules?.includes(key) ?? false;
}

export function addModule(
  selection: SelectionV1,
  key: ModuleKey,
  now: string,
): SelectionV1 {
  return hasModule(selection, key)
    ? selection
    : { ...selection, modules: [...(selection.modules ?? []), key], updatedAt: now };
}

// Only the hub tile goes away; what the module saved on the phone stays for when it is added back.
export function removeModule(
  selection: SelectionV1,
  key: ModuleKey,
  now: string,
): SelectionV1 {
  return hasModule(selection, key)
    ? {
        ...selection,
        modules: (selection.modules ?? []).filter((entry) => entry !== key),
        updatedAt: now,
      }
    : selection;
}

export function isHubFull(selection: SelectionV1): boolean {
  return selection.tiles.length >= MAX_TEAM_TILES;
}

export function findTile(
  selection: SelectionV1,
  key: TeamKey,
): Tile | undefined {
  return selection.tiles.find((tile) => tile.key === key);
}

function withTiles(selection: SelectionV1, tiles: Tile[], now: string): SelectionV1 {
  return { ...selection, tiles, updatedAt: now };
}

function orderedSports(sports: readonly SportKey[]): SportKey[] {
  return SPORT_ORDER.filter((sport) => sports.includes(sport));
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

// A pro team always has its own tile. No change when the key exists or the hub is full.
export function addPro(
  selection: SelectionV1,
  tile: ProTile,
  now: string,
): SelectionV1 {
  if (findTile(selection, tile.key) || isHubFull(selection)) {
    return selection;
  }
  return withTiles(selection, [...selection.tiles, tile], now);
}

// Unions the sports into the school's tile, else appends a new tile. A new tile past the cap is
// refused; merging into an existing tile adds no tile, so the cap does not apply.
export function addSchoolSports(
  selection: SelectionV1,
  school: SchoolTile,
  now: string,
): SelectionV1 {
  const existing = findTile(selection, school.key);
  if (existing) {
    if (existing.kind !== 'school') {
      return selection;
    }
    const sports = orderedSports([...existing.sports, ...school.sports]);
    if (sameList(sports, existing.sports)) {
      return selection;
    }
    return withTiles(
      selection,
      selection.tiles.map((tile) =>
        tile.key === school.key ? { ...existing, sports } : tile,
      ),
      now,
    );
  }
  const sports = orderedSports(school.sports);
  if (sports.length === 0 || isHubFull(selection)) {
    return selection;
  }
  return withTiles(selection, [...selection.tiles, { ...school, sports }], now);
}

// Replaces a school tile's sports. An empty list removes the tile.
export function setSchoolSports(
  selection: SelectionV1,
  key: TeamKey,
  sports: readonly SportKey[],
  now: string,
): SelectionV1 {
  const existing = findTile(selection, key);
  if (!existing || existing.kind !== 'school') {
    return selection;
  }
  const ordered = orderedSports(sports);
  if (ordered.length === 0) {
    return removeTile(selection, key, now);
  }
  if (sameList(ordered, existing.sports)) {
    return selection;
  }
  return withTiles(
    selection,
    selection.tiles.map((tile) =>
      tile.key === key ? { ...existing, sports: ordered } : tile,
    ),
    now,
  );
}

export function removeTile(
  selection: SelectionV1,
  key: TeamKey,
  now: string,
): SelectionV1 {
  if (!findTile(selection, key)) {
    return selection;
  }
  return withTiles(
    selection,
    selection.tiles.filter((tile) => tile.key !== key),
    now,
  );
}

export function moveTile(
  selection: SelectionV1,
  key: TeamKey,
  direction: MoveDirection,
  now: string,
): SelectionV1 {
  const from = selection.tiles.findIndex((tile) => tile.key === key);
  if (from < 0) {
    return selection;
  }
  const to =
    direction === 'front' ? 0 : direction === 'earlier' ? from - 1 : from + 1;
  if (to === from || to < 0 || to >= selection.tiles.length) {
    return selection;
  }
  const tiles = [...selection.tiles];
  const [moved] = tiles.splice(from, 1);
  tiles.splice(to, 0, moved);
  return withTiles(selection, tiles, now);
}

// Appends the missing presets in the order Guardians, Patriots, Cyclones and merges the Cyclones
// sports into an existing ncaa-66 tile.
export function applyFamilyPreset(
  selection: SelectionV1,
  now: string,
): SelectionV1 {
  return PRESET_TILES.reduce<SelectionV1>((current, tile) => {
    if (tile.kind === 'school') {
      return addSchoolSports(current, CYCLONES_TILE, now);
    }
    return addPro(current, tile, now);
  }, selection);
}

// Replaces the display data of stored tiles by key. Order and sports never change here.
export function refreshTeamRefs(
  selection: SelectionV1,
  refFor: (key: TeamKey) => TeamRef | undefined,
  now: string,
): SelectionV1 {
  let changed = false;
  const tiles = selection.tiles.map((tile): Tile => {
    const ref = refFor(tile.key);
    if (!ref) {
      return tile;
    }
    const team: TeamRef = { ...tile.team, ...ref };
    if (JSON.stringify(team) === JSON.stringify(tile.team)) {
      return tile;
    }
    changed = true;
    return { ...tile, team };
  });
  return changed ? withTiles(selection, tiles, now) : selection;
}
