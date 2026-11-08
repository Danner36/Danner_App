import assert from 'node:assert/strict';
import test from 'node:test';

import { selectListingLink } from '../lib/extract/listing.mjs';
import { candidateFromResult, entryForGame, runPipeline } from '../lib/pipeline.mjs';
import { createProgressReporter } from '../lib/progress.mjs';
import { createRedactor } from '../lib/redact.mjs';
import { SIGNATURE_HEADER, signBody } from '../lib/signedPost.mjs';
import {
  EMBED_URL,
  HOSTS,
  browserFakes,
  espnEvent,
  fakeFetch,
  foundExtraction,
  mlbSchedule,
  secretConfig,
  withWorkspace,
} from './fixtures.mjs';

const NOW = new Date('2026-09-26T23:00:00Z');
const MLB_REQUEST = { eventId: '', sport: '', team: 'mlb-5' };
const noProgress = { flush: async () => {}, send: () => {} };

function run(workspace, { fetcher = fakeFetch(), ...extras } = {}) {
  return runPipeline({
    ...browserFakes(),
    catalogDir: workspace.catalogDir,
    configPath: workspace.configPath,
    dryRun: true,
    extractListing: async () => foundExtraction(),
    fetchImpl: fetcher.fetchImpl,
    githubToken: 'test-token',
    now: NOW,
    progress: noProgress,
    repository: 'owner/repo',
    request: MLB_REQUEST,
    runId: '77',
    ...extras,
  });
}

for (const [name, request, code] of [
  ['an unknown key', { team: 'mlb-999' }, 'bad_team'],
  ['a malformed key', { team: 'mlb_5; rm -rf' }, 'bad_team'],
  ['a bad sport', { sport: 'hockey', team: 'ncaa-66' }, 'bad_sport'],
  ['a bad event id', { eventId: 'abc', team: 'mlb-5' }, 'bad_event'],
]) {
  test(`${name} stops as ${code} before the config, any fetch or the browser`, async () => {
    await withWorkspace(async (workspace) => {
      const fetcher = fakeFetch();
      const browser = browserFakes();
      let extracted = false;
      const result = await run(workspace, {
        ...browser,
        configPath: undefined,
        extractListing: async () => {
          extracted = true;
          return foundExtraction();
        },
        fetcher,
        request,
      });
      assert.equal(result.outcome, code);
      assert.equal(result.success, false);
      assert.equal(fetcher.calls.length, 0, 'a request was sent');
      assert.equal(browser.launches, 0);
      assert.equal(extracted, false);
    });
  });
}

test('an empty or missing secret fails the run with no fallback', async () => {
  await withWorkspace(async (workspace) => {
    const fetcher = fakeFetch();
    const result = await run(workspace, { configPath: undefined, fetcher });
    assert.equal(result.outcome, 'config_invalid');
    assert.equal(fetcher.calls.length, 0);
  });
});

test('an invalid secret stops as config_invalid before fetching a schedule', async () => {
  await withWorkspace(
    async (workspace) => {
      const fetcher = fakeFetch();
      const result = await run(workspace, { fetcher });
      assert.equal(result.outcome, 'config_invalid');
      assert.equal(result.success, false);
      assert.equal(fetcher.calls.length, 0);
      assert.equal(result.message.includes('listing-'), false);
    },
    { schemaVersion: 1, sources: [{ label: 'x', baseUrl: 'https://listing-one.test/live' }] },
  );
});

test('sources run in order with source 1 and backup navigation timing', async () => {
  await withWorkspace(async (workspace) => {
    const calls = [];
    const result = await run(workspace, {
      extractListing: async (baseUrl, options) => {
        calls.push({ baseUrl, timeoutSeconds: options.timeoutSeconds });
        return calls.length === 1 ? { failure: 'http_5xx', found: false } : foundExtraction();
      },
    });
    assert.equal(result.outcome, 'dry_run');
    assert.deepEqual(calls, [
      { baseUrl: 'https://listing-one.test/live', timeoutSeconds: 90 },
      { baseUrl: 'https://listing-two.test/live', timeoutSeconds: 30 },
    ]);
    assert.equal(result.listing.winner.number, 2);
    assert.equal(result.entry.url, EMBED_URL);
  });
});

