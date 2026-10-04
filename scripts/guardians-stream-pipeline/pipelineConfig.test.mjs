import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  configProblem,
  hrefNeedlesForGame,
  loadConfig,
  runGoozPipeline,
} from './lib/pipeline.mjs';

const BASE_URL = 'https://private-listing.example.test/live';

function guardiansConfig(overrides = {}) {
  return {
    teamId: 114,
    leadMinutes: 15,
    postStartGraceMinutes: 180,
    extract: { baseUrl: BASE_URL, hrefNeedle: 'cleveland-guardians' },
    github: { streamsPath: 'guardians_streams.json' },
    ...overrides,
  };
}

function cyclonesConfig(hrefNeedles) {
  return {
    sport: 'cyclones',
    extract: { baseUrl: BASE_URL, hrefNeedles },
    github: { streamsPath: 'cyclones_streams.json' },
  };
}

test('config problems are named without printing values', () => {
  const patriotsNoPath = { sport: 'nfl', extract: { baseUrl: BASE_URL, hrefNeedle: 'new-england-patriots' } };
  const problems = [
    configProblem(patriotsNoPath),
    configProblem({ ...patriotsNoPath, github: { streamsPath: 'guardians_streams.json' } }),
    configProblem(guardiansConfig(), { expectedModule: 'patriots' }),
    configProblem({ sport: 'nfl', extract: { baseUrl: BASE_URL, hrefNeedle: '  ' }, github: { streamsPath: 'patriots_streams.json' } }),
    configProblem(guardiansConfig({ extract: { hrefNeedle: 'cleveland-guardians' } })),
    configProblem(guardiansConfig({ sport: 'nhl' })),
    configProblem(cyclonesConfig({ football: ['iowa-state-cyclones'] }), { dispatchSport: 'mens-basketball' }),
    configProblem(cyclonesConfig(['iowa-state-cyclones'])),
    configProblem(cyclonesConfig({ football: ['iowa-state-cyclones'] }), { dispatchSport: 'hockey' }),
  ];
  for (const problem of problems) {
    assert.equal(typeof problem, 'string');
    assert.equal(problem.includes('private-listing'), false, problem);
  }
});

test('valid module configs pass', () => {
  assert.equal(configProblem(guardiansConfig(), { expectedModule: 'guardians' }), undefined);
  assert.equal(configProblem(guardiansConfig({ github: {} })), undefined, 'Guardians keeps its default file');
  assert.equal(
    configProblem(guardiansConfig({ extract: { baseUrl: BASE_URL } })),
    undefined,
    'Guardians keeps its own default team needle',
  );
  assert.equal(
    configProblem(
      { sport: 'nfl', extract: { baseUrl: BASE_URL, hrefNeedle: 'new-england-patriots' }, github: { streamsPath: 'patriots_streams.json' } },
      { expectedModule: 'patriots' },
    ),
    undefined,
  );
  assert.equal(
    configProblem(cyclonesConfig({ football: ['iowa-state-cyclones'] }), {
      dispatchSport: 'football',
      expectedModule: 'cyclones',
    }),
    undefined,
  );
});

test('needles never fall back to another team', () => {
  assert.deepEqual(hrefNeedlesForGame({ sport: 'nfl', extract: {} }, { sport: undefined }), []);
  assert.deepEqual(hrefNeedlesForGame({ sport: 'cyclones', extract: {} }, { sport: 'football' }), []);
  assert.deepEqual(
    hrefNeedlesForGame(guardiansConfig({ extract: { baseUrl: BASE_URL, hrefNeedle: '  ' } }), {}),
    ['cleveland-guardians'],
  );
  assert.deepEqual(
    hrefNeedlesForGame(cyclonesConfig({ football: ['iowa-state-cyclones'] }), { sport: 'womens-basketball' }),
    [],
  );
  assert.deepEqual(
    hrefNeedlesForGame(cyclonesConfig({ football: [' iowa-state-cyclones ', ''] }), { sport: 'football' }),
    ['iowa-state-cyclones'],
  );
  assert.deepEqual(
    hrefNeedlesForGame(guardiansConfig({ extract: { hrefNeedles: ['cleveland-guardians', '/mlb/'] } }), {}),
    ['cleveland-guardians', '/mlb/'],
  );
});

