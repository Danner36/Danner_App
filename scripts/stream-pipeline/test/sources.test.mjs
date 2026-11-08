import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_TIMING,
  MIN_BACKUP_BUDGET_SECONDS,
  NEXT_CODES,
  STOP_CODES,
  formatRunSummary,
  normalizeSources,
  outcomeForAttempts,
  parseSourceOnly,
  rawSourceUrls,
  runSources,
  sourceBudget,
  sourcesConfigProblem,
} from '../lib/sources.mjs';

const THREE_SOURCES = [
  { baseUrl: 'https://listing-one.test/live', label: 'primary', number: 1 },
  { baseUrl: 'https://listing-two.test/live', label: 'backup-1', number: 2 },
  { baseUrl: 'https://listing-three.test/live', label: 'backup-2', number: 3 },
];

const FOUND = { entry: { url: 'https://player.test/embed/1' } };

function fakeClock() {
  const timers = new Map();
  let nowMs = 0;
  let nextHandle = 1;
  return {
    timers,
    advance(seconds) {
      nowMs += seconds * 1000;
    },
    clearTimer: (handle) => timers.delete(handle),
    fire() {
      for (const [handle, timer] of timers) {
        timers.delete(handle);
        timer.callback();
      }
    },
    now: () => nowMs,
    requested: [],
    setTimer(callback, ms) {
      const handle = nextHandle;
      nextHandle += 1;
      timers.set(handle, { callback, ms });
      this.requested.push(ms);
      return handle;
    },
  };
}

function harness(outcomes, overrides = {}) {
  const contexts = [];
  const calls = [];
  let browserCloses = 0;
  let launches = 0;
  const clock = overrides.clock ?? fakeClock();
  const options = {
    attemptSource: async ({ context, navigationTimeoutSeconds, onStage, source }) => {
      calls.push({ context, navigationTimeoutSeconds, number: source.number });
      const outcome = outcomes[calls.length - 1];
      return typeof outcome === 'function' ? outcome({ onStage, source }) : outcome;
    },
    clock,
    launchBrowser: async () => {
      launches += 1;
      return { close: async () => { browserCloses += 1; } };
    },
    newContext: async () => {
      const context = { closed: false, close: async () => { context.closed = true; } };
      contexts.push(context);
      return context;
    },
    sources: THREE_SOURCES,
    ...overrides,
  };
  return {
    calls,
    clock,
    contexts,
    get browserCloses() { return browserCloses; },
    get launches() { return launches; },
    run: () => runSources(options),
  };
}

for (const code of NEXT_CODES) {
  test(`NEXT code ${code} moves on to the next source`, async () => {
    const run = harness([{ code }, FOUND]);
    const result = await run.run();
    assert.equal(result.code, 'found');
    assert.equal(result.winner.number, 2);
    assert.deepEqual(result.attempts.map((attempt) => attempt.result), [code, 'found']);
  });
}

test('every STOP code an attempt can return ends the run at once', async () => {
  for (const code of STOP_CODES) {
    const run = harness([{ code }, FOUND]);
    const result = await run.run();
    assert.equal(result.code, code);
    assert.equal(run.calls.length, 1);
  }
});

test('the first source that returns an entry ends the run', async () => {
  const run = harness([FOUND, FOUND]);
  const result = await run.run();
  assert.equal(result.code, 'found');
  assert.deepEqual(result.entry, FOUND.entry);
  assert.equal(run.calls.length, 1);
});

test('Chromium launches once and each source gets its own closed context', async () => {
  const run = harness([{ code: 'http_5xx' }, { code: 'nav_error' }, FOUND]);
  await run.run();
  assert.equal(run.launches, 1);
  assert.equal(run.browserCloses, 1);
  assert.equal(new Set(run.calls.map((call) => call.context)).size, 3);
  assert.ok(run.contexts.every((context) => context.closed));
});

test('a browser that cannot launch stops as browser_failed', async () => {
  const run = harness([FOUND], {
    launchBrowser: async () => {
      throw new Error('no browser at https://listing-one.test/live');
    },
  });
  const result = await run.run();
  assert.equal(result.code, 'browser_failed');
  assert.equal(run.calls.length, 0);
});

