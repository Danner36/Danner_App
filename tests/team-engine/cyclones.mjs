import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { basketballBoardFromScheduleEvent } from '../../app/leagues/espn/basketballBoard.ts';
import { basketballRulesFor } from '../../app/leagues/espn/basketballRules.ts';
import { teamGameFromEspnEvent } from '../../app/leagues/espn/game.ts';
import { ESPN_ADAPTER_ROWS, seasonYearFor } from '../../app/leagues/espn/rows.ts';
import {
  basketballBoardFromEspnEvent,
  basketballBoardFromEspnSummary,
  boardTotals,
  liveSummaryFromEspn,
  periodBoardFromEspn,
} from '../../app/leagues/espn/summary.ts';
import { lineupCaptions } from '../../app/scoreboards/basketball/arenaText.ts';
import { streamsFromDocument } from '../../app/streams/sources.ts';
import { easternDateString } from '../../app/team/engine/dates.ts';
import {
  adapterRecords,
  snapshotFromGames as engineSnapshot,
} from '../../app/team/engine/featured.ts';
import { teamGameFromHarness } from '../../app/team/engine/harness.ts';
import {
  LIVE_BOARD_FRESH_MS,
  snapshotWithPreservedBoards as preserved,
} from '../../app/team/engine/liveMerge.ts';
import { sportStatus as engineSportStatus } from '../../app/team/engine/postseason.ts';
import { recordLabel } from '../../app/team/engine/records.ts';
import { authorizedStreamsForGame } from '../../app/team/engine/streamMatch.ts';
import { isVideoWindowOpen, recapResult } from '../../app/team/engine/videoWindow.ts';
import { CYCLONES_TILE } from '../../app/selection/presets.ts';

const CONFERENCE = 'Big 12';
const ADAPTERS = ['ncaa/football', 'ncaa/mens-basketball', 'ncaa/womens-basketball'];
const rowFor = (sport) => ESPN_ADAPTER_ROWS.find((row) => row.sport === sport);
const footballSeasonYear = (now) => seasonYearFor(rowFor('football').seasonYear, now);
const basketballSeasonYear = (now) => seasonYearFor(rowFor('mens-basketball').seasonYear, now);
const cyclonesGameFromEspnEvent = (event, sport) =>
  teamGameFromEspnEvent(event, rowFor(sport), { espnId: '66' }, event?.seasonType?.type ?? 2);
const cyclonesGameFromHarness = (value) =>
  teamGameFromHarness(
    value && { ...value, gameId: String(value.gamePk), board: undefined },
    CYCLONES_TILE,
  );
const cyclonesStreamsFromDocument = (value) => streamsFromDocument(value, { school: true });
const recordsFromGames = (games) => {
  const records = adapterRecords(games, ADAPTERS);
  return {
    football: records['ncaa/football'],
    'mens-basketball': records['ncaa/mens-basketball'],
    'womens-basketball': records['ncaa/womens-basketball'],
  };
};
const sportStatus = (games, sport, now) => engineSportStatus(games, sport, now, CONFERENCE);
const statusesFromGames = (games, now) => {
  const football = sportStatus(games, 'football', now);
  return { football: football?.kind === 'season-complete' ? undefined : football };
};
const snapshotFromGames = (games, records, now) =>
  engineSnapshot(games, records ?? {}, { conference: CONFERENCE, now, perGameCards: true });
const liveCyclonesSummaryFromEspn = (value, sport, poll) => liveSummaryFromEspn(value, rowFor(sport), poll);
const liveFootballScoreboardFromEspn = periodBoardFromEspn;
const liveBoardTotals = boardTotals;
const basketballBoardFromCyclonesSummary = (value, sport, poll, flags) =>
  basketballBoardFromEspnSummary(value, `ncaa/${sport}`, poll, flags);
const basketballBoardFromCyclonesEvent = (event, sport, polledAt) =>
  basketballBoardFromEspnEvent(event, `ncaa/${sport}`, polledAt);
