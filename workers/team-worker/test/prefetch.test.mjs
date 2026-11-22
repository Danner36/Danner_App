import assert from 'node:assert/strict';
import test from 'node:test';

import { GOOZ_HOST } from '../../../scripts/stream-pipeline/lib/extract/providers.mjs';
import { DEMAND_HALF_LIFE_MS, GlobalGateCore, MemoryStorage, TeamGateCore, readLimits } from '../src/gates.js';
import { compactGames, gamesInPrefetchWindow, readPrefetchSettings, scheduleIsStale } from '../src/prefetch.js';
import {
  APP_KEY,
  OFFICIAL_DATE,
  PROGRESS_KEY,
  START_MS,
  STATUS_KEY,
  bindDurableObjects,
  createWorld,
  espnScheduleEvent,
  espnSummary,
  pipelineEntry,
  streamsDocument,
} from './world.mjs';

const MINUTE = 60_000;
const PLAYER_URL = `https://${GOOZ_HOST}/new-stream-embed/123456`;

function world(options) {
  const created = createWorld(options);
  created.seedCatalog();
  created.setEspn('401', espnSummary({ state: 'in', name: 'STATUS_IN_PROGRESS' }));
  bindDurableObjects(created);
  return created;
}

function candidate(overrides = {}) {
  return {
    entry: pipelineEntry({ url: PLAYER_URL }),
    eventId: '401',
    game: { eventId: '401', gameNumber: 1, officialDate: OFFICIAL_DATE },
    outcome: 'found',
    schemaVersion: 1,
    team: 'nfl-17',
    ...overrides,
  };
}

function handEntry(w, fields = {}) {
  return w.signed('/run-entry', { candidate: candidate(), eventId: '401', runId: 555, team: 'nfl-17', ...fields }, PROGRESS_KEY);
}

async function streamsFor(w, event = '401') {
  const response = await w.request(`/streams?team=nfl-17&event=${event}`);
  return { body: JSON.parse(await response.text()), response };
}

// --- Early entry hand-off -------------------------------------------------------------------

test('run-entry: a running game takes a checked entry and /streams serves it before publish', async () => {
  const w = world();
  w.setStreams('nfl', { '17.json': streamsDocument([]) });
  assert.equal((await w.getVideo()).status, 202);

  assert.equal((await handEntry(w)).status, 204);
  const { body, response } = await streamsFor(w);
  assert.equal(response.headers.get('X-Streams-State'), 'early');
  assert.match(response.headers.get('ETag'), /^"early-[0-9a-f]{32}"$/);
  assert.deepEqual(body.streams.at(-1), pipelineEntry({ url: PLAYER_URL }));
  assert.equal(body.streams.length, 3, 'the file entries stay and the early entry is appended');

  // Revalidation works on the merged body.
  const etag = response.headers.get('ETag');
  const again = await w.request('/streams?team=nfl-17&event=401', { headers: { 'If-None-Match': etag } });
  assert.equal(again.status, 304);
});

test('run-entry: the early entry also fills a team with no streams file yet', async () => {
  const w = world();
  await w.getVideo();
  assert.equal((await handEntry(w)).status, 204);
  const { body, response } = await streamsFor(w);
  assert.equal(response.headers.get('X-Streams-State'), 'early');
  assert.equal(body.streams.length, 1);
});

test('run-entry: once the file holds a ready entry, the file is served unchanged', async () => {
  const w = world();
  w.setStreams('nfl', { '17.json': streamsDocument([]) });
  await w.getVideo();
  await handEntry(w);
  w.setStreams('nfl', { '17.json': streamsDocument([pipelineEntry({ url: PLAYER_URL })]) });
  w.clock.now += 11_000;
  const { response } = await streamsFor(w);
  assert.equal(response.headers.get('X-Streams-State'), null);
  assert.match(response.headers.get('ETag'), /^"[0-9a-f]{40}"$/);
});

