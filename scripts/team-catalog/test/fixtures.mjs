// ESPN- and statsapi-shaped fixtures and a URL-routed fake fetch for the catalog tests.

export function espnTeam(id, displayName, name, extra = {}) {
  return {
    abbreviation: displayName.slice(0, 3).toUpperCase(),
    alternateColor: 'ffffff',
    color: 'ae192d',
    displayName,
    id: String(id),
    isActive: true,
    isAllStar: false,
    location: displayName.split(' ').slice(0, -1).join(' ') || displayName,
    logos: [
      { href: `https://a.espncdn.com/i/teamlogos/500-dark/${id}.png`, rel: ['full', 'dark'] },
      { href: `https://a.espncdn.com/i/teamlogos/500/${id}.png`, rel: ['full', 'default'] },
    ],
    name,
    nickname: displayName.split(' ')[0],
    ...extra,
  };
}

export function teamsBody(teams) {
  return { sports: [{ leagues: [{ teams: teams.map((team) => ({ team })) }] }] };
}

// conferences: [{ shortName, ids, divisions: [{ ids }] }]
export function standingsBody(conferences) {
  return {
    children: conferences.map(({ divisions, ids, shortName }) =>
      divisions
        ? {
            children: divisions.map((division) => ({
              name: `${shortName} East`,
              standings: { entries: division.ids.map((id) => ({ team: { id: String(id) } })) },
            })),
            shortName,
          }
        : { shortName, standings: { entries: (ids ?? []).map((id) => ({ team: { id: String(id) } })) } },
    ),
  };
}

export function ok(body) {
  return { body, jsonError: false, latencyMs: 12, networkError: null, ok: true, status: 200 };
}

export function httpError(status) {
  return { body: null, jsonError: false, latencyMs: 12, networkError: status >= 500 ? `HTTP ${status}` : null, ok: false, status };
}

export function networkFailure(error = 'ENOTFOUND') {
  return { body: null, jsonError: false, latencyMs: 12, networkError: error, ok: false, status: null };
}

// routes: [[pattern, response or (url) => response], ...]; the first match wins.
export function fakeFetch(routes, fallback = networkFailure()) {
  const calls = [];
  const getJson = async (url) => {
    calls.push(url);
    for (const [pattern, response] of routes) {
      const matched = pattern instanceof RegExp ? pattern.test(url) : url.includes(pattern);
      if (matched) {
        return typeof response === 'function' ? response(url) : response;
      }
    }
    return fallback;
  };
  getJson.calls = calls;
  return getJson;
}

const MLB_NAMES = [
  ['5', 'Cleveland Guardians', 'Guardians', 114, 103],
  ['1', 'Baltimore Orioles', 'Orioles', 110, 103],
  ['2', 'Boston Red Sox', 'Red Sox', 111, 103],
  ['3', 'Chicago Cubs', 'Cubs', 112, 104],
  ['4', 'Atlanta Braves', 'Braves', 144, 104],
  ['6', 'Detroit Tigers', 'Tigers', 116, 103],
  ['7', 'Kansas City Royals', 'Royals', 118, 103],
  ['8', 'Minnesota Twins', 'Twins', 142, 103],
  ['9', 'New York Mets', 'Mets', 121, 104],
  ['10', 'Athletics', 'Athletics', 133, 103],
];

export function mlbTeams(count = MLB_NAMES.length) {
  return MLB_NAMES.slice(0, count).map(([id, displayName, name]) => espnTeam(id, displayName, name));
}

export function statsapiTeams(count = MLB_NAMES.length) {
  return MLB_NAMES.slice(0, count).map(([, name, , teamId, leagueId]) => ({ id: teamId, league: { id: leagueId }, name }));
}

export function nflTeams(count = 10) {
  const teams = [espnTeam('17', 'New England Patriots', 'Patriots')];
  for (let id = 1; teams.length < count; id += 1) {
    if (id !== 17) {
      teams.push(espnTeam(String(id), `Team ${id} Cats`, 'Cats'));
    }
  }
  return teams;
}

// Ten Division I schools (id 66 plus 100..108) in every college list, plus a Division II school
// (900) only in the football list.
export function schoolLists() {
  const ids = [66, 100, 101, 102, 103, 104, 105, 106, 107, 108];
  const schools = ids.map((id) =>
    id === 66 ? espnTeam(66, 'Iowa State Cyclones', 'Cyclones') : espnTeam(id, `School ${id} Tigers`, 'Tigers'),
  );
  const conferences = [
    { ids: [66, 100, 101, 102, 103], shortName: 'Big 12' },
    { divisions: [{ ids: [104, 105] }, { ids: [106, 107, 108] }], shortName: 'Sun Belt' },
  ];
  return { conferences, football: [...schools, espnTeam(900, 'School 900 Bears', 'Bears')], mens: schools, womens: schools };
}

// A fetch serving every list the builder reads. `overridesBy` replaces a route body by key
// (mlb, nfl, football, mens, womens, statsapi).
export function buildFetch(overridesBy = {}) {
  const lists = schoolLists();
  const teams = {
    football: lists.football,
    mens: lists.mens,
    mlb: mlbTeams(),
    nfl: nflTeams(),
    statsapi: statsapiTeams(),
    womens: lists.womens,
    ...overridesBy,
  };
  return fakeFetch([
    ['/baseball/mlb/teams', ok(teamsBody(teams.mlb))],
    ['/football/nfl/teams', ok(teamsBody(teams.nfl))],
    ['/football/college-football/teams', ok(teamsBody(teams.football))],
    ['/basketball/mens-college-basketball/teams', ok(teamsBody(teams.mens))],
    ['/basketball/womens-college-basketball/teams', ok(teamsBody(teams.womens))],
    ['/standings?group=80', ok(standingsBody(lists.conferences))],
    ['/standings?group=81', ok(standingsBody([{ ids: [], shortName: 'Empty FCS' }]))],
    ['/mens-college-basketball/standings', ok(standingsBody(lists.conferences))],
    ['/womens-college-basketball/standings', ok(standingsBody(lists.conferences))],
    ['statsapi.mlb.com/api/v1/teams', ok({ teams: teams.statsapi })],
  ]);
}
