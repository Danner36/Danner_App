import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CYCLONES_TILE, GUARDIANS_TILE, PATRIOTS_TILE } from '../../app/selection/presets.ts';
import { teamAccent, teamBoardLabel } from '../../app/team/theme.ts';
import { streamsFromDocument, streamsPathForKey } from '../../app/streams/sources.ts';
import {
  getVideoStartFromResponse,
  getVideoText,
  pollForStream,
  progressView,
} from '../../app/streams/getVideo.ts';
import { streamsPathForKey as pipelineStreamsPath } from '../../scripts/stream-pipeline/lib/catalog.mjs';
import { recapDay } from '../../app/team/engine/dates.ts';
import { snapshotFromGames } from '../../app/team/engine/featured.ts';
import { snapshotWithPreservedBoards } from '../../app/team/engine/liveMerge.ts';
import { sportStatus } from '../../app/team/engine/postseason.ts';
import { regularSeasonRecord } from '../../app/team/engine/records.ts';
import { fetchTeamSnapshot } from '../../app/team/engine/snapshot.ts';
import {
  authorizedStreamsForGame,
  streamMatchesGame,
} from '../../app/team/engine/streamMatch.ts';
import {
  isVideoWindowOpen,
  streamsPollWindowOpen,
} from '../../app/team/engine/videoWindow.ts';

function localIso(year, monthIndex, day, hour, minute = 0) {
  return new Date(year, monthIndex, day, hour, minute).toISOString();
}

function game(overrides) {
  const merged = {
    abstractState: 'Preview',
    adapter: 'nfl',
    gameDate: localIso(2026, 8, 5, 12),
    gameId: '1',
    gameNumber: 1,
    isHome: true,
    neutralSite: false,
    notes: '',
    officialDate: '2026-09-05',
    opponentName: 'Opponent',
    opponentScore: 0,
    scoreboard: 'periods',
    scoresKnown: true,
    seasonType: 2,
    status: 'Scheduled',
    teamScore: 0,
    timeValid: true,
    ...overrides,
  };
  return { key: `${merged.adapter}:${merged.gameId}:${merged.officialDate}`, ...merged };
}

// Unparseable score: a Final with no published score stays out of the record for every adapter.
assert.deepEqual(
  regularSeasonRecord([
    game({ abstractState: 'Final', scoresKnown: false, status: 'Final' }),
    game({ abstractState: 'Final', gameId: '2', status: 'Final', teamScore: 3 }),
  ]),
  { losses: 0, ties: 0, wins: 1 },
);

// Live game with a TBA time opens the video window for every adapter.
assert.equal(
  isVideoWindowOpen(game({ abstractState: 'Live', status: 'Q2', timeValid: false }), Date.now()),
  true,
);

// Recap day: the phone-local date of a known start for ESPN, the MLB official date for MLB.
const lateWest = game({
  abstractState: 'Final',
  gameDate: localIso(2026, 8, 5, 23, 30),
  officialDate: '2026-09-06',
  status: 'Final',
});
assert.equal(recapDay(lateWest), '2026-09-05');
assert.equal(recapDay({ ...lateWest, timeValid: false }), '2026-09-06');
assert.equal(recapDay({ ...lateWest, adapter: 'mlb' }), '2026-09-06');