test('run-entry: refused without a started run, for a failing entry, a bad signature or bad fields', async () => {
  const w = world();
  assert.equal((await handEntry(w)).status, 409, 'no run was started');
  assert.equal((await streamsFor(w)).response.headers.get('X-Streams-State'), 'empty');

  await w.getVideo();
  const bad = [
    { candidate: candidate({ entry: pipelineEntry({ url: 'https://player.example.invalid/embed/1' }) }) },
    { candidate: candidate({ team: 'nfl-2' }) },
    { candidate: candidate({ eventId: '402' }) },
    { candidate: candidate({ game: { eventId: '401', gameNumber: 0, officialDate: OFFICIAL_DATE } }) },
    { candidate: candidate({ entry: { ...pipelineEntry({ url: PLAYER_URL }), sport: 'football' } }) },
    { sport: 'football' },
  ];
  for (const fields of bad) {
    assert.equal((await handEntry(w, fields)).status, 400, JSON.stringify(fields).slice(0, 80));
  }
  assert.equal((await handEntry(w, { candidate: 'nope' })).status, 400);
  assert.equal((await handEntry(w, { team: 'nfl-999' })).status, 400, 'unknown team');
  const forged = await w.signed('/run-entry', { candidate: candidate(), eventId: '401', runId: 1, team: 'nfl-17' }, STATUS_KEY);
  assert.equal(forged.status, 401, 'the status key cannot hand over entries');
  const stale = await w.signed(
    '/run-entry',
    { candidate: candidate(), eventId: '401', runId: 1, team: 'nfl-17' },
    PROGRESS_KEY,
    { at: w.clock.now - 10 * MINUTE },
  );
  assert.equal(stale.status, 401);
  assert.equal((await streamsFor(w)).response.headers.get('X-Streams-State'), 'empty');
});

test('run-entry: publish refusing the entry with invalid_entry withdraws it', async () => {
  const w = world();
  await w.getVideo();
  await handEntry(w);
  const report = await w.signed('/run-status', { code: 'invalid_entry', eventId: '401', runId: 555, team: 'nfl-17' }, STATUS_KEY);
  assert.equal(report.status, 204);
  assert.equal((await streamsFor(w)).response.headers.get('X-Streams-State'), 'empty');
});

test('run-entry: the early entry expires with the run state', async () => {
  const w = world();
  await w.getVideo();
  await handEntry(w);
  w.clock.now += 31 * MINUTE;
  assert.equal((await streamsFor(w)).response.headers.get('X-Streams-State'), 'empty');
});

// --- Published refresh ------------------------------------------------------------------------

test('streams: after a run publishes, the folder index is re-read within 2 s instead of 10 s', async () => {
  const w = world();
  w.setStreams('nfl', { '17.json': streamsDocument([]) });
  await w.getVideo();
  await streamsFor(w);
  const before = w.callsTo('streamsIndex').length;
  await w.signed('/run-status', { code: 'published', eventId: '401', runId: 9, team: 'nfl-17' }, STATUS_KEY);
  w.setStreams('nfl', { '17.json': streamsDocument([pipelineEntry({ url: PLAYER_URL })]) });
  w.clock.now += 3_000;
  const { body } = await streamsFor(w);
  assert.equal(w.callsTo('streamsIndex').length, before + 1);
  assert.equal(body.streams.at(-1).url, PLAYER_URL);

  // A read without the event keeps the normal 10 s cache.
  await w.request('/streams?team=nfl-17');
  assert.equal(w.callsTo('streamsIndex').length, before + 1);
});

// --- Demand ranking ---------------------------------------------------------------------------

