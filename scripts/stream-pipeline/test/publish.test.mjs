import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { checkRequest } from '../lib/catalog.mjs';
import { commitMessage, publishSummary, resultDocument, runPublish, validateFoundCandidate } from '../lib/publishRun.mjs';
import { SIGNATURE_HEADER, signBody } from '../lib/signedPost.mjs';
import { EMBED_URL, fakeFetch, withWorkspace } from './fixtures.mjs';

const exec = promisify(execFile);
const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATUS_KEY = 'test-status-key';
const NOW = new Date('2026-11-08T15:00:00Z');

function foundCandidate(overrides = {}) {
  return {
    schemaVersion: 1,
    outcome: 'found',
    team: 'nfl-17',
    eventId: '401',
    game: { eventId: '401', gameNumber: 1, officialDate: '2026-11-08' },
    entry: {
      eventId: '401',
      gameDates: ['2026-11-08'],
      gameNumbers: [1],
      kind: 'web',
      url: EMBED_URL,
      allowInsecureHttp: false,
      trustedHosts: [],
      source: 'pipeline',
    },
    listing: {
      attempts: [
        { label: 'primary', number: 1, result: 'http_5xx', seconds: 3, stage: 'listing' },
        { label: 'backup-1', number: 2, result: 'found', seconds: 21, stage: 'entry' },
      ],
      total: 3,
      winnerNumber: 2,
    },
    ...overrides,
  };
}

function schoolCandidate(overrides = {}) {
  const base = foundCandidate();
  return foundCandidate({
    sport: 'football',
    team: 'ncaa-66',
    entry: { ...base.entry, sport: 'football' },
    ...overrides,
  });
}

async function nflSpec(workspace) {
  return (await checkRequest({ eventId: '401', team: 'nfl-17' }, workspace.catalogDir)).spec;
}

const BAD_CANDIDATES = [
  ['another team', (c) => { c.team = 'mlb-5'; }],
  ['another event', (c) => { c.eventId = '402'; }],
  ['another game event', (c) => { c.game.eventId = '402'; }],
  ['a bad official date', (c) => { c.game.officialDate = '2026-13-40'; }],
  ['a game number out of range', (c) => { c.game.gameNumber = 10; }],
  ['a non-provider host', (c) => { c.entry.url = 'https://evil.test/new-stream-embed/1'; }],
  ['a squatted sibling host', (c) => { c.entry.url = 'https://notgooz.aapmains.net/new-stream-embed/1'; }],
  ['a provider host with the wrong path', (c) => { c.entry.url = 'https://gooz.aapmains.net/other/1'; }],
  ['a host in a query parameter', (c) => { c.entry.url = `${EMBED_URL}&ref=listing-one.test`; }],
  ['a host in userinfo', (c) => { c.entry.url = 'https://listing-one.test@gooz.aapmains.net/new-stream-embed/57001'; }],
  ['a host in a fragment', (c) => { c.entry.url = `${EMBED_URL}#listing-one.test`; }],
  ['a host in an extra path segment', (c) => { c.entry.url = 'https://gooz.aapmains.net/new-stream-embed/57001/listing-one.test'; }],
  ['a host as a subdomain', (c) => { c.entry.url = 'https://listing-one.test.gooz.aapmains.net/new-stream-embed/57001'; }],
  ['a port', (c) => { c.entry.url = 'https://gooz.aapmains.net:8443/new-stream-embed/57001'; }],
  ['plain http', (c) => { c.entry.url = c.entry.url.replace('https:', 'http:'); }],
  ['a direct entry', (c) => { c.entry.kind = 'direct'; }],
  ['insecure http allowed', (c) => { c.entry.allowInsecureHttp = true; }],
  ['added trusted hosts', (c) => { c.entry.trustedHosts = ['evil.test']; }],
  ['a mismatched entry date', (c) => { c.entry.gameDates = ['2026-11-09']; }],
  ['a mismatched game number', (c) => { c.entry.gameNumbers = [2]; }],
  ['a mismatched entry event', (c) => { c.entry.eventId = '402'; }],
  ['a sport on a pro entry', (c) => { c.entry.sport = 'football'; }],
  ['a non-pipeline entry', (c) => { c.entry.source = 'hand'; }],
  ['no entry', (c) => { delete c.entry; }],
  ['no game', (c) => { delete c.game; }],
  ['a wrong schema version', (c) => { c.schemaVersion = 2; }],
];

