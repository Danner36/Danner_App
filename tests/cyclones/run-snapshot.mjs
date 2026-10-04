import assert from 'node:assert/strict';

import {
  basketballSeasonYear,
  chicagoDateString,
  cyclonesGameFromEspnEvent,
  cyclonesGameFromHarness,
  easternDateString,
  footballSeasonYear,
  isVideoWindowOpen,
  recapResult,
  recordLabel,
  recordsFromGames,
  snapshotFromGames,
  sportStatus,
  statusesFromGames,
} from '../../app/cyclones/cyclonesSnapshot.ts';
import {
  authorizedStreamsForGame,
  cyclonesStreamsFromDocument,
} from '../../app/cyclones/cyclonesSources.ts';
import {
  liveCyclonesSummaryFromEspn,
  liveFootballScoreboardFromEspn,
} from '../../app/cyclones/espnCyclonesScoreboard.ts';

// Featuring and day checks use the phone's local calendar, so fixture times are built in the
// machine's local time zone and the assertions hold in any zone.
function localIso(year, monthIndex, day, hour, minute = 0) {
  return new Date(year, monthIndex, day, hour, minute).toISOString();
}

const recapNow = new Date(2026, 8, 5, 20, 15, 0);
const gameDay = new Date(2026, 8, 5, 14, 15, 0);
const now = new Date(2026, 8, 6, 14, 15, 0);

