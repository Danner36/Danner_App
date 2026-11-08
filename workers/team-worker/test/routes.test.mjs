import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../src/app.js';
import {
  APP_KEY,
  GITHUB_SECRET_TEXT,
  OFFICIAL_DATE,
  PREVIOUS_KEY,
  PROGRESS_KEY,
  START_MS,
  STATUS_KEY,
  bindDurableObjects,
  createWorld,
  espnSummary,
  pipelineEntry,
  statsapiSchedule,
  streamsDocument,
} from './world.mjs';

const MINUTE = 60_000;
const FIELDS = ['code', 'message', 'ok', 'retryAfterSeconds', 'sport', 'team'];

function world(options) {
  const created = createWorld(options);
  created.seedCatalog();
  created.setEspn('401', espnSummary({ state: 'in', name: 'STATUS_IN_PROGRESS' }));
  return created;
}

async function bodyOf(response) {
  return JSON.parse(await response.text());
}

function assertReplyShape(body) {
  assert.deepEqual(Object.keys(body).sort(), FIELDS);
}

// Sends one Get video press from a fresh IP per call so IP limits do not interfere.
let pressCounter = 0;
function freshIp() {
  pressCounter += 1;
  return `198.51.100.${(pressCounter % 250) + 1}`;
}

test('GET /health answers the contract version without touching GitHub', async () => {
  const w = world();
  const response = await w.request('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await bodyOf(response), { contract: 2, ok: true });
  assert.equal(w.calls.length, 0);
});

test('GET /health?deep=1 reports GitHub with one conditional read', async () => {
  const w = world();
  assert.deepEqual(await bodyOf(await w.request('/health?deep=1')), { contract: 2, github: 'ok', ok: true });
  await w.request('/health?deep=1');
  assert.equal(w.callsTo('repo')[1].headers['If-None-Match'], w.repoEtag);
  w.fail('repo', 503);
  assert.deepEqual(await bodyOf(await w.request('/health?deep=1')), { contract: 2, github: 'error', ok: false });
});

test('GET /health?deep=1 reports a missing token and a network failure as errors', async () => {
  const w = world();
  delete w.env.GITHUB_TOKEN;
  assert.equal((await bodyOf(await w.request('/health?deep=1'))).github, 'error');
  assert.equal(w.calls.length, 0);
  w.env.GITHUB_TOKEN = 'x';
  w.fail('repo', 'network');
  assert.equal((await bodyOf(await w.request('/health?deep=1'))).github, 'error');
});

test('anything else answers 404 not_found with the common fields', async () => {
  const w = world();
  for (const [path, options] of [
    ['/nope', {}],
    ['/get-video', { method: 'GET' }],
    ['/streams', { method: 'POST' }],
    ['/health', { method: 'POST' }],
  ]) {
    const response = await w.request(path, options);
    assert.equal(response.status, 404);
    const body = await bodyOf(response);
    assertReplyShape(body);
    assert.equal(body.code, 'not_found');
  }
});

test('GET /catalog serves leagues.json with an ETag and revalidates to 304', async () => {
  const w = world();
  const response = await w.request('/catalog');
  assert.equal(response.status, 200);
  const etag = response.headers.get('ETag');
  assert.match(etag, /^"[0-9a-f]{40}"$/);
  assert.equal((await bodyOf(response)).schemaVersion, 1);

  for (const header of [etag, `W/${etag}`, `"other", ${etag}`, '*']) {
    const again = await w.request('/catalog', { headers: { 'If-None-Match': header } });
    assert.equal(again.status, 304);
    assert.equal(again.headers.get('ETag'), etag);
  }
  const mismatch = await w.request('/catalog', { headers: { 'If-None-Match': '"stale"' } });
  assert.equal(mismatch.status, 200);
});

test('GET /catalog/<league> serves the league file with an ETag', async () => {
  const w = world();
  const response = await w.request('/catalog/nfl');
  assert.equal(response.status, 200);
  assert.ok(response.headers.get('ETag'));
  const body = await bodyOf(response);
  assert.equal(body.league, 'nfl');
  assert.equal(body.teams[0].key, 'nfl-17');
});

test('catalog: bad league keys and unknown leagues answer 400 bad_league', async () => {
  const w = world();
  for (const path of ['/catalog/NFL', '/catalog/n', '/catalog/too-long-a-key', '/catalog/xfl']) {
    const response = await w.request(path);
    assert.equal(response.status, 400);
    assert.equal((await bodyOf(response)).code, 'bad_league');
  }
});

test('catalog: an uncommitted catalog is upstream_error for /catalog and bad_league per league', async () => {
  const w = createWorld();
  const root = await w.request('/catalog');
  assert.equal(root.status, 502);
  assert.equal((await bodyOf(root)).code, 'upstream_error');
  assert.equal((await bodyOf(await w.request('/catalog/nfl'))).code, 'bad_league');
});

test('catalog: failures at the index and blob stages answer 502 with no GitHub text', async () => {
  for (const [stage, failure] of [
    ['catalogIndex', 503],
    ['catalogIndex', 'network'],
    ['catalogIndex', 'garbage'],
    ['blob', 500],
    ['blob', 'network'],
  ]) {
    const w = world();
    w.fail(stage, failure);
    const response = await w.request('/catalog');
    assert.equal(response.status, 502, `${stage} ${failure}`);
    const text = await response.text();
    assert.equal(JSON.parse(text).code, 'upstream_error');
    assert.equal(text.includes(GITHUB_SECRET_TEXT), false);
  }
});

test('catalog: the index refreshes conditionally after 3600 s and blobs stay cached', async () => {
  const w = world();
  await w.request('/catalog');
  await w.request('/catalog');
  assert.equal(w.callsTo('catalogIndex').length, 1);
  assert.equal(w.callsTo('blob').length, 1);
  w.clock.now += 3600 * 1000;
  await w.request('/catalog');
  assert.equal(w.callsTo('catalogIndex').length, 2);
  assert.ok(w.callsTo('catalogIndex')[1].headers['If-None-Match']);
  assert.equal(w.callsTo('blob').length, 1);
});

test('catalog: 500 not_configured without a token; 429 from the read limiter', async () => {
  const w = world();
  delete w.env.GITHUB_TOKEN;
  assert.equal((await w.request('/catalog')).status, 500);
  w.env.GITHUB_TOKEN = 't';
  w.env.READ_LIMITER = { limit: async () => ({ success: false }) };
  const limited = await w.request('/catalog');
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '60');
  assert.equal((await bodyOf(limited)).code, 'rate_limited');
});

test('streams: bad and unknown teams answer 400 bad_team without GitHub stream reads', async () => {
  const w = world();
  for (const path of ['/streams', '/streams?team=NFL-17', '/streams?team=nfl', '/streams?team=nfl-99']) {
    const response = await w.request(path);
    assert.equal(response.status, 400, path);
    assert.equal((await bodyOf(response)).code, 'bad_team');
  }
  assert.equal(w.callsTo('streamsIndex').length, 0);
});

