import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { selectListingLink } from './lib/extractGooz.mjs';
import { loadListingSources, runGoozPipeline } from './lib/pipeline.mjs';
import { createRedactor } from './lib/redact.mjs';

const PER_TEAM_URL = 'https://listing-per-team.test/live';
const EMBED_URL = 'https://gooz.aapmains.net/new-stream-embed/57001?ad=111';
const NOW = new Date('2026-09-26T23:00:00Z');

function perTeamConfig(overrides = {}) {
  return {
    teamId: 114,
    leadMinutes: 15,
    postStartGraceMinutes: 180,
    extract: { baseUrl: PER_TEAM_URL, hrefNeedle: 'cleveland-guardians', timeoutSeconds: 77 },
    github: { streamsPath: 'guardians_streams.json' },
    ...overrides,
  };
}

function sourcesConfig(hosts = ['listing-one.test', 'listing-two.test', 'listing-three.test']) {
  return {
    schemaVersion: 2,
    sources: hosts.map((host, index) => ({
      label: index === 0 ? 'primary' : `backup-${index}`,
      baseUrl: `https://${host}/live`,
    })),
  };
}

function mlbSchedule() {
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
          },
        ],
      },
    ],
  };
}

function emptyContents() {
  return new Response(
    JSON.stringify({
      content: Buffer.from(JSON.stringify({ streams: [] })).toString('base64'),
      encoding: 'base64',
      sha: 'remote-sha',
    }),
  );
}

async function withPipeline(body, { schedule } = {}) {
  const savedFetch = globalThis.fetch;
  const savedEnv = {
    STREAM_PIPELINE_CONFIG: process.env.STREAM_PIPELINE_CONFIG,
    STREAM_PIPELINE_CONFIG_PATH: process.env.STREAM_PIPELINE_CONFIG_PATH,
    SOURCE_ONLY: process.env.SOURCE_ONLY,
  };
  delete process.env.STREAM_PIPELINE_CONFIG;
  delete process.env.STREAM_PIPELINE_CONFIG_PATH;
  delete process.env.SOURCE_ONLY;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pipeline-sources-'));
  const puts = [];
  globalThis.fetch = async (url, init = {}) => {
    const text = String(url);
    if (/statsapi\.mlb\.com/.test(text)) {
      return schedule ? schedule() : new Response(JSON.stringify(mlbSchedule()));
    }
    if (/api\.github\.com/.test(text)) {
      if (init.method === 'PUT') {
        puts.push(init);
        return new Response(JSON.stringify({ content: {}, commit: { sha: 'next' } }));
      }
      return emptyContents();
    }
    return new Response('not found', { status: 404 });
  };
  try {
    const configPath = path.join(directory, 'config.json');
    await writeFile(configPath, JSON.stringify(perTeamConfig()));
    return await body({ configPath, directory, puts });
  } finally {
    globalThis.fetch = savedFetch;
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await rm(directory, { force: true, recursive: true });
  }
}

function browserFakes() {
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

function foundExtraction() {
  return { found: true, goozUrl: EMBED_URL, logLines: ['Inner gooz URL is ready.'] };
}

function run(configPath, extras) {
  return runGoozPipeline({
    configPath,
    dryRun: true,
    githubToken: 'test-token',
    module: 'guardians',
    now: NOW,
    ...extras,
  });
}

// The per-team path, as it runs right after the merge while the secret does not exist yet.

test('with no secret the per-team baseUrl is the only source, called as before', async () => {
  await withPipeline(async ({ configPath }) => {
    const calls = [];
    const browser = browserFakes();
    const result = await run(configPath, {
      ...browser,
      extractListing: async (baseUrl, options) => {
        calls.push({ baseUrl, options });
        return foundExtraction();
      },
    });
    assert.equal(result.outcome, 'dry_run');
    assert.equal(result.success, true);
    assert.equal(result.listing, undefined);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].baseUrl, PER_TEAM_URL);
    assert.deepEqual(Object.keys(calls[0].options).sort(), [
      'game',
      'hrefNeedles',
      'opponentName',
      'requireOpponent',
      'timeoutSeconds',
    ]);
    assert.equal(calls[0].options.timeoutSeconds, 77);
    assert.deepEqual(calls[0].options.hrefNeedles, ['cleveland-guardians']);
    assert.equal(browser.launches, 0, 'the per-team path launches its own browser, not the failover one');
    assert.equal(
      result.steps.find((step) => step.step === 'extract_gooz').message,
      'Extracting gooz URL from listing path /live using href "cleveland-guardians".',
    );
    assert.equal(result.steps.some((step) => step.step === 'listing_source'), false);
  });
});

