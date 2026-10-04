import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

import {
  abstractStateFromEspn,
  easternDateString,
  gameDayLabel,
  gameWithLiveSummary,
  nflSeasonYear,
  patriotsGameFromEspnEvent,
  recapResult,
  recordLabel,
  regularSeasonRecord,
  snapshotFromGames,
} from '../../app/patriots/patriotsSnapshot.ts';
import { liveSummaryFromEspn } from '../../app/patriots/espnScoreboard.ts';

// The fixed fixtures below are Eastern kickoffs read against Eastern wall-clock times. Pinning
// the process zone keeps them independent of the machine; zone-sensitive rules run again
// under several zones further down.
const FIXTURE_TIME_ZONE = 'America/New_York';
process.env.TZ = FIXTURE_TIME_ZONE;

function inTimeZone(timeZone, run) {
  process.env.TZ = timeZone;
  try {
    run();
  } finally {
    process.env.TZ = FIXTURE_TIME_ZONE;
  }
}

const PHONE_TIME_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Pacific/Honolulu',
  'UTC',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Pacific/Auckland',
];

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
    scoresKnown: true,
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

const finalStatus = {
  completed: true,
  description: 'Final',
  detail: 'Final',
  name: 'STATUS_FINAL',
  shortDetail: 'Final',
  state: 'post',
};

