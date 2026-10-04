import assert from 'node:assert/strict';
import test from 'node:test';

import { publishStreamsUpdate } from './lib/publishGithub.mjs';
import { planStreamUpdate, serializeStreamsDocument } from './lib/streamsDocument.mjs';

const target = {
  branch: 'main',
  owner: 'Danner36',
  path: 'cyclones_streams.json',
  repo: 'Danner_App',
  token: 'test-token',
};

function goozEntry(gameDates, id, sport) {
  return {
    gameDates,
    gameNumbers: [1],
    kind: 'web',
    url: `https://gooz.aapmains.net/new-stream-embed/${id}?ad=111`,
    allowInsecureHttp: false,
    trustedHosts: [],
    sport,
  };
}

// Serves successive versions of the remote file and records every PUT.
function fakeGithub(versions, putStatuses) {
  const puts = [];
  let reads = 0;
  const fetchImpl = async (url, init = {}) => {
    if (!init.method || init.method === 'GET') {
      const version = versions[Math.min(reads, versions.length - 1)];
      reads += 1;
      return new Response(
        JSON.stringify({
          content: Buffer.from(serializeStreamsDocument(version.document)).toString('base64'),
          encoding: 'base64',
          sha: version.sha,
        }),
        { status: 200 },
      );
    }
    const body = JSON.parse(init.body);
    puts.push({
      document: JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')),
      sha: body.sha,
    });
    const status = putStatuses[puts.length - 1] ?? 201;
    return new Response(JSON.stringify(status < 300 ? { commit: { sha: 'new' } } : { message: 'conflict' }), {
      status,
    });
  };
  return { fetchImpl, puts, reads: () => reads };
}

const footballGame = { gameNumber: 1, officialDate: '2026-11-07', sport: 'football' };
const basketballGame = { gameNumber: 1, officialDate: '2026-11-07', sport: 'mens-basketball' };
const basketballEntry = goozEntry(['2026-11-07'], 200, 'mens-basketball');
const plan = (game, entry) => (document) =>
  planStreamUpdate(document, { entry, game, requireSport: true, today: '2026-11-07' });

test('publish applies the entry to the remote copy and sends that copy\'s SHA', async () => {
  const remote = {
    document: { streams: ['marker', goozEntry(['2026-11-07'], 100, 'football')] },
    sha: 'remote-sha',
  };
  const github = fakeGithub([remote], [201]);
  const result = await publishStreamsUpdate({
    ...target,
    fallbackDocument: { streams: ['stale checkout'] },
    fetchImpl: github.fetchImpl,
    message: 'cyclones: update stream for 2026-11-07 game 1',
    sleep: async () => {},
    update: plan(basketballGame, basketballEntry),
  });
  assert.equal(result.published, true);
  assert.equal(github.puts.length, 1);
  assert.equal(github.puts[0].sha, 'remote-sha');
  assert.deepEqual(github.puts[0].document.streams, [
    'marker',
    goozEntry(['2026-11-07'], 100, 'football'),
    basketballEntry,
  ]);
});

test('a conflict re-reads the file and re-applies the change on top of the newer copy', async () => {
  const first = { document: { streams: ['marker'] }, sha: 'sha-1' };
  const football = goozEntry(['2026-11-07'], 100, 'football');
  const second = { document: { streams: ['marker', football] }, sha: 'sha-2' };
  const github = fakeGithub([first, second], [409, 201]);
  const waits = [];
  const result = await publishStreamsUpdate({
    ...target,
    fetchImpl: github.fetchImpl,
    message: 'm',
    sleep: async (ms) => {
      waits.push(ms);
    },
    update: plan(basketballGame, basketballEntry),
  });
  assert.equal(result.published, true);
  assert.equal(result.attempts, 2);
  assert.deepEqual(github.puts.map((put) => put.sha), ['sha-1', 'sha-2']);
  assert.deepEqual(github.puts[1].document.streams, ['marker', football, basketballEntry]);
  assert.equal(waits.length, 1);
});

test('a run that finds a ready entry in the newer copy stops without publishing', async () => {
  const first = { document: { streams: ['marker'] }, sha: 'sha-1' };
  const ready = goozEntry(['2026-11-07'], 100, 'football');
  const second = { document: { streams: ['marker', ready] }, sha: 'sha-2' };
  const github = fakeGithub([first, second], [422]);
  const result = await publishStreamsUpdate({
    ...target,
    fetchImpl: github.fetchImpl,
    message: 'm',
    sleep: async () => {},
    update: plan(footballGame, goozEntry(['2026-11-07'], 300, 'football')),
  });
  assert.equal(result.published, false);
  assert.equal(result.change.outcome, 'video_ready');
  assert.equal(github.puts.length, 1);
});

test('publishing gives up after three retries', async () => {
  const remote = { document: { streams: ['marker'] }, sha: 'sha' };
  const github = fakeGithub([remote], [409, 422, 409, 409, 201]);
  const waits = [];
  await assert.rejects(
    publishStreamsUpdate({
      ...target,
      fetchImpl: github.fetchImpl,
      message: 'm',
      sleep: async (ms) => {
        waits.push(ms);
      },
      update: plan(basketballGame, basketballEntry),
    }),
    /GitHub publish failed with 409/,
  );
  assert.equal(github.puts.length, 4);
  assert.equal(waits.length, 3);
  assert.ok(waits[0] < waits[1] && waits[1] < waits[2]);
});

test('other failures are not retried', async () => {
  const remote = { document: { streams: ['marker'] }, sha: 'sha' };
  const github = fakeGithub([remote], [500]);
  await assert.rejects(
    publishStreamsUpdate({
      ...target,
      fetchImpl: github.fetchImpl,
      message: 'm',
      sleep: async () => {},
      update: plan(basketballGame, basketballEntry),
    }),
    /GitHub publish failed with 500/,
  );
  assert.equal(github.puts.length, 1);
});