// One card for a pro tile, one per game for a school tile.
const doubleheader = [
  game({ adapter: 'mlb', gameId: '10', gameNumber: 1, gameDate: localIso(2026, 8, 5, 12), scoreboard: 'baseball' }),
  game({ adapter: 'mlb', gameId: '11', gameNumber: 2, gameDate: localIso(2026, 8, 5, 18), scoreboard: 'baseball' }),
];
const dayOf = new Date(2026, 8, 5, 9);
const proSnapshot = snapshotFromGames(doubleheader, { mlb: { losses: 0, ties: 0, wins: 0 } }, { now: dayOf });
assert.deepEqual(proSnapshot.featuredGames.map((entry) => entry.gameId), ['10']);
assert.deepEqual(proSnapshot.upcomingGames.map((entry) => entry.gameId), ['11']);
const schoolGames = [
  game({ adapter: 'ncaa/football', gameId: '20', sport: 'football', gameDate: localIso(2026, 8, 5, 12) }),
  game({
    adapter: 'ncaa/mens-basketball',
    gameId: '21',
    scoreboard: 'basketball',
    sport: 'mens-basketball',
    gameDate: localIso(2026, 8, 5, 18),
  }),
];
assert.deepEqual(
  snapshotFromGames(schoolGames, {}, { now: dayOf, perGameCards: true }).featuredGames.map(
    (entry) => entry.gameId,
  ),
  ['20', '21'],
);

// Superset rules across a school tile: a suspended game ESPN reports Live is not a Live card, and a
// start delayed past local midnight keeps its card.
const suspended = game({
  abstractState: 'Live',
  adapter: 'ncaa/football',
  gameDate: localIso(2026, 8, 4, 18),
  gameId: '30',
  officialDate: '2026-09-04',
  sport: 'football',
  status: 'Suspended',
});
const live = game({
  abstractState: 'Live',
  adapter: 'ncaa/mens-basketball',
  gameDate: localIso(2026, 8, 5, 8),
  gameId: '31',
  sport: 'mens-basketball',
  status: 'First Half',
});
const carried = game({
  adapter: 'ncaa/womens-basketball',
  gameDate: localIso(2026, 8, 4, 23, 45),
  gameId: '32',
  officialDate: '2026-09-04',
  sport: 'womens-basketball',
  status: 'Delayed Start',
});
assert.deepEqual(
  snapshotFromGames([suspended, live, carried], {}, {
    now: new Date(2026, 8, 5, 9),
    perGameCards: true,
  }).featuredGames.map((entry) => entry.gameId),
  ['31', '32'],
);

// Postseason.
function postseasonFinal(notes, overrides = {}) {
  return game({
    abstractState: 'Final',
    adapter: 'ncaa/mens-basketball',
    gameDate: localIso(2027, 2, 12, 18),
    gameId: '80',
    notes,
    officialDate: '2027-03-12',
    opponentScore: 70,
    scoreboard: 'basketball',
    seasonType: 3,
    sport: 'mens-basketball',
    status: 'Final',
    teamScore: 60,
    ...overrides,
  });
}
const march14 = new Date(2027, 2, 14, 12);
const statusOf = (final, conference, now = march14) =>
  sportStatus([final], final.sport, now, conference);
assert.equal(statusOf(postseasonFinal('College Basketball Invitational Tournament - First Round')).label, 'Eliminated from the tournament');
assert.equal(statusOf(postseasonFinal('CollegeInsider.com Postseason Tournament - Quarterfinal')).kind, 'eliminated');
// A non-Big 12 conference final is a conference tournament game.
assert.equal(
  statusOf(postseasonFinal('Sun Belt Championship - Final'), 'Sun Belt').kind,
  'awaiting-next',
);
assert.equal(
  statusOf(postseasonFinal('ACC Tournament - Final', { seasonType: 2 })).kind,
  'awaiting-next',
);
assert.equal(
  statusOf(postseasonFinal('Conference Tournament - Quarterfinal')).kind,
  'awaiting-next',
);
assert.equal(
  statusOf(
    postseasonFinal('College Football Playoff semifinal', {
      adapter: 'ncaa/football',
      scoreboard: 'periods',
      sport: 'football',
    }),
  ).label,
  'Eliminated from the College Football Playoff',
);

