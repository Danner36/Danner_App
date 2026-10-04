import assert from 'node:assert/strict';

import {
  abstractStateFromMlb,
  blocksPlayback,
  gameInterruption,
  gameWithLiveReport,
  guardiansGameFromMlb,
  recapResult,
  snapshotFromGames,
} from '../../app/guardians/guardiansSnapshot.ts';
import { guardiansStreamsFromDocument } from '../../app/guardians/guardiansSources.ts';
import { liveGameFromSchedule } from '../../app/guardians/mlbLinescore.ts';

// Local-time expectations below are written for a Central-time phone. Pinning the zone keeps
// the results the same on any machine.
process.env.TZ = 'America/Chicago';
assert.equal(
  Intl.DateTimeFormat().resolvedOptions().timeZone,
  'America/Chicago',
);

const now = new Date(2026, 7, 29, 20, 15, 0);

function game(overrides) {
  return {
    abstractState: 'Preview',
    gameDate: '2026-08-29T17:10:00Z',
    gameNumber: 1,
    gamePk: 1,
    guardiansScore: 0,
    isHome: true,
    officialDate: '2026-08-29',
    opponentName: 'Detroit Tigers',
    opponentScore: 0,
    status: 'Scheduled',
    timeValid: true,
    ...overrides,
  };
}

const win = game({
  abstractState: 'Final',
  gamePk: 10,
  guardiansScore: 7,
  opponentScore: 3,
  status: 'Final',
});
const loss = game({
  abstractState: 'Final',
  gamePk: 11,
  guardiansScore: 2,
  opponentName: 'New York Yankees',
  opponentScore: 5,
  status: 'Final',
});
const laterToday = game({
  gameDate: '2026-08-29T23:10:00Z',
  gamePk: 20,
  gameNumber: 2,
  opponentName: 'Detroit Tigers',
  status: 'Scheduled',
});
const live = game({
  abstractState: 'Live',
  gamePk: 30,
  guardiansScore: 4,
  opponentScore: 2,
  status: 'Top 5th',
});
const tomorrow = game({
  gameDate: '2026-08-30T17:10:00Z',
  gamePk: 40,
  officialDate: '2026-08-30',
  opponentName: 'San Francisco Giants',
});

assert.equal(
  snapshotFromGames([win, tomorrow], 62, 66, now).featuredGame?.gamePk,
  10,
);
assert.deepEqual(
  snapshotFromGames([win, tomorrow], 62, 66, now).upcomingGames.map(
    (entry) => entry.gamePk,
  ),
  [40],
);

assert.equal(
  snapshotFromGames([win, laterToday, tomorrow], 62, 66, now).featuredGame
    ?.gamePk,
  20,
);
assert.deepEqual(
  snapshotFromGames([win, laterToday, tomorrow], 62, 66, now).upcomingGames.map(
    (entry) => entry.gamePk,
  ),
  [40],
);

assert.equal(
  snapshotFromGames([win, live, laterToday], 62, 66, now).featuredGame?.gamePk,
  30,
);

const doubleheaderFinals = snapshotFromGames(
  [
    win,
    game({
      abstractState: 'Final',
      gameDate: '2026-08-29T23:10:00Z',
      gameNumber: 2,
      gamePk: 12,
      guardiansScore: 1,
      opponentScore: 4,
      status: 'Final',
    }),
    tomorrow,
  ],
  62,
  66,
  now,
);
assert.equal(doubleheaderFinals.featuredGame?.gamePk, 12);
assert.deepEqual(
  doubleheaderFinals.upcomingGames.map((entry) => entry.gamePk),
  [40],
);

const nextDay = new Date(2026, 7, 30, 0, 10, 0);
assert.equal(
  snapshotFromGames([win, tomorrow], 62, 66, nextDay).featuredGame?.gamePk,
  40,
);

assert.equal(
  snapshotFromGames(
    [
      game({
        abstractState: 'Final',
        gamePk: 99,
        officialDate: '2026-08-28',
        status: 'Final',
      }),
      tomorrow,
    ],
    62,
    66,
    now,
  ).featuredGame,
  undefined,
);

assert.equal(
  snapshotFromGames(
    [
      game({
        abstractState: 'Final',
        gamePk: 98,
        status: 'Postponed',
      }),
      tomorrow,
    ],
    62,
    66,
    now,
  ).featuredGame?.gamePk,
  98,
);

assert.equal(recapResult(win), 'WIN');
assert.equal(recapResult(loss), 'LOSS');
assert.equal(
  recapResult(game({ guardiansScore: 3, opponentScore: 3 })),
  'TIE',
);