const PER_TEAM_FAILURES = [
  ['nothing found', { found: false, failure: 'gooz_not_found' }, 'no_video', 'No video found.'],
  ['an ambiguous link', { found: false, failure: 'ambiguous_link' }, 'ambiguous_link', 'More than one listing link matches this game; nothing was published.'],
  ['a config failure', { found: false, failure: 'config_missing', message: 'No listing href needles are configured.' }, 'config_missing', 'No listing href needles are configured.'],
];

for (const [name, extraction, outcome, message] of PER_TEAM_FAILURES) {
  test(`with no secret ${name} keeps today's outcome and message`, async () => {
    await withPipeline(async ({ configPath }) => {
      const result = await run(configPath, { extractListing: async () => extraction });
      assert.equal(result.outcome, outcome);
      assert.equal(result.message, message);
      assert.equal(result.success, false);
    });
  });
}

test('with no secret a thrown extraction stays extract_failed with the host redacted', async () => {
  await withPipeline(async ({ configPath }) => {
    const result = await run(configPath, {
      extractListing: async () => {
        throw new Error('page.goto failed at https://listing-per-team.test/live');
      },
    });
    assert.equal(result.outcome, 'extract_failed');
    assert.equal(result.success, false);
    assert.equal(result.message.includes('listing-per-team'), false);
    assert.match(result.message, /^Extraction failed: /);
  });
});

test('with no secret an HTTP-error listing is not classified: only the extraction result counts', async () => {
  await withPipeline(async ({ configPath }) => {
    const result = await run(configPath, {
      extractListing: async (_baseUrl, options) => {
        assert.equal(options.sourceAttempt, undefined);
        return foundExtraction();
      },
    });
    assert.equal(result.outcome, 'dry_run');
  });
});

test('with no secret a schedule error still throws as today', async () => {
  await withPipeline(
    async ({ configPath }) => {
      await assert.rejects(run(configPath, { extractListing: async () => foundExtraction() }));
    },
    { schedule: () => new Response('down', { status: 500 }) },
  );
});

test('an empty sources file behaves like no secret', async () => {
  await withPipeline(async ({ configPath, directory }) => {
    const sourcesConfigPath = path.join(directory, 'sources.json');
    await writeFile(sourcesConfigPath, ' \n');
    const calls = [];
    const result = await run(configPath, {
      extractListing: async (baseUrl) => {
        calls.push(baseUrl);
        return foundExtraction();
      },
      sourcesConfigPath,
    });
    assert.equal(result.outcome, 'dry_run');
    assert.deepEqual(calls, [PER_TEAM_URL]);
  });
});

test('with no secret the source input accepts only 1', async () => {
  await withPipeline(async ({ configPath }) => {
    const one = await run(configPath, { extractListing: async () => foundExtraction(), sourceOnly: '1' });
    assert.equal(one.outcome, 'dry_run');
    const two = await run(configPath, { extractListing: async () => foundExtraction(), sourceOnly: '2' });
    assert.equal(two.outcome, 'config_invalid');
    assert.equal(two.success, false);
  });
});

// The secret path.

async function sourcesRun({ configPath, directory }, secret, extractListing, extras = {}) {
  const sourcesConfigPath = path.join(directory, 'sources.json');
  await writeFile(sourcesConfigPath, JSON.stringify(secret));
  return run(configPath, { ...browserFakes(), extractListing, sourcesConfigPath, ...extras });
}

