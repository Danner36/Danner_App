import assert from 'node:assert/strict';

import {
  basketballSeasonYear,
  chicagoDateString,
  cyclonesGameFromEspnEvent,
  footballSeasonYear,
  recapResult,
  recordLabel,
  recordsFromGames,
  snapshotFromGames,
  sportStatus,
} from '../../app/cyclones/cyclonesSnapshot.ts';
import {
  authorizedStreamsForGame,
  cyclonesStreamsFromDocument,
} from '../../app/cyclones/cyclonesSources.ts';

const recapNow = new Date(2026, 8, 5, 20, 15, 0);
const gameDay = new Date(2026, 8, 5, 14, 15, 0);
const now = new Date(2026, 8, 6, 14, 15, 0);

function game(overrides) {
  return {
    abstractState: 'Preview',
    cyclonesScore: 0,
    gameDate: '2026-09-05T17:00:00Z',
    gameNumber: 1,
    gamePk: 1,
    isHome: true,
    notes: '',
    officialDate: '2026-09-05',
    opponentName: 'Southeast Missouri State Redhawks',
    opponentScore: 0,
    seasonType: 2,
    sport: 'football',
    status: 'Scheduled',
    timeValid: true,
    ...overrides,
  };
}

const footballWin = game({
  abstractState: 'Final',
  gamePk: 20,
  cyclonesScore: 24,
  opponentScore: 17,
  status: 'Final',
});
const laterHoops = game({
  gameDate: '2026-09-05T23:00:00Z',
  gamePk: 21,
  officialDate: '2026-09-05',
  opponentName: 'Memphis Tigers',
  sport: 'mens-basketball',
});
const liveFootball = game({
  abstractState: 'Live',
  gamePk: 30,
  cyclonesScore: 14,
  opponentScore: 10,
  status: 'Q2 4:12',
});
const tomorrowFootball = game({
  gameDate: '2026-09-12T16:00:00Z',
  gamePk: 40,
  officialDate: '2026-09-12',
  opponentName: 'Iowa Hawkeyes',
});
const tbaHoops = game({
  gameDate: '2026-11-02T00:00:00Z',
  gamePk: 50,
  officialDate: '2026-11-02',
  opponentName: 'Memphis Tigers',
  sport: 'mens-basketball',
  timeValid: false,
});
const preseasonFootball = game({
  abstractState: 'Final',
  gameDate: '2026-08-28T00:00:00Z',
  gamePk: 10,
  officialDate: '2026-08-27',
  cyclonesScore: 13,
  opponentScore: 17,
  seasonType: 1,
  status: 'Final',
});

assert.equal(
  snapshotFromGames([footballWin, tomorrowFootball], undefined, recapNow)
    .featuredGame?.gamePk,
  20,
);
assert.deepEqual(
  snapshotFromGames([footballWin, tomorrowFootball], undefined, recapNow)
    .upcomingGames.map((entry) => entry.gamePk),
  [40],
);
assert.equal(
  snapshotFromGames([footballWin, tomorrowFootball], undefined, now)
    .featuredGame?.gamePk,
  undefined,
);

assert.equal(
  snapshotFromGames([liveFootball, laterHoops], undefined, gameDay).featuredGame
    ?.gamePk,
  30,
);
assert.deepEqual(
  snapshotFromGames(
    [liveFootball, laterHoops],
    undefined,
    gameDay,
  ).upcomingGames.map((entry) => entry.gamePk),
  [21],
);

assert.equal(
  snapshotFromGames([laterHoops, tomorrowFootball], undefined, gameDay)
    .featuredGame?.sport,
  'mens-basketball',
);

assert.equal(recapResult(footballWin), 'WIN');
assert.equal(
  recapResult(game({ cyclonesScore: 13, opponentScore: 13 })),
  'TIE',
);
assert.equal(recordLabel(11, 6, 0), '11–6');
assert.equal(recordLabel(1, 1, 1), '1–1–1');

const records = recordsFromGames([preseasonFootball, footballWin]);
assert.deepEqual(records.football, { losses: 0, ties: 0, wins: 1 });
assert.deepEqual(records['mens-basketball'], { losses: 0, ties: 0, wins: 0 });

assert.equal(footballSeasonYear(new Date(2026, 8, 5)), 2026);
assert.equal(footballSeasonYear(new Date(2027, 0, 8)), 2026);
assert.equal(basketballSeasonYear(new Date(2026, 7, 1)), 2027);
assert.equal(basketballSeasonYear(new Date(2027, 1, 8)), 2027);

