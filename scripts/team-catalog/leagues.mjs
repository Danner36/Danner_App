// League rows shared by build.mjs, probe.mjs and live-capture.mjs. `LEAGUE_ROWS` is the shape
// written to catalog/leagues.json; the adapter table adds what only these tools need.

export const CATALOG_SCHEMA_VERSION = 1;
export const REPORT_SCHEMA_VERSION = 1;
export const TEAM_KEY_PATTERN = /^[a-z]{2,8}-\d{1,8}$/;
export const SPORT_ORDER = ['football', 'mens-basketball', 'womens-basketball'];
export const OFFICIAL_DATE_ZONE = 'America/New_York';
const BASKETBALL_SEASON = { shiftForwardFromMonth: 7 };
const SEASON_TYPES = [1, 2, 3];

const ESPN_FOOTBALL_NFL = {
  corePath: 'football/leagues/nfl',
  provider: 'espn',
  seasonTypes: SEASON_TYPES,
  seasonYear: { shiftBackThroughMonth: 2 },
  sitePath: 'football/nfl',
};

export const LEAGUE_ROWS = [
  {
    espn: { corePath: 'baseball/leagues/mlb', sitePath: 'baseball/mlb' },
    key: 'mlb',
    kind: 'pro',
    label: 'MLB',
    schedule: { provider: 'mlb-statsapi', sportId: 1 },
  },
  {
    key: 'nfl',
    kind: 'pro',
    label: 'NFL',
    officialDateZone: OFFICIAL_DATE_ZONE,
    schedule: ESPN_FOOTBALL_NFL,
  },
  {
    key: 'ncaa',
    kind: 'school',
    label: 'College',
    officialDateZone: OFFICIAL_DATE_ZONE,
    sports: [
      {
        key: 'football',
        label: 'NCAA football',
        schedule: {
          corePath: 'football/leagues/college-football',
          provider: 'espn',
          seasonTypes: SEASON_TYPES,
          seasonYear: { shiftBackThroughMonth: 1 },
          sitePath: 'football/college-football',
        },
      },
      {
        key: 'mens-basketball',
        label: "NCAA men's basketball",
        schedule: {
          corePath: 'basketball/leagues/mens-college-basketball',
          provider: 'espn',
          seasonTypes: SEASON_TYPES,
          seasonYear: BASKETBALL_SEASON,
          sitePath: 'basketball/mens-college-basketball',
        },
      },
      {
        key: 'womens-basketball',
        label: "NCAA women's basketball",
        schedule: {
          corePath: 'basketball/leagues/womens-college-basketball',
          provider: 'espn',
          seasonTypes: SEASON_TYPES,
          seasonYear: BASKETBALL_SEASON,
          sitePath: 'basketball/womens-college-basketball',
        },
      },
    ],
  },
];

// presetEspnId supplies the schedule the probe and the live capture read for the adapter.
// standingsGroups are the ESPN standings groups that name a school's conference; a sport with
// divisionOneFilter keeps only the schools inside them, because its /teams list also holds
// Division II and III programs. The basketball /teams lists are Division I already.
export const ADAPTERS = Object.freeze({
  mlb: {
    corePath: 'baseball/leagues/mlb',
    key: 'mlb',
    league: 'mlb',
    presetEspnId: '5',
    seasonTypes: SEASON_TYPES,
    seasonYear: {},
    sitePath: 'baseball/mlb',
  },
  nfl: {
    corePath: 'football/leagues/nfl',
    key: 'nfl',
    league: 'nfl',
    presetEspnId: '17',
    seasonTypes: SEASON_TYPES,
    seasonYear: ESPN_FOOTBALL_NFL.seasonYear,
    sitePath: 'football/nfl',
  },
  'ncaa/football': {
    corePath: 'football/leagues/college-football',
    divisionOneFilter: true,
    key: 'ncaa/football',
    league: 'ncaa',
    presetEspnId: '66',
    seasonTypes: SEASON_TYPES,
    seasonYear: { shiftBackThroughMonth: 1 },
    sitePath: 'football/college-football',
    sport: 'football',
    standingsGroups: [80, 81],
  },
  'ncaa/mens-basketball': {
    basketball: true,
    corePath: 'basketball/leagues/mens-college-basketball',
    key: 'ncaa/mens-basketball',
    league: 'ncaa',
    presetEspnId: '66',
    seasonTypes: SEASON_TYPES,
    seasonYear: BASKETBALL_SEASON,
    sitePath: 'basketball/mens-college-basketball',
    sport: 'mens-basketball',
    standingsGroups: [50],
  },
  'ncaa/womens-basketball': {
    basketball: true,
    corePath: 'basketball/leagues/womens-college-basketball',
    key: 'ncaa/womens-basketball',
    league: 'ncaa',
    presetEspnId: '66',
    seasonTypes: SEASON_TYPES,
    seasonYear: BASKETBALL_SEASON,
    sitePath: 'basketball/womens-college-basketball',
    sport: 'womens-basketball',
    standingsGroups: [50],
  },
});

