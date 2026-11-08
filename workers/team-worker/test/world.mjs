// Fake GitHub, ESPN and statsapi for the route tests. The fixtures follow the shape that
// scripts/team-catalog/build.mjs writes to catalog/.

import { createHash, createHmac } from 'node:crypto';

import { createApp } from '../src/app.js';
import { GlobalGateCore, MemoryStorage, TeamGateCore, readLimits } from '../src/gates.js';

export const APP_KEY = 'test-app-key-not-a-real-value';
export const PREVIOUS_KEY = 'test-previous-app-key';
export const STATUS_KEY = 'test-run-status-key';
export const PROGRESS_KEY = 'test-run-progress-key';
export const REPO = 'Danner36/Danner_App';
export const GITHUB_SECRET_TEXT = 'github-private-detail-token-ghp_marker';

export const START_MS = Date.parse('2026-11-08T18:00:00Z');
export const OFFICIAL_DATE = '2026-11-08';

export const LEAGUES_DOC = {
  generatedAt: '2026-11-01T00:00:00.000Z',
  leagues: [
    {
      espn: { corePath: 'baseball/leagues/mlb', sitePath: 'baseball/mlb' },
      key: 'mlb',
      kind: 'pro',
      label: 'MLB',
      pickable: true,
      schedule: { provider: 'mlb-statsapi', sportId: 1 },
    },
    {
      key: 'nfl',
      kind: 'pro',
      label: 'NFL',
      officialDateZone: 'America/New_York',
      pickable: true,
      schedule: { provider: 'espn', sitePath: 'football/nfl' },
    },
    {
      key: 'ncaa',
      kind: 'school',
      label: 'College',
      officialDateZone: 'America/New_York',
      sports: [
        { key: 'football', label: 'NCAA football', pickable: true, schedule: { provider: 'espn', sitePath: 'football/college-football' } },
        { key: 'mens-basketball', label: "NCAA men's basketball", pickable: true, schedule: { provider: 'espn', sitePath: 'basketball/mens-college-basketball' } },
      ],
    },
  ],
  schemaVersion: 1,
};

const TEAM_DOCS = {
  mlb: {
    league: 'mlb',
    schemaVersion: 1,
    teams: [
      { espnId: '5', key: 'mlb-5', name: 'Cleveland Guardians', nickname: 'Guardians', statsapi: { leagueId: 103, teamId: 114 } },
    ],
  },
  ncaa: {
    league: 'ncaa',
    schemaVersion: 1,
    teams: [
      { espnId: '66', key: 'ncaa-66', name: 'Iowa State Cyclones', nickname: 'Cyclones', sports: ['football', 'mens-basketball', 'womens-basketball'], retiredSports: ['womens-basketball'] },
      { espnId: '2', key: 'ncaa-2', name: 'Auburn Tigers', nickname: 'Tigers', sports: ['football'], retired: true },
    ],
  },
  nfl: {
    league: 'nfl',
    schemaVersion: 1,
    teams: [
      { espnId: '17', key: 'nfl-17', name: 'New England Patriots', nickname: 'Patriots' },
      { espnId: '2', key: 'nfl-2', name: 'Buffalo Bills', nickname: 'Bills' },
    ],
  },
};

function blobSha(text) {
  return createHash('sha1').update(text).digest('hex');
}

function jsonResponse(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { headers, status });
}

export function espnSummary({
  date = '2026-11-08T18:00:00Z',
  name = 'STATUS_SCHEDULED',
  state = 'pre',
  teams = ['17', '2'],
} = {}) {
  return {
    header: {
      competitions: [
        {
          competitors: teams.map((id) => ({ id, team: { id } })),
          date,
          status: { type: { completed: state === 'post', name, state } },
        },
      ],
    },
  };
}