function game(overrides) {
  return {
    abstractState: 'Preview',
    cyclonesScore: 0,
    gameDate: localIso(2026, 8, 5, 12),
    gameNumber: 1,
    gamePk: 1,
    isHome: true,
    neutralSite: false,
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
  gameDate: localIso(2026, 8, 5, 18),
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
  gameDate: localIso(2026, 8, 12, 11),
  gamePk: 40,
  officialDate: '2026-09-12',
  opponentName: 'Iowa Hawkeyes',
});
// ESPN places a game without a start time at midnight Eastern of its calendar day.
const tbaHoops = game({
  gameDate: '2026-11-02T05:00:00Z',
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

function postseasonFinal(overrides) {
  return game({
    abstractState: 'Final',
    seasonType: 3,
    status: 'Final',
    ...overrides,
  });
}

function statusFor(finalGame, nowDate, extraGames = []) {
  return sportStatus([finalGame, ...extraGames], finalGame.sport, nowDate);
}

const ncaaLoss = postseasonFinal({
  gameDate: localIso(2027, 2, 19, 19),
  gamePk: 80,
  officialDate: '2027-03-19',
  cyclonesScore: 60,
  opponentScore: 72,
  notes: 'NCAA Tournament second round',
  sport: 'mens-basketball',
});
assert.equal(statusFor(ncaaLoss, new Date(2027, 2, 21))?.kind, 'eliminated');
assert.equal(
  statusFor(
    {
      ...ncaaLoss,
      notes: "NCAA Women's Tournament - Second Round",
      sport: 'womens-basketball',
    },
    new Date(2027, 2, 21),
  )?.label,
  'Eliminated from the NCAA Tournament',
);

// A game dated today that has not gone Final keeps the season alive, even after its
// scheduled start.
const pendingToday = game({
  gameDate: localIso(2027, 2, 21, 12),
  gamePk: 83,
  officialDate: '2027-03-21',
  sport: 'mens-basketball',
  status: 'Scheduled',
});
assert.equal(
  statusFor(ncaaLoss, new Date(2027, 2, 21, 18), [pendingToday]),
  undefined,
);

// Football: only College Football Playoff games are knockout rounds.
const cfpWin = postseasonFinal({
  gameDate: localIso(2026, 11, 31, 19),
  gamePk: 81,
  officialDate: '2026-12-31',
  cyclonesScore: 31,
  opponentScore: 24,
  notes: 'College Football Playoff quarterfinal',
});
assert.deepEqual(statusFor(cfpWin, new Date(2027, 0, 2)), {
  kind: 'awaiting-next',
  label: 'Awaiting next College Football Playoff game',
});
assert.equal(
  statusFor(
    { ...cfpWin, notes: 'Rose Bowl Game Presented by Prudential - CFP Quarterfinal' },
    new Date(2027, 0, 2),
  )?.kind,
  'awaiting-next',
);
assert.deepEqual(
  statusFor({ ...cfpWin, cyclonesScore: 17 }, new Date(2027, 0, 2)),
  { kind: 'eliminated', label: 'Eliminated from the College Football Playoff' },
);
assert.deepEqual(
  statusFor(
    {
      ...cfpWin,
      notes: 'College Football Playoff National Championship Presented by AT&T',
    },
    new Date(2027, 0, 21),
  ),
  { kind: 'won-tournament', label: 'Won the College Football Playoff' },
);
const bowlWin = postseasonFinal({
  gameDate: localIso(2026, 11, 27, 14),
  gamePk: 90,
  officialDate: '2026-12-27',
  cyclonesScore: 30,
  opponentScore: 20,
  notes: 'Iowa State Cyclones vs Miami Hurricanes ISU vs MIA Postseason Pop-Tarts Bowl',
});
assert.equal(statusFor(bowlWin, new Date(2027, 0, 5))?.kind, 'season-complete');
assert.equal(
  statusFor({ ...bowlWin, cyclonesScore: 10 }, new Date(2027, 0, 5))?.kind,
  'season-complete',
);
assert.equal(
  statusesFromGames([bowlWin], new Date(2027, 0, 5)).football,
  undefined,
);

// NCAA tournament notes as ESPN writes them.
const ncaaFirstRound = postseasonFinal({
  gameDate: localIso(2027, 2, 19, 13),
  gamePk: 91,
  officialDate: '2027-03-19',
  cyclonesScore: 80,
  opponentScore: 70,
  notes: "Men's Basketball Championship - East Region - 1st Round",
  sport: 'mens-basketball',
});
assert.deepEqual(statusFor(ncaaFirstRound, new Date(2027, 2, 19, 22)), {
  kind: 'awaiting-next',
  label: 'Awaiting next NCAA Tournament game',
});
assert.deepEqual(
  statusFor({ ...ncaaFirstRound, cyclonesScore: 60 }, new Date(2027, 2, 20)),
  { kind: 'eliminated', label: 'Eliminated from the NCAA Tournament' },
);
assert.equal(
  statusFor(
    {
      ...ncaaFirstRound,
      cyclonesScore: 55,
      notes: "Women's Basketball Championship - Albany Regional 1 - Sweet 16",
      sport: 'womens-basketball',
    },
    new Date(2027, 2, 30),
  )?.kind,
  'eliminated',
);
assert.equal(
  statusFor(
    { ...ncaaFirstRound, notes: "Men's Basketball Championship - Final Four" },
    new Date(2027, 3, 4),
  )?.kind,
  'awaiting-next',
);
assert.deepEqual(
  statusFor(
    {
      ...ncaaFirstRound,
      notes: "Men's Basketball Championship - National Championship",
    },
    new Date(2027, 3, 6),
  ),
  { kind: 'won-tournament', label: 'Won the NCAA Tournament' },
);

// A conference tournament result waits on Selection Sunday instead of eliminating.
const big12Semifinal = postseasonFinal({
  gameDate: localIso(2027, 2, 12, 18),
  gamePk: 92,
  officialDate: '2027-03-12',
  cyclonesScore: 60,
  opponentScore: 70,
  notes: 'Big 12 Tournament - Semifinal',
  sport: 'mens-basketball',
});
assert.deepEqual(statusFor(big12Semifinal, new Date(2027, 2, 14, 12)), {
  kind: 'awaiting-next',
  label: 'Awaiting next tournament game',
});
assert.equal(
  statusFor(big12Semifinal, new Date(2027, 3, 10))?.kind,
  'season-complete',
);
assert.equal(
  statusFor(
    {
      ...big12Semifinal,
      cyclonesScore: 75,
      notes: 'Big 12 Tournament - Championship',
    },
    new Date(2027, 2, 14, 12),
  )?.kind,
  'awaiting-next',
);
assert.equal(
  statusFor(
    {
      ...big12Semifinal,
      notes: "Phillips 66 Big 12 Men's Basketball Championship - Quarterfinal",
    },
    new Date(2027, 2, 14, 12),
  )?.kind,
  'awaiting-next',
);

const nitLoss = postseasonFinal({
  gameDate: localIso(2027, 2, 21, 18),
  gamePk: 93,
  officialDate: '2027-03-21',
  cyclonesScore: 61,
  opponentScore: 66,
  notes: 'NIT - Second Round',
  sport: 'mens-basketball',
});
assert.deepEqual(statusFor(nitLoss, new Date(2027, 2, 23)), {
  kind: 'eliminated',
  label: 'Eliminated from the NIT',
});
assert.deepEqual(
  statusFor(
    { ...nitLoss, cyclonesScore: 70, notes: 'NIT - Championship' },
    new Date(2027, 3, 5),
  ),
  { kind: 'won-tournament', label: 'Won the NIT' },
);
assert.equal(
  statusFor(
    { ...nitLoss, notes: 'NIT Season Tip-Off - Semifinal', seasonType: 2 },
    new Date(2027, 2, 23),
  )?.kind,
  'season-complete',
);
assert.equal(
  statusFor(
    {
      ...nitLoss,
      notes: 'WBIT - First Round',
      sport: 'womens-basketball',
    },
    new Date(2027, 2, 23),
  )?.label,
  'Eliminated from the WBIT',
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
assert.equal(parsed?.cyclonesScore, 0);
assert.equal(parsed?.opponentScore, 0);
assert.equal(chicagoDateString(new Date('2026-09-05T17:00:00Z')), '2026-09-05');
assert.equal(tbaHoops.timeValid, false);

const espnFinal = cyclonesGameFromEspnEvent(
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
              id: '66',
              score: { displayValue: '38', value: 38.0 },
              team: { displayName: 'Iowa State Cyclones', id: '66' },
              winner: true,
            },
            {
              homeAway: 'away',
              id: '2546',
              score: { displayValue: '10', value: 10.0 },
              team: {
                displayName: 'Southeast Missouri State Redhawks',
                id: '2546',
              },
              winner: false,
            },
          ],
        },
      ],
    },
  ),
  'football',
);
assert.equal(espnFinal?.abstractState, 'Final');
assert.equal(espnFinal?.cyclonesScore, 38);
assert.equal(espnFinal?.opponentScore, 10);
assert.equal(espnFinal?.status, 'Final');
assert.equal(recapResult(espnFinal), 'WIN');
assert.deepEqual(recordsFromGames([espnFinal]).football, {
  losses: 0,
  ties: 0,
  wins: 1,
});