function finalCompetition(patriotsScore, opponentScore) {
  return {
    timeValid: true,
    status: { type: finalStatus },
    competitors: [
      {
        homeAway: 'home',
        id: '26',
        score: opponentScore,
        team: { displayName: 'Seattle Seahawks', id: '26' },
      },
      {
        homeAway: 'away',
        id: '17',
        score: patriotsScore,
        team: { displayName: 'New England Patriots', id: '17' },
      },
    ],
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
  2,
);
assert.equal(parsed?.gamePk, 401872656);
assert.equal(parsed?.isHome, false);
assert.equal(parsed?.opponentName, 'Seattle Seahawks');
assert.equal(parsed?.status, 'Scheduled');
assert.equal(parsed?.timeValid, true);
assert.equal(parsed?.officialDate, '2026-09-09');
assert.equal(parsed?.abstractState, 'Preview');
assert.equal(
  patriotsGameFromEspnEvent(
    espnEvent({
      description: 'Delayed',
      detail: 'Delayed',
      name: 'STATUS_DELAYED',
      state: 'pre',
    }),
    2,
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
    2,
  )?.status,
  'Q2 4:12',
);
assert.equal(easternDateString(new Date('2026-09-10T00:20:00Z')), '2026-09-09');
assert.equal(tba.timeValid, false);

const espnFinal = patriotsGameFromEspnEvent(
  espnEvent(finalStatus, {
    competitions: [
      finalCompetition(
        { displayValue: '24', value: 24.0 },
        { displayValue: '17', value: 17.0 },
      ),
    ],
  }),
  2,
);
assert.equal(espnFinal?.abstractState, 'Final');
assert.equal(espnFinal?.patriotsScore, 24);
assert.equal(espnFinal?.opponentScore, 17);
assert.equal(espnFinal?.scoresKnown, true);
assert.equal(recapResult(espnFinal), 'WIN');

// B50: the requested schedule list decides the season type, not the event's own field.
const preseasonTagged = patriotsGameFromEspnEvent(
  espnEvent(finalStatus, {
    competitions: [finalCompetition('31', '3')],
    seasonType: { type: 2 },
  }),
  1,
);
assert.equal(preseasonTagged?.seasonType, 1);
const playoffTagged = patriotsGameFromEspnEvent(
  espnEvent(finalStatus, {
    competitions: [finalCompetition('31', '3')],
    seasonType: undefined,
  }),
  3,
);
assert.equal(playoffTagged?.seasonType, 3);
assert.deepEqual(regularSeasonRecord([preseasonTagged, playoffTagged]), {
  losses: 0,
  ties: 0,
  wins: 0,
});

// B50: a Final whose scores do not parse stays out of the record instead of counting as a tie.
const unscoredFinal = patriotsGameFromEspnEvent(
  espnEvent(finalStatus, {
    competitions: [finalCompetition(undefined, 'n/a')],
  }),
  2,
);
assert.equal(unscoredFinal?.abstractState, 'Final');
assert.equal(unscoredFinal?.scoresKnown, false);
assert.deepEqual(regularSeasonRecord([unscoredFinal, espnFinal]), {
  losses: 0,
  ties: 0,
  wins: 1,
});

// B13: ESPN state mapping shared by the schedule parser and the live summary poll.
assert.equal(abstractStateFromEspn('pre'), 'Preview');
assert.equal(abstractStateFromEspn('in'), 'Live');
assert.equal(abstractStateFromEspn('post'), 'Final');
assert.equal(abstractStateFromEspn('in', true), 'Final');
assert.equal(abstractStateFromEspn(undefined), 'Preview');

function summaryDocument(statusType, options = {}) {
  const competition = {
    competitors: [
      {
        homeAway: 'home',
        linescores: [{ displayValue: '3' }, { displayValue: '7' }],
        score: options.homeScore ?? '10',
      },
      {
        homeAway: 'away',
        linescores: [{ displayValue: '7' }, { displayValue: '7' }],
        score: options.awayScore ?? '14',
      },
    ],
    status: { displayClock: '8:42', period: 2, type: statusType },
    ...(options.competitionSituation
      ? { situation: options.competitionSituation }
      : {}),
  };
  return {
    header: { competitions: [competition] },
    ...(options.situation ? { situation: options.situation } : {}),
  };
}

const inSummary = liveSummaryFromEspn(
  summaryDocument(
    { completed: false, detail: 'Q2 8:42', state: 'in' },
    {
      competitionSituation: {
        distance: 7,
        down: 2,
        downDistanceText: '2nd & 7 at SEA 33',
        possession: '17',
      },
    },
  ),
);
assert.equal(inSummary?.state, 'in');
assert.equal(inSummary?.completed, false);
assert.equal(inSummary?.scoreboard?.status, 'Q2 8:42');
assert.equal(inSummary?.scoreboard?.down, 2);
assert.equal(inSummary?.scoreboard?.distance, 7);
assert.equal(inSummary?.scoreboard?.possessionTeamId, 17);
assert.equal(inSummary?.scoreboard?.situation, '2nd & 7 at SEA 33');
assert.equal(
  liveSummaryFromEspn(
    summaryDocument(
      { detail: 'Q3 1:00', state: 'in' },
      {
        competitionSituation: { down: 1, distance: 10 },
        situation: { down: 4, distance: 1 },
      },
    ),
  )?.scoreboard?.down,
  4,
);

const postSummary = liveSummaryFromEspn(
  summaryDocument(
    { completed: true, detail: 'Final', state: 'post' },
    { awayScore: '24', homeScore: '17' },
  ),
);
assert.equal(postSummary?.state, 'post');
assert.equal(postSummary?.completed, true);
assert.equal(liveSummaryFromEspn({})?.state, undefined);
assert.equal(liveSummaryFromEspn(undefined), undefined);
assert.equal(
  liveSummaryFromEspn(summaryDocument({ state: 'halftime' }))?.state,
  undefined,
);

const kickoffPending = game({ gamePk: 60, officialDate: '2026-09-10' });
const preSummary = liveSummaryFromEspn(
  summaryDocument({ detail: 'Scheduled', state: 'pre' }),
);
assert.equal(gameWithLiveSummary(kickoffPending, preSummary), kickoffPending);

const nowLive = gameWithLiveSummary(kickoffPending, inSummary);
assert.equal(nowLive.abstractState, 'Live');
assert.equal(nowLive.patriotsScore, 14);
assert.equal(nowLive.opponentScore, 10);
assert.equal(nowLive.status, 'Q2 8:42');
assert.equal(nowLive.scoreboard?.down, 2);

const nowFinal = gameWithLiveSummary(nowLive, postSummary);
assert.equal(nowFinal.abstractState, 'Final');
assert.equal(nowFinal.status, 'Final');
assert.equal(nowFinal.patriotsScore, 24);
assert.equal(recapResult(nowFinal), 'WIN');

// A stale cached summary does not move a finished or live game backwards.
assert.equal(gameWithLiveSummary(nowFinal, inSummary), nowFinal);
assert.equal(gameWithLiveSummary(nowLive, preSummary), nowLive);
// A post-game summary without a board (postponed and canceled games are post too) leaves
// Final to the schedule refresh; a live one without a board still turns the card live.
assert.equal(
  gameWithLiveSummary(nowLive, { completed: false, state: 'post' }),
  nowLive,
);
assert.equal(
  gameWithLiveSummary(kickoffPending, { completed: false, state: 'in' })
    .abstractState,
  'Live',
);
// No state in the summary keeps the old board-only update for a live game.
assert.equal(
  gameWithLiveSummary(nowLive, {
    completed: false,
    scoreboard: { ...inSummary.scoreboard, away: { points: 21, quarters: [] } },
  }).patriotsScore,
  21,
);

// B27 and the featured "today" rule, under several phone time zones. ESPN stores a game with
// no kickoff time at a placeholder that can be midnight Eastern.
const tbaEvent = patriotsGameFromEspnEvent(
  espnEvent(
    { description: 'Scheduled', name: 'STATUS_SCHEDULED', state: 'pre' },
    { date: '2026-12-20T05:00Z', id: '401872999', timeValid: false },
  ),
  2,
);
assert.equal(tbaEvent?.timeValid, false);
assert.equal(tbaEvent?.officialDate, '2026-12-20');

for (const timeZone of PHONE_TIME_ZONES) {
  inTimeZone(timeZone, () => {
    const label = `${timeZone}`;
    assert.equal(gameDayLabel(tbaEvent, 'en-US'), 'Sun, Dec 20', label);

    const gameDay = new Date(2026, 11, 20, 9, 0, 0);
    const dayBefore = new Date(2026, 11, 19, 22, 0, 0);
    const dayAfter = new Date(2026, 11, 21, 9, 0, 0);
    assert.equal(
      snapshotFromGames([tbaEvent], 0, 0, 0, gameDay).featuredGame?.gamePk,
      401872999,
      label,
    );
    const eve = snapshotFromGames([tbaEvent], 0, 0, 0, dayBefore);
    assert.equal(eve.featuredGame, undefined, label);
    assert.deepEqual(
      eve.upcomingGames.map((entry) => entry.gamePk),
      [401872999],
      label,
    );
    assert.deepEqual(
      snapshotFromGames([tbaEvent], 0, 0, 0, dayAfter).upcomingGames,
      [],
      label,
    );

    // A known kickoff still follows the phone's own calendar day.
    const localKickoff = new Date(2026, 8, 10, 23, 15, 0);
    const localGame = game({
      gameDate: localKickoff.toISOString(),
      gamePk: 70,
      officialDate: easternDateString(localKickoff),
    });
    assert.equal(
      snapshotFromGames(
        [localGame, tomorrow],
        0,
        0,
        0,
        new Date(2026, 8, 10, 20, 15, 0),
      ).featuredGame?.gamePk,
      70,
      label,
    );
    assert.equal(
      snapshotFromGames(
        [localGame],
        0,
        0,
        0,
        new Date(2026, 8, 9, 20, 15, 0),
      ).featuredGame,
      undefined,
      label,
    );
  });
}

// B15 and B50: the shipped ESPN schedule fetch, with fetch stubbed. The resolve hook lets Node
// load the app's extensionless relative imports.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier.startsWith('./') &&
      !specifier.endsWith('.ts') &&
      context.parentURL?.includes('/app/patriots/')
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});
const { fetchEspnPatriotsEvents } = await import(
  '../../app/patriots/espnNfl.ts'
);