test('the secret replaces extract.baseUrl and tries sources in order', async () => {
  await withPipeline(async (env) => {
    const calls = [];
    const result = await sourcesRun(env, sourcesConfig(), async (baseUrl, options) => {
      calls.push({ baseUrl, timeoutSeconds: options.timeoutSeconds });
      return calls.length === 1 ? { failure: 'http_5xx', found: false } : foundExtraction();
    });
    assert.equal(result.outcome, 'dry_run');
    assert.deepEqual(calls, [
      { baseUrl: 'https://listing-one.test/live', timeoutSeconds: 77 },
      { baseUrl: 'https://listing-two.test/live', timeoutSeconds: 30 },
    ]);
    assert.equal(result.listing.winner.number, 2);
    assert.equal(result.nextEntry.url, EMBED_URL);
  });
});

test('a source run keeps the per-team needles and opponent rule', async () => {
  await withPipeline(async (env) => {
    let seen;
    await sourcesRun(env, sourcesConfig(), async (_baseUrl, options) => {
      seen = options;
      return foundExtraction();
    });
    assert.deepEqual(seen.hrefNeedles, ['cleveland-guardians']);
    assert.equal(seen.opponentName, 'Detroit Tigers');
    assert.equal(seen.requireOpponent, false);
  });
});

test('an entry the phone would reject moves on as invalid_entry', async () => {
  await withPipeline(async (env) => {
    const answers = [{ found: true, goozUrl: 'https://other-player.test/embed/1' }, foundExtraction()];
    const result = await sourcesRun(env, sourcesConfig(), async () => answers.shift());
    assert.equal(result.outcome, 'dry_run');
    assert.equal(result.listing.attempts[0].result, 'invalid_entry');
  });
});

for (const [name, goozUrl] of [
  ['a query parameter other than ad', 'https://gooz.aapmains.net/new-stream-embed/57001?ref=listing-one.test'],
  ['userinfo', 'https://listing-one.test@gooz.aapmains.net/new-stream-embed/57001'],
  ['a port', 'https://gooz.aapmains.net:8443/new-stream-embed/57001'],
  ['a fragment', 'https://gooz.aapmains.net/new-stream-embed/57001#listing-one.test'],
]) {
  test(`a secret-mode URL with ${name} moves on as invalid_entry`, async () => {
    await withPipeline(async (env) => {
      const answers = [{ found: true, goozUrl }, foundExtraction()];
      const result = await sourcesRun(env, sourcesConfig(), async () => answers.shift());
      assert.equal(result.outcome, 'dry_run');
      assert.equal(result.listing.attempts[0].result, 'invalid_entry');
    });
  });
}

test('the per-team path keeps a URL the secret path would refuse', async () => {
  await withPipeline(async ({ configPath }) => {
    const goozUrl = 'https://gooz.aapmains.net/new-stream-embed/57001?ref=x';
    const result = await run(configPath, { extractListing: async () => ({ found: true, goozUrl }) });
    assert.equal(result.outcome, 'dry_run');
    assert.equal(result.nextEntry.url, goozUrl);
  });
});

test('after an ambiguous source a lone link without the opponent does not win', async () => {
  await withPipeline(async (env) => {
    const requireOpponent = [];
    const links = [{ href: 'https://listing-two.test/stream/cleveland-guardians', score: 13, text: 'x' }];
    const result = await sourcesRun(env, sourcesConfig(), async (_baseUrl, options) => {
      requireOpponent.push(options.requireOpponent);
      if (requireOpponent.length === 1) {
        return { failure: 'ambiguous_link', found: false };
      }
      const selection = selectListingLink(links, options);
      return selection.link ? foundExtraction() : { failure: selection.failure, found: false };
    });
    assert.deepEqual(requireOpponent, [false, true, true]);
    assert.equal(result.outcome, 'ambiguous_link');
    assert.equal(result.listing.attempts[1].result, 'opponent_not_found');
    assert.equal(result.nextEntry, undefined);
  });
});