const displayValueOnly = cyclonesGameFromEspnEvent(
  espnEvent(
    {
      description: 'Final',
      detail: 'Final',
      name: 'STATUS_FINAL',
      state: 'post',
    },
    {
      competitions: [
        {
          status: {
            type: {
              description: 'Final',
              detail: 'Final',
              name: 'STATUS_FINAL',
              state: 'post',
            },
          },
          competitors: [
            {
              homeAway: 'home',
              id: '66',
              score: { displayValue: '21' },
              team: { displayName: 'Iowa State Cyclones', id: '66' },
            },
            {
              homeAway: 'away',
              id: '2546',
              score: { displayValue: '24' },
              team: {
                displayName: 'Southeast Missouri State Redhawks',
                id: '2546',
              },
            },
          ],
        },
      ],
    },
  ),
  'football',
);
assert.equal(displayValueOnly?.cyclonesScore, 21);
assert.equal(displayValueOnly?.opponentScore, 24);
assert.equal(recapResult(displayValueOnly), 'LOSS');

const boardFromScheduleScoreObjects = liveFootballScoreboardFromEspn({
  competitions: [
    {
      competitors: [
        {
          homeAway: 'home',
          score: { displayValue: '38', value: 38.0 },
        },
        {
          homeAway: 'away',
          score: { displayValue: '10', value: 10.0 },
        },
      ],
      status: {
        displayClock: '0:00',
        period: 4,
        type: { detail: 'Final', shortDetail: 'Final' },
      },
    },
  ],
});
assert.equal(boardFromScheduleScoreObjects?.home.points, 38);
assert.equal(boardFromScheduleScoreObjects?.away.points, 10);

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