test('streams: an allowlisted team without a file gets the empty document', async () => {
  const w = world();
  const response = await w.request('/streams?team=nfl-17');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Streams-State'), 'empty');
  assert.deepEqual(await bodyOf(response), {
    schemaVersion: 2,
    streams: [],
    team: { key: 'nfl-17', name: 'New England Patriots' },
  });
  const etag = (await w.request('/streams?team=nfl-17')).headers.get('ETag');
  const again = await w.request('/streams?team=nfl-17', { headers: { 'If-None-Match': etag } });
  assert.equal(again.status, 304);
  assert.equal(again.headers.get('X-Streams-State'), 'empty');
});

test('streams: a retired team and a retired-sport school stay valid', async () => {
  const w = world();
  assert.equal((await w.request('/streams?team=ncaa-2')).status, 200);
  assert.equal((await w.request('/streams?team=ncaa-66')).status, 200);
});

test('streams: a file is served raw with its blob SHA as ETag and revalidates', async () => {
  const w = world();
  const text = streamsDocument([pipelineEntry()]);
  w.setStreams('nfl', { '17.json': text });
  const response = await w.request('/streams?team=nfl-17');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), text);
  assert.equal(response.headers.get('X-Streams-State'), null);
  const etag = response.headers.get('ETag');
  const again = await w.request('/streams?team=nfl-17', { headers: { 'If-None-Match': etag } });
  assert.equal(again.status, 304);
  assert.equal(await again.text(), '');
});

test('streams: the league index refreshes every 10 s conditionally and blobs are cached by SHA', async () => {
  const w = world();
  w.setStreams('nfl', { '17.json': streamsDocument([]) });
  await w.request('/streams?team=nfl-17');
  await w.request('/streams?team=nfl-2');
  assert.equal(w.callsTo('streamsIndex').length, 1);
  const blobCalls = w.callsTo('blob').length;

  w.clock.now += 10_000;
  await w.request('/streams?team=nfl-17');
  assert.equal(w.callsTo('streamsIndex').length, 2);
  assert.ok(w.callsTo('streamsIndex')[1].headers['If-None-Match']);
  assert.equal(w.callsTo('blob').length, blobCalls);
});

test('streams: a publish is visible on the next index refresh', async () => {
  const w = world();
  w.setStreams('nfl', { '17.json': streamsDocument([]) });
  await w.request('/streams?team=nfl-17');
  const updated = streamsDocument([pipelineEntry()]);
  w.setStreams('nfl', { '17.json': updated });
  await w.request('/streams?team=nfl-17');
  assert.notEqual(await (await w.request('/streams?team=nfl-17')).text(), updated);
  w.clock.now += 10_000;
  assert.equal(await (await w.request('/streams?team=nfl-17')).text(), updated);
});

test('streams: a missing league folder is cached as empty for 60 s', async () => {
  const w = world();
  await w.request('/streams?team=mlb-5');
  await w.request('/streams?team=mlb-5');
  assert.equal(w.callsTo('streamsIndex').length, 1);
  w.clock.now += 60_000;
  await w.request('/streams?team=mlb-5');
  assert.equal(w.callsTo('streamsIndex').length, 2);
});

test('streams: index or blob failures answer 502 with no GitHub text', async () => {
  for (const [stage, failure] of [
    ['streamsIndex', 500],
    ['streamsIndex', 403],
    ['streamsIndex', 'network'],
    ['streamsIndex', 'garbage'],
    ['blob', 502],
  ]) {
    const w = world();
    w.setStreams('nfl', { '17.json': streamsDocument([]) });
    // The catalog blob must load before the stream blob is asked to fail.
    await w.request('/catalog/nfl');
    w.fail(stage, failure);
    const response = await w.request('/streams?team=nfl-17');
    assert.equal(response.status, 502, `${stage} ${failure}`);
    const text = await response.text();
    assert.equal(JSON.parse(text).code, 'upstream_error');
    assert.equal(text.includes(GITHUB_SECRET_TEXT), false);
  }
});

test('streams: a failed index refresh keeps serving the last good copy', async () => {
  const w = world();
  const text = streamsDocument([pipelineEntry()]);
  w.setStreams('nfl', { '17.json': text });
  await w.request('/streams?team=nfl-17');
  w.clock.now += 10_000;
  w.fail('streamsIndex', 503);
  const response = await w.request('/streams?team=nfl-17');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), text);
});

test('streams: catalog failure answers 502, not bad_team', async () => {
  const w = world();
  w.fail('teamsIndex', 503);
  const response = await w.request('/streams?team=nfl-17');
  assert.equal(response.status, 502);
  assert.equal((await bodyOf(response)).code, 'upstream_error');
});

test('streams: 500 not_configured without a token', async () => {
  const w = world();
  delete w.env.GITHUB_TOKEN;
  const response = await w.request('/streams?team=nfl-17');
  assert.equal(response.status, 500);
  assert.equal((await bodyOf(response)).code, 'not_configured');
});

test('streams: the read limiter binding answers 429 rate_limited with the IP key', async () => {
  const w = world();
  const keys = [];
  w.env.READ_LIMITER = {
    async limit({ key }) {
      keys.push(key);
      return { success: false };
    },
  };
  const response = await w.request('/streams?team=nfl-17');
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
  assert.deepEqual(keys, ['v4:203.0.113.7']);
});

test('reads fall back to a per-isolate limit when the binding is missing or throws', async () => {
  for (const binding of [undefined, { limit: async () => { throw new Error('binding down'); } }]) {
    const w = world();
    if (binding) w.env.READ_LIMITER = binding;
    let last;
    for (let index = 0; index < 121; index += 1) {
      last = await w.request('/streams?team=nfl-17');
    }
    assert.equal(last.status, 429);
    assert.equal((await w.request('/streams?team=nfl-17', { ip: '192.0.2.8' })).status, 200);
    w.clock.now += MINUTE;
    assert.equal((await w.request('/streams?team=nfl-17')).status, 200);
  }
});

test('streams with event add X-Run-State; without event no gate is consulted', async () => {
  const w = world();
  bindDurableObjects(w);
  const plain = await w.request('/streams?team=nfl-17');
  assert.equal(plain.headers.get('X-Run-State'), null);
  assert.equal(w.env.TEAM_GATE.objects.size, 0);
  const none = await w.request('/streams?team=nfl-17&event=401');
  assert.equal(none.headers.get('X-Run-State'), 'none');
  const junk = await w.request('/streams?team=nfl-17&event=abc');
  assert.equal(junk.headers.get('X-Run-State'), 'none');
});