for (const [name, mutate] of BAD_CANDIDATES) {
  test(`re-validation refuses ${name}`, async () => {
    await withWorkspace(async (workspace) => {
      const spec = await nflSpec(workspace);
      assert.ok(validateFoundCandidate(foundCandidate(), spec, '401'), 'the base candidate is valid');
      const candidate = structuredClone(foundCandidate());
      mutate(candidate);
      assert.equal(validateFoundCandidate(candidate, spec, '401'), undefined);
    });
  });
}

test('the published URL is the rebuilt one, not the candidate\'s text', async () => {
  await withWorkspace(async (workspace) => {
    const candidate = foundCandidate();
    candidate.entry.url = 'https://GOOZ.aapmains.net/new-stream-embed/57001?ad=111';
    const { entry } = validateFoundCandidate(candidate, await nflSpec(workspace), '401');
    assert.equal(entry.url, EMBED_URL);
  });
});

test('re-validation rebuilds the entry and drops anything extra', async () => {
  await withWorkspace(async (workspace) => {
    const candidate = foundCandidate();
    candidate.entry.extra = 'x';
    candidate.path = 'streams/nfl/999.json';
    const { entry } = validateFoundCandidate(candidate, await nflSpec(workspace), '401');
    assert.equal(entry.extra, undefined);
    assert.deepEqual(Object.keys(entry), [
      'eventId',
      'gameDates',
      'gameNumbers',
      'kind',
      'url',
      'allowInsecureHttp',
      'trustedHosts',
      'source',
    ]);
  });
});

function publishOptions(workspace, fetcher, overrides = {}) {
  return {
    candidatePath: path.join(workspace.directory, 'candidate.json'),
    catalogDir: workspace.catalogDir,
    fetchImpl: fetcher.fetchImpl,
    now: NOW,
    repository: 'owner/repo',
    request: { eventId: '401', team: 'nfl-17' },
    runId: '77',
    sleep: async () => {},
    statusKey: STATUS_KEY,
    token: 'test-token',
    workerUrl: 'https://worker.test/',
    ...overrides,
  };
}

async function publishWith(workspace, candidate, { contents, fetcher = fakeFetch({ contents }), ...overrides } = {}) {
  if (candidate !== undefined) {
    await writeFile(path.join(workspace.directory, 'candidate.json'), JSON.stringify(candidate));
  }
  const result = await runPublish(publishOptions(workspace, fetcher, overrides));
  const puts = fetcher.calls.filter((call) => call.init.method === 'PUT');
  const posts = fetcher.calls.filter((call) => call.url.startsWith('https://worker.test'));
  return { posts, puts, result };
}

