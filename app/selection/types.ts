import type { LeagueKey, SportKey, TeamKey, TeamRef } from '../leagues/types.ts';

export type ProTile = {
  kind: 'pro';
  key: TeamKey;
  league: Exclude<LeagueKey, 'ncaa'>;
  team: TeamRef;
};

export type SchoolTile = {
  kind: 'school';
  key: TeamKey;
  league: 'ncaa';
  // Non-empty, ordered football, mens-basketball, womens-basketball.
  sports: SportKey[];
  team: TeamRef;
};

export type Tile = ProTile | SchoolTile;

export type SelectionV1 = { schema: 1; tiles: Tile[]; updatedAt: string };