test('a timed-out attempt adds no late log lines to the run', async () => {
  await withPipeline(async (env) => {
    const timers = [];
    const clock = {
      clearTimer: () => {},
      now: () => 0,
      setTimer: (callback) => {
        timers.push(callback);
        return timers.length;
      },
    };
    let finishExtraction;
    let extractionStarted;
    const started = new Promise((resolve) => {
      extractionStarted = resolve;
    });
    const running = sourcesRun(
      env,
      sourcesConfig(),
      () =>
        new Promise((resolve) => {
          finishExtraction = resolve;
          extractionStarted();
        }),
      { clock, sourceOnly: '2' },
    );
    await started;
    timers[0]();
    const result = await running;
    assert.equal(result.listing.attempts[0].result, 'source_timeout');

    const stepCount = result.steps.length;
    finishExtraction({ found: false, failure: 'link_not_found', logLines: ['LATE LINE'] });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(result.steps.length, stepCount);
    assert.equal(result.steps.some((step) => step.message === 'LATE LINE'), false);
  });
});

test('source 2 alone runs with backup timing', async () => {
  await withPipeline(async (env) => {
    const calls = [];
    const result = await sourcesRun(
      env,
      sourcesConfig(),
      async (baseUrl, options) => {
        calls.push({ baseUrl, timeoutSeconds: options.timeoutSeconds });
        return foundExtraction();
      },
      { sourceOnly: '2' },
    );
    assert.equal(result.outcome, 'dry_run');
    assert.deepEqual(calls, [{ baseUrl: 'https://listing-two.test/live', timeoutSeconds: 30 }]);
    assert.equal(result.listing.total, 3);
  });
});

test('the source input is validated against the configured count', async () => {
  await withPipeline(async (env) => {
    const result = await sourcesRun(env, sourcesConfig(), async () => foundExtraction(), { sourceOnly: '4' });
    assert.equal(result.outcome, 'config_invalid');
  });
});

test('an invalid secret stops as config_invalid before fetching a schedule', async () => {
  await withPipeline(async (env) => {
    const saved = globalThis.fetch;
    let fetched = false;
    globalThis.fetch = async () => {
      fetched = true;
      return saved();
    };
    const result = await sourcesRun(env, { schemaVersion: 1 }, async () => foundExtraction());
    assert.equal(result.outcome, 'config_invalid');
    assert.equal(result.success, false);
    assert.equal(fetched, false);
    assert.equal(result.message.includes('listing-'), false);
  });
});

test('a failed run maps to its outcome and message', async () => {
  const cases = [
    [[{ failure: 'ambiguous_link' }, { failure: 'http_5xx' }, { failure: 'link_not_found' }], 'ambiguous_link', /More than one/],
    [[{ failure: 'http_5xx' }, { failure: 'nav_error' }, { failure: 'bot_challenge' }], 'sources_unreachable', /No listing source/],
    [[{ failure: 'link_not_found' }, { failure: 'player_not_found' }, { failure: 'http_5xx' }], 'no_video', /No video found/],
  ];
  for (const [answers, outcome, message] of cases) {
    await withPipeline(async (env) => {
      const queue = [...answers];
      const result = await sourcesRun(env, sourcesConfig(), async () => ({ found: false, ...queue.shift() }));
      assert.equal(result.outcome, outcome);
      assert.match(result.message, message);
      assert.equal(result.success, false);
    });
  }
});

test('a browser that will not launch reports browser_failed', async () => {
  await withPipeline(async (env) => {
    const result = await sourcesRun(env, sourcesConfig(), async () => foundExtraction(), {
      launchBrowser: async () => {
        throw new Error('no chromium');
      },
    });
    assert.equal(result.outcome, 'browser_failed');
    assert.equal(result.success, false);
  });
});

test('a schedule error with sources configured reports schedule_failed', async () => {
  await withPipeline(
    async (env) => {
      const result = await sourcesRun(env, sourcesConfig(), async () => foundExtraction());
      assert.equal(result.outcome, 'schedule_failed');
      assert.equal(result.success, false);
    },
    { schedule: () => new Response('down', { status: 500 }) },
  );
});

test('a pre-check outcome stops before any source runs', async () => {
  await withPipeline(
    async (env) => {
      const browser = browserFakes();
      const result = await sourcesRun(env, sourcesConfig(), async () => foundExtraction(), browser);
      assert.equal(result.outcome, 'no_game');
      assert.equal(result.success, true);
      assert.equal(browser.launches, 0);
    },
    { schedule: () => new Response(JSON.stringify({ dates: [] })) },
  );
});