test('demand: each keyed press counts once per event and IP and ranks teams and sports', async () => {
  const w = world();
  w.setEspn('501', espnSummary({ teams: ['66', '9'] }));
  await w.getVideo({}, { ip: '198.51.100.1' });
  await w.getVideo({}, { ip: '198.51.100.1' });
  await w.getVideo({}, { ip: '198.51.100.2' });
  await w.getVideo({ eventId: '501', sport: 'mens-basketball', team: 'ncaa-66' }, { ip: '198.51.100.3' });
  await w.getVideo({ appKey: 'wrong' }, { ip: '198.51.100.4' });

  const response = await w.request('/demand', { headers: { 'X-App-Key': APP_KEY } });
  assert.equal(response.status, 200);
  const body = JSON.parse(await response.text());
  assert.deepEqual(
    body.teams.map(({ score, sport, team }) => ({ score, sport, team })),
    [
      { score: 2, sport: undefined, team: 'nfl-17' },
      { score: 1, sport: 'mens-basketball', team: 'ncaa-66' },
    ],
  );
  assert.deepEqual(body.sports, [
    { league: 'nfl', score: 2 },
    { league: 'ncaa', score: 1, sport: 'mens-basketball' },
  ]);
  assert.equal(body.prefetchTopTeams, 10);
});

test('demand: a bad event does not count, and the list needs the app key', async () => {
  const w = world();
  w.setEspn('777', espnSummary({ teams: ['5', '6'] }));
  await w.getVideo({ eventId: '777' });
  assert.equal((await w.request('/demand')).status, 401);
  assert.equal((await w.request('/demand', { headers: { 'X-App-Key': 'wrong' } })).status, 401);
  const body = JSON.parse(await (await w.request('/demand', { headers: { 'X-App-Key': APP_KEY } })).text());
  assert.deepEqual(body.teams, []);
});

test('demand: scores halve every 14 days and the sweep drops faded ones', async () => {
  let nowMs = START_MS;
  const gate = new GlobalGateCore(new MemoryStorage(), readLimits({}), () => nowMs);
  await gate.recordDemand({ eventId: '1', ip: 'a', team: 'nfl-17' });
  await gate.recordDemand({ eventId: '2', ip: 'a', team: 'nfl-17' });
  await gate.recordDemand({ eventId: '1', ip: 'a', sport: 'football', team: 'ncaa-66' });
  nowMs += DEMAND_HALF_LIFE_MS;
  const top = await gate.topDemand(5);
  assert.deepEqual(top.map((row) => [row.team, row.sport, row.score]), [
    ['nfl-17', undefined, 1],
    ['ncaa-66', 'football', 0.5],
  ]);
  nowMs += DEMAND_HALF_LIFE_MS * 5;
  await gate.sweep();
  assert.deepEqual((await gate.topDemand(5)).map((row) => row.team), []);
});

// --- Prefetch -----------------------------------------------------------------------------------

function prefetchWorld({ startMs = START_MS + 10 * MINUTE } = {}) {
  const w = world();
  w.clock.now = START_MS;
  w.setEspn('401', espnSummary({ date: new Date(startMs).toISOString() }));
  w.setEspnSchedule('17', [espnScheduleEvent({ date: new Date(startMs).toISOString() })]);
  return w;
}

test('prefetch: a top team whose window opened gets a run before anyone taps', async () => {
  const w = prefetchWorld({ startMs: START_MS + 60 * MINUTE });
  // The press lands before the window, so it only counts demand.
  assert.equal((await w.getVideo()).status, 409);
  assert.equal(w.dispatches.length, 0);

  const early = await w.app.scheduled(w.env);
  assert.equal(early.refreshed, 1);
  assert.deepEqual(early.dispatched, []);
  assert.equal(w.callsTo('espn').filter((call) => call.url.includes('/schedule')).length, 1);

  w.clock.now = START_MS + 47 * MINUTE;
  const tick = await w.app.scheduled(w.env);
  assert.deepEqual(tick.dispatched, [{ attempt: 1, code: 'started', eventId: '401', team: 'nfl-17' }]);
  assert.equal(w.dispatches.length, 1);
  assert.equal(w.dispatches[0].client_payload.origin, 'prefetch');
  assert.equal(w.dispatches[0].client_payload.eventId, '401');
  assert.equal(
    w.callsTo('espn').filter((call) => call.url.includes('/schedule')).length,
    2,
    'a schedule with a game inside 3 hours is re-read after 30 minutes',
  );
  w.clock.now += 5 * MINUTE;
  await w.app.scheduled(w.env);
  assert.equal(w.callsTo('espn').filter((call) => call.url.includes('/schedule')).length, 2, 'then stays cached');
  w.clock.now -= 5 * MINUTE;

  // A queued run is not dispatched again.
  w.clock.now += 5 * MINUTE;
  assert.deepEqual((await w.app.scheduled(w.env)).dispatched, []);
});