test('a source run gets the catalog needles, league hints and the opponent', async () => {
  await withWorkspace(async (workspace) => {
    let seen;
    await run(workspace, {
      extractListing: async (_baseUrl, options) => {
        seen = options;
        return foundExtraction();
      },
    });
    assert.deepEqual(seen.hrefNeedles, ['cleveland-guardians']);
    assert.deepEqual(seen.leagueHints, ['/mlb/']);
    assert.equal(seen.opponentName, 'Detroit Tigers');
    assert.equal(seen.requireOpponent, false);
  });
});

test('per-source needles and the league opponent rule reach only that source', async () => {
  const secret = secretConfig(HOSTS, { matching: { leagues: { mlb: { requireOpponent: true } } } });
  secret.sources[1].matching = { teams: { 'mlb-5': { hrefNeedles: ['site-two-slug'], requireOpponent: false } } };
  await withWorkspace(async (workspace) => {
    const seen = [];
    await run(workspace, {
      extractListing: async (_baseUrl, options) => {
        seen.push({ needles: options.hrefNeedles, requireOpponent: options.requireOpponent });
        return seen.length === 1 ? { failure: 'link_not_found', found: false } : foundExtraction();
      },
    });
    assert.deepEqual(seen, [
      { needles: ['cleveland-guardians'], requireOpponent: true },
      { needles: ['site-two-slug'], requireOpponent: false },
    ]);
  }, secret);
});

test('an entry the phone would reject moves on as invalid_entry', async () => {
  await withWorkspace(async (workspace) => {
    const answers = [{ found: true, playerUrl: 'https://other-player.test/embed/1' }, foundExtraction()];
    const result = await run(workspace, { extractListing: async () => answers.shift() });
    assert.equal(result.outcome, 'dry_run');
    assert.equal(result.listing.attempts[0].result, 'invalid_entry');
  });
});

test('a player URL that could carry a host moves on as invalid_entry', async () => {
  await withWorkspace(async (workspace) => {
    const answers = [{ found: true, playerUrl: `${EMBED_URL}&ref=listing-one.test` }, foundExtraction()];
    const result = await run(workspace, { extractListing: async () => answers.shift() });
    assert.equal(result.outcome, 'dry_run');
    assert.equal(result.listing.attempts[0].result, 'invalid_entry');
    assert.equal(result.entry.url, EMBED_URL);
  });
});

function steppingClock() {
  let nowMs = 0;
  const timers = [];
  return {
    clearTimer: () => {},
    fire(index) {
      nowMs += timers[index].ms;
      timers[index].callback();
    },
    now: () => nowMs,
    setTimer(callback, ms) {
      timers.push({ callback, ms });
      return timers.length;
    },
    timers,
  };
}

async function hangingFirstSource(workspace) {
  const clock = steppingClock();
  let started;
  const attempted = new Promise((resolve) => {
    started = resolve;
  });
  let calls = 0;
  const running = run(workspace, {
    clock,
    extractListing: () => {
      calls += 1;
      if (calls > 1) {
        return Promise.resolve({ failure: 'link_not_found', found: false });
      }
      started();
      return new Promise(() => {});
    },
  });
  await attempted;
  const budget = clock.timers[0].ms;
  clock.fire(0);
  return { budget, calls: () => calls, result: await running };
}

test('a hung source 1 is cut off at the deadline minus the reserve and the run ends', async () => {
  await withWorkspace(async (workspace) => {
    const { budget, calls, result } = await hangingFirstSource(workspace);
    assert.equal(budget, 555_000);
    assert.equal(result.listing.attempts[0].result, 'source_timeout');
    assert.equal(result.outcome, 'deadline');
    assert.equal(calls(), 1);
  });
});