test('a browser that dies between sources stops as browser_failed', async () => {
  let opened = 0;
  const run = harness([{ code: 'http_5xx' }, FOUND], {
    newContext: async () => {
      opened += 1;
      if (opened > 1) {
        throw new Error('browser closed');
      }
      return { close: async () => {} };
    },
  });
  const result = await run.run();
  assert.equal(result.code, 'browser_failed');
  assert.equal(result.attempts.length, 1);
});

test('source 1 has no cap unless its own timeoutSeconds is set', async () => {
  const uncapped = harness([
    () => {
      uncapped.clock.advance(400);
      return FOUND;
    },
  ]);
  const result = await uncapped.run();
  assert.equal(result.code, 'found');
  assert.deepEqual(uncapped.clock.requested, []);
  assert.equal(result.attempts[0].seconds, 400);

  const capped = harness([FOUND], {
    sources: [{ ...THREE_SOURCES[0], timeoutSeconds: 200 }],
  });
  await capped.run();
  assert.deepEqual(capped.clock.requested, [200_000]);
});

test('source 1 uses the primary navigation timeout and backups the backup one', async () => {
  const run = harness([{ code: 'http_5xx' }, FOUND], {
    timing: { ...DEFAULT_TIMING, primary: { navigationTimeoutSeconds: 75 } },
  });
  await run.run();
  assert.deepEqual(run.calls.map((call) => call.navigationTimeoutSeconds), [75, 30]);
});

test('a backup defaults to 120 seconds and honors its own timeoutSeconds', async () => {
  const run = harness([{ code: 'http_5xx' }, { code: 'http_5xx' }, FOUND], {
    sources: [THREE_SOURCES[0], THREE_SOURCES[1], { ...THREE_SOURCES[2], timeoutSeconds: 60 }],
  });
  await run.run();
  assert.deepEqual(run.clock.requested, [120_000, 60_000]);
});

test('a backup budget is clamped to the time left minus the reserve', async () => {
  const run = harness([
    () => {
      run.clock.advance(500);
      return { code: 'http_5xx' };
    },
    FOUND,
  ]);
  await run.run();
  // 600 s deadline - 500 s elapsed - 45 s reserve.
  assert.deepEqual(run.clock.requested, [55_000]);
});

test('sources after an ambiguous_link must name the opponent', async () => {
  const seen = [];
  const run = harness([], {
    attemptSource: async ({ requireOpponent, source }) => {
      seen.push(requireOpponent);
      return [{ code: 'http_5xx' }, { code: 'ambiguous_link' }, FOUND][source.number - 1];
    },
  });
  const result = await run.run();
  assert.equal(result.code, 'found');
  assert.deepEqual(seen, [false, false, true]);
});

test('a backup with its own 30 second timeout still runs when time is plentiful', async () => {
  const run = harness([{ code: 'http_5xx' }, FOUND], {
    sources: [THREE_SOURCES[0], { ...THREE_SOURCES[1], timeoutSeconds: 30 }],
  });
  const result = await run.run();
  assert.equal(result.code, 'found');
  assert.deepEqual(run.clock.requested, [30_000]);
});

test('the clamp never raises a backup above its own timeout', () => {
  const backup = { ...THREE_SOURCES[1], timeoutSeconds: 40 };
  assert.equal(sourceBudget(backup, 500).budgetSeconds, 40);
  assert.equal(sourceBudget(backup, 60).budgetSeconds, 15);
});

test('a backup still starts when the clamp leaves exactly the minimum budget', async () => {
  const run = harness([
    () => {
      run.clock.advance(520);
      return { code: 'http_5xx' };
    },
    FOUND,
  ]);
  const result = await run.run();
  assert.equal(result.code, 'found');
  assert.deepEqual(run.clock.requested, [MIN_BACKUP_BUDGET_SECONDS * 1000]);
});

for (const elapsed of [521, 554, 555, 700]) {
  test(`${elapsed} seconds into the run the next source stops as deadline`, async () => {
    const run = harness([
      () => {
        run.clock.advance(elapsed);
        return { code: 'http_5xx' };
      },
      FOUND,
    ]);
    const result = await run.run();
    assert.equal(result.code, 'deadline');
    assert.equal(run.calls.length, 1);
    assert.equal(run.browserCloses, 1);
  });
}

