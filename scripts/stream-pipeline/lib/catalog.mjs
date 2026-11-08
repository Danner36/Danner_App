// Turns a team key and sport into the TeamSpec the pipeline runs on. The committed catalog is the
// only allowlist: nothing outside it reaches a schedule, a listing site or a streams path.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { EVENT_ID_PATTERN } from './playableStream.mjs';

export const TEAM_KEY_PATTERN = /^[a-z]{2,8}-\d{1,8}$/;
const DEFAULT_OFFICIAL_DATE_ZONE = 'America/New_York';
const SCHEDULE_PROVIDERS = new Set(['espn', 'mlb-statsapi']);

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = path.resolve(packageDir, '../..');

export function catalogDirectory(env = process.env) {
  return env.STREAM_CATALOG_DIR?.trim() || path.join(repoRoot, 'catalog');
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readLeagues(catalogDir) {
  const document = await readJson(path.join(catalogDir, 'leagues.json'));
  return Array.isArray(document?.leagues) ? document.leagues : undefined;
}

async function readTeams(catalogDir, leagueKey) {
  const document = await readJson(path.join(catalogDir, 'teams', `${leagueKey}.json`));
  return Array.isArray(document?.teams) ? document.teams : undefined;
}

// The whole allowlist, for --check-config: Map of team key to entry, plus the league rows.
export async function loadCatalog(catalogDir = catalogDirectory()) {
  const leagues = await readLeagues(catalogDir);
  if (!leagues) {
    return undefined;
  }
  const teams = new Map();
  for (const league of leagues) {
    for (const team of (await readTeams(catalogDir, league.key)) ?? []) {
      if (typeof team?.key === 'string') {
        teams.set(team.key, team);
      }
    }
  }
  return { leagues, teams };
}

export function streamsPathForKey(teamKey) {
  const [league, espnId] = teamKey.split('-');
  return `streams/${league}/${espnId}.json`;
}

function teamSpec(league, team, sport) {
  const row = sport ? league.sports.find((candidate) => candidate.key === sport) : league;
  return {
    adapter: sport ? `${league.key}/${sport}` : league.key,
    espnId: team.espnId,
    hrefNeedles: Array.isArray(team.hrefNeedles) ? team.hrefNeedles : [],
    key: team.key,
    kind: league.kind,
    league: league.key,
    name: team.name,
    officialDateZone: league.officialDateZone ?? DEFAULT_OFFICIAL_DATE_ZONE,
    schedule: row.schedule,
    ...(sport ? { sport, sports: team.sports } : {}),
    ...(team.statsapi ? { statsapi: team.statsapi } : {}),
    streamsPath: streamsPathForKey(team.key),
  };
}

const rejected = (code, message) => ({ code, message });

// Checks the key against the regex and the catalog, the sport against the team, and the event id
// against its shape. Messages name no value, because these values come from the dispatch payload.
// A catalog that cannot be read rejects every key. Retired and hidden entries stay valid.
export async function checkRequest(request, catalogDir = catalogDirectory()) {
  const teamKey = String(request.team ?? '').trim();
  const sport = String(request.sport ?? '').trim() || undefined;
  const eventId = String(request.eventId ?? '').trim() || undefined;

  if (!TEAM_KEY_PATTERN.test(teamKey)) {
    return rejected('bad_team', 'The team key is missing or malformed.');
  }
  const leagues = await readLeagues(catalogDir);
  if (!leagues) {
    return rejected('bad_team', 'The team catalog could not be read.');
  }
  const leagueKey = teamKey.split('-')[0];
  const league = leagues.find((row) => row?.key === leagueKey);
  const teams = league ? await readTeams(catalogDir, leagueKey) : undefined;
  const team = teams?.find((entry) => entry?.key === teamKey);
  if (!team || streamsPathForKey(teamKey) !== `streams/${leagueKey}/${team.espnId}.json`) {
    return rejected('bad_team', 'The team key is not in the catalog.');
  }

  if (league.kind === 'school') {
    const offered = Array.isArray(team.sports) && team.sports.includes(sport);
    const known = league.sports?.some((row) => row.key === sport);
    if (!offered || !known) {
      return rejected('bad_sport', 'The sport is missing or this school does not offer it.');
    }
  } else if (sport) {
    return rejected('bad_sport', 'A sport was sent for a pro team.');
  }

  if (eventId && !EVENT_ID_PATTERN.test(eventId)) {
    return rejected('bad_event', 'The event id must be 1 to 12 digits.');
  }

  const spec = teamSpec(league, team, sport);
  if (
    !isObject(spec.schedule) ||
    !SCHEDULE_PROVIDERS.has(spec.schedule.provider) ||
    (spec.schedule.provider === 'mlb-statsapi' && !Number.isInteger(spec.statsapi?.teamId))
  ) {
    return rejected('bad_team', 'The catalog entry has no usable schedule.');
  }
  return { eventId, spec };
}

export function requestFromEnv(env = process.env) {
  return { eventId: env.EVENT_ID, sport: env.TEAM_SPORT, team: env.TEAM_KEY };
}

// Entries in a school file must carry one of the school's sports; pro entries must carry none.
export function validationForTeam(spec) {
  return spec.kind === 'school' ? { sports: spec.sports } : {};
}