const stampsOf = (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);
const snapshotWithPreservedScoreboard = (previous, next, stamps, nowMs) =>
  preserved(previous, next, stampsOf(stamps), nowMs);

// Featuring and day checks use the phone's local calendar, so fixture times are built in the
// machine's local time zone and the assertions hold in any zone.
function localIso(year, monthIndex, day, hour, minute = 0) {
  return new Date(year, monthIndex, day, hour, minute).toISOString();
}

const recapNow = new Date(2026, 8, 5, 20, 15, 0);
const gameDay = new Date(2026, 8, 5, 14, 15, 0);
const now = new Date(2026, 8, 6, 14, 15, 0);

function game(overrides) {
  const merged = {
    abstractState: 'Preview',
    gameDate: localIso(2026, 8, 5, 12),
    gameNumber: 1,
    gamePk: 1,
    isHome: true,
    neutralSite: false,
    notes: '',
    officialDate: '2026-09-05',
    opponentName: 'Southeast Missouri State Redhawks',
    opponentScore: 0,
    scoresKnown: true,
    seasonType: 2,
    sport: 'football',
    status: 'Scheduled',
    teamScore: 0,
    timeValid: true,
    ...overrides,
  };
  const adapter = `ncaa/${merged.sport}`;
  const gameId = String(merged.gamePk);
  return {
    ...merged,
    adapter,
    board: merged.scoreboard,
    gameId,
    key: `${adapter}:${gameId}:${merged.officialDate}`,
    scoreboard: merged.sport === 'football' ? 'periods' : 'basketball',
  };
}

const footballWin = game({
  abstractState: 'Final',
  gamePk: 20,
  teamScore: 24,
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
  teamScore: 14,
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
  teamScore: 13,
  opponentScore: 17,
  seasonType: 1,
  status: 'Final',
});

assert.equal(
  snapshotFromGames([footballWin, tomorrowFootball], undefined, recapNow)
    .featuredGames[0]?.gamePk,
  20,
);
assert.deepEqual(
  snapshotFromGames([footballWin, tomorrowFootball], undefined, recapNow)
    .upcomingGames.map((entry) => entry.gamePk),
  [40],
);
assert.equal(
  snapshotFromGames([footballWin, tomorrowFootball], undefined, now)
    .featuredGames[0]?.gamePk,
  undefined,
);

// Every game today gets its own card: the live game first, then today's later game.
assert.deepEqual(
  snapshotFromGames([liveFootball, laterHoops], undefined, gameDay)
    .featuredGames.map((entry) => entry.gamePk),
  [30, 21],
);
assert.deepEqual(
  snapshotFromGames(
    [liveFootball, laterHoops],
    undefined,
    gameDay,
  ).upcomingGames.map((entry) => entry.gamePk),
  [],
);

assert.equal(
  snapshotFromGames([laterHoops, tomorrowFootball], undefined, gameDay)
    .featuredGames[0]?.sport,
  'mens-basketball',
);