// Live merge.
const board = { kind: 'periods', away: { periods: [], points: 7 }, clock: '', home: { periods: [], points: 14 }, period: 2, status: 'Q2' };
const shownLive = game({ abstractState: 'Live', board, status: 'Q2', teamScore: 14 });
const wrap = (entry) => ({ featuredGames: [entry], records: {}, statuses: {}, upcomingGames: [] });
const lagging = wrap(game({ abstractState: 'Preview', status: 'Scheduled' }));
assert.equal(
  snapshotWithPreservedBoards(wrap(shownLive), lagging, [], 1_000).featuredGames[0].abstractState,
  'Live',
  'a schedule that lags never moves the card backwards',
);
const newer = wrap(game({ abstractState: 'Live', status: 'Q1', teamScore: 7 }));
assert.equal(
  snapshotWithPreservedBoards(
    wrap(shownLive),
    newer,
    [{ appliedAt: 900, key: shownLive.key, requestedAt: 950 }],
    100_000,
    500,
  ).featuredGames[0].teamScore,
  14,
  'a poll requested after the snapshot keeps its state, score and board',
);
assert.equal(
  snapshotWithPreservedBoards(
    wrap(shownLive),
    newer,
    [{ appliedAt: 900, key: shownLive.key, requestedAt: 100 }],
    100_000,
    500,
  ).featuredGames[0].teamScore,
  7,
  'after a 30 s stall the schedule board shows',
);
const baseball = (extra) => ({
  away: { errors: 0, hits: 0, runs: 0 },
  balls: 0,
  home: { errors: 0, hits: 0, runs: 0 },
  innings: [],
  kind: 'baseball',
  outs: 0,
  status: 'Top 1st',
  strikes: 0,
  ...extra,
});
const shownMlb = game({
  abstractState: 'Live',
  adapter: 'mlb',
  board: baseball({ batterNumber: '42', pitcherNumber: '31' }),
  gameId: '7',
  scoreboard: 'baseball',
  status: 'In Progress',
});
const refreshedMlb = wrap({ ...shownMlb, board: baseball({ pitcherNumber: '9' }) });
const mergedBoard = snapshotWithPreservedBoards(wrap(shownMlb), refreshedMlb, [], 1_000).featuredGames[0].board;
assert.equal(mergedBoard.batterNumber, '42', 'a missing jersey number fills from the previous board');
assert.equal(mergedBoard.pitcherNumber, '9');

// Partial failure: the Cyclones rule for every adapter.
function fakeAdapter(key, schedule) {
  return {
    key,
    fetchSchedule: async () => {
      if (schedule === 'throw') {
        throw new Error('down');
      }
      return { adapter: key, ...schedule };
    },
  };
}
const nflPrevious = game({ gameDate: localIso(2026, 8, 7, 12), gameId: '50', officialDate: '2026-09-07' });
const previous = {
  featuredGames: [],
  records: { nfl: { losses: 1, ties: 0, wins: 2 } },
  statuses: {},
  upcomingGames: [nflPrevious],
};
const incomplete = await fetchTeamSnapshot({
  adapters: [fakeAdapter('nfl', { answered: true, complete: false, games: [] })],
  now: dayOf,
  perGameCards: false,
  previous,
  team: { conference: undefined },
  unavailableMessage: 'unavailable',
});
assert.equal(incomplete.complete, false);
assert.deepEqual(incomplete.snapshot.records.nfl, { losses: 1, ties: 0, wins: 2 });
assert.deepEqual(incomplete.snapshot.upcomingGames.map((entry) => entry.gameId), ['50']);
await assert.rejects(
  fetchTeamSnapshot({
    adapters: [fakeAdapter('nfl', { answered: true, complete: false, games: [] })],
    now: dayOf,
    perGameCards: false,
    team: {},
    unavailableMessage: 'first load fails',
  }),
  /first load fails/,
);
await assert.rejects(
  fetchTeamSnapshot({
    adapters: [fakeAdapter('nfl', 'throw')],
    now: dayOf,
    perGameCards: false,
    previous,
    team: {},
    unavailableMessage: 'nothing answered',
  }),
  /nothing answered/,
);
const oneSportDown = await fetchTeamSnapshot({
  adapters: [
    fakeAdapter('ncaa/football', { answered: true, complete: true, games: [] }),
    fakeAdapter('ncaa/mens-basketball', 'throw'),
  ],
  now: dayOf,
  perGameCards: true,
  team: {},
  unavailableMessage: 'x',
});
assert.equal(oneSportDown.complete, false);
assert.deepEqual(oneSportDown.snapshot.unavailable, ['ncaa/mens-basketball']);