const ncaaLoss = game({
  abstractState: 'Final',
  gameDate: '2027-03-20T00:00:00Z',
  gamePk: 80,
  officialDate: '2027-03-19',
  cyclonesScore: 60,
  opponentScore: 72,
  notes: 'NCAA Tournament second round',
  seasonType: 3,
  sport: 'mens-basketball',
  status: 'Final',
});
assert.equal(
  sportStatus([ncaaLoss], 'mens-basketball', new Date(2027, 2, 21))?.kind,
  'eliminated',
);

const cfpWin = game({
  abstractState: 'Final',
  gameDate: '2027-01-01T01:00:00Z',
  gamePk: 81,
  officialDate: '2026-12-31',
  cyclonesScore: 31,
  opponentScore: 24,
  notes: 'College Football Playoff quarterfinal',
  seasonType: 3,
  status: 'Final',
});
assert.equal(
  sportStatus([cfpWin], 'football', new Date(2027, 0, 2))?.kind,
  'awaiting-next',
);

const pairing = game({
  abstractState: 'Final',
  gameDate: '2027-03-15T00:00:00Z',
  gamePk: 82,
  officialDate: '2027-03-14',
  cyclonesScore: 80,
  opponentScore: 70,
  notes: 'Selection Sunday pairing',
  seasonType: 3,
  sport: 'mens-basketball',
  status: 'Final',
});
assert.equal(
  sportStatus([pairing], 'mens-basketball', new Date(2027, 2, 16))?.kind,
  'awaiting-next',
);

function espnEvent(statusType, overrides = {}) {
  return {
    id: '401856779',
    date: '2026-09-05T17:00:00Z',
    name: 'Southeast Missouri State Redhawks at Iowa State Cyclones',
    seasonType: { type: 2, name: 'Regular Season' },
    timeValid: true,
    competitions: [
      {
        timeValid: true,
        status: { type: statusType },
        competitors: [
          {
            id: '66',
            homeAway: 'home',
            score: '0',
            team: { id: '66', displayName: 'Iowa State Cyclones' },
          },
          {
            id: '2546',
            homeAway: 'away',
            score: '0',
            team: {
              id: '2546',
              displayName: 'Southeast Missouri State Redhawks',
            },
          },
        ],
      },
    ],
    ...overrides,
  };
}

const parsed = cyclonesGameFromEspnEvent(
  espnEvent({
    description: 'Scheduled',
    detail: 'Sat, September 5th at 12:00 PM CDT',
    name: 'STATUS_SCHEDULED',
    shortDetail: '9/5 - 12:00 PM CDT',
    state: 'pre',
  }),
  'football',
);
assert.equal(parsed?.gamePk, 401856779);
assert.equal(parsed?.isHome, true);
assert.equal(parsed?.opponentName, 'Southeast Missouri State Redhawks');
assert.equal(parsed?.status, 'Scheduled');
assert.equal(parsed?.timeValid, true);
assert.equal(parsed?.officialDate, '2026-09-05');
assert.equal(parsed?.sport, 'football');
assert.equal(chicagoDateString(new Date('2026-09-05T17:00:00Z')), '2026-09-05');
assert.equal(tbaHoops.timeValid, false);

const streams = cyclonesStreamsFromDocument({
  streams: [
    {
      allowInsecureHttp: false,
      gameDates: ['2026-09-05'],
      gameNumbers: [1],
      kind: 'web',
      sport: 'football',
      trustedHosts: [],
      url: 'https://example.com/football',
    },
    {
      allowInsecureHttp: false,
      gameDates: ['2026-09-05'],
      gameNumbers: [1],
      kind: 'web',
      sport: 'mens-basketball',
      trustedHosts: [],
      url: 'https://example.com/hoops',
    },
    {
      allowInsecureHttp: false,
      gameDates: ['2026-09-05'],
      gameNumbers: [1],
      kind: 'web',
      trustedHosts: [],
      url: 'https://example.com/missing-sport',
    },
  ],
});
assert.equal(streams?.length, 2);
assert.equal(
  authorizedStreamsForGame(streams, {
    gameNumber: 1,
    officialDate: '2026-09-05',
    sport: 'football',
  })[0]?.url,
  'https://example.com/football',
);

process.stdout.write('Cyclones snapshot assertions passed.\n');