assert.equal(recapResult(footballWin), 'WIN');
assert.equal(
  recapResult(game({ teamScore: 13, opponentScore: 13 })),
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
  teamScore: 60,
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
  teamScore: 31,
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
  statusFor({ ...cfpWin, teamScore: 17 }, new Date(2027, 0, 2)),
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
  teamScore: 30,
  opponentScore: 20,
  notes: 'Iowa State Cyclones vs Miami Hurricanes ISU vs MIA Postseason Pop-Tarts Bowl',
});
assert.equal(statusFor(bowlWin, new Date(2027, 0, 5))?.kind, 'season-complete');
assert.equal(
  statusFor({ ...bowlWin, teamScore: 10 }, new Date(2027, 0, 5))?.kind,
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
  teamScore: 80,
  opponentScore: 70,
  notes: "Men's Basketball Championship - East Region - 1st Round",
  sport: 'mens-basketball',
});
assert.deepEqual(statusFor(ncaaFirstRound, new Date(2027, 2, 19, 22)), {
  kind: 'awaiting-next',
  label: 'Awaiting next NCAA Tournament game',
});
assert.deepEqual(
  statusFor({ ...ncaaFirstRound, teamScore: 60 }, new Date(2027, 2, 20)),
  { kind: 'eliminated', label: 'Eliminated from the NCAA Tournament' },
);
assert.equal(
  statusFor(
    {
      ...ncaaFirstRound,
      teamScore: 55,
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
  teamScore: 60,
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
      teamScore: 75,
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
  teamScore: 61,
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
    { ...nitLoss, teamScore: 70, notes: 'NIT - Championship' },
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
assert.equal(parsed?.gameId, '401856779');
assert.equal(parsed?.isHome, true);
assert.equal(parsed?.opponentName, 'Southeast Missouri State Redhawks');
assert.equal(parsed?.status, 'Scheduled');
assert.equal(parsed?.timeValid, true);
assert.equal(parsed?.officialDate, '2026-09-05');
assert.equal(parsed?.sport, 'football');
assert.equal(parsed?.teamScore, 0);
assert.equal(parsed?.opponentScore, 0);
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
assert.equal(espnFinal?.teamScore, 38);
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
assert.equal(displayValueOnly?.teamScore, 21);
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
assert.equal(nov1Snapshot.featuredGames[0]?.gamePk, 51);
assert.deepEqual(
  nov1Snapshot.upcomingGames.map((entry) => entry.gamePk),
  [50],
);
assert.equal(
  snapshotFromGames([tbaHoops], undefined, new Date(2026, 10, 1, 23, 30))
    .featuredGames[0],
  undefined,
);
assert.equal(
  snapshotFromGames([tbaHoops], undefined, new Date(2026, 10, 2, 0, 30))
    .featuredGames[0]?.gamePk,
  50,
);
assert.equal(
  snapshotFromGames([tbaHoops], undefined, new Date(2026, 10, 2, 23, 30))
    .featuredGames[0]?.gamePk,
  50,
);
const nov3Snapshot = snapshotFromGames(
  [tbaHoops],
  undefined,
  new Date(2026, 10, 3, 9),
);
assert.deepEqual(nov3Snapshot.featuredGames, []);
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

// Basketball arena board on the live-basketball harness fixture: a trimmed ESPN summary of
// women's game 401827429 at 1:17 of the third quarter.
const basketballFixture = JSON.parse(
  readFileSync(new URL('../team-harness/fixtures/live-basketball.fixture.json', import.meta.url), 'utf8'),
);
const basketballSummary = basketballFixture.liveGame.board;
const boardPolledAt = Date.UTC(2026, 2, 1, 20, 30);
const sides = ['away', 'home'];

// The shipped NCAA rows have every capability flag off: the board is the center panel only.
const liveBasketball = liveCyclonesSummaryFromEspn(
  basketballSummary,
  'womens-basketball',
  { now: boardPolledAt },
);
assert.equal(liveBasketball.state, 'in');
assert.equal(liveBasketball.completed, false);
const centerBoard = liveBasketball.scoreboard;
assert.equal(centerBoard?.kind, 'basketball');
assert.equal(centerBoard.source, 'summary');
assert.equal(centerBoard.eventId, '401827429');
assert.equal(centerBoard.clock, '1:17');
assert.equal(centerBoard.period, 3);
assert.equal(centerBoard.phase, 'inPlay');
assert.equal(centerBoard.regulationPeriods, 4);
assert.equal(centerBoard.statusDetail, '1:17 - 3rd Quarter');
assert.equal(centerBoard.away.score, 61);
assert.equal(centerBoard.home.score, 62);
assert.equal(centerBoard.away.teamId, '66');
assert.equal(centerBoard.away.color, '#AE192D');
assert.equal(centerBoard.home.color, '#330A57');
assert.equal(centerBoard.home.alternateColor, '#E2E3E4');
assert.equal(centerBoard.flags.players, true);
assert.equal(centerBoard.flags.teamFouls, true);
assert.equal(centerBoard.flags.timeouts, false);
assert.equal(centerBoard.flags.possessionArrow, false);
for (const side of sides) {
  assert.equal(centerBoard[side].lineup, 'floor');
  assert.equal(centerBoard[side].players.length, 5);
  assert.equal(typeof centerBoard[side].teamFouls, 'number');
  assert.equal(centerBoard[side].timeoutsLeft, undefined);
}
assert.ok(centerBoard.lastFoul);
assert.deepEqual(centerBoard.stale, {
  playerCellsAppliedAt: boardPolledAt,
  playsLength: basketballSummary.plays.length,
  polledAt: boardPolledAt,
});
assert.deepEqual(liveBoardTotals(centerBoard), {
  away: 61,
  home: 62,
  status: '1:17 - 3rd Quarter',
});
assert.deepEqual(liveBoardTotals(finalSummary.scoreboard), {
  away: 17,
  home: 31,
  status: 'Final',
});

// The harness path: the fixture's flags turn the player-derived cells on, and the real parser
// replays the substitutions.
const harnessBoard = basketballBoardFromCyclonesSummary(
  basketballSummary,
  'womens-basketball',
  { now: boardPolledAt },
  basketballFixture.boardFlags,
);
const activeIds = (teamId) =>
  basketballSummary.boxscore.players
    .find((team) => team.team.id === teamId)
    .statistics[0].athletes.filter((line) => line.active)
    .map((line) => line.athlete.id)
    .sort();
for (const side of sides) {
  assert.equal(harnessBoard[side].lineup, 'floor');
  assert.equal(harnessBoard[side].players.length, 5);
  assert.deepEqual(
    harnessBoard[side].players.map((player) => player.athleteId).sort(),
    activeIds(harnessBoard[side].teamId),
  );
}
assert.equal(harnessBoard.away.teamFouls, 3);
assert.equal(harnessBoard.home.teamFouls, 4);
assert.equal(harnessBoard.away.bonus, 'bonus');
assert.equal(harnessBoard.home.bonus, 'none');
assert.equal(harnessBoard.lastFoul?.side, 'home');
assert.equal(harnessBoard.lastFoul?.jersey, '4');
assert.equal(harnessBoard.lastFoul?.fouls, 2);
assert.equal(
  basketballBoardFromCyclonesSummary(
    { header: { competitions: [{ competitors: [] }] } },
    'womens-basketball',
    { now: boardPolledAt },
    basketballFixture.boardFlags,
  ),
  undefined,
);

// A shorter plays array keeps the previous player cells for 30 s, then applies.
const shorterSummary = {
  ...basketballSummary,
  plays: basketballSummary.plays.slice(0, -3),
};
const carriedBoard = basketballBoardFromCyclonesSummary(
  shorterSummary,
  'womens-basketball',
  { now: boardPolledAt + 29_999, previous: harnessBoard },
  basketballFixture.boardFlags,
);
for (const side of sides) {
  assert.deepEqual(carriedBoard[side].players, harnessBoard[side].players);
  assert.equal(carriedBoard[side].teamFouls, harnessBoard[side].teamFouls);
}
assert.deepEqual(carriedBoard.lastFoul, harnessBoard.lastFoul);
assert.deepEqual(carriedBoard.stale, {
  playerCellsAppliedAt: boardPolledAt,
  playsLength: basketballSummary.plays.length,
  polledAt: boardPolledAt + 29_999,
});
const appliedBoard = basketballBoardFromCyclonesSummary(
  shorterSummary,
  'womens-basketball',
  { now: boardPolledAt + 30_000, previous: harnessBoard },
  basketballFixture.boardFlags,
);
assert.deepEqual(appliedBoard.stale, {
  playerCellsAppliedAt: boardPolledAt + 30_000,
  playsLength: shorterSummary.plays.length,
  polledAt: boardPolledAt + 30_000,
});

// A Final with fewer plays than the last live poll still moves the card to Final with its score.
const finalHeader = structuredClone(basketballSummary.header);
const finalCompetition = finalHeader.competitions[0];
finalCompetition.status = {
  displayClock: '0:00',
  period: 4,
  type: { completed: true, detail: 'Final', name: 'STATUS_FINAL', state: 'post' },
};
for (const competitor of finalCompetition.competitors) {
  competitor.score = competitor.homeAway === 'home' ? '79' : '93';
}
const finalBasketball = liveCyclonesSummaryFromEspn(
  { ...shorterSummary, header: finalHeader },
  'womens-basketball',
  { now: boardPolledAt + 5_000, previous: harnessBoard },
);
assert.equal(finalBasketball.state, 'post');
assert.equal(finalBasketball.completed, true);
assert.equal(finalBasketball.scoreboard?.phase, 'final');
assert.deepEqual(liveBoardTotals(finalBasketball.scoreboard), {
  away: 93,
  home: 79,
  status: 'Final',
});

// The schedule path: scores, clock and period only, regulation periods from the sport.
function liveScheduleEvent() {
  const event = espnEvent({
    completed: false,
    detail: '12:34 - 2nd Half',
    name: 'STATUS_SECOND_HALF',
    shortDetail: '12:34 - 2nd',
    state: 'in',
  });
  const competition = event.competitions[0];
  competition.status = { ...competition.status, displayClock: '12:34', period: 2 };
  competition.competitors[0].score = { displayValue: '40', value: 40 };
  competition.competitors[1].score = { displayValue: '35', value: 35 };
  return event;
}
const scheduleBoard = basketballBoardFromCyclonesEvent(
  liveScheduleEvent(),
  'mens-basketball',
  boardPolledAt,
);
assert.equal(scheduleBoard?.kind, 'basketball');
assert.equal(scheduleBoard.source, 'schedule');
assert.equal(scheduleBoard.eventId, '401856779');
assert.equal(scheduleBoard.regulationPeriods, 2);
assert.equal(scheduleBoard.clock, '12:34');
assert.equal(scheduleBoard.period, 2);
assert.equal(scheduleBoard.phase, 'inPlay');
assert.equal(scheduleBoard.home.score, 40);
assert.equal(scheduleBoard.away.score, 35);
assert.deepEqual(scheduleBoard.stale, { polledAt: boardPolledAt });
assert.equal(scheduleBoard.lastFoul, undefined);
for (const side of sides) {
  assert.equal(scheduleBoard[side].lineup, 'unavailable');
  assert.deepEqual(scheduleBoard[side].players, []);
  assert.equal(scheduleBoard[side].bonus, 'none');
  assert.equal(scheduleBoard[side].color, undefined);
}
assert.equal(
  basketballBoardFromCyclonesEvent(
    liveScheduleEvent(),
    'womens-basketball',
    boardPolledAt,
  )?.regulationPeriods,
  4,
);
assert.equal(
  basketballBoardFromCyclonesEvent({}, 'mens-basketball', boardPolledAt),
  undefined,
);

// The merge keeps the polled board under 30 s; after that the schedule board applies with the
// previous stripe colors, and the tables show PLAYER STATS NOT AVAILABLE.
assert.equal(LIVE_BOARD_FRESH_MS, 30_000);
function liveBasketballCard(scoreboard, overrides = {}) {
  return game({
    abstractState: 'Live',
    teamScore: 61,
    gamePk: 401827429,
    isHome: false,
    opponentName: 'Kansas State Wildcats',
    opponentScore: 62,
    scoreboard,
    sport: 'womens-basketball',
    status: '1:17 - 3rd Quarter',
    ...overrides,
  });
}
function snapshotWith(featuredGame) {
  return {
    featuredGames: featuredGame ? [featuredGame] : [],
    records: recordsFromGames([]),
    statuses: {},
    upcomingGames: [],
  };
}
const scheduleEventForFixture = {
  competitions: [
    {
      ...basketballSummary.header.competitions[0],
      competitors: basketballSummary.header.competitions[0].competitors.map(
        (competitor) => ({
          ...competitor,
          score: competitor.homeAway === 'home' ? '62' : '63',
        }),
      ),
    },
  ],
  id: '401827429',
};
const flaggedScheduleBoard = {
  ...basketballBoardFromScheduleEvent(
    scheduleEventForFixture,
    basketballRulesFor('ncaa/womens-basketball', basketballFixture.boardFlags),
  ),
  stale: { polledAt: boardPolledAt + 40_000 },
};
const shownBasketball = snapshotWith(liveBasketballCard(harnessBoard));
const refreshedBasketball = snapshotWith(
  liveBasketballCard(flaggedScheduleBoard, { teamScore: 63 }),
);
const liveStamp = { appliedAt: boardPolledAt, key: liveBasketballCard(harnessBoard).key };
const keptBoard = snapshotWithPreservedScoreboard(
  shownBasketball,
  refreshedBasketball,
  liveStamp,
  boardPolledAt + 29_999,
).featuredGames[0];
assert.equal(keptBoard.board, harnessBoard);
assert.equal(keptBoard.teamScore, 61);
const stalledGame = snapshotWithPreservedScoreboard(
  shownBasketball,
  refreshedBasketball,
  liveStamp,
  boardPolledAt + 30_000,
).featuredGames[0];
const stalledBoard = stalledGame.board;
assert.equal(stalledGame.teamScore, 63);
assert.equal(stalledBoard.source, 'schedule');
assert.equal(stalledBoard.away.score, 63);
assert.equal(stalledBoard.away.color, '#AE192D');
assert.equal(stalledBoard.away.alternateColor, '#FFC72A');
assert.equal(stalledBoard.home.color, '#330A57');
assert.equal(stalledBoard.home.alternateColor, '#E2E3E4');
assert.deepEqual(stalledBoard.stale, { polledAt: boardPolledAt + 40_000 });
assert.deepEqual(
  lineupCaptions('split', stalledBoard.away.lineup, stalledBoard.home.lineup),
  { shared: 'PLAYER STATS NOT AVAILABLE' },
);
assert.equal(flaggedScheduleBoard.away.color, undefined);
// A color the schedule board already has, or a board of another event, is left alone.
const coloredSchedule = snapshotWith(
  liveBasketballCard({
    ...flaggedScheduleBoard,
    home: { ...flaggedScheduleBoard.home, color: '#FFFFFF' },
  }),
);
const coloredBoard = snapshotWithPreservedScoreboard(
  shownBasketball,
  coloredSchedule,
  undefined,
  boardPolledAt,
).featuredGames[0].board;
assert.equal(coloredBoard.home.color, '#FFFFFF');
assert.equal(coloredBoard.home.alternateColor, '#E2E3E4');
const otherEventBoard = snapshotWithPreservedScoreboard(
  snapshotWith(liveBasketballCard({ ...harnessBoard, eventId: '1' })),
  refreshedBasketball,
  undefined,
  boardPolledAt,
).featuredGames[0].board;
assert.equal(otherEventBoard, flaggedScheduleBoard);
// Football boards merge as before: a fresh schedule board replaces a stale summary board.
const footballBoard = liveFootballScoreboardFromEspn(
  summaryDocument({ completed: false, detail: '2nd Quarter', state: 'in' }),
);
const nextFootballBoard = { ...footballBoard, clock: '4:00' };
assert.equal(
  snapshotWithPreservedScoreboard(
    snapshotWith(game({ abstractState: 'Live', scoreboard: footballBoard })),
    snapshotWith(game({ abstractState: 'Live', scoreboard: nextFootballBoard })),
    { appliedAt: boardPolledAt, key: game({ abstractState: 'Live' }).key },
    boardPolledAt + LIVE_BOARD_FRESH_MS,
  ).featuredGames[0].board,
  nextFootballBoard,
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

// One card per game today. Men's and women's basketball the same evening: both live, one live
// and one final, and both final. Each keeps its own card; neither final disappears.
{
  const evening = new Date(2026, 10, 2, 20, 30);
  const mens = (overrides) =>
    game({
      gameDate: localIso(2026, 10, 2, 19),
      gamePk: 401909771,
      officialDate: '2026-11-02',
      sport: 'mens-basketball',
      ...overrides,
    });
  const womens = (overrides) =>
    game({
      gameDate: localIso(2026, 10, 2, 19, 30),
      gamePk: 401909900,
      officialDate: '2026-11-02',
      sport: 'womens-basketball',
      ...overrides,
    });
  const keys = (snapshot) =>
    snapshot.featuredGames.map((entry) => `${entry.sport}:${entry.abstractState}`);

  const bothLive = snapshotFromGames(
    [womens({ abstractState: 'Live' }), mens({ abstractState: 'Live' })],
    undefined,
    evening,
  );
  assert.deepEqual(keys(bothLive), ['mens-basketball:Live', 'womens-basketball:Live']);
  assert.deepEqual(bothLive.upcomingGames, []);

  const liveAndFinal = snapshotFromGames(
    [
      mens({ abstractState: 'Final', teamScore: 66, opponentScore: 72, status: 'Final' }),
      womens({ abstractState: 'Live' }),
    ],
    undefined,
    evening,
  );
  assert.deepEqual(keys(liveAndFinal), ['womens-basketball:Live', 'mens-basketball:Final']);

  const bothFinal = snapshotFromGames(
    [
      mens({ abstractState: 'Final', teamScore: 66, opponentScore: 72, status: 'Final' }),
      womens({ abstractState: 'Final', teamScore: 80, opponentScore: 61, status: 'Final' }),
    ],
    undefined,
    new Date(2026, 10, 2, 23, 30),
  );
  assert.deepEqual(keys(bothFinal), ['mens-basketball:Final', 'womens-basketball:Final']);
  assert.deepEqual(
    snapshotFromGames(
      [
        mens({ abstractState: 'Final', status: 'Final' }),
        womens({ abstractState: 'Final', status: 'Final' }),
      ],
      undefined,
      new Date(2026, 10, 3, 0, 30),
    ).featuredGames,
    [],
  );

  const laterToday = snapshotFromGames(
    [
      mens({ abstractState: 'Live' }),
      womens({ gameDate: localIso(2026, 10, 2, 21) }),
      game({ gameDate: localIso(2026, 10, 5, 18), gamePk: 7, officialDate: '2026-11-05' }),
    ],
    undefined,
    evening,
  );
  assert.deepEqual(keys(laterToday), ['mens-basketball:Live', 'womens-basketball:Preview']);
  assert.deepEqual(laterToday.upcomingGames.map((entry) => entry.gamePk), [7]);

  // A schedule refresh keeps each card's five-second board on its own game only.
  const mensBoard = { kind: 'basketball', source: 'summary', marker: 'mens' };
  const womensBoard = { kind: 'basketball', source: 'summary', marker: 'womens' };
  const shown = {
    ...bothLive,
    featuredGames: [
      { ...bothLive.featuredGames[0], board: mensBoard },
      { ...bothLive.featuredGames[1], board: womensBoard },
    ],
  };
  const merged = snapshotWithPreservedScoreboard(
    shown,
    bothLive,
    [{ appliedAt: 1_000, key: bothLive.featuredGames[0].key }],
    5_000,
  );
  assert.equal(merged.featuredGames[0].board, mensBoard);
  assert.equal(merged.featuredGames[1].board, womensBoard);
  assert.equal(
    snapshotWithPreservedScoreboard(shown, bothLive, [], 5_000).featuredGames[0].board,
    mensBoard,
  );
}

process.stdout.write('team-engine cyclones cases passed.\n');