test('get-video: a started press dispatches the plan payload and records queued', async () => {
  const w = world();
  const response = await w.getVideo();
  assert.equal(response.status, 202);
  const body = await bodyOf(response);
  assertReplyShape(body);
  assert.deepEqual([body.ok, body.code, body.team, body.sport], [true, 'started', 'nfl-17', null]);
  assert.deepEqual(w.dispatches, [
    {
      client_payload: {
        eventId: '401',
        origin: 'phone',
        requestedAt: new Date(START_MS).toISOString(),
        team: 'nfl-17',
      },
      event_type: 'team-get-video',
    },
  ]);
  const poll = await w.request('/streams?team=nfl-17&event=401');
  assert.equal(poll.headers.get('X-Run-State'), 'queued');
  assert.deepEqual(JSON.parse(poll.headers.get('X-Run-Progress')), {
    k: 0,
    n: 0,
    step: 'requested',
    updatedSecondsAgo: 0,
  });
  const call = w.callsTo('dispatch')[0];
  assert.equal(call.headers.Authorization, 'Bearer test-github-token');
});

test('get-video: a school sends its sport and the payload carries it', async () => {
  const w = world();
  w.setEspn('401', espnSummary({ state: 'in', teams: ['66', '99'] }));
  const response = await w.getVideo({ sport: 'football', team: 'ncaa-66' });
  assert.equal(response.status, 202);
  assert.equal(w.dispatches[0].client_payload.sport, 'football');
  assert.match(w.callsTo('espn')[0].url, /football\/college-football\/summary\?event=401/);
});

test('get-video: wrong keys answer 401 and make no external call', async () => {
  const w = world();
  for (const appKey of ['wrong', '', 7]) {
    const response = await w.getVideo({ appKey });
    assert.equal(response.status, 401);
    assert.equal((await bodyOf(response)).code, 'unauthorized');
  }
  assert.equal(w.calls.length, 0);
  assert.equal(w.dispatches.length, 0);
});

test('get-video: the key check comes before the catalog', async () => {
  const w = world();
  w.fail('teamsIndex', 503);
  const wrong = await w.getVideo({ appKey: 'wrong', team: 'nfl-99999' });
  assert.equal(wrong.status, 401);
  assert.equal(w.callsTo('teamsIndex').length, 0);
});

test('get-video: wrong keys lock the IP out at the limit, across teams', async () => {
  const w = world();
  w.env.IP_FAILED_KEY_PER_HOUR = 3;
  const ip = freshIp();
  for (const team of ['nfl-17', 'nfl-2', 'ncaa-66']) {
    assert.equal((await w.getVideo({ appKey: 'bad', team }, { ip })).status, 401);
  }
  const locked = await w.getVideo({ appKey: APP_KEY }, { ip });
  assert.equal(locked.status, 429);
  assert.equal(locked.headers.get('Retry-After'), '3600');
  const body = await bodyOf(locked);
  assert.equal(body.code, 'rate_limited');
  assert.equal(body.retryAfterSeconds, 3600);
  assert.equal(w.calls.length, 0);
  assert.equal((await w.getVideo({}, { ip: freshIp() })).status, 202);
});

test('get-video: APP_KEY_PREVIOUS is accepted while set', async () => {
  const w = world();
  w.env.APP_KEY_PREVIOUS = PREVIOUS_KEY;
  assert.equal((await w.getVideo({ appKey: PREVIOUS_KEY })).status, 202);
  w.clock.now += 3 * MINUTE;
  delete w.env.APP_KEY_PREVIOUS;
  assert.equal((await w.getVideo({ appKey: PREVIOUS_KEY }, { ip: freshIp() })).status, 401);
});

test('get-video: bodies that are not JSON objects answer 400 bad_request', async () => {
  const w = world();
  for (const body of ['not json', 'null', '[1]', '"text"', '']) {
    const response = await w.request('/get-video', { body, method: 'POST' });
    assert.equal(response.status, 400, body);
    assert.equal((await bodyOf(response)).code, 'bad_request');
  }
  const oversized = await w.request('/get-video', { body: JSON.stringify({ pad: 'x'.repeat(5000) }), method: 'POST' });
  assert.equal(oversized.status, 400);
});

test('get-video: missing secrets answer 500 not_configured', async () => {
  for (const name of ['APP_KEY', 'RUN_STATUS_KEY', 'GITHUB_TOKEN']) {
    const w = world();
    delete w.env[name];
    const response = await w.getVideo();
    assert.equal(response.status, 500, name);
    assert.equal((await bodyOf(response)).code, 'not_configured');
  }
});

test('get-video: team shape, catalog and sport checks', async () => {
  const w = world();
  const cases = [
    [{ team: 'BAD' }, 400, 'bad_team'],
    [{ team: 'nfl-99999' }, 400, 'bad_team'],
    [{ sport: 'football' }, 400, 'bad_sport'],
    [{ sport: 'Football!', team: 'ncaa-66' }, 400, 'bad_sport'],
    [{ sport: 7, team: 'ncaa-66' }, 400, 'bad_sport'],
    [{ team: 'ncaa-66' }, 400, 'bad_sport'],
    [{ sport: 'mens-tennis', team: 'ncaa-66' }, 400, 'bad_sport'],
  ];
  for (const [fields, status, code] of cases) {
    const response = await w.getVideo(fields, { ip: freshIp() });
    assert.equal(response.status, status, JSON.stringify(fields));
    assert.equal((await bodyOf(response)).code, code);
  }
  assert.equal(w.dispatches.length, 0);
});

test('get-video: a retired sport on a school passes the sport check', async () => {
  const w = world();
  w.setEspn('401', espnSummary({ state: 'in', teams: ['66', '99'] }));
  const response = await w.getVideo({ sport: 'womens-basketball', team: 'ncaa-66' });
  assert.equal(response.status, 202);
  assert.equal(w.dispatches[0].client_payload.sport, 'womens-basketball');
});

test('get-video: malformed event ids answer 400 bad_event before any external call', async () => {
  const w = world();
  for (const eventId of ['', 'abc', '1234567890123', 7]) {
    const response = await w.getVideo({ eventId });
    assert.equal(response.status, 400);
    assert.equal((await bodyOf(response)).code, 'bad_event');
  }
  assert.equal(w.calls.length, 0);
});

test('get-video: catalog failure after a good key answers 502 and dispatches nothing', async () => {
  const w = world();
  w.fail('teamsIndex', 'network');
  const response = await w.getVideo();
  assert.equal(response.status, 502);
  assert.equal((await bodyOf(response)).code, 'upstream_error');
  assert.equal(w.dispatches.length, 0);
});

test('get-video: an event the team does not play in is bad_event and counts nothing', async () => {
  const w = world();
  w.setEspn('401', espnSummary({ teams: ['3', '4'] }));
  const response = await w.getVideo();
  assert.equal(response.status, 400);
  assert.equal((await bodyOf(response)).code, 'bad_event');
  assert.equal(w.dispatches.length, 0);
});

test('get-video: an unknown event id from the provider is bad_event', async () => {
  const w = world();
  const espn = await w.getVideo({ eventId: '999' });
  assert.equal((await bodyOf(espn)).code, 'bad_event');
  const mlb = await w.getVideo({ eventId: '999', team: 'mlb-5' }, { ip: freshIp() });
  assert.equal((await bodyOf(mlb)).code, 'bad_event');
  const bad = await w.getVideo({ eventId: '998' }, { ip: freshIp() });
  assert.equal(bad.status, 400);
});