function putBody(put) {
  const body = JSON.parse(put.init.body);
  return { ...body, document: JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')) };
}

test('a found candidate creates a missing file from the template at the path from the key', async () => {
  await withWorkspace(async (workspace) => {
    const candidate = foundCandidate();
    candidate.path = 'streams/nfl/999.json';
    const { puts, result } = await publishWith(workspace, candidate);
    assert.equal(result.code, 'published');
    assert.equal(result.success, true);
    assert.equal(puts.length, 1);
    assert.equal(puts[0].url, 'https://api.github.com/repos/owner/repo/contents/streams/nfl/17.json');
    const body = putBody(puts[0]);
    assert.equal(body.sha, undefined);
    assert.equal(body.branch, 'main');
    assert.equal(body.message, 'streams: nfl-17 2026-11-08 game 1.');
    assert.equal(body.document.schemaVersion, 2);
    assert.deepEqual(body.document.team, { key: 'nfl-17', name: 'New England Patriots' });
    assert.equal(body.document.streams.length, 3);
    assert.equal(body.document.streams.at(-1).source, 'pipeline');
  });
});

test('a school commit names its sport and writes the school file', async () => {
  await withWorkspace(async (workspace) => {
    const { puts, result } = await publishWith(workspace, schoolCandidate(), {
      request: { eventId: '401', sport: 'football', team: 'ncaa-66' },
    });
    assert.equal(result.code, 'published');
    assert.match(puts[0].url, /contents\/streams\/ncaa\/66\.json$/);
    const body = putBody(puts[0]);
    assert.equal(body.message, 'streams: ncaa-66 football 2026-11-08 game 1.');
    assert.equal(body.document.streams.at(-1).sport, 'football');
    assert.equal(body.document.streams[1].sport, 'football', 'the example carries a sport in a school file');
  });
});

test('the commit message follows the plan', () => {
  assert.equal(commitMessage({ key: 'nfl-17' }, { gameNumber: 2, officialDate: '2026-11-08' }), 'streams: nfl-17 2026-11-08 game 2.');
});

test('a concurrent create is retried through a re-read', async () => {
  await withWorkspace(async (workspace) => {
    const calls = [];
    let reads = 0;
    let puts = 0;
    const existing = { schemaVersion: 2, streams: ['marker'] };
    const fetchImpl = async (url, init = {}) => {
      calls.push({ init, url: String(url) });
      if (String(url).includes('api.github.com')) {
        if (init.method === 'PUT') {
          puts += 1;
          return new Response('{}', { status: puts === 1 ? 422 : 201 });
        }
        reads += 1;
        if (reads === 1) {
          return new Response('{}', { status: 404 });
        }
        return new Response(
          JSON.stringify({ content: Buffer.from(JSON.stringify(existing)).toString('base64'), encoding: 'base64', sha: 'created' }),
        );
      }
      return new Response(null, { status: 204 });
    };
    const { result } = await publishWith(workspace, foundCandidate(), { fetcher: { calls, fetchImpl } });
    assert.equal(result.code, 'published');
    assert.equal(puts, 2);
    assert.equal(JSON.parse(calls.filter((call) => call.init.method === 'PUT')[1].init.body).sha, 'created');
  });
});

test('an entry already published by another run reports video_ready without a commit', async () => {
  await withWorkspace(async (workspace) => {
    const entry = foundCandidate().entry;
    const { posts, puts, result } = await publishWith(workspace, foundCandidate(), {
      contents: { schemaVersion: 2, streams: [{ ...entry, url: 'https://gooz.aapmains.net/new-stream-embed/99' }] },
    });
    assert.equal(result.code, 'video_ready');
    assert.equal(puts.length, 0);
    assert.equal(JSON.parse(posts[0].init.body).code, 'video_ready');
  });
});

test('force replaces an existing entry for the game', async () => {
  await withWorkspace(async (workspace) => {
    const entry = foundCandidate().entry;
    const { puts, result } = await publishWith(workspace, foundCandidate(), {
      contents: { schemaVersion: 2, streams: [{ ...entry, url: 'https://gooz.aapmains.net/new-stream-embed/99' }] },
      force: true,
    });
    assert.equal(result.code, 'published');
    assert.deepEqual(putBody(puts[0]).document.streams.map((row) => row.url), [EMBED_URL]);
  });
});

test('the run status is signed and holds only the agreed fields', async () => {
  await withWorkspace(async (workspace) => {
    const { posts, result } = await publishWith(workspace, foundCandidate());
    assert.equal(result.posted, true);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].url, 'https://worker.test/run-status');
    const raw = posts[0].init.body;
    assert.equal(posts[0].init.headers[SIGNATURE_HEADER], signBody(STATUS_KEY, raw));
    assert.deepEqual(JSON.parse(raw), {
      at: Math.floor(NOW.getTime() / 1000),
      code: 'published',
      eventId: '401',
      runId: '77',
      team: 'nfl-17',
    });
  });
});

test('a school run status carries its sport', async () => {
  await withWorkspace(async (workspace) => {
    const { posts } = await publishWith(workspace, schoolCandidate(), {
      request: { eventId: '401', sport: 'football', team: 'ncaa-66' },
    });
    assert.equal(JSON.parse(posts[0].init.body).sport, 'football');
  });
});

test('a dry run writes nothing and posts nothing', async () => {
  await withWorkspace(async (workspace) => {
    const { posts, puts, result } = await publishWith(workspace, foundCandidate(), { dryRun: true });
    assert.equal(result.code, 'dry_run');
    assert.equal(puts.length, 0);
    assert.equal(posts.length, 0);
  });
});