const parsed = guardiansGameFromMlb({
  gameDate: '2026-08-20T17:10:00Z',
  gameNumber: 1,
  gamePk: 824395,
  officialDate: '2026-08-20',
  status: { abstractGameState: 'Final', detailedState: 'Final' },
  teams: {
    away: { score: 2, team: { id: 137, name: 'San Francisco Giants' } },
    home: { score: 5, team: { id: 114, name: 'Cleveland Guardians' } },
  },
});
assert.ok(parsed);
assert.equal(parsed.guardiansScore, 5);
assert.equal(parsed.opponentScore, 2);
assert.equal(parsed.opponentName, 'San Francisco Giants');
assert.equal(parsed.timeValid, true);
assert.equal(recapResult(parsed), 'WIN');
assert.equal('decisions' in parsed, false);

const postseasonTba = guardiansGameFromMlb({
  gameDate: '2026-10-03T07:33:00Z',
  gameNumber: 1,
  gamePk: 824900,
  officialDate: '2026-10-03',
  status: {
    abstractGameState: 'Preview',
    detailedState: 'Scheduled',
    startTimeTBD: true,
  },
  teams: {
    away: { score: 0, team: { id: 114, name: 'Cleveland Guardians' } },
    home: { score: 0, team: { id: 142, name: 'Minnesota Twins' } },
  },
});
assert.ok(postseasonTba);
assert.equal(postseasonTba.timeValid, false);
assert.equal(postseasonTba.officialDate, '2026-10-03');
assert.equal(postseasonTba.status, 'Scheduled');

const postseasonTimed = guardiansGameFromMlb({
  gameDate: '2026-10-03T20:08:00Z',
  gameNumber: 1,
  gamePk: 824901,
  officialDate: '2026-10-03',
  status: {
    abstractGameState: 'Preview',
    detailedState: 'Scheduled',
    startTimeTBD: false,
  },
  teams: {
    away: { score: 0, team: { id: 114, name: 'Cleveland Guardians' } },
    home: { score: 0, team: { id: 142, name: 'Minnesota Twins' } },
  },
});
assert.equal(postseasonTimed?.timeValid, true);

// Time TBA: game 2's placeholder time does not take the card from game 1, and a TBA game
// whose placeholder falls on the previous local day is still today's game.
const timedGameOne = game({
  gameDate: '2026-10-03T18:08:00Z',
  gamePk: 70,
  officialDate: '2026-10-03',
});
const tbaGameTwo = game({
  gameDate: '2026-10-03T07:33:00Z',
  gameNumber: 2,
  gamePk: 71,
  officialDate: '2026-10-03',
  timeValid: false,
});
const octoberMorning = new Date(2026, 9, 3, 9, 0, 0);
const doubleheaderTba = snapshotFromGames(
  [tbaGameTwo, timedGameOne],
  88,
  74,
  octoberMorning,
);
assert.equal(doubleheaderTba.featuredGame?.gamePk, 70);
assert.deepEqual(
  doubleheaderTba.upcomingGames.map((entry) => entry.gamePk),
  [71],
);
assert.equal(
  snapshotFromGames(
    [
      game({
        gameDate: '2026-10-03T04:00:00Z',
        gamePk: 72,
        officialDate: '2026-10-03',
        timeValid: false,
      }),
    ],
    88,
    74,
    new Date(2026, 9, 3, 12, 0, 0),
  ).featuredGame?.gamePk,
  72,
);

// B29: MLB lists a postponed game under both dates with one gamePk and moves the postponed
// entry's official date to the makeup date. The makeup stays in the schedule.
const postponedToday = game({
  abstractState: 'Final',
  gameDate: '2026-08-29T23:10:00Z',
  gamePk: 777,
  officialDate: '2026-08-30',
  status: 'Postponed',
});
const makeupTomorrow = game({
  gameDate: '2026-08-30T21:10:00Z',
  gameNumber: 2,
  gamePk: 777,
  officialDate: '2026-08-30',
});
const regularTomorrow = game({
  gameDate: '2026-08-30T17:10:00Z',
  gamePk: 778,
  officialDate: '2026-08-30',
});
const postponedSnapshot = snapshotFromGames(
  [postponedToday, regularTomorrow, makeupTomorrow],
  62,
  66,
  now,
);
assert.equal(postponedSnapshot.featuredGame, postponedToday);
assert.equal(blocksPlayback(postponedToday), true);
assert.deepEqual(
  postponedSnapshot.upcomingGames.map(
    (entry) => `${entry.gamePk}#${entry.gameNumber}`,
  ),
  ['778#1', '777#2'],
);
// The same holds while the postponed entry still carries its original official date.
assert.deepEqual(
  snapshotFromGames(
    [{ ...postponedToday, officialDate: '2026-08-29' }, makeupTomorrow],
    62,
    66,
    now,
  ).upcomingGames.map((entry) => entry.gamePk),
  [777],
);