test('source 1 keeps a shorter timeout of its own, and a longer one is capped', async () => {
  const shorter = secretConfig();
  shorter.sources[0].timeoutSeconds = 100;
  await withWorkspace(async (workspace) => {
    assert.equal((await hangingFirstSource(workspace)).budget, 100_000);
  }, shorter);

  const longer = secretConfig(HOSTS, { timing: { extractDeadlineSeconds: 300 } });
  longer.sources[0].timeoutSeconds = 300;
  await withWorkspace(async (workspace) => {
    assert.equal((await hangingFirstSource(workspace)).budget, 255_000);
  }, longer);
});

test('after an ambiguous source a lone link without the opponent does not win', async () => {
  await withWorkspace(async (workspace) => {
    const requireOpponent = [];
    const links = [{ href: 'https://listing-two.test/stream/cleveland-guardians', score: 13, text: 'x' }];
    const result = await run(workspace, {
      extractListing: async (_baseUrl, options) => {
        requireOpponent.push(options.requireOpponent);
        if (requireOpponent.length === 1) {
          return { failure: 'ambiguous_link', found: false };
        }
        const selection = selectListingLink(links, options);
        return selection.link ? foundExtraction() : { failure: selection.failure, found: false };
      },
    });
    assert.deepEqual(requireOpponent, [false, true, true]);
    assert.equal(result.outcome, 'ambiguous_link');
    assert.equal(result.listing.attempts[1].result, 'opponent_not_found');
  });
});

test('a timed-out attempt adds no late log lines to the run', async () => {
  await withWorkspace(async (workspace) => {
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
    const running = run(workspace, {
      clock,
      extractListing: () =>
        new Promise((resolve) => {
          finishExtraction = resolve;
          extractionStarted();
        }),
      sourceOnly: '2',
    });
    await started;
    timers[0]();
    const result = await running;
    assert.equal(result.listing.attempts[0].result, 'source_timeout');

    const stepCount = result.steps.length;
    finishExtraction({ failure: 'link_not_found', found: false, logLines: ['LATE LINE'] });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(result.steps.length, stepCount);
  });
});

test('source 2 alone runs with backup timing and is numbered of 3', async () => {
  await withWorkspace(async (workspace) => {
    const calls = [];
    const result = await run(workspace, {
      extractListing: async (baseUrl, options) => {
        calls.push({ baseUrl, timeoutSeconds: options.timeoutSeconds });
        return foundExtraction();
      },
      sourceOnly: '2',
    });
    assert.equal(result.outcome, 'dry_run');
    assert.deepEqual(calls, [{ baseUrl: 'https://listing-two.test/live', timeoutSeconds: 30 }]);
    assert.equal(result.listing.total, 3);
  });
});

test('the source input is validated against the configured count', async () => {
  await withWorkspace(async (workspace) => {
    const result = await run(workspace, { sourceOnly: '4' });
    assert.equal(result.outcome, 'config_invalid');
  });
});

test('a failed run maps to its outcome and message', async () => {
  const cases = [
    [[{ failure: 'ambiguous_link' }, { failure: 'http_5xx' }, { failure: 'link_not_found' }], 'ambiguous_link', /More than one/],
    [[{ failure: 'http_5xx' }, { failure: 'nav_error' }, { failure: 'bot_challenge' }], 'sources_unreachable', /No listing source/],
    [[{ failure: 'link_not_found' }, { failure: 'player_not_found' }, { failure: 'http_5xx' }], 'no_video', /No video found/],
  ];
  for (const [answers, outcome, message] of cases) {
    await withWorkspace(async (workspace) => {
      const queue = [...answers];
      const result = await run(workspace, { extractListing: async () => ({ found: false, ...queue.shift() }) });
      assert.equal(result.outcome, outcome);
      assert.match(result.message, message);
      assert.equal(result.success, false);
    });
  }
});

