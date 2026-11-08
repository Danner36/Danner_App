import { isSportKey, SPORT_ORDER, sportLabel } from '../leagues/sports.ts';
import type {
  AdapterKey,
  LeagueKey,
  SportKey,
  TeamKey,
  TeamRef,
} from '../leagues/types.ts';
import type { ProTile, SchoolTile, Tile } from '../selection/types.ts';

const TEAM_KEY_PATTERN = /^[a-z]{2,8}-\d{1,8}$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const LOGO_HOST = 'a.espncdn.com';

export const CATALOG_SCHEMA = 1;

export type CatalogSport = {
  key: SportKey;
  label: string;
  pickable: boolean;
};

export type CatalogLeague =
  | {
      key: Exclude<LeagueKey, 'ncaa'>;
      kind: 'pro';
      label: string;
      pickable: boolean;
    }
  | {
      key: 'ncaa';
      kind: 'school';
      label: string;
      sports: CatalogSport[];
    };

export type CatalogLeagues = {
  generatedAt?: string;
  leagues: CatalogLeague[];
};

export type CatalogTeam = TeamRef & {
  hidden: boolean;
  key: TeamKey;
  retired: boolean;
  retiredSports: SportKey[];
  sports: SportKey[];
};

export type CatalogTeams = {
  generatedAt?: string;
  league: LeagueKey;
  teams: CatalogTeam[];
};

export type PickerRow = {
  adapter: AdapterKey;
  label: string;
  league: LeagueKey;
  sport?: SportKey;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isAllowedLogoUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(`https://${LOGO_HOST}/`);
}

function isLeagueKey(value: unknown): value is LeagueKey {
  return (
    value === 'mlb' ||
    value === 'nfl' ||
    value === 'nba' ||
    value === 'wnba' ||
    value === 'nhl' ||
    value === 'mls' ||
    value === 'nwsl' ||
    value === 'ncaa'
  );
}

function parseSport(value: unknown): CatalogSport | undefined {
  if (!isRecord(value) || !isSportKey(value.key) || !isText(value.label)) {
    return undefined;
  }
  return { key: value.key, label: value.label, pickable: value.pickable === true };
}

function parseLeague(value: unknown): CatalogLeague | undefined {
  if (!isRecord(value) || !isLeagueKey(value.key) || !isText(value.label)) {
    return undefined;
  }
  if (value.key === 'ncaa' || value.kind === 'school') {
    if (value.key !== 'ncaa' || !Array.isArray(value.sports)) {
      return undefined;
    }
    return {
      key: 'ncaa',
      kind: 'school',
      label: value.label,
      sports: value.sports.flatMap((sport) => parseSport(sport) ?? []),
    };
  }
  return {
    key: value.key,
    kind: 'pro',
    label: value.label,
    pickable: value.pickable === true,
  };
}

export function parseLeaguesDocument(value: unknown): CatalogLeagues | undefined {
  if (!isRecord(value) || value.schemaVersion !== CATALOG_SCHEMA || !Array.isArray(value.leagues)) {
    return undefined;
  }
  const leagues = value.leagues.flatMap((row) => parseLeague(row) ?? []);
  if (leagues.length === 0) {
    return undefined;
  }
  return {
    generatedAt: isText(value.generatedAt) ? value.generatedAt : undefined,
    leagues,
  };
}

function parseSportList(value: unknown): SportKey[] {
  const listed = Array.isArray(value) ? value.filter(isSportKey) : [];
  return SPORT_ORDER.filter((sport) => listed.includes(sport));
}

function parseTeam(value: unknown, league: LeagueKey): CatalogTeam | undefined {
  if (
    !isRecord(value) ||
    !isText(value.key) ||
    !TEAM_KEY_PATTERN.test(value.key) ||
    !isText(value.espnId) ||
    value.key !== `${league}-${value.espnId}` ||
    !isText(value.name) ||
    !isText(value.nickname) ||
    !isText(value.location) ||
    !isText(value.abbreviation)
  ) {
    return undefined;
  }
  const team: CatalogTeam = {
    abbreviation: value.abbreviation,
    espnId: value.espnId,
    hidden: value.hidden === true,
    key: value.key,
    location: value.location,
    name: value.name,
    nickname: value.nickname,
    retired: value.retired === true,
    retiredSports: parseSportList(value.retiredSports),
    sports: parseSportList(value.sports),
  };
  if (typeof value.color === 'string' && COLOR_PATTERN.test(value.color)) {
    team.color = value.color;
  }
  if (typeof value.alternateColor === 'string' && COLOR_PATTERN.test(value.alternateColor)) {
    team.alternateColor = value.alternateColor;
  }
  if (isAllowedLogoUrl(value.logo)) {
    team.logo = value.logo;
  }
  if (isText(value.conference)) {
    team.conference = value.conference;
  }
  const statsapi = value.statsapi;
  if (
    isRecord(statsapi) &&
    typeof statsapi.teamId === 'number' &&
    (statsapi.leagueId === 103 || statsapi.leagueId === 104)
  ) {
    team.statsapi = { leagueId: statsapi.leagueId, teamId: statsapi.teamId };
  }
  return team;
}