// Games without a start time take the Eastern calendar date and count as all-day games.
const scheduledType = {
  description: 'Scheduled',
  detail: 'TBD',
  name: 'STATUS_SCHEDULED',
  shortDetail: 'TBD',
  state: 'pre',
};
const tbaParsed = cyclonesGameFromEspnEvent(
  espnEvent(scheduledType, { date: '2026-11-02T05:00Z', timeValid: false }),
  'mens-basketball',
);
assert.equal(tbaParsed?.timeValid, false);
assert.equal(chicagoDateString(new Date('2026-11-02T05:00Z')), '2026-11-01');
assert.equal(easternDateString(new Date('2026-11-02T05:00Z')), '2026-11-02');
assert.equal(tbaParsed?.officialDate, '2026-11-02');
assert.equal(
  cyclonesGameFromEspnEvent(
    espnEvent(scheduledType, { date: '2026-09-19T04:00Z', timeValid: false }),
    'football',
  )?.officialDate,
  '2026-09-19',
);
assert.equal(
  cyclonesGameFromEspnEvent(
    espnEvent(scheduledType, { date: '2026-09-20T00:00:00Z' }),
    'football',
  )?.officialDate,
  '2026-09-19',
);
const lateNov1 = game({
  gameDate: localIso(2026, 10, 1, 22),
  gamePk: 51,
  officialDate: '2026-11-01',
  sport: 'womens-basketball',
});
assert.deepEqual(
  snapshotFromGames(
    [tbaHoops, lateNov1],
    undefined,
    new Date(2026, 9, 31, 12),
  ).upcomingGames.map((entry) => entry.gamePk),
  [51, 50],
);
const nov1Snapshot = snapshotFromGames(
  [tbaHoops, lateNov1],
  undefined,
  new Date(2026, 10, 1, 12),
);
assert.equal(nov1Snapshot.featuredGame?.gamePk, 51);
assert.deepEqual(
  nov1Snapshot.upcomingGames.map((entry) => entry.gamePk),
  [50],
);
assert.equal(
  snapshotFromGames([tbaHoops], undefined, new Date(2026, 10, 1, 23, 30))
    .featuredGame,
  undefined,
);
assert.equal(
  snapshotFromGames([tbaHoops], undefined, new Date(2026, 10, 2, 0, 30))
    .featuredGame?.gamePk,
  50,
);
assert.equal(
  snapshotFromGames([tbaHoops], undefined, new Date(2026, 10, 2, 23, 30))
    .featuredGame?.gamePk,
  50,
);
const nov3Snapshot = snapshotFromGames(
  [tbaHoops],
  undefined,
  new Date(2026, 10, 3, 9),
);
assert.equal(nov3Snapshot.featuredGame, undefined);
assert.equal(nov3Snapshot.upcomingGames.length, 0);
assert.equal(
  sportStatus(
    [{ ...ncaaLoss, gameDate: localIso(2026, 10, 1, 19) }, tbaHoops],
    'mens-basketball',
    new Date(2026, 10, 2, 23),
  ),
  undefined,
);
const tbaStreams = cyclonesStreamsFromDocument({
  streams: [
    {
      allowInsecureHttp: false,
      gameDates: ['2026-11-02'],
      gameNumbers: [1],
      kind: 'web',
      sport: 'mens-basketball',
      trustedHosts: [],
      url: 'https://example.com/tba-hoops',
    },
  ],
});
assert.equal(authorizedStreamsForGame(tbaStreams, tbaParsed).length, 1);