function scheduleWith(gameOverrides) {
  const schedule = mlbSchedule();
  Object.assign(schedule.dates[0].games[0], gameOverrides);
  return () => new Response(JSON.stringify(schedule));
}

const PRE_CHECK_STOPS = [
  ['blocked', { status: { abstractGameState: 'Preview', detailedState: 'Postponed' } }],
  // Game selection drops a finished game, so a Final reaches this point as no_game.
  ['no_game', { status: { abstractGameState: 'Final', detailedState: 'Final' } }],
  ['too_early', { gameDate: '2026-09-27T01:10:00Z' }],
];

for (const [outcome, gameOverrides] of PRE_CHECK_STOPS) {
  test(`${outcome} stops with success before any source runs`, async () => {
    await withPipeline(
      async (env) => {
        const browser = browserFakes();
        const result = await sourcesRun(env, sourcesConfig(), async () => foundExtraction(), browser);
        assert.equal(result.outcome, outcome);
        assert.equal(result.success, true);
        assert.equal(browser.launches, 0);
      },
      { schedule: scheduleWith(gameOverrides) },
    );
  });
}

test('video_ready stops with success before any source runs', async () => {
  await withPipeline(async (env) => {
    const saved = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      if (/api\.github\.com/.test(String(url)) && init.method !== 'PUT') {
        const document = {
          streams: [
            {
              gameDates: ['2026-09-26'],
              gameNumbers: [1],
              kind: 'web',
              url: EMBED_URL,
              allowInsecureHttp: false,
              trustedHosts: [],
            },
          ],
        };
        return new Response(
          JSON.stringify({
            content: Buffer.from(JSON.stringify(document)).toString('base64'),
            encoding: 'base64',
            sha: 'remote-sha',
          }),
        );
      }
      return saved(url, init);
    };
    const browser = browserFakes();
    const result = await sourcesRun(env, sourcesConfig(), async () => foundExtraction(), browser);
    assert.equal(result.outcome, 'video_ready');
    assert.equal(result.success, true);
    assert.equal(browser.launches, 0);
  });
});

test('a publish that keeps failing reports publish_failed', async () => {
  await withPipeline(async (env) => {
    const saved = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      if (init.method === 'PUT') {
        return new Response('nope', { status: 500 });
      }
      return saved(url, init);
    };
    const result = await sourcesRun(env, sourcesConfig(), async () => foundExtraction(), { dryRun: false });
    assert.equal(result.outcome, 'publish_failed');
    assert.equal(result.success, false);
    assert.equal(result.listing.winner.number, 1);
  });
});

test('every run message and step stays free of all source hosts', async () => {
  await withPipeline(async (env) => {
    const hosts = ['listing-one.test', 'listing-two.test', 'listing-three.test'];
    const masks = [];
    const redactor = createRedactor({ emit: (line) => masks.push(line) });
    const answers = [
      { failure: 'http_5xx', logLines: ['Listing page answered at https://listing-one.test/live'] },
      { failure: 'game_nav', logLines: ['Redirected via listing-three.test'] },
      foundExtraction(),
    ];
    const result = await sourcesRun(env, sourcesConfig(hosts), async () => answers.shift(), { redactor });
    const text = [result.message, ...result.steps.map((step) => redactor.text(step.message))].join('\n');
    for (const host of hosts) {
      assert.equal(text.includes(host), false);
      assert.ok(masks.includes(`::add-mask::${host}`));
    }
  });
});

test('loadListingSources reports an unreadable or malformed file without values', async () => {
  await withPipeline(async ({ directory }) => {
    const missing = await loadListingSources({ configPath: path.join(directory, 'absent.json') });
    assert.match(missing.problem, /could not be read/);

    const broken = path.join(directory, 'broken.json');
    await writeFile(broken, '{"sources": [{"baseUrl": "https://listing-one.test/live",}]}');
    const result = await loadListingSources({ configPath: broken });
    assert.equal(result.problem, 'Listing sources config is not valid JSON.');
  });
});