// A resumed game keeps its gamePk and official date; its interrupted first date is the same
// game and leaves the schedule while the resumption is featured.
const suspendedOriginal = game({
  abstractState: 'Live',
  gameDate: '2026-08-28T23:10:00Z',
  gamePk: 555,
  officialDate: '2026-08-28',
  status: 'Suspended: Rain',
});
const resumedToday = game({
  abstractState: 'Live',
  gameDate: '2026-08-29T17:10:00Z',
  gamePk: 555,
  officialDate: '2026-08-28',
  status: 'In Progress',
});
const resumedSnapshot = snapshotFromGames(
  [suspendedOriginal, resumedToday, tomorrow],
  62,
  66,
  now,
);
assert.equal(resumedSnapshot.featuredGame, resumedToday);
assert.deepEqual(
  resumedSnapshot.upcomingGames.map((entry) => entry.gamePk),
  [40],
);

// B48: a suspended game MLB still reports as Live does not outrank tonight's game.
const suspendedYesterday = game({
  abstractState: 'Live',
  gameDate: '2026-08-28T23:10:00Z',
  gamePk: 600,
  officialDate: '2026-08-28',
  status: 'Suspended: Rain',
});
const liveTonight = game({
  abstractState: 'Live',
  gameDate: '2026-08-29T23:40:00Z',
  gamePk: 601,
  officialDate: '2026-08-29',
  status: 'In Progress',
});
assert.equal(
  snapshotFromGames([suspendedYesterday, liveTonight], 62, 66, now).featuredGame
    ?.gamePk,
  601,
);
// Of two games reported Live, today's official date wins.
assert.equal(
  snapshotFromGames(
    [
      game({
        abstractState: 'Live',
        gameDate: '2026-08-28T23:10:00Z',
        gamePk: 602,
        officialDate: '2026-08-28',
        status: 'In Progress',
      }),
      liveTonight,
    ],
    62,
    66,
    now,
  ).featuredGame?.gamePk,
  601,
);
// A delayed game in progress is still the Live pick.
assert.equal(
  snapshotFromGames(
    [{ ...liveTonight, status: 'Delayed: Rain' }, tomorrow],
    62,
    66,
    now,
  ).featuredGame?.gamePk,
  601,
);

// B48: a start delayed past local midnight keeps the card until MLB marks it Live.
const delayedStart = game({
  gameDate: '2026-08-30T00:10:00Z',
  gamePk: 610,
  officialDate: '2026-08-29',
  status: 'Delayed Start: Rain',
});
const afterMidnight = new Date(2026, 7, 30, 0, 30, 0);
const delayedSnapshot = snapshotFromGames(
  [delayedStart, tomorrow],
  62,
  66,
  afterMidnight,
);
assert.equal(delayedSnapshot.featuredGame?.gamePk, 610);
assert.deepEqual(
  delayedSnapshot.upcomingGames.map((entry) => entry.gamePk),
  [40],
);
// Two days later it is gone.
assert.equal(
  snapshotFromGames([delayedStart], 62, 66, new Date(2026, 7, 31, 0, 30, 0))
    .featuredGame,
  undefined,
);

// B13: MLB reports Warmup as Live before first pitch; it stays a pre-game card.
const warmup = guardiansGameFromMlb({
  gameDate: '2026-08-29T23:10:00Z',
  gameNumber: 1,
  gamePk: 824950,
  officialDate: '2026-08-29',
  status: {
    abstractGameState: 'Live',
    codedGameState: 'P',
    detailedState: 'Warmup',
    statusCode: 'PW',
  },
  teams: {
    away: { score: 0, team: { id: 116, name: 'Detroit Tigers' } },
    home: { score: 0, team: { id: 114, name: 'Cleveland Guardians' } },
  },
});
assert.equal(warmup?.abstractState, 'Preview');
assert.equal(
  abstractStateFromMlb({ abstractGameState: 'Live', statusCode: 'I' }),
  'Live',
);
assert.equal(
  abstractStateFromMlb({ abstractGameState: 'Final', statusCode: 'O' }),
  'Final',
);

