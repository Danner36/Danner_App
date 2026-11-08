import assert from 'node:assert/strict';
import test from 'node:test';

import { publishStreamsUpdate, readRemoteStreamsDocument } from '../lib/publishGithub.mjs';
import { planStreamUpdate, serializeStreamsDocument } from '../lib/streamsDocument.mjs';

const target = {
  branch: 'main',
  owner: 'owner',
  path: 'streams/ncaa/66.json',
  repo: 'repo',
  token: 'test-token',
};

function entry(id, sport) {
  return {
    sport,
    eventId: String(id),
    gameDates: ['2026-11-07'],
    gameNumbers: [1],
    kind: 'web',
    url: `https://gooz.aapmains.net/new-stream-embed/${id}?ad=111`,
    allowInsecureHttp: false,
    trustedHosts: [],
    source: 'pipeline',
  };
}

// Serves successive versions of the remote file (undefined means 404) and records every PUT.
function fakeGithub(versions, putStatuses) {
  const puts = [];
  let reads = 0;
  const fetchImpl = async (url, init = {}) => {
    if (!init.method || init.method === 'GET') {
      const version = versions[Math.min(reads, versions.length - 1)];
      reads += 1;
      if (!version) {
        return new Response('{}', { status: 404 });
      }
      return new Response(
        JSON.stringify({
          content: Buffer.from(serializeStreamsDocument(version.document)).toString('base64'),
          encoding: 'base64',
          sha: version.sha,
        }),
      );
    }
    const body = JSON.parse(init.body);
    puts.push({ body, document: JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')), sha: body.sha });
    const status = putStatuses[puts.length - 1] ?? 201;
    return new Response(status < 300 ? '{"commit":{"sha":"new"}}' : '{"message":"secret body"}', { status });
  };
  return { fetchImpl, puts };
}

const football = { gameNumber: 1, gamePk: 100, officialDate: '2026-11-07', sport: 'football' };
const basketball = { gameNumber: 1, gamePk: 200, officialDate: '2026-11-07', sport: 'mens-basketball' };
const validation = { sports: ['football', 'mens-basketball'] };
const plan = (game, next) => (document) => planStreamUpdate(document, { entry: next, game, today: '2026-11-07', validation });
const options = { ...target, message: 'm', sleep: async () => {} };

test('publish applies the entry to the remote copy and sends that copy\'s SHA', async () => {
  const remote = { document: { streams: ['marker', entry(100, 'football')] }, sha: 'remote-sha' };
  const github = fakeGithub([remote], [201]);
  const result = await publishStreamsUpdate({
    ...options,
    fallbackDocument: { streams: ['template'] },
    fetchImpl: github.fetchImpl,
    update: plan(basketball, entry(200, 'mens-basketball')),
  });
  assert.equal(result.published, true);
  assert.equal(github.puts[0].sha, 'remote-sha');
  assert.deepEqual(github.puts[0].document.streams, ['marker', entry(100, 'football'), entry(200, 'mens-basketball')]);
});

test('a 404 creates the file from the template with no sha', async () => {
  const github = fakeGithub([undefined], [201]);
  const result = await publishStreamsUpdate({
    ...options,
    fallbackDocument: { schemaVersion: 2, streams: ['template'] },
    fetchImpl: github.fetchImpl,
    update: plan(basketball, entry(200, 'mens-basketball')),
  });
  assert.equal(result.published, true);
  assert.equal('sha' in github.puts[0].body, false);
  assert.deepEqual(github.puts[0].document.streams, ['template', entry(200, 'mens-basketball')]);
});

test('a concurrent create answers 422 and the retry applies on top of the new file', async () => {
  const created = { document: { streams: ['template', entry(100, 'football')] }, sha: 'sha-2' };
  const github = fakeGithub([undefined, created], [422, 201]);
  const result = await publishStreamsUpdate({
    ...options,
    fallbackDocument: { streams: ['template'] },
    fetchImpl: github.fetchImpl,
    update: plan(basketball, entry(200, 'mens-basketball')),
  });
  assert.equal(result.published, true);
  assert.equal(result.attempts, 2);
  assert.deepEqual(github.puts.map((put) => put.sha), [undefined, 'sha-2']);
  assert.equal(github.puts[1].document.streams.length, 3);
});

test('a run that finds a ready entry in the newer copy stops without publishing', async () => {
  const first = { document: { streams: ['marker'] }, sha: 'sha-1' };
  const second = { document: { streams: ['marker', entry(100, 'football')] }, sha: 'sha-2' };
  const github = fakeGithub([first, second], [422]);
  const result = await publishStreamsUpdate({
    ...options,
    fetchImpl: github.fetchImpl,
    update: plan(football, entry(100, 'football')),
  });
  assert.equal(result.published, false);
  assert.equal(result.change.outcome, 'video_ready');
  assert.equal(github.puts.length, 1);
});

test('publishing gives up after three retries with exponential waits', async () => {
  const remote = { document: { streams: ['marker'] }, sha: 'sha' };
  const github = fakeGithub([remote], [409, 422, 409, 409, 201]);
  const waits = [];
  await assert.rejects(
    publishStreamsUpdate({
      ...target,
      fetchImpl: github.fetchImpl,
      message: 'm',
      sleep: async (ms) => waits.push(ms),
      update: plan(basketball, entry(200, 'mens-basketball')),
    }),
    /GitHub publish failed with 409/,
  );
  assert.equal(github.puts.length, 4);
  assert.ok(waits[0] < waits[1] && waits[1] < waits[2]);
});

test('other failures are not retried and GitHub text stays out of the error', async () => {
  const github = fakeGithub([{ document: { streams: [] }, sha: 'sha' }], [500]);
  await assert.rejects(
    publishStreamsUpdate({
      ...options,
      fetchImpl: github.fetchImpl,
      update: plan(basketball, entry(200, 'mens-basketball')),
    }),
    (error) => {
      assert.equal(error.message, 'GitHub publish failed with 500.');
      return true;
    },
  );
  assert.equal(github.puts.length, 1);
});

test('a read of a missing file is undefined and other errors throw', async () => {
  const missing = fakeGithub([undefined], []);
  assert.equal(await readRemoteStreamsDocument({ ...target, fetchImpl: missing.fetchImpl }), undefined);
  await assert.rejects(
    readRemoteStreamsDocument({ ...target, fetchImpl: async () => new Response('', { status: 500 }) }),
    /GitHub read failed with 500/,
  );
});