export const ADAPTER_KEYS = Object.freeze(Object.keys(ADAPTERS));

export function adapterDirName(adapter) {
  return adapter.replaceAll('/', '-');
}

export function adaptersForLeague(leagueKey) {
  return ADAPTER_KEYS.filter((key) => ADAPTERS[key].league === leagueKey);
}

export function leagueKeys() {
  return LEAGUE_ROWS.map((row) => row.key);
}

// Parses the optional `leagues` input: comma- or space-separated league keys (mlb, nfl, ncaa) or
// adapter keys (ncaa/football). Empty input is every adapter. Returns null when an entry is unknown.
export function adaptersFromInput(input) {
  const names = String(input ?? '')
    .split(/[,\s]+/)
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length === 0) {
    return [...ADAPTER_KEYS];
  }
  const selected = new Set();
  for (const name of names) {
    if (Object.hasOwn(ADAPTERS, name)) {
      selected.add(name);
    } else if (leagueKeys().includes(name)) {
      for (const adapter of adaptersForLeague(name)) {
        selected.add(adapter);
      }
    } else {
      return null;
    }
  }
  return ADAPTER_KEYS.filter((key) => selected.has(key));
}

// The season year of `date` (default: now) under a seasonYear rule, read in the official date zone:
// shiftForwardFromMonth m means months m and later count toward year + 1; shiftBackThroughMonth m
// means months through m count toward year − 1.
export function seasonYearFor(rule, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    timeZone: OFFICIAL_DATE_ZONE,
    year: 'numeric',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  if (rule?.shiftForwardFromMonth && values.month >= rule.shiftForwardFromMonth) {
    return values.year + 1;
  }
  if (rule?.shiftBackThroughMonth && values.month <= rule.shiftBackThroughMonth) {
    return values.year - 1;
  }
  return values.year;
}

export const SITE_API = 'https://site.api.espn.com/apis/site/v2/sports';
export const STANDINGS_API = 'https://site.api.espn.com/apis/v2/sports';
export const CORE_API = 'https://sports.core.api.espn.com/v2/sports';
export const STATSAPI = 'https://statsapi.mlb.com/api/v1';

export function teamsUrl(row) {
  return `${SITE_API}/${row.sitePath}/teams?limit=1000`;
}

export function scheduleUrl(row, espnId, season, seasonType) {
  const query = seasonType === undefined ? `season=${season}` : `season=${season}&seasontype=${seasonType}`;
  return `${SITE_API}/${row.sitePath}/teams/${espnId}/schedule?${query}`;
}

export function scoreboardUrl(row) {
  const group = row.standingsGroups?.[0];
  return `${SITE_API}/${row.sitePath}/scoreboard?limit=300${group ? `&groups=${group}` : ''}`;
}

export function summaryUrl(row, event) {
  return `${SITE_API}/${row.sitePath}/summary?event=${event}`;
}

export function standingsUrl(row, group) {
  return `${STANDINGS_API}/${row.sitePath}/standings?group=${group}&level=3`;
}

export function coreCompetitionUrl(row, event, resource) {
  return `${CORE_API}/${row.corePath}/events/${event}/competitions/${event}/${resource}`;
}