// B05: the five-second poll keeps MLB's detailed state as the game status. The inning text
// stays on the scoreboard, so a rain delay remains visible.
const scheduleDocument = {
  dates: [
    {
      date: '2026-08-29',
      games: [
        {
          gameDate: '2026-08-29T23:10:00Z',
          gamePk: 824960,
          linescore: {
            currentInningOrdinal: '5th',
            inningState: 'Top',
            innings: [{ away: { runs: 1 }, home: { runs: 2 }, num: 1 }],
            teams: {
              away: { errors: 0, hits: 4, runs: 1 },
              home: { errors: 1, hits: 6, runs: 3 },
            },
          },
          officialDate: '2026-08-29',
          status: {
            abstractGameState: 'Live',
            codedGameState: 'I',
            detailedState: 'Delayed: Rain',
            statusCode: 'IR',
          },
          teams: { away: { score: 1 }, home: { score: 3 } },
        },
      ],
    },
  ],
};
const liveCard = game({
  abstractState: 'Live',
  gameDate: '2026-08-29T23:10:00Z',
  gamePk: 824960,
  status: 'In Progress',
});
const report = liveGameFromSchedule(scheduleDocument, liveCard);
assert.ok(report);
assert.equal(report.status.detailedState, 'Delayed: Rain');
assert.equal(report.linescore?.status, 'Top 5th');
const delayedCard = gameWithLiveReport(liveCard, {
  awayScore: report.awayScore,
  homeScore: report.homeScore,
  scoreboard: report.linescore,
  status: report.status,
});
assert.equal(delayedCard.status, 'Delayed: Rain');
assert.equal(gameInterruption(delayedCard.status), 'delayed');
assert.equal(delayedCard.scoreboard?.status, 'Top 5th');
assert.equal(delayedCard.abstractState, 'Live');
assert.equal(delayedCard.guardiansScore, 3);
assert.equal(delayedCard.opponentScore, 1);
// Final from the poll reaches the card without waiting for the schedule refresh.
const finalCard = gameWithLiveReport(liveCard, {
  awayScore: 1,
  homeScore: 4,
  status: { abstractGameState: 'Final', detailedState: 'Final' },
});
assert.equal(finalCard.abstractState, 'Final');
assert.equal(finalCard.guardiansScore, 4);
assert.equal(recapResult(finalCard), 'WIN');
// The poll picks the entry for the featured date when a gamePk appears under two dates.
const twoDates = {
  dates: [
    {
      games: [
        {
          gameDate: '2026-08-28T23:10:00Z',
          gamePk: 555,
          officialDate: '2026-08-28',
          status: { abstractGameState: 'Live', detailedState: 'Suspended: Rain' },
        },
      ],
    },
    {
      games: [
        {
          gameDate: '2026-08-29T17:10:00Z',
          gamePk: 555,
          officialDate: '2026-08-28',
          status: { abstractGameState: 'Live', detailedState: 'In Progress' },
        },
      ],
    },
  ],
};
assert.equal(
  liveGameFromSchedule(twoDates, resumedToday)?.status.detailedState,
  'In Progress',
);
assert.equal(
  liveGameFromSchedule(twoDates, suspendedOriginal)?.status.detailedState,
  'Suspended: Rain',
);
// An entry without MLB's game state is not applied.
assert.equal(
  liveGameFromSchedule(
    {
      dates: [
        {
          games: [
            {
              gameDate: liveCard.gameDate,
              gamePk: liveCard.gamePk,
              officialDate: liveCard.officialDate,
            },
          ],
        },
      ],
    },
    liveCard,
  ),
  undefined,
);

// B01: guide strings are not entries, and past the cap the newest entries are kept.
function streamEntry(gameDate) {
  return {
    allowInsecureHttp: false,
    gameDates: [gameDate],
    gameNumbers: [1],
    kind: 'web',
    trustedHosts: [],
    url: 'https://gooz.aapmains.net/new-stream-embed/55387?ad=111',
  };
}
function isoDay(offset) {
  return new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);
}
const sixtyEntries = guardiansStreamsFromDocument({
  HOW_TO_GUIDE: ['Add one entry per game.'],
  streams: [
    'INACTIVE EXAMPLE BELOW',
    streamEntry('2026-01-01'),
    'REAL ENTRIES BELOW',
    ...Array.from({ length: 60 }, (_, index) => streamEntry(isoDay(index + 1))),
  ],
});
assert.equal(sixtyEntries?.length, 61);
const overCap = guardiansStreamsFromDocument({
  streams: [
    'GUIDE',
    ...Array.from({ length: 250 }, (_, index) => streamEntry(isoDay(index))),
  ],
});
assert.equal(overCap?.length, 200);
assert.equal(overCap?.[0]?.gameDates[0], isoDay(50));
assert.equal(overCap?.at(-1)?.gameDates[0], isoDay(249));
assert.equal(guardiansStreamsFromDocument({ streams: 'none' }), undefined);

console.log('Guardians snapshot recap states passed.');