test('a browser that will not launch reports browser_failed', async () => {
  await withWorkspace(async (workspace) => {
    const result = await run(workspace, {
      launchBrowser: async () => {
        throw new Error('no chromium');
      },
    });
    assert.equal(result.outcome, 'browser_failed');
  });
});

test('a schedule error reports schedule_failed', async () => {
  await withWorkspace(async (workspace) => {
    const result = await run(workspace, {
      fetcher: fakeFetch({ mlb: () => new Response('down', { status: 500 }) }),
    });
    assert.equal(result.outcome, 'schedule_failed');
    assert.equal(result.success, false);
  });
});

function scheduleWith(overrides) {
  return () => new Response(JSON.stringify(mlbSchedule(overrides)));
}

const PRE_CHECK_STOPS = [
  ['blocked', { status: { abstractGameState: 'Preview', detailedState: 'Postponed' } }],
  // Game selection drops a finished game, so a Final reaches this point as no_game.
  ['no_game', { status: { abstractGameState: 'Final', detailedState: 'Final' } }],
  ['too_early', { gameDate: '2026-09-27T01:10:00Z' }],
];

for (const [outcome, overrides] of PRE_CHECK_STOPS) {
  test(`${outcome} stops with success before any source runs`, async () => {
    await withWorkspace(async (workspace) => {
      const browser = browserFakes();
      const result = await run(workspace, { ...browser, fetcher: fakeFetch({ mlb: scheduleWith(overrides) }) });
      assert.equal(result.outcome, outcome);
      assert.equal(result.success, true);
      assert.equal(browser.launches, 0);
    });
  });
}

test('no game out of season stops with success', async () => {
  await withWorkspace(async (workspace) => {
    const browser = browserFakes();
    const result = await run(workspace, {
      ...browser,
      fetcher: fakeFetch({ mlb: () => new Response('{"dates":[]}') }),
    });
    assert.equal(result.outcome, 'no_game');
    assert.equal(result.success, true);
    assert.equal(browser.launches, 0);
  });
});

test('a dispatched event id selects that game, past any today tier', async () => {
  await withWorkspace(async (workspace) => {
    let seen;
    const result = await run(workspace, {
      extractListing: async (_baseUrl, options) => {
        seen = options.game;
        return foundExtraction();
      },
      fetcher: fakeFetch({
        mlb: () => {
          const schedule = mlbSchedule();
          schedule.dates[0].games.push({
            ...schedule.dates[0].games[0],
            gameDate: '2026-09-26T23:05:00Z',
            gameNumber: 2,
            gamePk: 900002,
          });
          return new Response(JSON.stringify(schedule));
        },
      }),
      request: { team: 'mlb-5', eventId: '900002' },
    });
    assert.equal(result.outcome, 'dry_run');
    assert.equal(seen.gamePk, 900002);
    assert.equal(result.entry.eventId, '900002');
  });
});

test('a gamePk listed on two days takes the unblocked row', async () => {
  const schedule = mlbSchedule({ gameDate: '2026-09-26T23:05:00Z', officialDate: '2026-09-20', resumedFrom: '2026-09-20' });
  const suspended = {
    ...schedule.dates[0].games[0],
    gameDate: '2026-09-20T23:05:00Z',
    resumedFrom: undefined,
    status: { abstractGameState: 'Preview', detailedState: 'Suspended: Rain' },
  };
  schedule.dates.unshift({ date: '2026-09-20', games: [suspended] });
  await withWorkspace(async (workspace) => {
    let seen;
    const result = await run(workspace, {
      extractListing: async (_baseUrl, options) => {
        seen = options.game;
        return foundExtraction();
      },
      fetcher: fakeFetch({ mlb: () => new Response(JSON.stringify(schedule)) }),
      request: { eventId: '900001', team: 'mlb-5' },
    });
    assert.equal(result.outcome, 'dry_run');
    assert.equal(seen.status, 'Scheduled');
    assert.equal(seen.gameDate, '2026-09-26T23:05:00Z');
  });
});

