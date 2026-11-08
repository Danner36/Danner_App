import assert from 'node:assert/strict';
import test from 'node:test';

import { isWithinGetVideoWindow, officialDateInZone, selectFeaturedGame } from '../lib/gameWindow.mjs';
import { fetchEspnGames, gameFromEspnEvent, isCompleteEspnGame, seasonYearFor } from '../lib/schedule/espn.mjs';
import { fetchMlbGames, isCompleteMlbGame, mlbGamesFromSchedule } from '../lib/schedule/mlbStatsapi.mjs';
import { espnEvent, mlbSchedule } from './fixtures.mjs';

const NEW_YORK = 'America/New_York';
const espnTeam = { espnId: '66', officialDateZone: NEW_YORK, sport: 'mens-basketball' };

const featuredMlb = (games, now, options = {}) =>
  selectFeaturedGame(games, now, { isComplete: isCompleteMlbGame, timeZone: NEW_YORK, ...options });
const featuredEspn = (games, now, options = {}) =>
  selectFeaturedGame(games, now, { isComplete: isCompleteEspnGame, timeZone: NEW_YORK, ...options });

test('an unpublished start time stays outside the Get video window', () => {
  const game = { abstractState: 'Preview', gameDate: '2026-10-03T07:33:00Z', status: 'Scheduled', timeValid: false };
  assert.equal(isWithinGetVideoWindow(game, new Date('2026-10-03T18:00:00Z'), 15), false);
});

test('a published start time opens 15 minutes before the start', () => {
  const game = { abstractState: 'Preview', gameDate: '2026-10-03T20:08:00Z', status: 'Scheduled', timeValid: true };
  assert.equal(isWithinGetVideoWindow(game, new Date('2026-10-03T19:00:00Z'), 15), false);
  assert.equal(isWithinGetVideoWindow(game, new Date('2026-10-03T19:53:00Z'), 15), true);
});

test('a game with no timeValid flag still uses its start time', () => {
  const game = { abstractState: 'Preview', gameDate: '2026-10-03T20:08:00Z', status: 'Scheduled' };
  assert.equal(isWithinGetVideoWindow(game, new Date('2026-10-03T19:53:00Z'), 15), true);
});

const PROCESS_TIME_ZONES = ['UTC', 'America/Los_Angeles', 'Asia/Tokyo', 'America/New_York'];

function inEachProcessTimeZone(run) {
  const saved = process.env.TZ;
  try {
    for (const zone of PROCESS_TIME_ZONES) {
      process.env.TZ = zone;
      run(zone);
    }
  } finally {
    if (saved === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = saved;
    }
  }
}

function game(overrides) {
  return {
    abstractState: 'Preview',
    gameNumber: 1,
    gamePk: 1,
    opponentName: 'Detroit Tigers',
    status: 'Scheduled',
    timeValid: true,
    ...overrides,
  };
}

test('a 7:10 PM CDT first pitch (00:10 UTC) is today during its pregame window', () => {
  const evening = game({ gameDate: '2026-09-27T00:10:00Z', officialDate: '2026-09-26' });
  const tomorrow = game({ gameDate: '2026-09-27T17:10:00Z', gamePk: 2, officialDate: '2026-09-27' });
  const pregame = new Date('2026-09-26T23:55:00Z');
  inEachProcessTimeZone((zone) => {
    const featured = featuredMlb([tomorrow, evening], pregame);
    assert.equal(featured?.gamePk, 1, zone);
    assert.equal(isWithinGetVideoWindow(featured, pregame, 15), true, zone);
  });
});

test('a start delayed past 00:00 UTC stays selectable while still in Preview', () => {
  const delayed = game({ gameDate: '2026-09-26T23:10:00Z', officialDate: '2026-09-26', status: 'Delayed Start: Rain' });
  const next = game({ gameDate: '2026-09-27T17:10:00Z', gamePk: 2, officialDate: '2026-09-27' });
  inEachProcessTimeZone((zone) => {
    assert.equal(featuredMlb([next, delayed], new Date('2026-09-27T00:40:00Z'))?.gamePk, 1, zone);
    assert.equal(featuredMlb([next, delayed], new Date('2026-09-27T01:50:00Z'), { graceMinutes: 180 })?.gamePk, 1, zone);
  });
});

test('tomorrow\'s game is not featured on a UTC runner in the evening', () => {
  const final = game({ abstractState: 'Final', gameDate: '2026-09-26T17:10:00Z', officialDate: '2026-09-26', status: 'Final' });
  const tomorrow = game({ gameDate: '2026-09-27T17:10:00Z', gamePk: 2, officialDate: '2026-09-27' });
  inEachProcessTimeZone((zone) => {
    assert.equal(featuredMlb([final, tomorrow], new Date('2026-09-27T01:00:00Z')), undefined, zone);
  });
});