test('a dry run still re-validates the candidate', async () => {
  await withWorkspace(async (workspace) => {
    const candidate = foundCandidate();
    candidate.entry.url = 'https://evil.test/new-stream-embed/1';
    const { posts, puts, result } = await publishWith(workspace, candidate, { dryRun: true });
    assert.equal(result.code, 'invalid_entry');
    assert.equal(puts.length, 0);
    assert.equal(posts.length, 0);
  });
});

for (const claimed of ['published', 'unchanged', 'video_ready', 'dry_run', 'nonsense']) {
  test(`a candidate cannot claim ${claimed}`, async () => {
    await withWorkspace(async (workspace) => {
      const { posts, puts, result } = await publishWith(workspace, { outcome: claimed, schemaVersion: 1, team: 'nfl-17' });
      assert.equal(result.code, 'extract_failed');
      assert.equal(result.success, false);
      assert.equal(puts.length, 0);
      assert.equal(JSON.parse(posts[0].init.body).code, 'extract_failed');
    });
  });
}

function entryExistsCandidate(overrides = {}) {
  const { entry, listing, ...rest } = foundCandidate({ outcome: 'entry_exists', ...overrides });
  return rest;
}

test('publish confirms an existing entry itself before answering video_ready', async () => {
  await withWorkspace(async (workspace) => {
    const entry = foundCandidate().entry;
    const { puts, result } = await publishWith(workspace, entryExistsCandidate(), {
      contents: { schemaVersion: 2, streams: [entry] },
    });
    assert.equal(result.code, 'video_ready');
    assert.equal(result.success, true);
    assert.equal(puts.length, 0);
  });
});

test('an entry the branch does not hold is extract_failed', async () => {
  await withWorkspace(async (workspace) => {
    const empty = await publishWith(workspace, entryExistsCandidate(), { contents: { schemaVersion: 2, streams: [] } });
    assert.equal(empty.result.code, 'extract_failed');
    const missing = await publishWith(workspace, entryExistsCandidate());
    assert.equal(missing.result.code, 'extract_failed');
    const noGame = await publishWith(workspace, entryExistsCandidate({ game: undefined }), {
      contents: { schemaVersion: 2, streams: [foundCandidate().entry] },
    });
    assert.equal(noGame.result.code, 'extract_failed');
  });
});

function mlbCandidate(extraGame = {}) {
  const base = foundCandidate();
  return foundCandidate({
    eventId: '900001',
    team: 'mlb-5',
    game: { eventId: '900001', gameNumber: 1, officialDate: '2026-09-12', ...extraGame },
    entry: { ...base.entry, eventId: '900001', gameDates: ['2026-09-12'] },
  });
}