test('get-video: a finished old game answers 409 not_in_window and counts nothing', async () => {
  const w = world();
  w.setEspn('401', espnSummary({ date: '2026-09-01T18:00:00Z', name: 'STATUS_FINAL', state: 'post' }));
  const response = await w.getVideo();
  assert.equal(response.status, 409);
  const body = await bodyOf(response);
  assert.equal(body.code, 'not_in_window');
  assert.equal(body.ok, false);
  assert.equal(w.dispatches.length, 0);
  const poll = await w.request('/streams?team=nfl-17&event=401');
  assert.equal(poll.headers.get('X-Run-State'), 'none');
  for (let press = 0; press < 12; press += 1) {
    assert.equal((await w.getVideo({}, { ip: freshIp() })).status, 409);
  }
});

test('get-video: window edges are 20 minutes before the start and the end of the grace', async () => {
  const cases = [
    [START_MS - 21 * MINUTE, 409],
    [START_MS - 20 * MINUTE, 202],
    [START_MS, 202],
    [START_MS + 240 * MINUTE, 202],
    [START_MS + 241 * MINUTE, 409],
  ];
  for (const [now, status] of cases) {
    const w = world({ now });
    w.setEspn('401', espnSummary());
    assert.equal((await w.getVideo()).status, status, `at ${now - START_MS}`);
  }
});

test('get-video: MLB uses the 180-minute grace and statsapi team ids', async () => {
  for (const [offset, status] of [[180, 202], [181, 409]]) {
    const w = world({ now: START_MS + offset * MINUTE });
    w.setStatsapi('777', statsapiSchedule());
    const response = await w.getVideo({ eventId: '777', team: 'mlb-5' });
    assert.equal(response.status, status, String(offset));
  }
  const w = world();
  w.setStatsapi('777', statsapiSchedule({ teams: [1, 2] }));
  assert.equal((await bodyOf(await w.getVideo({ eventId: '777', team: 'mlb-5' }))).code, 'bad_event');
  assert.match(w.callsTo('statsapi')[0].url, /schedule\?gamePk=777/);
});

test('get-video: a Live game passes past the grace; finished and interrupted games do not', async () => {
  const beyond = START_MS + 10 * 60 * MINUTE;
  const live = world({ now: beyond });
  live.setEspn('401', espnSummary({ name: 'STATUS_IN_PROGRESS', state: 'in' }));
  assert.equal((await live.getVideo()).status, 202);

  for (const summary of [
    espnSummary({ name: 'STATUS_FINAL', state: 'post' }),
    espnSummary({ name: 'STATUS_POSTPONED', state: 'post' }),
    espnSummary({ name: 'STATUS_SUSPENDED', state: 'in' }),
  ]) {
    const w = world();
    w.setEspn('401', summary);
    assert.equal((await w.getVideo()).status, 409);
  }

  const suspended = world();
  suspended.setStatsapi('777', statsapiSchedule({ abstract: 'Live', detailed: 'Suspended: Rain' }));
  assert.equal((await suspended.getVideo({ eventId: '777', team: 'mlb-5' })).status, 409);
  const tbd = world();
  tbd.setStatsapi('777', statsapiSchedule({ startTimeTBD: true }));
  assert.equal((await tbd.getVideo({ eventId: '777', team: 'mlb-5' })).status, 409);
});

test('get-video: when the event provider does not answer, the check is skipped and gates still apply', async () => {
  for (const [stage, failure, fields] of [
    ['espn', 503, {}],
    ['espn', 'network', {}],
    ['espn', 'garbage', {}],
    ['statsapi', 500, { eventId: '777', team: 'mlb-5' }],
    ['statsapi', 'network', { eventId: '777', team: 'mlb-5' }],
    ['statsapi', 'garbage', { eventId: '777', team: 'mlb-5' }],
  ]) {
    const w = world();
    w.fail(stage, failure);
    const response = await w.getVideo(fields);
    assert.equal(response.status, 202, `${stage} ${failure}`);
    const second = await w.getVideo(fields, { ip: freshIp() });
    assert.equal((await bodyOf(second)).code, 'in_progress');
  }
});

test('get-video: a successful event answer is cached for 60 s', async () => {
  const w = world();
  await w.getVideo();
  await w.getVideo({}, { ip: freshIp() });
  assert.equal(w.callsTo('espn').length, 1);
  w.clock.now += MINUTE;
  await w.getVideo({}, { ip: freshIp() });
  assert.equal(w.callsTo('espn').length, 2);
});

test('get-video: a ready pipeline entry answers 200 video_ready and sends nothing', async () => {
  const w = world();
  w.setStreams('nfl', { '17.json': streamsDocument([pipelineEntry()]) });
  const response = await w.getVideo();
  assert.equal(response.status, 200);
  const body = await bodyOf(response);
  assert.deepEqual([body.ok, body.code], [true, 'video_ready']);
  assert.equal(w.dispatches.length, 0);
});

test('get-video: only an entry the phone would match counts as ready', async () => {
  const entries = [
    pipelineEntry({ gameDates: ['2026-11-01'] }),
    pipelineEntry({ source: undefined }),
    pipelineEntry({ eventId: '999' }),
    pipelineEntry({ url: 'not a url' }),
    pipelineEntry({ kind: 'mystery' }),
  ];
  for (const entry of entries) {
    const w = world();
    w.setStreams('nfl', { '17.json': streamsDocument([entry]) });
    assert.equal((await w.getVideo()).status, 202, JSON.stringify(entry));
  }
  const wrongSport = world();
  wrongSport.setEspn('401', espnSummary({ state: 'in', teams: ['66', '99'] }));
  wrongSport.setStreams('ncaa', { '66.json': streamsDocument([pipelineEntry({ sport: 'mens-basketball' })]) });
  assert.equal((await wrongSport.getVideo({ sport: 'football', team: 'ncaa-66' })).status, 202);
  const rightSport = world();
  rightSport.setEspn('401', espnSummary({ state: 'in', teams: ['66', '99'] }));
  rightSport.setStreams('ncaa', { '66.json': streamsDocument([pipelineEntry({ sport: 'football' })]) });
  assert.equal((await rightSport.getVideo({ sport: 'football', team: 'ncaa-66' })).status, 200);
});

test('get-video: the official date is the New York calendar date of the start', async () => {
  const w = world({ now: Date.parse('2026-11-09T02:30:00Z') });
  w.setEspn('401', espnSummary({ date: '2026-11-09T02:00:00Z', state: 'in' }));
  w.setStreams('nfl', { '17.json': streamsDocument([pipelineEntry({ gameDates: [OFFICIAL_DATE] })]) });
  assert.equal((await w.getVideo()).status, 200);
});

test('get-video: a readiness read failure continues to the gates', async () => {
  const w = world();
  w.fail('streamsIndex', 503);
  assert.equal((await w.getVideo()).status, 202);
});