test('a live game wins over a later game in the window', () => {
  const live = game({ abstractState: 'Live', gameDate: '2026-09-26T17:10:00Z', officialDate: '2026-09-26', status: 'In Progress' });
  const nightcap = game({ gameDate: '2026-09-26T21:10:00Z', gameNumber: 2, gamePk: 2, officialDate: '2026-09-26' });
  assert.equal(featuredMlb([nightcap, live], new Date('2026-09-26T21:00:00Z'))?.gamePk, 1);
});

test('a suspended game reported as Live never outranks the game being played', () => {
  const suspended = game({ abstractState: 'Live', gameDate: '2026-09-25T23:10:00Z', officialDate: '2026-09-25', status: 'Suspended: Rain' });
  const today = game({ gameDate: '2026-09-26T17:10:00Z', gamePk: 2, officialDate: '2026-09-26' });
  assert.equal(featuredMlb([suspended, today], new Date('2026-09-26T17:00:00Z'))?.gamePk, 2);
});

test('among live games today\'s official date wins', () => {
  const resumedLive = game({ abstractState: 'Live', gameDate: '2026-09-26T16:05:00Z', officialDate: '2026-09-17', status: 'In Progress' });
  const todayLive = game({ abstractState: 'Live', gameDate: '2026-09-26T17:10:00Z', gamePk: 2, officialDate: '2026-09-26', status: 'In Progress' });
  assert.equal(featuredMlb([resumedLive, todayLive], new Date('2026-09-26T17:30:00Z'))?.gamePk, 2);
});

test('a pre-game delay from yesterday\'s official date stays selectable after midnight', () => {
  const delayed = game({ gameDate: '2026-09-26T23:10:00Z', officialDate: '2026-09-26', status: 'Delayed Start: Rain' });
  const scheduled = { ...delayed, status: 'Scheduled' };
  const now = new Date('2026-09-27T05:30:00Z');
  inEachProcessTimeZone((zone) => {
    assert.equal(featuredMlb([delayed], now, { graceMinutes: 60 })?.gamePk, 1, zone);
    assert.equal(featuredMlb([scheduled], now, { graceMinutes: 60 }), undefined, zone);
  });
});

test('a resumed game with an older official date is featured when its restart nears', () => {
  const resumed = game({ gameDate: '2026-09-21T17:10:00Z', officialDate: '2026-09-12', resumed: true });
  assert.equal(featuredMlb([resumed], new Date('2026-09-21T17:00:00Z'))?.gamePk, 1);
  assert.equal(featuredMlb([resumed], new Date('2026-09-21T14:00:00Z')), undefined);
});

test('a time-TBA game sorts after an earlier game number on the same official date', () => {
  const nightcap = game({ gameDate: '2026-10-03T07:33:00Z', gameNumber: 2, gamePk: 2, officialDate: '2026-10-03', timeValid: false });
  const opener = game({ gameDate: '2026-10-03T17:10:00Z', officialDate: '2026-10-03', timeValid: true });
  assert.equal(featuredMlb([nightcap, opener], new Date('2026-10-03T13:00:00Z'))?.gamePk, 1);
});

test('a time-TBA game is featured for today but stays outside the window', () => {
  const tba = game({ gameDate: '2026-10-03T07:33:00Z', officialDate: '2026-10-03', timeValid: false });
  const afternoon = new Date('2026-10-03T18:00:00Z');
  inEachProcessTimeZone((zone) => {
    const featured = featuredMlb([tba], afternoon);
    assert.equal(featured?.gamePk, 1, zone);
    assert.equal(isWithinGetVideoWindow(featured, afternoon, 15), false, zone);
  });
});

test('official dates follow America/New_York across the November DST change', () => {
  assert.equal(officialDateInZone(new Date('2026-11-01T03:59:00Z'), NEW_YORK), '2026-10-31');
  assert.equal(officialDateInZone(new Date('2026-11-01T04:00:00Z'), NEW_YORK), '2026-11-01');
  assert.equal(officialDateInZone(new Date('2026-11-02T04:59:00Z'), NEW_YORK), '2026-11-01');
  assert.equal(officialDateInZone(new Date('2026-11-02T05:00:00Z'), NEW_YORK), '2026-11-02');
});

test('a Thursday night kickoff keeps its New York date on a UTC runner', () => {
  const event = espnEvent({ date: '2026-09-11T00:15:00Z', espnId: '17', id: '777' });
  const team = { espnId: '17', officialDateZone: NEW_YORK };
  inEachProcessTimeZone((zone) => {
    const parsed = gameFromEspnEvent(event, team);
    assert.equal(parsed.officialDate, '2026-09-10', zone);
    assert.equal(featuredEspn([parsed], new Date('2026-09-11T00:05:00Z'))?.gamePk, 777, zone);
  });
});

