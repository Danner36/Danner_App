import assert from 'node:assert/strict';

import {
  guardiansGameFromMlb,
  recapResult,
  snapshotFromGames,
} from '../../app/guardians/guardiansSnapshot.ts';

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

console.log('Guardians snapshot recap states passed.');