test('get-video: when the event check is skipped, readiness is skipped and the gates apply', async () => {
  const w = world();
  w.setStreams('nfl', { '17.json': streamsDocument([pipelineEntry()]) });
  w.fail('espn', 503);
  assert.equal((await w.getVideo()).status, 202);
  assert.equal(w.callsTo('streamsIndex').length, 0);
});

test('get-video: cooldown answers 202 in_progress, sends nothing and keeps the run state', async () => {
  const w = world();
  await w.getVideo();
  w.clock.now += MINUTE;
  const response = await w.getVideo({}, { ip: freshIp() });
  assert.equal(response.status, 202);
  const body = await bodyOf(response);
  assert.equal(body.code, 'in_progress');
  assert.equal(body.retryAfterSeconds, 120);
  assert.equal(w.dispatches.length, 1);
});

test('get-video: the IP+team limit answers 429 and counts sports of a school together', async () => {
  const w = world();
  w.setEspn('401', espnSummary({ state: 'in', teams: ['66', '99'] }));
  w.setEspn('402', espnSummary({ state: 'in', teams: ['66', '99'] }));
  w.setEspn('403', espnSummary({ state: 'in', teams: ['66', '99'] }));
  w.setEspn('404', espnSummary({ state: 'in', teams: ['66', '99'] }));
  const ip = freshIp();
  const presses = [
    { eventId: '401', sport: 'football' },
    { eventId: '402', sport: 'mens-basketball' },
    { eventId: '403', sport: 'football' },
  ];
  for (const fields of presses) {
    assert.equal((await w.getVideo({ ...fields, team: 'ncaa-66' }, { ip })).status, 202);
  }
  const limited = await w.getVideo({ eventId: '404', sport: 'football', team: 'ncaa-66' }, { ip });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '600');
  assert.equal((await bodyOf(limited)).code, 'rate_limited');
});

test('get-video: the IP hourly limit answers 429 and releases the team reservation', async () => {
  const w = world();
  w.env.IP_DISPATCH_PER_HOUR = 1;
  w.setEspn('402', espnSummary({ state: 'in', teams: ['17', '2'] }));
  const ip = freshIp();
  assert.equal((await w.getVideo({}, { ip })).status, 202);
  const limited = await w.getVideo({ eventId: '402' }, { ip });
  assert.equal(limited.status, 429);
  assert.equal((await bodyOf(limited)).code, 'rate_limited');
  // The team cooldown for event 402 was not left behind.
  assert.equal((await bodyOf(await w.getVideo({ eventId: '402' }, { ip: freshIp() }))).code, 'started');
});

test('get-video: the per-game cap answers 429 game_limit', async () => {
  const w = world();
  w.env.GAME_DISPATCH_MAX = 2;
  w.env.COOLDOWN_SECONDS = 0;
  assert.equal((await w.getVideo({}, { ip: freshIp() })).status, 202);
  w.clock.now += 1;
  assert.equal((await w.getVideo({}, { ip: freshIp() })).status, 202);
  w.clock.now += 1;
  const limited = await w.getVideo({}, { ip: freshIp() });
  assert.equal(limited.status, 429);
  assert.equal((await bodyOf(limited)).code, 'game_limit');
  assert.ok(limited.headers.get('Retry-After'));
});

test('get-video: the in-flight cap and the global hourly cap answer 503 busy', async () => {
  const inFlight = world();
  inFlight.env.GLOBAL_IN_FLIGHT_MAX = 1;
  inFlight.setEspn('402', espnSummary({ state: 'in' }));
  assert.equal((await inFlight.getVideo({}, { ip: freshIp() })).status, 202);
  const busy = await inFlight.getVideo({ eventId: '402' }, { ip: freshIp() });
  assert.equal(busy.status, 503);
  assert.equal((await bodyOf(busy)).code, 'busy');
  assert.ok(busy.headers.get('Retry-After'));

  const hourly = world();
  hourly.env.GLOBAL_DISPATCH_PER_HOUR = 1;
  hourly.env.GLOBAL_IN_FLIGHT_MAX = 15;
  hourly.setEspn('402', espnSummary({ state: 'in' }));
  assert.equal((await hourly.getVideo({}, { ip: freshIp() })).status, 202);
  assert.equal((await hourly.getVideo({ eventId: '402' }, { ip: freshIp() })).status, 503);
  // The refused press released its team reservation, so a retry is not left in the cooldown.
  hourly.clock.now += 61 * MINUTE;
  assert.equal((await hourly.getVideo({ eventId: '402' }, { ip: freshIp() })).status, 202);
});

test('get-video: a limit of 0 refuses every press', async () => {
  const w = world();
  w.env.GLOBAL_DISPATCH_PER_HOUR = 0;
  assert.equal((await w.getVideo()).status, 503);
  assert.equal(w.dispatches.length, 0);
});

test('get-video: dispatch failures answer 502 and release both reservations', async () => {
  for (const failure of [500, 'network']) {
    const w = world();
    w.env.GLOBAL_IN_FLIGHT_MAX = 1;
    w.env.GAME_DISPATCH_MAX = 1;
    w.fail('dispatch', failure);
    const ip = freshIp();
    const response = await w.getVideo({}, { ip });
    assert.equal(response.status, 502, String(failure));
    const text = await response.text();
    assert.equal(JSON.parse(text).code, 'dispatch_failed');
    assert.equal(text.includes(GITHUB_SECRET_TEXT), false);
    assert.equal((await w.request('/streams?team=nfl-17&event=401')).headers.get('X-Run-State'), 'none');

    w.failures.delete('dispatch');
    const retry = await w.getVideo({}, { ip });
    assert.equal(retry.status, 202, 'cooldown, cap and in-flight slot were released');
  }
});

test('get-video: GitHub detail goes only to the logs, never the app key', async () => {
  const w = world();
  w.fail('dispatch', 500);
  await w.getVideo();
  await w.getVideo({ appKey: 'bad' }, { ip: freshIp() });
  assert.ok(w.logs.join('\n').includes('github dispatch failed'));
  assert.equal(w.logs.join('\n').includes(APP_KEY), false);
  assert.equal(w.logs.join('\n').includes('test-github-token'), false);
});

function brokenNamespace() {
  return {
    get() {
      throw new Error('object unavailable');
    },
    idFromName: (name) => name,
  };
}

// A namespace whose objects work except for the named methods, which throw.
function namespaceFailing(names, base) {
  return {
    get(id) {
      const object = base.get(id);
      return new Proxy(object, {
        get(target, name) {
          return names.includes(name)
            ? () => Promise.reject(new Error('object overloaded'))
            : target[name];
        },
      });
    },
    idFromName: (name) => name,
    objects: base.objects,
  };
}

test('Durable Object bindings carry the gates', async () => {
  const w = world();
  bindDurableObjects(w);
  assert.equal((await w.getVideo()).status, 202);
  assert.equal(w.env.TEAM_GATE.objects.size, 1);
  assert.equal(w.env.GLOBAL_GATE.objects.size, 1);
});