export function statsapiSchedule({
  abstract = 'Preview',
  detailed = 'Scheduled',
  gameDate = '2026-11-08T18:00:00Z',
  officialDate = OFFICIAL_DATE,
  startTimeTBD = false,
  teams = [114, 120],
} = {}) {
  return {
    dates: [
      {
        date: officialDate,
        games: [
          {
            gameDate,
            gamePk: 777,
            officialDate,
            status: { abstractGameState: abstract, detailedState: detailed, startTimeTBD },
            teams: { away: { team: { id: teams[1] } }, home: { team: { id: teams[0] } } },
          },
        ],
      },
    ],
  };
}

export function pipelineEntry(overrides = {}) {
  return {
    allowInsecureHttp: false,
    eventId: '401',
    gameDates: [OFFICIAL_DATE],
    gameNumbers: [1],
    kind: 'web',
    source: 'pipeline',
    trustedHosts: [],
    url: 'https://example.invalid/embed/1',
    ...overrides,
  };
}

export function streamsDocument(entries) {
  return JSON.stringify({
    schemaVersion: 2,
    streams: ['INACTIVE EXAMPLE', { kind: 'direct', url: 'https://example.invalid/game.m3u8' }, ...entries],
    team: { key: 'nfl-17', name: 'New England Patriots' },
  });
}