// Stream match, sharing its cases with the pipeline.
const { cases } = JSON.parse(
  readFileSync(new URL('../fixtures/stream-match.json', import.meta.url), 'utf8'),
);
for (const { game: identity, matches, name, stream } of cases) {
  assert.equal(streamMatchesGame(stream, identity), matches, name);
}
assert.equal(
  authorizedStreamsForGame([cases[0].stream, cases[1].stream], cases[0].game).length,
  2,
);

// The streams parser: unknown keys are ignored, eventId is kept, a school file needs a sport.
const entry = {
  allowInsecureHttp: false,
  gameDates: ['2026-09-12'],
  gameNumbers: [1],
  kind: 'web',
  trustedHosts: [],
  url: 'https://example.invalid/game',
};
const parsedPro = streamsFromDocument(
  { streams: [{ ...entry, eventId: '401', extra: true, source: 'pipeline' }] },
  { school: false },
);
assert.equal(parsedPro.length, 1);
assert.equal(parsedPro[0].eventId, '401');
assert.equal(streamsFromDocument({ streams: [entry] }, { school: true }).length, 0);
assert.equal(
  streamsFromDocument({ streams: [{ ...entry, eventId: 'x' }] }, { school: false }).length,
  0,
);
assert.equal(streamsPathForKey('ncaa-66'), pipelineStreamsPath('ncaa-66'));
assert.equal(streamsPathForKey('mlb-5'), 'streams/mlb/5.json');

// The streams polling window.
const startMs = new Date(localIso(2026, 8, 5, 12)).getTime();
assert.equal(streamsPollWindowOpen([game({})], startMs - 46 * 60_000), false);
assert.equal(streamsPollWindowOpen([game({})], startMs - 44 * 60_000), true);
assert.equal(streamsPollWindowOpen([game({})], startMs + 239 * 60_000), true);
assert.equal(streamsPollWindowOpen([game({})], startMs + 241 * 60_000), false);
assert.equal(streamsPollWindowOpen([game({ adapter: 'mlb' })], startMs + 181 * 60_000), false);
assert.equal(streamsPollWindowOpen([game({ abstractState: 'Live', status: 'Q2' })], startMs - 300 * 60_000), true);
assert.equal(streamsPollWindowOpen([game({ abstractState: 'Final', status: 'Final' })], startMs), false);

// Identity and accent.
assert.equal(teamAccent(GUARDIANS_TILE.key, GUARDIANS_TILE.team), '#E31937');
assert.equal(teamAccent(PATRIOTS_TILE.key, PATRIOTS_TILE.team), '#E31937');
assert.equal(teamAccent(CYCLONES_TILE.key, CYCLONES_TILE.team), '#AE192D');
assert.equal(teamAccent('mlb-1', { color: '#000000' }), '#000000');
assert.equal(teamAccent('mlb-1', { alternateColor: '#112233', color: '#FFFFFF' }), '#112233');
assert.equal(teamAccent('mlb-1', { color: '#FFFFFF' }), '#1F6F55');
assert.equal(teamBoardLabel(CYCLONES_TILE.team), 'CYCLONES');
assert.equal(
  teamBoardLabel({ abbreviation: 'DUKE', nickname: 'Blue Devils Long' }),
  'DUKE',
);

// Get video: each Worker answer, each phone text.
const reply = (status, body, headers) =>
  new Response(JSON.stringify(body), { headers, status });