test('a bound Durable Object that fails answers 503 busy and sends nothing', async () => {
  const w = world();
  w.env.TEAM_GATE = brokenNamespace();
  w.env.GLOBAL_GATE = brokenNamespace();
  const response = await w.getVideo();
  assert.equal(response.status, 503);
  assert.equal((await bodyOf(response)).code, 'busy');
  assert.ok(response.headers.get('Retry-After'));
  assert.equal(w.calls.length, 0);
  assert.equal(w.dispatches.length, 0);
});

test('a failed team reserve answers 503 busy and does not fall back per isolate', async () => {
  const w = world();
  bindDurableObjects(w);
  w.env.TEAM_GATE = namespaceFailing(['reserve'], w.env.TEAM_GATE);
  for (let press = 0; press < 3; press += 1) {
    const response = await w.getVideo({}, { ip: freshIp() });
    assert.equal(response.status, 503);
    assert.equal((await bodyOf(response)).code, 'busy');
  }
  assert.equal(w.dispatches.length, 0);
});

test('a failed global reserve answers 503 busy and releases the team reservation', async () => {
  const w = world();
  bindDurableObjects(w);
  const working = w.env.GLOBAL_GATE;
  w.env.GLOBAL_GATE = namespaceFailing(['reserve'], working);
  assert.equal((await w.getVideo({}, { ip: freshIp() })).status, 503);
  assert.equal(w.dispatches.length, 0);
  w.env.GLOBAL_GATE = working;
  assert.equal((await bodyOf(await w.getVideo({}, { ip: freshIp() }))).code, 'started');
});

test('a failed key attempt call answers 503 busy before the key is compared', async () => {
  const w = world();
  bindDurableObjects(w);
  w.env.GLOBAL_GATE = namespaceFailing(['consumeKeyAttempt'], w.env.GLOBAL_GATE);
  const wrong = await w.getVideo({ appKey: 'bad' }, { ip: freshIp() });
  assert.equal(wrong.status, 503);
  assert.equal(w.calls.length, 0);
});

test('a failed refund does not block a correct key', async () => {
  const w = world();
  bindDurableObjects(w);
  w.env.GLOBAL_GATE = namespaceFailing(['refundKeyAttempt'], w.env.GLOBAL_GATE);
  assert.equal((await w.getVideo({}, { ip: freshIp() })).status, 202);
});

for (const [label, bind] of [
  ['Durable Object', bindDurableObjects],
  ['per-isolate', () => {}],
]) {
  test(`a parallel wrong-key burst from one IP stops at the limit (${label})`, async () => {
    const w = world();
    w.env.IP_FAILED_KEY_PER_HOUR = 5;
    bind(w);
    const ip = freshIp();
    const responses = await Promise.all(
      Array.from({ length: 30 }, () => w.getVideo({ appKey: 'bad' }, { ip })),
    );
    const statuses = responses.map((response) => response.status);
    assert.equal(statuses.filter((status) => status === 401).length, 5);
    assert.equal(statuses.filter((status) => status === 429).length, 25);
    assert.equal(w.calls.length, 0);
  });
}

test('correct keys refund their attempt, so they do not use up the limit', async () => {
  const w = world();
  w.env.IP_FAILED_KEY_PER_HOUR = 2;
  w.env.IP_TEAM_DISPATCH_PER_10_MIN = 99;
  bindDurableObjects(w);
  const ip = freshIp();
  for (let press = 0; press < 4; press += 1) {
    const response = await w.getVideo({}, { ip });
    assert.notEqual(response.status, 429, `press ${press}`);
    w.clock.now += 181_000;
  }
});

function flush() {
  return new Promise((resolve) => setImmediate(resolve)).then(
    () => new Promise((resolve) => setImmediate(resolve)),
  );
}

async function settle(rounds = 8) {
  for (let round = 0; round < rounds; round += 1) {
    await flush();
  }
}

for (const stage of ['teamsIndex', 'blob']) {
  test(`a shared ${stage} read older than the timeout is replaced by a fresh read`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const w = world();
    w.fail(stage, 'hang');
    const first = w.request('/catalog/nfl');
    await settle();
    const callsBefore = w.callsTo(stage).length;
    assert.equal(callsBefore, 1);

    w.failures.delete(stage);
    w.clock.now += 8000;
    const second = await w.request('/catalog/nfl');
    assert.equal(second.status, 200);
    assert.equal(w.callsTo(stage).length, 2);

    t.mock.timers.tick(8000);
    await settle();
    assert.ok((await first).status > 0, 'the request tied to the hung read still ends');
  });
}

test('a read younger than the timeout is shared, and every waiter ends at its own timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = world();
  w.fail('teamsIndex', 'hang');
  const first = w.request('/catalog/nfl');
  await settle();
  w.clock.now += 7999;
  const second = w.request('/catalog/nfl');
  await settle();
  assert.equal(w.callsTo('teamsIndex').length, 1);

  t.mock.timers.tick(8000);
  await settle();
  for (const pending of [first, second]) {
    const response = await pending;
    assert.equal(response.status, 502);
    assert.equal((await bodyOf(response)).code, 'upstream_error');
  }
});

test('a timed-out wait on an index refresh serves the last good copy', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = world();
  const text = streamsDocument([pipelineEntry()]);
  w.setStreams('nfl', { '17.json': text });
  await w.request('/streams?team=nfl-17');
  w.clock.now += 10_000;
  w.fail('streamsIndex', 'hang');
  const pending = w.request('/streams?team=nfl-17');
  await settle();
  t.mock.timers.tick(8000);
  await settle();
  const response = await pending;
  assert.equal(response.status, 200);
  assert.equal(await response.text(), text);
});

test('a late result from a replaced read does not clear the newer one', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = world();
  const realFetch = w.fetch;
  let releaseOld;
  let answered = 0;
  const gate = new Promise((resolve) => { releaseOld = resolve; });
  w.app = createApp({
    fetchImpl: async (url, init) => {
      if (new URL(url).pathname.endsWith('/contents/catalog/teams')) {
        answered += 1;
        if (answered === 1) {
          await gate;
        }
      }
      return realFetch(url, init);
    },
    log: () => {},
    now: () => w.clock.now,
  });
  const first = w.request('/catalog/nfl');
  await settle();
  w.clock.now += 8000;
  await w.request('/catalog/nfl');
  assert.equal(answered, 2);
  releaseOld();
  await settle();
  assert.equal((await first).status, 200);
});

for (const failure of ['stalled-body', 'hang']) {
  test(`streams: a blob read that stalls (${failure}) answers 502 upstream_error`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const w = world();
    w.setStreams('nfl', { '17.json': streamsDocument([]) });
    await w.request('/catalog/nfl');
    w.fail('blob', failure);
    const pending = w.request('/streams?team=nfl-17');
    await settle();
    t.mock.timers.tick(8000);
    await settle();
    const response = await pending;
    assert.equal(response.status, 502);
    assert.equal((await bodyOf(response)).code, 'upstream_error');
  });
}