test('the deadline does not apply when no source remains', async () => {
  const run = harness(
    [
      () => {
        run.clock.advance(599);
        return { code: 'http_5xx' };
      },
    ],
    { sources: [THREE_SOURCES[0]] },
  );
  const result = await run.run();
  assert.equal(result.code, 'sources_unreachable');
});

test('source_timeout fires on the budget timer and closes that context', async () => {
  let attemptStarted;
  const started = new Promise((resolve) => {
    attemptStarted = resolve;
  });
  const clock = fakeClock();
  const run = harness(
    [
      () => ({ code: 'http_5xx' }),
      async ({ onStage }) => {
        onStage('game');
        attemptStarted();
        await new Promise(() => {});
      },
      FOUND,
    ],
    { clock },
  );
  const running = run.run();
  await started;
  clock.fire();
  const result = await running;
  assert.equal(result.code, 'found');
  assert.equal(result.attempts[1].result, 'source_timeout');
  assert.equal(result.attempts[1].stage, 'game');
  assert.equal(run.contexts[1].closed, true);
});

test('a thrown failure is charged to the stage it interrupted', async () => {
  const stages = [
    ['listing', 'nav_error'],
    ['link', 'link_not_found'],
    ['game', 'game_nav'],
    ['player', 'player_not_found'],
    ['entry', 'invalid_entry'],
  ];
  for (const [stage, code] of stages) {
    const run = harness([
      ({ onStage }) => {
        onStage(stage);
        throw new Error('page crashed');
      },
      FOUND,
    ]);
    const result = await run.run();
    assert.equal(result.attempts[0].result, code);
  }
});

test('outcome precedence: ambiguous_link, then sources_unreachable, then no_video', () => {
  const attempts = (...results) => results.map((result) => ({ result }));
  assert.equal(outcomeForAttempts(attempts('nav_error', 'ambiguous_link', 'link_not_found')), 'ambiguous_link');
  assert.equal(outcomeForAttempts(attempts('ambiguous_link', 'http_5xx')), 'ambiguous_link');
  assert.equal(outcomeForAttempts(attempts('nav_error', 'nav_timeout', 'http_4xx', 'http_5xx', 'bot_challenge')), 'sources_unreachable');
  assert.equal(outcomeForAttempts(attempts('http_5xx', 'link_not_found')), 'no_video');
  assert.equal(outcomeForAttempts(attempts('source_timeout')), 'no_video');
  assert.equal(outcomeForAttempts(attempts('game_nav', 'unplayable')), 'no_video');
});

test('a run where every source fails ends with the precedence outcome', async () => {
  const ambiguous = harness([{ code: 'http_5xx' }, { code: 'ambiguous_link' }, { code: 'link_not_found' }]);
  assert.equal((await ambiguous.run()).code, 'ambiguous_link');

  const unreachable = harness([{ code: 'http_5xx' }, { code: 'nav_timeout' }, { code: 'bot_challenge' }]);
  assert.equal((await unreachable.run()).code, 'sources_unreachable');

  const none = harness([{ code: 'link_not_found' }, { code: 'http_5xx' }, { code: 'unknown_provider' }]);
  assert.equal((await none.run()).code, 'no_video');
});

test('a single selected source keeps its number and the configured total in the log', async () => {
  const lines = [];
  const run = harness([FOUND], {
    log: (line) => lines.push(line),
    sources: [THREE_SOURCES[1]],
    total: 3,
  });
  const result = await run.run();
  assert.equal(result.winner.number, 2);
  assert.ok(lines.includes('Trying source 2/3 (backup-1).'));
  assert.deepEqual(run.calls.map((call) => call.navigationTimeoutSeconds), [30]);
  assert.deepEqual(run.clock.requested, [120_000]);
});

const validConfig = () => ({
  schemaVersion: 2,
  sources: [
    { label: 'primary', baseUrl: 'https://listing-one.test/live' },
    { label: 'backup-1', baseUrl: 'https://listing-two.test/live', timeoutSeconds: 120 },
  ],
});

test('a valid sources config passes and normalizes in order', () => {
  assert.equal(sourcesConfigProblem(validConfig()), undefined);
  assert.deepEqual(normalizeSources(validConfig()).map((source) => source.number), [1, 2]);
});