test('a gamePk whose only row is blocked still reports blocked', async () => {
  await withWorkspace(async (workspace) => {
    const result = await run(workspace, {
      fetcher: fakeFetch({ mlb: scheduleWith({ status: { abstractGameState: 'Preview', detailedState: 'Postponed' } }) }),
      request: { eventId: '900001', team: 'mlb-5' },
    });
    assert.equal(result.outcome, 'blocked');
  });
});

test('a dispatched event not on this team\'s schedule is no_game', async () => {
  await withWorkspace(async (workspace) => {
    const browser = browserFakes();
    const result = await run(workspace, { ...browser, request: { eventId: '123', team: 'mlb-5' } });
    assert.equal(result.outcome, 'no_game');
    assert.equal(browser.launches, 0);
  });
});

test('a dispatched event that is Final is game_over', async () => {
  await withWorkspace(async (workspace) => {
    const result = await run(workspace, {
      fetcher: fakeFetch({ mlb: scheduleWith({ status: { abstractGameState: 'Final', detailedState: 'Final' } }) }),
      request: { eventId: '900001', team: 'mlb-5' },
    });
    assert.equal(result.outcome, 'game_over');
    assert.equal(result.success, true);
  });
});

function pipelineEntry(overrides = {}) {
  return {
    eventId: '900001',
    gameDates: ['2026-09-26'],
    gameNumbers: [1],
    kind: 'web',
    url: EMBED_URL,
    allowInsecureHttp: false,
    trustedHosts: [],
    source: 'pipeline',
    ...overrides,
  };
}

test('video_ready stops with success before the browser starts', async () => {
  await withWorkspace(async (workspace) => {
    const browser = browserFakes();
    const result = await run(workspace, {
      ...browser,
      fetcher: fakeFetch({ contents: { schemaVersion: 2, streams: [pipelineEntry()] } }),
      request: { eventId: '900001', team: 'mlb-5' },
    });
    assert.equal(result.outcome, 'video_ready');
    assert.equal(result.success, true);
    assert.equal(browser.launches, 0);
  });
});

test('an entry for a rescheduled event does not count, so the run proceeds', async () => {
  await withWorkspace(async (workspace) => {
    const result = await run(workspace, {
      fetcher: fakeFetch({ contents: { streams: [pipelineEntry({ gameDates: ['2026-09-20'] })] } }),
      request: { eventId: '900001', team: 'mlb-5' },
    });
    assert.equal(result.outcome, 'dry_run');
  });
});

test('a team with no streams file yet is read from the template and proceeds', async () => {
  await withWorkspace(async (workspace) => {
    const result = await run(workspace, { fetcher: fakeFetch({ contents: undefined }) });
    assert.equal(result.outcome, 'dry_run');
  });
});

test('the extract half never writes, on any outcome', async () => {
  await withWorkspace(async (workspace) => {
    const fetcher = fakeFetch();
    const result = await run(workspace, { dryRun: false, fetcher });
    assert.equal(result.outcome, 'found');
    assert.equal(result.success, true);
    assert.equal(fetcher.calls.some((call) => call.init.method === 'PUT'), false);
  });
});

test('the found candidate holds a schema 2 pipeline entry and no listing URL', async () => {
  await withWorkspace(async (workspace) => {
    const request = { eventId: '900001', team: 'mlb-5' };
    const result = await run(workspace, { dryRun: false, request });
    const candidate = candidateFromResult(result, request);
    assert.deepEqual(candidate.entry, {
      eventId: '900001',
      gameDates: ['2026-09-26'],
      gameNumbers: [1],
      kind: 'web',
      url: EMBED_URL,
      allowInsecureHttp: false,
      trustedHosts: [],
      source: 'pipeline',
    });
    assert.deepEqual(candidate.game, { eventId: '900001', gameNumber: 1, officialDate: '2026-09-26' });
    assert.equal(candidate.team, 'mlb-5');
    const text = JSON.stringify(candidate);
    for (const host of HOSTS) {
      assert.equal(text.includes(host), false);
    }
  });
});