assert.deepEqual(await getVideoStartFromResponse(reply(202, { code: 'started' })), { kind: 'poll' });
assert.deepEqual(await getVideoStartFromResponse(reply(202, { code: 'in_progress' })), { kind: 'poll' });
assert.deepEqual(await getVideoStartFromResponse(reply(200, { code: 'video_ready' })), { kind: 'ready' });
assert.equal(
  (await getVideoStartFromResponse(reply(409, { code: 'not_in_window' }))).message,
  'Get video works from 15 minutes before the start until the game ends.',
);
assert.equal(
  (await getVideoStartFromResponse(reply(429, { code: 'rate_limited' }, { 'Retry-After': '120' }))).message,
  'Get video was asked for too often. Try again in 2 minutes.',
);
assert.equal(
  (await getVideoStartFromResponse(reply(503, { code: 'busy', retryAfterSeconds: 30 }))).message,
  'Get video was asked for too often. Try again in 1 minute.',
);
assert.equal((await getVideoStartFromResponse(reply(401, { code: 'unauthorized' }))).kind, 'refused');
assert.equal(getVideoText(progressView(undefined)), 'Looking for video…');
assert.equal(getVideoText(progressView({ k: 2, n: 3, step: 'source_start' })), 'Looking for video (2 of 3)…');
assert.equal(getVideoText(progressView({ k: 2, n: 3, step: 'found' })), 'Video found. Getting it ready…');
assert.equal(getVideoText({ kind: 'still' }), 'Still looking…');

const target = { gameId: '401', gameNumber: 1, officialDate: '2026-09-12' };
const playable = streamsFromDocument(
  { streams: [{ ...entry, eventId: '401' }] },
  { school: false },
);
async function pollRun(steps) {
  const views = [];
  let index = 0;
  let clock = 0;
  const outcome = await pollForStream(
    target,
    async () => {
      const step = steps[Math.min(index, steps.length - 1)];
      index += 1;
      clock += step.advance ?? 5_000;
      return step;
    },
    { intervalMs: 0, now: () => clock, onView: (view) => views.push(getVideoText(view)), timeoutMs: 900_000 },
  );
  return { outcome, views };
}
const success = await pollRun([
  { runState: 'queued', streams: [] },
  { progress: { k: 1, n: 3, step: 'source_start' }, runState: 'queued', streams: [] },
  { progress: { k: 2, n: 3, step: 'source_start' }, runState: 'queued', streams: [] },
  { progress: { k: 3, n: 3, step: 'found' }, runState: 'queued', streams: [] },
  { progress: { k: 3, n: 3, step: 'found' }, runState: 'published', streams: [] },
  { runState: 'published', streams: playable },
]);
assert.equal(success.outcome.kind, 'found');
assert.deepEqual(success.views, [
  'Looking for video…',
  'Looking for video (1 of 3)…',
  'Looking for video (2 of 3)…',
  'Video found. Getting it ready…',
  'Video found. Getting it ready…',
]);
assert.deepEqual((await pollRun([{ runState: 'no_video', streams: [] }])).outcome, { kind: 'none' });
assert.deepEqual((await pollRun([{ runState: 'deadline', streams: [] }])).outcome, { kind: 'none' });
for (const code of ['too_early', 'game_over', 'no_game']) {
  assert.equal((await pollRun([{ runState: code, streams: [] }])).outcome.kind, 'message');
}
const stalled = await pollRun([
  { progress: { k: 1, n: 3, step: 'source_start' }, runState: 'queued', streams: [] },
  { advance: 89_000, progress: { k: 1, n: 3, step: 'source_start' }, runState: 'queued', streams: [] },
  { advance: 2_000, progress: { k: 1, n: 3, step: 'source_start' }, runState: 'queued', streams: [] },
  { runState: 'no_video', streams: [] },
]);
assert.deepEqual(stalled.views, [
  'Looking for video (1 of 3)…',
  'Looking for video (1 of 3)…',
  'Still looking…',
]);

process.stdout.write('team-engine shared cases passed.\n');