test('get-video: a streams blob body that stalls continues to the gates', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = world();
  w.setStreams('nfl', { '17.json': streamsDocument([pipelineEntry()]) });
  await w.request('/catalog');
  await w.request('/catalog/nfl');
  w.fail('blob', 'stalled-body');
  const pending = w.getVideo();
  await settle();
  t.mock.timers.tick(8000);
  await settle();
  const response = await pending;
  assert.equal(response.status, 202);
  assert.equal((await bodyOf(response)).code, 'started');
});

function endlessBody(track) {
  return new ReadableStream({
    pull(controller) {
      track.pulls += 1;
      controller.enqueue(new Uint8Array(1024));
    },
    cancel() {
      track.cancelled = true;
    },
  });
}

for (const [path, status, code] of [
  ['/get-video', 400, 'bad_request'],
  ['/run-status', 401, 'bad_signature'],
  ['/run-progress', 401, 'bad_signature'],
]) {
  test(`${path}: a chunked body with no Content-Length is cut off at the limit`, async () => {
    const w = world();
    const track = { cancelled: false, pulls: 0 };
    const response = await w.request(path, { body: endlessBody(track), method: 'POST' });
    assert.equal(response.status, status);
    assert.equal((await bodyOf(response)).code, code);
    assert.equal(track.cancelled, true);
    assert.ok(track.pulls <= 8, `read stopped early (${track.pulls} pulls)`);
  });
}

test('a body at the limit in chunks is accepted and over it is refused', async () => {
  const w = world();
  const fields = JSON.stringify({ appKey: APP_KEY, eventId: '401', pad: 'x', team: 'nfl-17' });
  const atLimit = fields.replace('"pad":"x"', `"pad":"${'x'.repeat(4096 - fields.length + 1)}"`);
  const chunked = (text) =>
    new ReadableStream({
      start(controller) {
        const bytes = new TextEncoder().encode(text);
        for (let offset = 0; offset < bytes.length; offset += 500) {
          controller.enqueue(bytes.slice(offset, offset + 500));
        }
        controller.close();
      },
    });
  assert.equal(new TextEncoder().encode(atLimit).length, 4096);
  assert.equal((await w.request('/get-video', { body: chunked(atLimit), method: 'POST' })).status, 202);
  const over = await w.request('/get-video', {
    body: chunked(atLimit.replace('"pad":"', '"pad":"y')),
    ip: freshIp(),
    method: 'POST',
  });
  assert.equal(over.status, 400);
});

test('a target with a global cap of 0 stops at busy after the key, catalog and window checks', async () => {
  const w = world();
  // `--var` delivers the override as text.
  w.env.GLOBAL_DISPATCH_PER_HOUR = '0';
  bindDurableObjects(w);
  assert.equal((await w.getVideo({ appKey: 'bad' }, { ip: freshIp() })).status, 401);
  assert.equal((await w.getVideo({ team: 'nfl-99999' }, { ip: freshIp() })).status, 400);
  w.setEspn('500', espnSummary({ date: '2026-09-01T18:00:00Z', name: 'STATUS_FINAL', state: 'post' }));
  assert.equal((await bodyOf(await w.getVideo({ eventId: '500' }, { ip: freshIp() }))).code, 'not_in_window');

  for (let press = 0; press < 3; press += 1) {
    const response = await w.getVideo({}, { ip: freshIp() });
    assert.equal(response.status, 503);
    assert.equal((await bodyOf(response)).code, 'busy');
    w.clock.now += 1000;
  }
  assert.equal(w.callsTo('dispatch').length, 0);
  assert.equal((await bodyOf(await w.request('/health?deep=1'))).ok, true);
});

test('without Durable Object bindings the same limits apply per isolate', async () => {
  const w = world();
  w.env.GAME_DISPATCH_MAX = 1;
  w.env.COOLDOWN_SECONDS = 0;
  assert.equal((await w.getVideo()).status, 202);
  w.clock.now += 1;
  assert.equal((await bodyOf(await w.getVideo({}, { ip: freshIp() }))).code, 'game_limit');
});

test('run-status: a signed report stores the code, frees the slot and answers 204', async () => {
  const w = world();
  w.env.GLOBAL_IN_FLIGHT_MAX = 1;
  w.setEspn('402', espnSummary({ state: 'in' }));
  await w.getVideo();
  const refused = await w.getVideo({ eventId: '402' }, { ip: freshIp() });
  assert.equal(refused.status, 503);

  const response = await w.signed(
    '/run-status',
    { code: 'no_video', eventId: '401', runId: 123, team: 'nfl-17' },
    STATUS_KEY,
  );
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
  const poll = await w.request('/streams?team=nfl-17&event=401');
  assert.equal(poll.headers.get('X-Run-State'), 'no_video');
  assert.equal((await w.getVideo({ eventId: '402' }, { ip: freshIp() })).status, 202);
});

test('run-status: a replayed report does not free a second slot', async () => {
  const w = world();
  w.env.GLOBAL_IN_FLIGHT_MAX = 2;
  w.setEspn('402', espnSummary({ state: 'in' }));
  w.setEspn('403', espnSummary({ state: 'in' }));
  await w.getVideo();
  w.clock.now += 181_000;
  await w.getVideo({}, { ip: freshIp() });
  const report = { code: 'no_video', eventId: '401', runId: '555', team: 'nfl-17' };
  await w.signed('/run-status', report, STATUS_KEY);
  await w.signed('/run-status', report, STATUS_KEY);
  assert.equal((await w.getVideo({ eventId: '402' }, { ip: freshIp() })).status, 202);
  assert.equal((await w.getVideo({ eventId: '403' }, { ip: freshIp() })).status, 503);
});

test('run-status: bad signatures, stale reports and malformed bodies are refused', async () => {
  const w = world();
  const report = { code: 'published', eventId: '401', runId: 1, team: 'nfl-17' };
  const cases = [
    [{ signature: 'deadbeef' }, 401, 'bad_signature'],
    [{ at: START_MS - 301_000 }, 401, 'bad_signature'],
    [{ at: START_MS + 301_000 }, 401, 'bad_signature'],
  ];
  for (const [options, status, code] of cases) {
    const response = await w.signed('/run-status', report, STATUS_KEY, options);
    assert.equal(response.status, status);
    assert.equal((await bodyOf(response)).code, code);
  }
  assert.equal((await w.signed('/run-status', report, 'other-key')).status, 401);
  assert.equal((await w.signed('/run-status', report, PROGRESS_KEY)).status, 401, 'progress key cannot report');

  const unsigned = await w.request('/run-status', { body: JSON.stringify(report), method: 'POST' });
  assert.equal(unsigned.status, 401);

  for (const fields of [
    { ...report, team: 'BAD' },
    { ...report, eventId: 'x' },
    { ...report, runId: 'abc' },
    { ...report, code: 'Bad Code' },
  ]) {
    const response = await w.signed('/run-status', fields, STATUS_KEY);
    assert.equal(response.status, 400, JSON.stringify(fields));
    assert.equal((await bodyOf(response)).code, 'bad_request');
  }
  assert.equal((await w.request('/streams?team=nfl-17&event=401')).headers.get('X-Run-State'), 'none');
});