const scheduleEvents = {
  1: [{ id: '1001', seasonType: { type: 2 } }],
  2: [{ id: '2001', seasonType: { type: 1 } }, { id: '2002' }],
  3: [{ id: '3001', seasonType: '3' }],
};

async function withScheduleResponses(statusBySeasonType, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const seasonType = Number(new URL(url).searchParams.get('seasontype'));
    const status = statusBySeasonType[seasonType] ?? 200;
    if (status === 'throw') {
      throw new Error('Aborted');
    }
    return new Response(
      JSON.stringify({ events: scheduleEvents[seasonType] }),
      { headers: { 'Content-Type': 'application/json' }, status },
    );
  };
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const scheduleNow = new Date(2026, 8, 10, 12, 0, 0);
const allTypes = await withScheduleResponses({}, () =>
  fetchEspnPatriotsEvents(scheduleNow),
);
assert.deepEqual(
  allTypes.map(({ event, seasonType }) => [event.id, seasonType]),
  [
    ['1001', 1],
    ['2001', 2],
    ['2002', 2],
    ['3001', 3],
  ],
);

const withoutPreseason = await withScheduleResponses({ 1: 503, 3: 'throw' }, () =>
  fetchEspnPatriotsEvents(scheduleNow),
);
assert.deepEqual(
  withoutPreseason.map(({ event, seasonType }) => [event.id, seasonType]),
  [
    ['2001', 2],
    ['2002', 2],
  ],
);

await assert.rejects(
  withScheduleResponses({ 2: 500 }, () => fetchEspnPatriotsEvents(scheduleNow)),
  /temporarily unavailable/,
);

process.stdout.write('Patriots snapshot assertions passed.\n');