test('prefetch: a failed run is retried every 10 minutes, at most 4 times, inside the window', async () => {
  const w = prefetchWorld();
  await w.getVideo({}, { ip: '198.51.100.9' });
  w.dispatches.length = 0;
  // The phone's run failed.
  await w.signed('/run-status', { code: 'no_video', eventId: '401', runId: 1, team: 'nfl-17' }, STATUS_KEY);

  const codes = [];
  for (let tick = 0; tick < 12; tick += 1) {
    const summary = await w.app.scheduled(w.env);
    for (const item of summary.dispatched) {
      codes.push(item.attempt);
      await w.signed('/run-status', { code: 'no_video', eventId: '401', runId: 100 + tick, team: 'nfl-17' }, STATUS_KEY);
    }
    w.clock.now += 5 * MINUTE;
  }
  assert.deepEqual(codes, [1, 2, 3, 4]);
});

test('prefetch: a game with a ready entry or outside its window gets no run', async () => {
  const w = prefetchWorld();
  w.setStreams('nfl', { '17.json': streamsDocument([pipelineEntry({ url: PLAYER_URL })]) });
  await w.getVideo();
  w.dispatches.length = 0;
  const summary = await w.app.scheduled(w.env);
  assert.deepEqual(summary.dispatched, []);

  const late = prefetchWorld({ startMs: START_MS - 50 * MINUTE });
  late.setEspn('401', espnSummary({ date: new Date(START_MS - 50 * MINUTE).toISOString(), state: 'in', name: 'STATUS_IN_PROGRESS' }));
  await late.getVideo();
  await late.signed('/run-status', { code: 'no_video', eventId: '401', runId: 1, team: 'nfl-17' }, STATUS_KEY);
  late.dispatches.length = 0;
  late.clock.now += 11 * MINUTE;
  assert.deepEqual((await late.app.scheduled(late.env)).dispatched, [], '45 minutes after the start is past the window');
});

test('prefetch: off with PREFETCH_TOP_TEAMS 0, on a target with a global cap of 0, and without secrets', async () => {
  const w = prefetchWorld();
  w.clock.now = START_MS - 30 * MINUTE;
  await w.getVideo();
  w.clock.now = START_MS;
  w.env.PREFETCH_TOP_TEAMS = '0';
  assert.equal((await w.app.scheduled(w.env)).off, true);
  w.env.PREFETCH_TOP_TEAMS = '10';
  w.env.GLOBAL_DISPATCH_PER_HOUR = '0';
  assert.equal((await w.app.scheduled(w.env)).off, true);
  delete w.env.GLOBAL_DISPATCH_PER_HOUR;
  delete w.env.RUN_STATUS_KEY;
  assert.equal((await w.app.scheduled(w.env)).off, true);
  assert.equal(w.dispatches.length, 0);
  assert.equal(w.callsTo('espn').filter((call) => call.url.includes('/schedule')).length, 0);
});

