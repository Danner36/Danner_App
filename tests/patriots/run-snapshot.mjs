import assert from 'node:assert/strict';

import {
  easternDateString,
  nflSeasonYear,
  patriotsGameFromEspnEvent,
  recapResult,
  recordLabel,
  regularSeasonRecord,
  snapshotFromGames,
} from '../../app/patriots/patriotsSnapshot.ts';

const recapNow = new Date(2026, 8, 9, 20, 15, 0);
const now = new Date(2026, 8, 10, 20, 15, 0);

function game(overrides) {
  return {
    abstractState: 'Preview',
    gameDate: '2026-09-10T00:20:00Z',
    gameNumber: 1,
    gamePk: 1,
    isHome: false,
    officialDate: '2026-09-09',
    opponentName: 'Seattle Seahawks',
    opponentScore: 0,
    patriotsScore: 0,
    seasonType: 2,
    status: 'Scheduled',
    timeValid: true,
    ...overrides,
  };
}

const preseason = game({
  abstractState: 'Final',
  gameDate: '2026-08-28T00:00:00Z',
  gamePk: 10,
  officialDate: '2026-08-27',
  opponentName: 'Cleveland Browns',
  opponentScore: 37,
  patriotsScore: 13,
  seasonType: 1,
  status: 'Final',
});
const win = game({
  abstractState: 'Final',
  gameDate: '2026-09-10T00:20:00Z',
  gamePk: 20,
  officialDate: '2026-09-09',
  patriotsScore: 24,
  opponentScore: 17,
  status: 'Final',
});
const laterToday = game({
  gameDate: '2026-09-10T23:15:00Z',
  gamePk: 21,
  officialDate: '2026-09-10',
  opponentName: 'New York Jets',
});
const live = game({
  abstractState: 'Live',
  gamePk: 30,
  officialDate: '2026-09-10',
  patriotsScore: 14,
  opponentScore: 10,
  status: 'Q2 4:12',
});
const tomorrow = game({
  gameDate: '2026-09-14T17:00:00Z',
  gamePk: 40,
  officialDate: '2026-09-14',
  opponentName: 'Miami Dolphins',
});
const tba = game({
  gameDate: '2026-12-20T18:00:00Z',
  gamePk: 50,
  officialDate: '2026-12-20',
  opponentName: 'Buffalo Bills',
  timeValid: false,
});

assert.equal(
  snapshotFromGames([win, tomorrow], 1, 0, 0, recapNow).featuredGame?.gamePk,
  20,
);
assert.deepEqual(
  snapshotFromGames([win, tomorrow], 1, 0, 0, recapNow).upcomingGames.map(
    (entry) => entry.gamePk,
  ),
  [40],
);
assert.equal(
  snapshotFromGames([win, tomorrow], 1, 0, 0, now).featuredGame?.gamePk,
  undefined,
);

assert.equal(
  snapshotFromGames([live, tomorrow], 0, 0, 0, now).featuredGame?.gamePk,
  30,
);
assert.deepEqual(
  snapshotFromGames([live, tomorrow], 0, 0, 0, now).upcomingGames.map(
    (entry) => entry.gamePk,
  ),
  [40],
);

assert.equal(
  snapshotFromGames([laterToday, tomorrow], 0, 0, 0, now).featuredGame?.gamePk,
  21,
);

assert.equal(recapResult(win), 'WIN');
assert.equal(
  recapResult(game({ patriotsScore: 13, opponentScore: 13 })),
  'TIE',
);
assert.equal(recordLabel(11, 6, 0), '11–6');
assert.equal(recordLabel(1, 1, 1), '1–1–1');

const record = regularSeasonRecord([preseason, win]);
assert.deepEqual(record, { losses: 0, ties: 0, wins: 1 });

assert.equal(nflSeasonYear(new Date(2026, 8, 10)), 2026);
assert.equal(nflSeasonYear(new Date(2027, 1, 8)), 2026);

function espnEvent(statusType, overrides = {}) {
  return {
    id: '401872656',
    date: '2026-09-10T00:20:00Z',
    seasonType: { type: 2 },
    timeValid: true,
    competitions: [
      {
        timeValid: true,
        status: { type: statusType },
        competitors: [
          {
            id: '26',
            homeAway: 'home',
            score: '0',
            team: { id: '26', displayName: 'Seattle Seahawks' },
          },
          {
            id: '17',
            homeAway: 'away',
            score: '0',
            team: { id: '17', displayName: 'New England Patriots' },
          },
        ],
      },
    ],
    ...overrides,
  };
}

const parsed = patriotsGameFromEspnEvent(
  espnEvent({
    description: 'Scheduled',
    detail: 'Wed, September 9th at 8:20 PM EDT',
    name: 'STATUS_SCHEDULED',
    shortDetail: '9/9 - 8:20 PM EDT',
    state: 'pre',
  }),
);
assert.equal(parsed?.gamePk, 401872656);
assert.equal(parsed?.isHome, false);
assert.equal(parsed?.opponentName, 'Seattle Seahawks');
assert.equal(parsed?.status, 'Scheduled');
assert.equal(parsed?.timeValid, true);
assert.equal(parsed?.officialDate, '2026-09-09');
assert.equal(
  patriotsGameFromEspnEvent(
    espnEvent({
      description: 'Delayed',
      detail: 'Delayed',
      name: 'STATUS_DELAYED',
      state: 'pre',
    }),
  )?.status,
  'Delayed',
);
assert.equal(
  patriotsGameFromEspnEvent(
    espnEvent({
      description: 'In Progress',
      detail: 'Q2 4:12',
      name: 'STATUS_IN_PROGRESS',
      shortDetail: 'Q2 4:12',
      state: 'in',
    }),
  )?.status,
  'Q2 4:12',
);
assert.equal(easternDateString(new Date('2026-09-10T00:20:00Z')), '2026-09-09');
assert.equal(tba.timeValid, false);

const espnFinal = patriotsGameFromEspnEvent(
  espnEvent(
    {
      completed: true,
      description: 'Final',
      detail: 'Final',
      name: 'STATUS_FINAL',
      shortDetail: 'Final',
      state: 'post',
    },
    {
      competitions: [
        {
          timeValid: true,
          status: {
            type: {
              completed: true,
              description: 'Final',
              detail: 'Final',
              name: 'STATUS_FINAL',
              shortDetail: 'Final',
              state: 'post',
            },
          },
          competitors: [
            {
              homeAway: 'home',
              id: '26',
              score: { displayValue: '17', value: 17.0 },
              team: { displayName: 'Seattle Seahawks', id: '26' },
            },
            {
              homeAway: 'away',
              id: '17',
              score: { displayValue: '24', value: 24.0 },
              team: { displayName: 'New England Patriots', id: '17' },
            },
          ],
        },
      ],
    },
  ),
);
assert.equal(espnFinal?.abstractState, 'Final');
assert.equal(espnFinal?.patriotsScore, 24);
assert.equal(espnFinal?.opponentScore, 17);
assert.equal(recapResult(espnFinal), 'WIN');

process.stdout.write('Patriots snapshot assertions passed.\n');