export function parseTeamsDocument(value: unknown, league: LeagueKey): CatalogTeams | undefined {
  if (
    !isRecord(value) ||
    value.schemaVersion !== CATALOG_SCHEMA ||
    value.league !== league ||
    !Array.isArray(value.teams)
  ) {
    return undefined;
  }
  return {
    generatedAt: isText(value.generatedAt) ? value.generatedAt : undefined,
    league,
    teams: value.teams.flatMap((entry) => parseTeam(entry, league) ?? []),
  };
}

function generatedTime(document: { generatedAt?: string } | undefined): number {
  const time = Date.parse(document?.generatedAt ?? '');
  return Number.isNaN(time) ? 0 : time;
}

// The cached copy replaces the bundled copy only when it is newer.
export function newerDocument<T extends { generatedAt?: string }>(
  bundled: T | undefined,
  cached: T | undefined,
): T | undefined {
  if (!cached) {
    return bundled;
  }
  if (!bundled) {
    return cached;
  }
  return generatedTime(cached) > generatedTime(bundled) ? cached : bundled;
}

// The rows of step 1: a league or college sport appears only when the build has its adapter and
// the catalog marks it pickable.
export function pickerRows(
  leagues: CatalogLeagues | undefined,
  supported: readonly AdapterKey[],
): PickerRow[] {
  if (!leagues) {
    return [];
  }
  return leagues.leagues.flatMap((league): PickerRow[] => {
    if (league.kind === 'school') {
      return league.sports
        .filter((sport) => sport.pickable && supported.includes(`ncaa/${sport.key}`))
        .map((sport) => ({
          adapter: `ncaa/${sport.key}` as AdapterKey,
          label: sport.label,
          league: 'ncaa',
          sport: sport.key,
        }));
    }
    return league.pickable && supported.includes(league.key)
      ? [{ adapter: league.key, label: league.label, league: league.key }]
      : [];
  });
}

function sportsStillOffered(team: CatalogTeam): SportKey[] {
  return team.sports.filter((sport) => !team.retiredSports.includes(sport));
}

// The teams of step 2. Retired and hidden entries are not offered; for a college sport only the
// schools that still play it are. An MLB entry needs its statsapi ids to load a schedule.
export function teamsForRow(teams: readonly CatalogTeam[], row: PickerRow): CatalogTeam[] {
  return teams.filter((team) => {
    if (team.retired || team.hidden) {
      return false;
    }
    if (row.sport !== undefined) {
      return sportsStillOffered(team).includes(row.sport);
    }
    return row.league !== 'mlb' || team.statsapi !== undefined;
  });
}

export function foldSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// Case- and accent-insensitive match over name, nickname, location, and abbreviation.
export function searchTeams(teams: readonly CatalogTeam[], query: string): CatalogTeam[] {
  const needle = foldSearchText(query.trim());
  if (needle.length === 0) {
    return [...teams];
  }
  return teams.filter((team) =>
    [team.name, team.nickname, team.location, team.abbreviation].some((field) =>
      foldSearchText(field).includes(needle),
    ),
  );
}

export function teamRefFromCatalog(team: CatalogTeam): TeamRef {
  const ref: TeamRef = {
    abbreviation: team.abbreviation,
    espnId: team.espnId,
    location: team.location,
    name: team.name,
    nickname: team.nickname,
  };
  if (team.color) ref.color = team.color;
  if (team.alternateColor) ref.alternateColor = team.alternateColor;
  if (team.logo) ref.logo = team.logo;
  if (team.conference) ref.conference = team.conference;
  if (team.statsapi) ref.statsapi = team.statsapi;
  return ref;
}

export function proTileFromCatalog(
  team: CatalogTeam,
  league: Exclude<LeagueKey, 'ncaa'>,
): ProTile {
  return { key: team.key, kind: 'pro', league, team: teamRefFromCatalog(team) };
}

export function schoolTileFromCatalog(team: CatalogTeam, sports: readonly SportKey[]): SchoolTile {
  return {
    key: team.key,
    kind: 'school',
    league: 'ncaa',
    sports: SPORT_ORDER.filter((sport) => sports.includes(sport)),
    team: teamRefFromCatalog(team),
  };
}

// The checkboxes of step 3: every sport the catalog still offers for the school and the build can
// show, plus any sport already on the tile so it can be unchecked.
export function sportChoices(
  team: CatalogTeam | undefined,
  rows: readonly PickerRow[],
  existing: Tile | undefined,
): SportKey[] {
  const offered = team ? sportsStillOffered(team) : [];
  const onTile = existing?.kind === 'school' ? existing.sports : [];
  return SPORT_ORDER.filter(
    (sport) =>
      onTile.includes(sport) ||
      (offered.includes(sport) && rows.some((row) => row.sport === sport)),
  );
}

// Pre-checked in step 3: the sports on the tile plus the one picked in step 1.
export function presetSports(existing: Tile | undefined, picked: SportKey | undefined): SportKey[] {
  const onTile = existing?.kind === 'school' ? existing.sports : [];
  return SPORT_ORDER.filter((sport) => onTile.includes(sport) || sport === picked);
}

export function hubStatusLabel(existing: Tile | undefined): string | undefined {
  if (!existing) {
    return undefined;
  }
  if (existing.kind === 'pro') {
    return 'On hub';
  }
  return `On hub · ${existing.sports.map(sportLabel).join(', ')}`;
}