test('prefetch: prefetch runs share the gates under their own rate-limit key', async () => {
  const w = prefetchWorld();
  w.env.IP_DISPATCH_PER_HOUR = '0';
  bindDurableObjects(w);
  w.clock.now = START_MS - 30 * MINUTE;
  await w.getVideo();
  w.clock.now = START_MS;
  const summary = await w.app.scheduled(w.env);
  assert.deepEqual(summary.dispatched, [{ attempt: 1, code: 'rate_limited', eventId: '401', team: 'nfl-17' }]);
  assert.equal(w.dispatches.length, 0);
});

test('prefetch: a schedule read failure is cached for 30 minutes', async () => {
  const w = prefetchWorld();
  w.clock.now = START_MS - 30 * MINUTE;
  await w.getVideo();
  w.setEspnSchedule('17', [], 500);
  w.clock.now = START_MS;
  assert.equal((await w.app.scheduled(w.env)).refreshed, 1);
  w.clock.now += 5 * MINUTE;
  assert.equal((await w.app.scheduled(w.env)).refreshed, 0);
  w.setEspnSchedule('17', [espnScheduleEvent({ date: new Date(START_MS + 40 * MINUTE).toISOString() })]);
  w.clock.now += 26 * MINUTE;
  const summary = await w.app.scheduled(w.env);
  assert.equal(summary.refreshed, 1);
  assert.equal(summary.dispatched.length, 1);
});

test('prefetch helpers: window, staleness and settings', () => {
  const nowMs = START_MS;
  const games = compactGames(
    [
      { abstractState: 'Preview', gameDate: new Date(nowMs + 10 * MINUTE).toISOString(), gamePk: 1, officialDate: OFFICIAL_DATE, status: 'Scheduled' },
      { abstractState: 'Preview', gameDate: new Date(nowMs + 20 * MINUTE).toISOString(), gamePk: 2, officialDate: OFFICIAL_DATE, status: 'Scheduled' },
      { abstractState: 'Preview', gameDate: new Date(nowMs + 5 * MINUTE).toISOString(), gamePk: 3, officialDate: OFFICIAL_DATE, status: 'Postponed' },
      { abstractState: 'Final', gameDate: new Date(nowMs - 10 * MINUTE).toISOString(), gamePk: 4, officialDate: OFFICIAL_DATE, status: 'Final' },
      { abstractState: 'Preview', gameDate: new Date(nowMs + 5 * MINUTE).toISOString(), gamePk: 5, officialDate: OFFICIAL_DATE, status: 'Scheduled', timeValid: false },
      { abstractState: 'Preview', gameDate: new Date(nowMs + 72 * 60 * MINUTE).toISOString(), gamePk: 6, officialDate: OFFICIAL_DATE, status: 'Scheduled' },
    ],
    nowMs,
  );
  assert.deepEqual(games.map((game) => game.eventId), ['4', '3', '5', '1', '2']);
  assert.deepEqual(gamesInPrefetchWindow({ games }, nowMs).map((game) => game.eventId), ['1']);

  assert.equal(scheduleIsStale(undefined, nowMs), true);
  assert.equal(scheduleIsStale({ fetchedAt: nowMs - 31 * MINUTE, games }, nowMs), true, 'a game within 3 h');
  assert.equal(scheduleIsStale({ fetchedAt: nowMs - 31 * MINUTE, games: [] }, nowMs), false);
  assert.equal(scheduleIsStale({ fetchedAt: nowMs - 6 * 60 * MINUTE, games: [] }, nowMs), true);

  assert.equal(readPrefetchSettings({}).topTeams, 10);
  assert.equal(readPrefetchSettings({ PREFETCH_TOP_TEAMS: '500' }).topTeams, 50);
  assert.equal(readPrefetchSettings({ PREFETCH_TOP_TEAMS: 'x' }).topTeams, 10);
  assert.equal(readPrefetchSettings({ GLOBAL_DISPATCH_PER_HOUR: '0' }).enabled, false);
});