test('an ESPN game carries the team\'s sport and reads its state', () => {
  const live = gameFromEspnEvent(espnEvent({ state: 'in' }), espnTeam);
  assert.equal(live.abstractState, 'Live');
  assert.equal(live.sport, 'mens-basketball');
  assert.equal(live.officialDate, '2026-11-07');
  assert.equal(gameFromEspnEvent(espnEvent({ state: 'post' }), espnTeam).abstractState, 'Final');
  assert.equal(gameFromEspnEvent(espnEvent(), { espnId: '999', officialDateZone: NEW_YORK }), undefined);
  assert.equal(gameFromEspnEvent({ ...espnEvent(), id: 'abc' }, espnTeam), undefined);
});

test('a game with no start time uses the New York date of ESPN\'s placeholder', () => {
  const event = { ...espnEvent({ date: '2026-11-02T05:00:00Z' }), timeValid: false };
  const parsed = gameFromEspnEvent(event, espnTeam);
  assert.equal(parsed.officialDate, '2026-11-02');
  assert.equal(parsed.timeValid, false);
});

test('season years follow the catalog rule in New York, not the process zone', () => {
  const football = { shiftBackThroughMonth: 1 };
  const nfl = { shiftBackThroughMonth: 2 };
  const basketball = { shiftForwardFromMonth: 7 };
  inEachProcessTimeZone((zone) => {
    // 11:30 PM on New Year's Eve in New York is already January in UTC.
    assert.equal(seasonYearFor(football, new Date('2027-01-01T04:30:00Z'), NEW_YORK), 2026, zone);
    assert.equal(seasonYearFor(football, new Date('2027-02-01T12:00:00Z'), NEW_YORK), 2027, zone);
    assert.equal(seasonYearFor(nfl, new Date('2027-02-10T12:00:00Z'), NEW_YORK), 2026, zone);
    assert.equal(seasonYearFor(basketball, new Date('2026-11-08T12:00:00Z'), NEW_YORK), 2027, zone);
    assert.equal(seasonYearFor(basketball, new Date('2027-03-01T12:00:00Z'), NEW_YORK), 2027, zone);
    assert.equal(seasonYearFor({}, new Date('2026-06-01T12:00:00Z'), NEW_YORK), 2026, zone);
  });
});

function espnSpec(overrides = {}) {
  return {
    ...espnTeam,
    schedule: {
      seasonTypes: [1, 2, 3],
      seasonYear: { shiftForwardFromMonth: 7 },
      sitePath: 'basketball/womens-college-basketball',
    },
    ...overrides,
  };
}

test('only the dispatched sport\'s lists are fetched and an event appears once', async () => {
  const urls = [];
  const games = await fetchEspnGames(espnSpec(), new Date('2026-11-08T12:00:00Z'), async (url) => {
    urls.push(String(url));
    return new Response(JSON.stringify({ events: [espnEvent()] }));
  });
  assert.equal(urls.length, 3);
  for (const url of urls) {
    assert.match(url, /basketball\/womens-college-basketball\/teams\/66\/schedule\?season=2027&seasontype=[123]$/);
  }
  assert.equal(games.length, 1);
  assert.equal(games[0].gamePk, 401800001);
});

test('one failed list fails the schedule', async () => {
  await assert.rejects(
    fetchEspnGames(espnSpec(), new Date('2026-11-08T12:00:00Z'), async (url) =>
      String(url).endsWith('seasontype=3') ? new Response('', { status: 500 }) : new Response('{"events":[]}'),
    ),
    /ESPN schedule request failed/,
  );
});

test('MLB uses the statsapi team id and keeps gamePk as the event id', async () => {
  const urls = [];
  const games = await fetchMlbGames(
    { officialDateZone: NEW_YORK, schedule: { provider: 'mlb-statsapi', sportId: 1 }, statsapi: { teamId: 114 } },
    new Date('2026-09-26T22:00:00Z'),
    async (url) => {
      urls.push(String(url));
      return new Response(JSON.stringify(mlbSchedule()));
    },
  );
  assert.match(urls[0], /teamId=114/);
  assert.match(urls[0], /startDate=2026-09-25/);
  assert.equal(games[0].gamePk, 900001);
  assert.equal(games[0].opponentName, 'Detroit Tigers');
});

test('a resumed MLB game keeps its official date and is flagged', () => {
  const schedule = {
    dates: [
      { date: '2026-09-21', games: [mlbSchedule({ gameDate: '2026-09-21T17:10:00Z', officialDate: '2026-09-12', resumedFrom: '2026-09-12' }).dates[0].games[0]] },
      { date: '2026-09-22', games: [mlbSchedule({ gameDate: '2026-09-22T17:10:00Z', gamePk: 2, officialDate: '2026-09-22' }).dates[0].games[0]] },
    ],
  };
  const [resumed, ordinary] = mlbGamesFromSchedule(schedule, 114);
  assert.equal(resumed.officialDate, '2026-09-12');
  assert.equal(resumed.resumed, true);
  assert.equal(ordinary.resumed, undefined);
});