// Video opens for any live game and 15 minutes before a known start time.
const startMs = new Date(localIso(2026, 8, 5, 12)).getTime();
assert.equal(
  isVideoWindowOpen(game({ abstractState: 'Live', timeValid: false }), startMs),
  true,
);
assert.equal(isVideoWindowOpen(game({ timeValid: false }), startMs), false);
assert.equal(isVideoWindowOpen(game({}), startMs - 10 * 60_000), true);
assert.equal(isVideoWindowOpen(game({}), startMs - 20 * 60_000), false);
assert.equal(
  isVideoWindowOpen(game({ status: 'Delayed' }), startMs - 10 * 60_000),
  true,
);
assert.equal(
  isVideoWindowOpen(game({ abstractState: 'Final', status: 'Final' }), startMs),
  false,
);
assert.equal(
  isVideoWindowOpen(
    game({ abstractState: 'Final', status: 'Postponed' }),
    startMs,
  ),
  false,
);

// Neutral-site games carry the ESPN flag.
const neutralCompetition = espnEvent(scheduledType).competitions[0];
assert.equal(parsed?.neutralSite, false);
assert.equal(
  cyclonesGameFromEspnEvent(
    espnEvent(scheduledType, {
      competitions: [{ ...neutralCompetition, neutralSite: true }],
    }),
    'football',
  )?.neutralSite,
  true,
);
assert.equal(
  cyclonesGameFromHarness({ ...liveFootball, neutralSite: true })?.neutralSite,
  true,
);
assert.equal(
  cyclonesGameFromHarness({ ...liveFootball, neutralSite: undefined })
    ?.neutralSite,
  false,
);

// The live summary reports ESPN state so Live and Final switch on the five-second poll.
function summaryDocument(type) {
  return {
    header: {
      competitions: [
        {
          competitors: [
            { homeAway: 'home', linescores: [], score: '31' },
            { homeAway: 'away', linescores: [], score: '17' },
          ],
          status: { displayClock: '0:00', period: 4, type },
        },
      ],
    },
  };
}
const finalSummary = liveCyclonesSummaryFromEspn(
  summaryDocument({ completed: true, detail: 'Final', state: 'post' }),
  'football',
);
assert.equal(finalSummary.state, 'post');
assert.equal(finalSummary.completed, true);
assert.equal(finalSummary.scoreboard?.home.points, 31);
assert.equal(finalSummary.scoreboard?.status, 'Final');
const liveSummary = liveCyclonesSummaryFromEspn(
  summaryDocument({ completed: false, detail: '2nd Half', state: 'in' }),
  'mens-basketball',
);
assert.equal(liveSummary.state, 'in');
assert.equal(liveSummary.completed, false);
assert.equal(liveSummary.scoreboard?.kind, 'basketball');
assert.equal(
  liveCyclonesSummaryFromEspn({}, 'football').state,
  undefined,
);

// The streams list keeps its newest 200 entries instead of rejecting the file.
function datedStream(index) {
  const day = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10);
  return {
    allowInsecureHttp: false,
    gameDates: [day],
    gameNumbers: [1],
    kind: 'web',
    sport: 'football',
    trustedHosts: [],
    url: `https://example.com/game-${index}`,
  };
}
const inactiveExample = {
  allowInsecureHttp: false,
  gameDates: ['YYYY-MM-DD'],
  gameNumbers: [1],
  kind: 'web',
  trustedHosts: [],
  url: 'https://example.com/example',
};
const fiftyOne = cyclonesStreamsFromDocument({
  streams: [
    'Guide line',
    inactiveExample,
    ...Array.from({ length: 50 }, (_, index) => datedStream(index)),
  ],
});
assert.equal(fiftyOne?.length, 50);
const oversized = cyclonesStreamsFromDocument({
  streams: [
    'Guide line',
    null,
    7,
    ['nested'],
    inactiveExample,
    ...Array.from({ length: 250 }, (_, index) => datedStream(index)),
  ],
});
assert.equal(oversized?.length, 200);
assert.equal(oversized?.at(-1)?.url, 'https://example.com/game-249');
assert.equal(
  oversized?.some((stream) => stream.url === 'https://example.com/game-49'),
  false,
);
assert.equal(oversized?.[0]?.url, 'https://example.com/game-50');

process.stdout.write('Cyclones snapshot assertions passed.\n');