test('a dry run hands over found, so publish decides dry_run itself', async () => {
  await withWorkspace(async (workspace) => {
    const request = { eventId: '900001', team: 'mlb-5' };
    const result = await run(workspace, { request });
    assert.equal(result.outcome, 'dry_run');
    const candidate = candidateFromResult(result, request);
    assert.equal(candidate.outcome, 'found');
    assert.equal(candidate.entry.url, EMBED_URL);
  });
});

test('an entry already on the branch is handed over as a request to confirm it', () => {
  const game = { gameNumber: 1, gamePk: 900001, officialDate: '2026-09-26', resumed: true };
  const candidate = candidateFromResult({ game, outcome: 'video_ready' }, { eventId: '900001', team: 'mlb-5' });
  assert.equal(candidate.outcome, 'entry_exists');
  assert.equal(candidate.entry, undefined);
  assert.equal(candidate.game.resumed, undefined, 'publish derives resumed state itself');
});

test('a school run reads only the dispatched sport and writes its sport on the entry', async () => {
  await withWorkspace(async (workspace) => {
    const fetcher = fakeFetch({
      espn: () => new Response(JSON.stringify({ events: [espnEvent({ date: '2026-11-08T01:00:00Z' })] })),
    });
    const result = await run(workspace, {
      fetcher,
      now: new Date('2026-11-08T00:50:00Z'),
      request: { sport: 'mens-basketball', team: 'ncaa-66' },
    });
    assert.equal(result.outcome, 'dry_run');
    assert.equal(result.entry.sport, 'mens-basketball');
    assert.equal(result.entry.gameDates[0], '2026-11-07');
    const espnCalls = fetcher.calls.filter((call) => call.url.includes('espn.com'));
    assert.equal(espnCalls.length, 3);
    assert.ok(espnCalls.every((call) => call.url.includes('mens-college-basketball')));
  });
});

test('an entry is built from the provider row for the URL', () => {
  const entry = entryForGame({ gameNumber: 1, gamePk: 7, officialDate: '2026-11-07' }, { sport: 'football' }, EMBED_URL);
  assert.equal(Object.keys(entry)[0], 'sport');
  assert.equal(entry.source, 'pipeline');
  assert.deepEqual(entry.trustedHosts, []);
});

test('masks go out before the run can print a host, including a redirect host', async () => {
  await withWorkspace(async (workspace) => {
    const output = [];
    const redactor = createRedactor({ emit: (line) => output.push(line) });
    const redirect = 'redirect-host.test';
    const answers = [
      { failure: 'http_5xx', found: false, logLines: ['Answered at https://listing-one.test/live'] },
      { failure: 'game_nav', found: false, logLines: ['Redirected via listing-three.test'] },
      foundExtraction(),
    ];
    const result = await run(workspace, {
      extractListing: async (_baseUrl, options) => {
        options.sourceAttempt.onHost(redirect);
        const answer = answers.shift();
        return answer;
      },
      redactor,
    });
    for (const step of result.steps) {
      output.push(redactor.text(step.message));
    }
    output.push(redactor.text(result.message));

    for (const host of [...HOSTS, redirect]) {
      const first = output.findIndex((line) => line.includes(host));
      assert.ok(output[first].startsWith('::add-mask::'), `first mention of ${host} is not a mask`);
      assert.equal(
        output.filter((line) => line.includes(host) && !line.startsWith('::add-mask::')).length,
        0,
        `${host} reached the printed log`,
      );
    }
    const firstPrinted = output.findIndex((line) => !line.startsWith('::add-mask::'));
    for (const host of HOSTS) {
      assert.ok(output.indexOf(`::add-mask::${host}`) < firstPrinted);
    }
  });
});