export function createWorld({ now = START_MS } = {}) {
  const world = {
    blobs: new Map(),
    calls: [],
    clock: { now },
    dispatches: [],
    espn: new Map(),
    failures: new Map(),
    folders: new Map(),
    logs: [],
    repoEtag: '"repo-etag"',
    statsapi: new Map(),
  };

  world.putBlob = (text) => {
    const sha = blobSha(text);
    world.blobs.set(sha, text);
    return sha;
  };

  world.setFolder = (path, files) => {
    world.folders.set(path, {
      etag: `"${blobSha(JSON.stringify(files))}"`,
      items: Object.entries(files).map(([name, text]) => ({
        name,
        sha: world.putBlob(text),
        type: 'file',
      })),
    });
  };

  world.seedCatalog = () => {
    const teams = Object.fromEntries(
      Object.entries(TEAM_DOCS).map(([league, doc]) => [`${league}.json`, JSON.stringify(doc)]),
    );
    world.setFolder('catalog', { 'leagues.json': JSON.stringify(LEAGUES_DOC) });
    world.setFolder('catalog/teams', teams);
  };

  world.setStreams = (league, files) => world.setFolder(`streams/${league}`, files);

  world.setEspn = (eventId, value, status = 200) => world.espn.set(eventId, { status, value });

  world.setStatsapi = (eventId, value, status = 200) => world.statsapi.set(eventId, { status, value });

  // Stages: catalogIndex, teamsIndex, streamsIndex, blob, dispatch, repo, espn, statsapi.
  // A failure is an HTTP status number, 'network' or 'garbage'.
  world.fail = (stage, failure) => world.failures.set(stage, failure);

  world.callsTo = (stage) => world.calls.filter((call) => call.stage === stage);

  function stageOf(url, method) {
    if (url.hostname === 'site.api.espn.com') return 'espn';
    if (url.hostname === 'statsapi.mlb.com') return 'statsapi';
    const repoPath = url.pathname.replace(`/repos/${REPO}`, '');
    if (repoPath === '') return 'repo';
    if (repoPath === '/dispatches' && method === 'POST') return 'dispatch';
    if (repoPath.startsWith('/git/blobs/')) return 'blob';
    if (repoPath === '/contents/catalog') return 'catalogIndex';
    if (repoPath === '/contents/catalog/teams') return 'teamsIndex';
    if (repoPath.startsWith('/contents/streams/')) return 'streamsIndex';
    return 'unknown';
  }

  world.fetch = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    const headers = init.headers ?? {};
    const stage = stageOf(url, method);
    world.calls.push({ headers, method, stage, url: url.href });
    const failure = world.failures.get(stage);
    if (failure === 'network') {
      throw new TypeError('network down');
    }
    if (typeof failure === 'number') {
      return new Response(GITHUB_SECRET_TEXT, { status: failure });
    }
    if (failure === 'garbage') {
      return new Response('<html>not json</html>', { status: 200 });
    }

    if (stage === 'espn') {
      const answer = world.espn.get(url.searchParams.get('event'));
      return answer ? jsonResponse(answer.value, answer.status) : jsonResponse({ code: 404 }, 404);
    }
    if (stage === 'statsapi') {
      const answer = world.statsapi.get(url.searchParams.get('gamePk'));
      return answer ? jsonResponse(answer.value, answer.status) : jsonResponse({ dates: [], totalGames: 0 });
    }
    if (stage === 'repo') {
      if (headers['If-None-Match'] === world.repoEtag) {
        return new Response(null, { status: 304 });
      }
      return jsonResponse({ full_name: REPO }, 200, { ETag: world.repoEtag });
    }
    if (stage === 'dispatch') {
      world.dispatches.push(JSON.parse(init.body));
      return new Response(null, { status: 204 });
    }
    if (stage === 'blob') {
      const text = world.blobs.get(url.pathname.split('/').pop());
      return text === undefined ? new Response('missing', { status: 404 }) : new Response(text);
    }
    if (stage === 'catalogIndex' || stage === 'teamsIndex' || stage === 'streamsIndex') {
      const folder = world.folders.get(url.pathname.replace(`/repos/${REPO}/contents/`, ''));
      if (!folder) {
        return jsonResponse({ message: 'Not Found' }, 404);
      }
      if (headers['If-None-Match'] === folder.etag) {
        return new Response(null, { status: 304 });
      }
      return jsonResponse(folder.items, 200, { ETag: folder.etag });
    }
    return new Response('unknown route', { status: 500 });
  };

  world.app = createApp({
    fetchImpl: world.fetch,
    log: (...args) => world.logs.push(args.join(' ')),
    now: () => world.clock.now,
  });

  world.env = {
    APP_KEY,
    GITHUB_REPO: REPO,
    GITHUB_TOKEN: 'test-github-token',
    RUN_PROGRESS_KEY: PROGRESS_KEY,
    RUN_STATUS_KEY: STATUS_KEY,
  };

  world.request = (path, { body, headers = {}, ip = '203.0.113.7', method = 'GET' } = {}) =>
    world.app.fetch(
      new Request(`https://worker.test${path}`, {
        body,
        headers: { 'CF-Connecting-IP': ip, ...headers },
        method,
      }),
      world.env,
    );

  world.getVideo = (fields = {}, options = {}) =>
    world.request('/get-video', {
      body: JSON.stringify({ appKey: APP_KEY, eventId: '401', team: 'nfl-17', ...fields }),
      method: 'POST',
      ...options,
    });

  world.signed = (path, fields, secret, { at = world.clock.now, headers = {}, signature } = {}) => {
    const body = JSON.stringify({ at, ...fields });
    const digest = createHmac('sha256', secret).update(body).digest('hex');
    return world.request(path, {
      body,
      headers: { 'X-Signature': signature ?? digest, ...headers },
      method: 'POST',
    });
  };

  return world;
}

// A namespace whose objects are the real gate classes over in-memory storage, reached the way the
// Worker reaches a Durable Object.
export function fakeNamespace(makeCore) {
  const objects = new Map();
  return {
    get(id) {
      if (!objects.has(id)) {
        objects.set(id, makeCore());
      }
      return objects.get(id);
    },
    idFromName(name) {
      return name;
    },
    objects,
  };
}

export function bindDurableObjects(world) {
  const limits = readLimits(world.env);
  const now = () => world.clock.now;
  world.env.TEAM_GATE = fakeNamespace(() => new TeamGateCore(new MemoryStorage(), limits, now));
  world.env.GLOBAL_GATE = fakeNamespace(() => new GlobalGateCore(new MemoryStorage(), limits, now));
}
