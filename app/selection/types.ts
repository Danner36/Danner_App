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

// A hub tile that is not a team, added from `+` under Custom modules.
export type ModuleKey = 'youtube-tv';

export type SelectionV1 = {
  // Absent only on a document written before custom modules; loading fills it in.
  modules?: ModuleKey[];
  schema: 1;
  tiles: Tile[];
  updatedAt: string;
};