test('sources config problems name sources by number and carry no values', () => {
  const cases = [
    [null, /JSON object/],
    [{ sources: [] }, /schemaVersion/],
    [{ schemaVersion: 2 }, /1 to 5/],
    [{ schemaVersion: 2, sources: [] }, /1 to 5/],
    [{ schemaVersion: 2, sources: Array.from({ length: 6 }, (_, index) => ({ label: `s${index}`, baseUrl: `https://listing-${index}.test/` })) }, /1 to 5/],
    [{ schemaVersion: 2, sources: ['https://listing-one.test/live'] }, /source 1 is not an object/],
    [{ schemaVersion: 2, sources: [{ label: 'has.dot', baseUrl: 'https://listing-one.test/' }] }, /source 1 label/],
    [{ schemaVersion: 2, sources: [{ label: 'primary', baseUrl: 'ftp://listing-one.test/' }] }, /source 1 baseUrl/],
    [{ schemaVersion: 2, sources: [{ label: 'primary', baseUrl: 'listing-one.test' }] }, /source 1 baseUrl/],
    [{ schemaVersion: 2, sources: [{ label: 'a', baseUrl: 'https://listing-one.test/x' }, { label: 'b', baseUrl: 'https://LISTING-one.test/x/' }] }, /source 2 repeats/],
    [{ schemaVersion: 2, sources: [{ label: 'a', baseUrl: 'https://listing-one.test/', timeoutSeconds: 29 }] }, /source 1 timeoutSeconds/],
    [{ schemaVersion: 2, sources: [{ label: 'a', baseUrl: 'https://listing-one.test/', timeoutSeconds: 301 }] }, /source 1 timeoutSeconds/],
  ];
  for (const [config, pattern] of cases) {
    const message = sourcesConfigProblem(config);
    assert.match(message, pattern);
    assert.doesNotMatch(message, /listing-|\.test/);
  }
});

test('two sources on one host with different paths are allowed', () => {
  const config = {
    schemaVersion: 2,
    sources: [
      { label: 'a', baseUrl: 'https://listing-one.test/mlb' },
      { label: 'b', baseUrl: 'https://listing-one.test/nfl' },
    ],
  };
  assert.equal(sourcesConfigProblem(config), undefined);
});

test('rawSourceUrls keeps malformed entries so they are still masked', () => {
  const urls = rawSourceUrls({ sources: [{ baseUrl: 'listing-one.test/live' }, { baseUrl: 7 }, null] });
  assert.deepEqual(urls, ['listing-one.test/live']);
  assert.deepEqual(rawSourceUrls({ sources: 'x' }), []);
});

test('the source input is 1-based, blank means all, and bad values never echo', () => {
  assert.deepEqual(parseSourceOnly('', 3), {});
  assert.deepEqual(parseSourceOnly(undefined, 3), {});
  assert.deepEqual(parseSourceOnly('2', 3), { sourceOnly: 2 });
  for (const value of ['0', '4', 'two', '1;ls', '-1']) {
    const { problem } = parseSourceOnly(value, 3);
    assert.match(problem, /1 to 3/);
    assert.equal(problem.includes(value) && value.length > 1, false);
  }
  assert.match(parseSourceOnly('2', 1).problem, /one listing source/);
});

test('the run summary names sources by number and label only', () => {
  const text = formatRunSummary({
    moduleName: 'patriots',
    result: {
      game: { gameNumber: 1, gamePk: 401, officialDate: '2026-11-08' },
      listing: {
        attempts: [
          { label: 'primary', number: 1, result: 'http_5xx', seconds: 3, stage: 'listing' },
          { label: 'backup-1', number: 2, result: 'found', seconds: 21, stage: 'entry' },
        ],
        total: 3,
        winner: { number: 2 },
      },
      outcome: 'published',
    },
  });
  assert.match(text, /^patriots \| event 401 \| 2026-11-08 game 1 \| published from source 2 of 3\n/);
  assert.match(text, /\| 1 \| primary \| listing \| http_5xx \| 3 \|/);
  assert.match(text, /\| 2 \| backup-1 \| entry \| found \| 21 \|/);
  assert.match(text, /\|---\|/);
});

test('a run summary with no attempts is one line', () => {
  const text = formatRunSummary({ moduleName: 'guardians', result: { outcome: 'no_game' } });
  assert.equal(text.trim(), 'guardians | no_game');
});