function mlbRows(rowDate) {
  return {
    dates: [
      {
        date: rowDate,
        games: [
          {
            gameDate: `${rowDate}T17:10:00Z`,
            gameNumber: 1,
            gamePk: 900001,
            officialDate: '2026-09-12',
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

async function mlbPublish(workspace, candidate, mlb) {
  const old = { ...mlbCandidate().entry, url: 'https://gooz.aapmains.net/new-stream-embed/99' };
  return publishWith(workspace, candidate, {
    fetcher: fakeFetch({ contents: { schemaVersion: 2, streams: [old] }, mlb }),
    now: new Date('2026-09-21T17:00:00Z'),
    request: { eventId: '900001', team: 'mlb-5' },
  });
}

test('publish finds a resumed MLB game itself and replaces its older entry', async () => {
  await withWorkspace(async (workspace) => {
    const { puts, result } = await mlbPublish(workspace, mlbCandidate(), () => new Response(JSON.stringify(mlbRows('2026-09-21'))));
    assert.equal(result.code, 'published');
    assert.deepEqual(putBody(puts[0]).document.streams.map((row) => row.url), [EMBED_URL]);
  });
});

test('a candidate that claims a resumed game is not believed', async () => {
  await withWorkspace(async (workspace) => {
    const { puts, result } = await mlbPublish(
      workspace,
      mlbCandidate({ resumed: true }),
      () => new Response(JSON.stringify(mlbRows('2026-09-12'))),
    );
    assert.equal(result.code, 'video_ready');
    assert.equal(puts.length, 0);
  });
});

for (const [name, mlb] of [
  ['an HTTP error', () => new Response('', { status: 500 })],
  ['a network failure', () => { throw new Error('down'); }],
  ['an unreadable body', () => new Response('not json')],
]) {
  test(`statsapi ${name} fails closed to not resumed`, async () => {
    await withWorkspace(async (workspace) => {
      const { puts, result } = await mlbPublish(workspace, mlbCandidate({ resumed: true }), mlb);
      assert.equal(result.code, 'video_ready');
      assert.equal(puts.length, 0);
    });
  });
}

test('the status post is tried three times with a doubling wait', async () => {
  await withWorkspace(async (workspace) => {
    let attempts = 0;
    const waits = [];
    const { result } = await publishWith(workspace, foundCandidate(), {
      fetcher: fakeFetch({
        worker: () => {
          attempts += 1;
          return new Response(null, { status: attempts < 3 ? 503 : 204 });
        },
      }),
      sleep: async (ms) => waits.push(ms),
    });
    assert.equal(result.posted, true);
    assert.equal(attempts, 3);
    assert.deepEqual(waits, [1000, 2000]);
  });
});

test('the status post stops at three attempts and the run still succeeds', async () => {
  await withWorkspace(async (workspace) => {
    let attempts = 0;
    const { result } = await publishWith(workspace, foundCandidate(), {
      fetcher: fakeFetch({
        worker: () => {
          attempts += 1;
          throw new Error('down');
        },
      }),
    });
    assert.equal(attempts, 3);
    assert.equal(result.posted, false);
    assert.equal(result.success, true);
  });
});

test('a run with no event id publishes but posts no status', async () => {
  await withWorkspace(async (workspace) => {
    const candidate = foundCandidate();
    delete candidate.eventId;
    const { posts, puts, result } = await publishWith(workspace, candidate, { request: { team: 'nfl-17' } });
    assert.equal(result.code, 'published');
    assert.equal(puts.length, 1);
    assert.equal(posts.length, 0);
  });
});

for (const [outcome, success] of [
  ['no_video', false],
  ['sources_unreachable', false],
  ['ambiguous_link', false],
  ['deadline', false],
  ['browser_failed', false],
  ['schedule_failed', false],
  ['config_invalid', false],
  ['no_game', true],
  ['blocked', true],
  ['game_over', true],
  ['too_early', true],
]) {
  test(`extract outcome ${outcome} is reported and writes nothing`, async () => {
    await withWorkspace(async (workspace) => {
      const { posts, puts, result } = await publishWith(workspace, { outcome, schemaVersion: 1, team: 'nfl-17' });
      assert.equal(result.code, outcome);
      assert.equal(result.success, success);
      assert.equal(puts.length, 0);
      assert.equal(JSON.parse(posts[0].init.body).code, outcome);
    });
  });
}

test('a missing candidate reports extract_failed and an unknown code is not passed on', async () => {
  await withWorkspace(async (workspace) => {
    const missing = await publishWith(workspace, undefined);
    assert.equal(missing.result.code, 'extract_failed');
    assert.equal(missing.result.success, false);
    assert.equal(missing.puts.length, 0);
    assert.equal(JSON.parse(missing.posts[0].init.body).code, 'extract_failed');

    const unknown = await publishWith(workspace, { outcome: 'https://listing-one.test/', schemaVersion: 1 });
    assert.equal(unknown.result.code, 'extract_failed');
    assert.equal(unknown.posts[0].init.body.includes('listing-one'), false);
  });
});

test('a tampered candidate stops as invalid_entry with no commit', async () => {
  await withWorkspace(async (workspace) => {
    const candidate = foundCandidate();
    candidate.entry.url = 'https://evil.test/new-stream-embed/1';
    const { posts, puts, result } = await publishWith(workspace, candidate);
    assert.equal(result.code, 'invalid_entry');
    assert.equal(result.success, false);
    assert.equal(puts.length, 0);
    assert.equal(JSON.parse(posts[0].init.body).code, 'invalid_entry');
  });
});

test('an invalid request writes nothing, posts nothing and sends no request', async () => {
  await withWorkspace(async (workspace) => {
    const fetcher = fakeFetch();
    for (const request of [{ team: 'nfl-999' }, { team: '../evil' }, { sport: 'x', team: 'nfl-17' }, { eventId: 'a', team: 'nfl-17' }]) {
      const { result } = await publishWith(workspace, foundCandidate(), { fetcher, request });
      assert.match(result.code, /^bad_/);
      assert.equal(result.success, false);
    }
    assert.equal(fetcher.calls.length, 0);
  });
});

test('a publish that keeps failing reports publish_failed', async () => {
  await withWorkspace(async (workspace) => {
    const posts = [];
    const fetchImpl = async (url, init = {}) => {
      if (String(url).includes('worker.test')) {
        posts.push(init);
        return new Response(null, { status: 204 });
      }
      return init.method === 'PUT' ? new Response('nope', { status: 500 }) : new Response('{}', { status: 404 });
    };
    const { result } = await publishWith(workspace, foundCandidate(), { fetcher: { calls: [], fetchImpl } });
    assert.equal(result.code, 'publish_failed');
    assert.equal(result.success, false);
    assert.equal(JSON.parse(posts[0].body).code, 'publish_failed');
  });
});

test('a Worker that does not answer does not fail the publish', async () => {
  await withWorkspace(async (workspace) => {
    const fetcher = fakeFetch({
      worker: () => {
        throw new Error('down');
      },
    });
    const { result } = await publishWith(workspace, foundCandidate(), { fetcher });
    assert.equal(result.code, 'published');
    assert.equal(result.posted, false);
    assert.equal(result.success, true);
  });
});

test('the summary follows the plan and the result document holds no host', async () => {
  await withWorkspace(async (workspace) => {
    const { result } = await publishWith(workspace, foundCandidate());
    const summary = publishSummary(result);
    assert.match(summary, /^nfl-17 \| event 401 \| 2026-11-08 game 1 \| published from source 2 of 3\n/);
    assert.match(summary, /\| 1 \| primary \| listing \| http_5xx \| 3 \|/);
    assert.match(summary, /\| 2 \| backup-1 \| entry \| found \| 21 \|/);
    const document = resultDocument(result);
    assert.equal(document.code, 'published');
    assert.equal(document.streamsPath, 'streams/nfl/17.json');
  });
});

test('a table row that is not numbers, labels and codes never reaches the summary', async () => {
  await withWorkspace(async (workspace) => {
    const candidate = foundCandidate();
    candidate.listing.attempts[0].label = 'listing-one.test';
    candidate.listing.attempts[1].result = 'https://listing-one.test/';
    const { result } = await publishWith(workspace, candidate);
    assert.equal(JSON.stringify(resultDocument(result)).includes('listing-one'), false);
    assert.equal(publishSummary(result).includes('listing-one'), false);
  });
});

async function importGraph(entry) {
  const seen = new Set();
  const specifiers = new Set();
  const visit = async (file) => {
    if (seen.has(file)) {
      return;
    }
    seen.add(file);
    const text = await readFile(file, 'utf8');
    for (const match of text.matchAll(/(?:from|import\()\s*'([^']+)'/g)) {
      specifiers.add(match[1]);
      if (match[1].startsWith('.')) {
        await visit(path.resolve(path.dirname(file), match[1]));
      }
    }
  };
  await visit(entry);
  return { files: [...seen], specifiers: [...specifiers] };
}

test('publish.mjs reaches no browser code and only built-in modules', async () => {
  const { files, specifiers } = await importGraph(path.join(packageDir, 'publish.mjs'));
  assert.equal(files.some((file) => file.endsWith('listing.mjs')), false, 'publish imports the browser driver');
  assert.equal(files.some((file) => file.endsWith(`lib${path.sep}pipeline.mjs`)), false);
  assert.equal(specifiers.includes('playwright'), false);
  for (const specifier of specifiers) {
    assert.ok(specifier.startsWith('.') || specifier.startsWith('node:'), `${specifier} needs npm ci`);
  }
});

test('publish.mjs exits 1 on an unknown key without reading anything else', async () => {
  await withWorkspace(async (workspace) => {
    await assert.rejects(
      exec(process.execPath, ['publish.mjs'], {
        cwd: packageDir,
        env: {
          ...process.env,
          RUNNER_TEMP: workspace.directory,
          STREAM_CATALOG_DIR: workspace.catalogDir,
          TEAM_KEY: 'nfl-404',
          TEAM_SPORT: '',
          EVENT_ID: '',
        },
      }),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stdout, /^bad_team: /);
        assert.equal(error.stdout.includes('nfl-404'), false);
        return true;
      },
    );
  });
});