async function withTempConfig(config, run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pipeline-config-'));
  const configPath = path.join(dir, 'config.json');
  await writeFile(configPath, typeof config === 'string' ? config : JSON.stringify(config));
  try {
    return await run(configPath);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

test('an unreadable config reports a generic error', async () => {
  await withTempConfig(`{"extract": {"baseUrl": "${BASE_URL}",}}`, async (configPath) => {
    await assert.rejects(loadConfig(configPath), (error) => {
      assert.equal(error.message, 'Pipeline config is not valid JSON.');
      return true;
    });
  });
});

function mlbSchedule(gameDate) {
  return {
    dates: [
      {
        date: '2026-09-26',
        games: [
          {
            gameDate,
            gameNumber: 1,
            gamePk: 900001,
            officialDate: '2026-09-26',
            status: { abstractGameState: 'Preview', detailedState: 'Scheduled' },
            teams: {
              away: { team: { id: 116, name: 'Detroit Tigers' } },
              home: { team: { id: 114, name: 'Cleveland Guardians' } },
            },
          },
        ],
      },
    ],
  };
}

async function withFakeFetch(routes, run) {
  const saved = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ method: init.method ?? 'GET', url: String(url) });
    for (const [pattern, respond] of routes) {
      if (pattern.test(String(url))) {
        return respond(init);
      }
    }
    return new Response('not found', { status: 404 });
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = saved;
  }
}

function contentsResponse(document) {
  return new Response(
    JSON.stringify({
      content: Buffer.from(JSON.stringify(document)).toString('base64'),
      encoding: 'base64',
      sha: 'remote-sha',
    }),
    { status: 200 },
  );
}

test('readiness is judged on the branch copy, not the job checkout', async () => {
  const remote = {
    streams: [
      'INACTIVE EXAMPLE. COPY THE COMPLETE OBJECT BELOW THIS LINE.',
      {
        gameDates: ['2026-09-26'],
        gameNumbers: [1],
        kind: 'web',
        url: 'https://gooz.aapmains.net/new-stream-embed/57001?ad=111',
        allowInsecureHttp: false,
        trustedHosts: [],
      },
    ],
  };
  await withTempConfig(guardiansConfig(), (configPath) =>
    withFakeFetch(
      [
        [/statsapi\.mlb\.com/, () => new Response(JSON.stringify(mlbSchedule('2026-09-26T23:10:00Z')))],
        [/api\.github\.com\/repos\/Danner36\/Danner_App\/contents\/guardians_streams\.json/, () => contentsResponse(remote)],
      ],
      async (calls) => {
        const result = await runGoozPipeline({
          configPath,
          githubToken: 'test-token',
          module: 'guardians',
          now: new Date('2026-09-26T23:00:00Z'),
        });
        assert.equal(result.outcome, 'video_ready');
        assert.equal(result.streamEntry.url, remote.streams[1].url);
        assert.equal(calls.some((call) => call.method === 'PUT'), false);
      },
    ),
  );
});

test('a run for the wrong module stops before fetching anything', async () => {
  await withTempConfig(guardiansConfig(), (configPath) =>
    withFakeFetch([], async (calls) => {
      const result = await runGoozPipeline({ configPath, module: 'cyclones' });
      assert.equal(result.outcome, 'config_missing');
      assert.equal(result.success, false);
      assert.equal(calls.length, 0);
    }),
  );
});

test('an evening game on a UTC runner reports too_early instead of no_game', async () => {
  await withTempConfig(guardiansConfig(), (configPath) =>
    withFakeFetch(
      [
        [/statsapi\.mlb\.com/, () => new Response(JSON.stringify(mlbSchedule('2026-09-27T00:10:00Z')))],
        [/api\.github\.com/, () => contentsResponse({ streams: [] })],
      ],
      async () => {
        const saved = process.env.TZ;
        process.env.TZ = 'UTC';
        try {
          const early = await runGoozPipeline({
            configPath,
            githubToken: 'test-token',
            now: new Date('2026-09-26T22:00:00Z'),
          });
          assert.equal(early.outcome, 'too_early');
        } finally {
          if (saved === undefined) {
            delete process.env.TZ;
          } else {
            process.env.TZ = saved;
          }
        }
      },
    ),
  );
});