test('a thrown extraction is classified with its hosts redacted', async () => {
  await withWorkspace(async (workspace) => {
    const redactor = createRedactor();
    const result = await run(workspace, {
      extractListing: async () => {
        throw new Error('page.goto failed at https://listing-one.test/live via listing-two.test');
      },
      redactor,
    });
    const text = result.steps.map((step) => step.message).join('\n');
    assert.equal(result.outcome, 'sources_unreachable');
    for (const host of HOSTS) {
      assert.equal(text.includes(host), false);
    }
  });
});

function workerCollector() {
  const posts = [];
  return {
    fetcher: fakeFetch({
      worker: (url, init) => {
        posts.push({ body: init.body, headers: init.headers, url });
        return new Response(null, { status: 204 });
      },
    }),
    posts,
  };
}

const PROGRESS_KEY = 'test-progress-key';

function progressRun(workspace, extras) {
  const { fetcher, posts } = workerCollector();
  const request = { eventId: '900001', team: 'mlb-5' };
  return run(workspace, {
    dryRun: false,
    fetcher,
    progress: undefined,
    progressKey: PROGRESS_KEY,
    request,
    workerUrl: 'https://worker.test/',
    ...extras,
  }).then((result) => ({ posts, result }));
}

test('each source reports its number, signed, and no body carries a label or host', async () => {
  await withWorkspace(async (workspace) => {
    const answers = [{ failure: 'http_5xx', found: false }, { failure: 'link_not_found', found: false }, foundExtraction()];
    const { posts, result } = await progressRun(workspace, { extractListing: async () => answers.shift() });
    assert.equal(result.outcome, 'found');
    assert.deepEqual(
      posts.map((post) => {
        const body = JSON.parse(post.body);
        return [body.step, body.k, body.n];
      }),
      [['source_start', 1, 3], ['source_start', 2, 3], ['source_start', 3, 3], ['found', 3, 3]],
    );
    for (const post of posts) {
      assert.equal(post.url, 'https://worker.test/run-progress');
      assert.equal(post.headers[SIGNATURE_HEADER], signBody(PROGRESS_KEY, post.body));
      const body = JSON.parse(post.body);
      assert.deepEqual(Object.keys(body).sort(), ['at', 'eventId', 'k', 'n', 'runId', 'step', 'team']);
      assert.equal(body.team, 'mlb-5');
      assert.equal(body.eventId, '900001');
      for (const forbidden of [...HOSTS, 'primary', 'backup']) {
        assert.equal(post.body.includes(forbidden), false);
      }
    }
  });
});

test('a dry run and a manual run with no event post no progress', async () => {
  await withWorkspace(async (workspace) => {
    assert.equal((await progressRun(workspace, { dryRun: true })).posts.length, 0);
    assert.equal((await progressRun(workspace, { request: { team: 'mlb-5' } })).posts.length, 0);
  });
});

test('a Worker that fails or hangs does not change the outcome', async () => {
  await withWorkspace(async (workspace) => {
    const result = await run(workspace, {
      dryRun: false,
      fetcher: fakeFetch({
        worker: () => {
          throw new Error('down');
        },
      }),
      progress: undefined,
      progressKey: PROGRESS_KEY,
      request: { eventId: '900001', team: 'mlb-5' },
      workerUrl: 'https://worker.test',
    });
    assert.equal(result.outcome, 'found');
  });
});

test('progress posts keep their order and never block the caller', async () => {
  const order = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const reporter = createProgressReporter({
    eventId: '1',
    fetchImpl: async (_url, init) => {
      order.push(JSON.parse(init.body).k);
      await gate;
      return new Response(null, { status: 204 });
    },
    key: 'k',
    runId: '1',
    team: 'mlb-5',
    workerUrl: 'https://worker.test',
  });
  reporter.send('source_start', 1, 2);
  reporter.send('source_start', 2, 2);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, [1], 'the second post waits for the first');
  release();
  await reporter.flush();
  assert.deepEqual(order, [1, 2]);
});
