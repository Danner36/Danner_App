// A catalog in the shape scripts/team-catalog/build.mjs writes, config secrets with made-up
// hosts, schedule bodies, and a URL-routed fake fetch.

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { CATALOG_SCHEMA_VERSION, LEAGUE_ROWS } from '../../team-catalog/leagues.mjs';

export const HOSTS = ['listing-one.test', 'listing-two.test', 'listing-three.test'];
export const EMBED_URL = 'https://gooz.aapmains.net/new-stream-embed/57001?ad=111';

const TEAMS = {
  mlb: [
    {
      abbreviation: 'CLE',
      espnId: '5',
      hrefNeedles: ['cleveland-guardians'],
      key: 'mlb-5',
      location: 'Cleveland',
      name: 'Cleveland Guardians',
      nickname: 'Guardians',
      statsapi: { leagueId: 103, teamId: 114 },
    },
  ],
  ncaa: [
    {
      abbreviation: 'ISU',
      conference: 'Big 12',
      espnId: '66',
      hrefNeedles: ['iowa-state-cyclones'],
      key: 'ncaa-66',
      location: 'Iowa State',
      name: 'Iowa State Cyclones',
      nickname: 'Cyclones',
      sports: ['football', 'mens-basketball', 'womens-basketball'],
    },
    {
      abbreviation: 'OLD',
      espnId: '9001',
      hrefNeedles: ['old-state-owls'],
      key: 'ncaa-9001',
      location: 'Old State',
      name: 'Old State Owls',
      nickname: 'Owls',
      retired: true,
      retiredSports: ['football'],
      sports: ['football'],
    },
  ],
  nfl: [
    {
      abbreviation: 'NE',
      espnId: '17',
      hrefNeedles: ['new-england-patriots'],
      key: 'nfl-17',
      location: 'New England',
      name: 'New England Patriots',
      nickname: 'Patriots',
    },
  ],
};

export async function writeCatalog(directory) {
  await mkdir(path.join(directory, 'teams'), { recursive: true });
  const leagues = LEAGUE_ROWS.map((row) => ({
    ...row,
    ...(row.sports
      ? { sports: row.sports.map((sport) => ({ ...sport, pickable: true })) }
      : { pickable: true }),
  }));
  await writeFile(
    path.join(directory, 'leagues.json'),
    JSON.stringify({ generatedAt: '2026-11-01T00:00:00Z', leagues, schemaVersion: CATALOG_SCHEMA_VERSION }),
  );
  for (const [league, teams] of Object.entries(TEAMS)) {
    await writeFile(
      path.join(directory, 'teams', `${league}.json`),
      JSON.stringify({ generatedAt: '2026-11-01T00:00:00Z', league, schemaVersion: CATALOG_SCHEMA_VERSION, teams }),
    );
  }
}

export function secretConfig(hosts = HOSTS, extra = {}) {
  return {
    schemaVersion: 2,
    sources: hosts.map((host, index) => ({
      label: index === 0 ? 'primary' : `backup-${index}`,
      baseUrl: `https://${host}/live`,
    })),
    ...extra,
  };
}

// A temp directory holding a catalog and a written secret.
export async function withWorkspace(body, secret = secretConfig()) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'stream-pipeline-'));
  try {
    const catalogDir = path.join(directory, 'catalog');
    await writeCatalog(catalogDir);
    const configPath = path.join(directory, 'config.json');
    await writeFile(configPath, JSON.stringify(secret));
    return await body({ catalogDir, configPath, directory });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

export function mlbSchedule(overrides = {}) {
  return {
    dates: [
      {
        date: '2026-09-26',
        games: [
          {
            gameDate: '2026-09-26T23:10:00Z',
            gameNumber: 1,
            gamePk: 900001,
            officialDate: '2026-09-26',
            status: { abstractGameState: 'Preview', detailedState: 'Scheduled' },
            teams: {
              away: { team: { id: 116, name: 'Detroit Tigers' } },
              home: { team: { id: 114, name: 'Cleveland Guardians' } },
            },
            ...overrides,
          },
        ],
      },
    ],
  };
}

export function espnEvent({ date = '2026-11-08T01:00:00Z', espnId = '66', id = '401800001', opponent = 'Kansas Jayhawks', state = 'pre' } = {}) {
  return {
    competitions: [
      {
        competitors: [
          { homeAway: 'home', team: { displayName: 'Our Team', id: espnId } },
          { homeAway: 'away', team: { displayName: opponent, id: '2305' } },
        ],
        status: { type: { name: 'STATUS_SCHEDULED', state } },
      },
    ],
    date,
    id,
  };
}

function contentsBody(document) {
  return JSON.stringify({
    content: Buffer.from(JSON.stringify(document)).toString('base64'),
    encoding: 'base64',
    sha: 'remote-sha',
  });
}

// Routes statsapi, ESPN and GitHub calls and records every request.
export function fakeFetch({
  contents,
  espn = () => new Response(JSON.stringify({ events: [] })),
  mlb = () => new Response(JSON.stringify(mlbSchedule())),
  worker = () => new Response(null, { status: 204 }),
} = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const text = String(url);
    calls.push({ init, url: text });
    if (text.includes('statsapi.mlb.com')) {
      return mlb(text);
    }
    if (text.includes('site.api.espn.com')) {
      return espn(text);
    }
    if (text.includes('api.github.com')) {
      if (init.method === 'PUT') {
        return new Response(JSON.stringify({ commit: { sha: 'new' } }), { status: 201 });
      }
      return contents === undefined
        ? new Response('{"message":"Not Found"}', { status: 404 })
        : new Response(contentsBody(contents));
    }
    return worker(text, init);
  };
  return { calls, fetchImpl };
}

export function browserFakes() {
  let launches = 0;
  return {
    get launches() {
      return launches;
    },
    launchBrowser: async () => {
      launches += 1;
      return { close: async () => {} };
    },
    newContext: async () => ({ close: async () => {} }),
  };
}

export function foundExtraction() {
  return { found: true, logLines: ['Inner player URL is ready.'], playerUrl: EMBED_URL };
}
