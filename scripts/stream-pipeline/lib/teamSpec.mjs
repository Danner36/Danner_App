// Builds the TeamSpec the pipeline runs on from one catalog league row and one catalog team entry.
// Pure, with no Node-only imports, so the Worker bundles the same rules the pipeline uses.

export const DEFAULT_OFFICIAL_DATE_ZONE = 'America/New_York';
export const SCHEDULE_PROVIDERS = new Set(['espn', 'mlb-statsapi']);

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function streamsPathForKey(teamKey) {
  const [league, espnId] = teamKey.split('-');
  return `streams/${league}/${espnId}.json`;
}

export function teamSpec(league, team, sport) {
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

// The spec, or undefined when the league, team and sport do not fit together or the entry has no
// schedule a provider can read. Same checks as checkRequest, minus the key and event shapes.
export function checkedTeamSpec(league, team, sport) {
  if (!isObject(league) || !isObject(team) || streamsPathForKey(team.key) !== `streams/${league.key}/${team.espnId}.json`) {
    return undefined;
  }
  if (league.kind === 'school') {
    const offered = Array.isArray(team.sports) && team.sports.includes(sport);
    const known = Array.isArray(league.sports) && league.sports.some((row) => row?.key === sport);
    if (!offered || !known) {
      return undefined;
    }
  } else if (sport) {
    return undefined;
  }
  const spec = teamSpec(league, team, sport);
  if (
    !isObject(spec.schedule) ||
    !SCHEDULE_PROVIDERS.has(spec.schedule.provider) ||
    (spec.schedule.provider === 'mlb-statsapi' && !Number.isInteger(spec.statsapi?.teamId))
  ) {
    return undefined;
  }
  return spec;
}

// Entries in a school file must carry one of the school's sports; pro entries must carry none.
export function validationForTeam(spec) {
  return spec.kind === 'school' ? { sports: spec.sports } : {};
}