test('team gate: a prefetch claim is refused while a run is queued or an entry is waiting', async () => {
  let nowMs = START_MS;
  const gate = new TeamGateCore(new MemoryStorage(), readLimits({}), () => nowMs);
  const options = { maxAttempts: 2, retryMs: 10 * MINUTE };
  assert.deepEqual(await gate.claimPrefetch('1', options), { attempt: 1, ok: true });
  assert.deepEqual(await gate.claimPrefetch('1', options), { ok: false, reason: 'waiting' });
  await gate.markQueued('1');
  nowMs += 11 * MINUTE;
  assert.deepEqual(await gate.claimPrefetch('1', options), { ok: false, reason: 'queued' });
  await gate.recordStatus({ code: 'no_video', eventId: '1', runId: '1' });
  assert.deepEqual(await gate.claimPrefetch('1', options), { attempt: 2, ok: true });
  nowMs += 11 * MINUTE;
  assert.deepEqual(await gate.claimPrefetch('1', options), { ok: false, reason: 'attempts' });

  assert.deepEqual(await gate.recordEntry({ entry: {}, eventId: '2', runId: '1' }), { ok: false }, 'no run started');
  await gate.reserve('ip', '2');
  assert.deepEqual(await gate.recordEntry({ entry: { url: 'x' }, eventId: '2', runId: '1' }), { ok: true });
  assert.deepEqual(await gate.claimPrefetch('2', options), { ok: false, reason: 'entry' });
  assert.deepEqual((await gate.readState('2')).entry, { url: 'x' });
});

// --- Missed games ---------------------------------------------------------------------------

async function missed(w, query = '') {
  const response = await w.request(`/missed${query}`, { headers: { 'X-App-Key': APP_KEY } });
  return { body: JSON.parse(await response.text()), status: response.status };
}

test('missed: a run that finds no video lists the game with its origin, and a later publish marks it found', async () => {
  const w = world();
  await w.getVideo();
  const report = (code, runId, extra = {}) =>
    w.signed('/run-status', { code, eventId: '401', runId, team: 'nfl-17', ...extra }, STATUS_KEY);
  await report('no_video', 1, { officialDate: OFFICIAL_DATE, opponent: 'Buffalo Bills', origin: 'prefetch' });
  await report('sources_unreachable', 2, { origin: 'phone' });
  await report('no_video', 2, { origin: 'phone' });

  let { body } = await missed(w);
  assert.equal(body.stillMissing, 1);
  assert.deepEqual(
    body.games.map(({ attempts, lastCode, officialDate, opponent, origins, team }) => ({ attempts, lastCode, officialDate, opponent, origins, team })),
    [{ attempts: 2, lastCode: 'sources_unreachable', officialDate: OFFICIAL_DATE, opponent: 'Buffalo Bills', origins: { phone: 1, prefetch: 1 }, team: 'nfl-17' }],
    'a replayed run id counts once',
  );

  await report('published', 3);
  ({ body } = await missed(w));
  assert.equal(body.stillMissing, 0);
  assert.ok(body.games[0].foundLaterAt);
});

test('missed: other failures, bad origins and bad opponents are not trusted, and the list needs the key', async () => {
  const w = world();
  await w.signed('/run-status', { code: 'publish_failed', eventId: '401', runId: 1, team: 'nfl-17' }, STATUS_KEY);
  await w.signed('/run-status', { code: 'no_video', eventId: '402', opponent: '<script>', origin: 'evil', runId: 2, team: 'nfl-17' }, STATUS_KEY);
  const { body } = await missed(w);
  assert.equal(body.games.length, 1);
  assert.equal(body.games[0].eventId, '402');
  assert.deepEqual(body.games[0].origins, { manual: 1 });
  assert.equal(body.games[0].opponent, undefined);
  assert.equal((await w.request('/missed')).status, 401);
  w.clock.now += 8 * 24 * 60 * MINUTE;
  assert.equal((await missed(w)).body.games.length, 0, 'older than 7 days');
  assert.equal((await missed(w, '?days=30')).body.games.length, 1);
});