const SIGNED_REPORTS = [
  ['/run-status', { code: 'no_video', eventId: '401', runId: 1 }, STATUS_KEY],
  ['/run-progress', { eventId: '401', k: 1, n: 2, runId: 1, step: 'source_start' }, PROGRESS_KEY],
];

for (const [path, report, key] of SIGNED_REPORTS) {
  test(`${path}: a signed report for a team outside the catalog creates no object`, async () => {
    const w = world();
    bindDurableObjects(w);
    const response = await w.signed(path, { ...report, team: 'nfl-99999' }, key);
    assert.equal(response.status, 400);
    const body = await bodyOf(response);
    assert.equal(body.code, 'bad_request');
    assertReplyShape(body);
    assert.equal(w.env.TEAM_GATE.objects.size, 0);
    assert.equal(w.env.GLOBAL_GATE.objects.size, 0);
    assert.equal((await w.signed(path, { ...report, team: 'zzz-1' }, key)).status, 400);
    assert.equal(w.env.TEAM_GATE.objects.size, 0);
  });

  test(`${path}: an unreadable catalog answers 502 and writes nothing`, async () => {
    const w = world();
    bindDurableObjects(w);
    w.fail('teamsIndex', 503);
    const response = await w.signed(path, { ...report, team: 'nfl-17' }, key);
    assert.equal(response.status, 502);
    assert.equal((await bodyOf(response)).code, 'upstream_error');
    assert.equal(w.env.TEAM_GATE.objects.size, 0);
    assert.equal(w.env.GLOBAL_GATE.objects.size, 0);
  });

  test(`${path}: a retired catalog team is still accepted, and a bad signature reads no catalog`, async () => {
    const w = world();
    bindDurableObjects(w);
    assert.equal((await w.signed(path, { ...report, team: 'nfl-99999' }, 'wrong-key')).status, 401);
    assert.equal(w.callsTo('teamsIndex').length, 0);
    assert.equal((await w.signed(path, { ...report, sport: 'football', team: 'ncaa-2' }, key)).status, 204);
    assert.equal(w.env.TEAM_GATE.objects.size, 1);
  });

  test(`${path}: a missing token answers 500 not_configured`, async () => {
    const w = world();
    delete w.env.GITHUB_TOKEN;
    const response = await w.signed(path, { ...report, team: 'nfl-17' }, key);
    assert.equal(response.status, 500);
    assert.equal((await bodyOf(response)).code, 'not_configured');
  });
}

test('run-status: at may be ISO text, seconds or milliseconds, and the signature may carry a prefix', async () => {
  const w = world();
  const report = { code: 'published', eventId: '401', team: 'nfl-17' };
  const stamps = [new Date(START_MS).toISOString(), Math.floor(START_MS / 1000), START_MS];
  for (const [index, at] of stamps.entries()) {
    const response = await w.signed('/run-status', { ...report, runId: index + 1 }, STATUS_KEY, { at });
    assert.equal(response.status, 204, String(at));
  }
  const body = JSON.stringify({ ...report, at: START_MS, runId: 9 });
  const { createHmac } = await import('node:crypto');
  const digest = createHmac('sha256', STATUS_KEY).update(body).digest('hex');
  const prefixed = await w.request('/run-status', {
    body,
    headers: { 'X-Signature': `sha256=${digest}` },
    method: 'POST',
  });
  assert.equal(prefixed.status, 204);
});

test('run-status: a missing key answers 500 not_configured', async () => {
  const w = world();
  delete w.env.RUN_STATUS_KEY;
  const response = await w.signed('/run-status', {}, 'x');
  assert.equal(response.status, 500);
  assert.equal((await bodyOf(response)).code, 'not_configured');
});

test('run-progress: a signed step is visible next to the run state and frees nothing', async () => {
  const w = world();
  w.env.GLOBAL_IN_FLIGHT_MAX = 1;
  w.setEspn('402', espnSummary({ state: 'in' }));
  await w.getVideo();
  const response = await w.signed(
    '/run-progress',
    { eventId: '401', k: 2, n: 3, runId: 7, sport: 'football', step: 'source_start', team: 'nfl-17' },
    PROGRESS_KEY,
  );
  assert.equal(response.status, 204);
  w.clock.now += 5000;
  const poll = await w.request('/streams?team=nfl-17&event=401');
  assert.equal(poll.headers.get('X-Run-State'), 'queued');
  assert.deepEqual(JSON.parse(poll.headers.get('X-Run-Progress')), {
    k: 2,
    n: 3,
    step: 'source_start',
    updatedSecondsAgo: 5,
  });
  assert.equal((await w.getVideo({ eventId: '402' }, { ip: freshIp() })).status, 503, 'slot still held');
});

test('run-progress: cannot set a final code and refuses bad signatures and fields', async () => {
  const w = world();
  const base = { eventId: '401', k: 1, n: 2, runId: 1, step: 'found', team: 'nfl-17' };
  assert.equal((await w.signed('/run-progress', base, STATUS_KEY)).status, 401, 'status key cannot sign');
  assert.equal((await w.signed('/run-progress', base, PROGRESS_KEY, { at: START_MS - 301_000 })).status, 401);
  for (const fields of [
    { ...base, step: 'published' },
    { ...base, step: 'requested' },
    { ...base, k: 0 },
    { ...base, k: 3 },
    { ...base, n: 21 },
    { ...base, k: 1.5 },
    { ...base, eventId: 'x' },
  ]) {
    const response = await w.signed('/run-progress', fields, PROGRESS_KEY);
    assert.equal(response.status, 400, JSON.stringify(fields));
  }
  assert.equal((await w.signed('/run-progress', base, PROGRESS_KEY)).status, 204);
  assert.equal((await w.request('/streams?team=nfl-17&event=401')).headers.get('X-Run-State'), 'none');
});

test('run-progress: a missing key answers 500 not_configured', async () => {
  const w = world();
  delete w.env.RUN_PROGRESS_KEY;
  const response = await w.signed('/run-progress', {}, 'x');
  assert.equal(response.status, 500);
});

test('a final code from a signed report ends the poll loop states the phone reads', async () => {
  const w = world();
  await w.getVideo();
  const codes = ['no_video', 'sources_unreachable', 'ambiguous_link', 'deadline', 'too_early', 'game_over', 'no_game'];
  for (const [index, code] of codes.entries()) {
    const response = await w.signed('/run-status', { code, eventId: '401', runId: index + 1, team: 'nfl-17' }, STATUS_KEY);
    assert.equal(response.status, 204);
    assert.equal((await w.request('/streams?team=nfl-17&event=401')).headers.get('X-Run-State'), code);
  }
});

test('unexpected internal errors answer a JSON 500 instead of an HTML page', async () => {
  const w = world();
  w.env.READ_LIMITER = {
    get limit() {
      throw new Error('boom');
    },
  };
  const response = await w.request('/streams?team=nfl-17');
  assert.equal(response.status, 500);
  assert.equal((await bodyOf(response)).code, 'internal_error');
});
