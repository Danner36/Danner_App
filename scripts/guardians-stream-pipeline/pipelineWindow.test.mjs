import assert from 'node:assert/strict';
import test from 'node:test';

import { officialDateInZone } from './lib/gameWindow.mjs';
import { featuredGame } from './lib/mlbSchedule.mjs';
import {
  cyclonesGameFromEspnEvent,
  featuredCyclonesGame,
} from './lib/ncaaSchedule.mjs';
import {
  featuredGameForConfig,
  isWithinGetVideoWindow,
} from './lib/pipeline.mjs';

test('an unpublished MLB start time stays outside the get-video window', () => {
  const game = {
    abstractState: 'Preview',
    gameDate: '2026-10-03T07:33:00Z',
    status: 'Scheduled',
    timeValid: false,
  };
  const afternoon = new Date('2026-10-03T18:00:00Z');
  assert.equal(isWithinGetVideoWindow(game, afternoon, 15), false);
});

test('a published start time opens 15 minutes before first pitch', () => {
  const game = {
    abstractState: 'Preview',
    gameDate: '2026-10-03T20:08:00Z',
    status: 'Scheduled',
    timeValid: true,
  };
  const tooEarly = new Date('2026-10-03T19:00:00Z');
  const open = new Date('2026-10-03T19:53:00Z');
  assert.equal(isWithinGetVideoWindow(game, tooEarly, 15), false);
  assert.equal(isWithinGetVideoWindow(game, open, 15), true);
});

test('a game with no timeValid flag still uses its start time', () => {
  const game = {
    abstractState: 'Preview',
    gameDate: '2026-10-03T20:08:00Z',
    status: 'Scheduled',
  };
  const open = new Date('2026-10-03T19:53:00Z');
  assert.equal(isWithinGetVideoWindow(game, open, 15), true);
});

// The selection must not depend on the runner's time zone (GitHub Actions runs in UTC).
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

function mlbGame(overrides) {
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
  const game = mlbGame({ gameDate: '2026-09-27T00:10:00Z', officialDate: '2026-09-26' });
  const tomorrow = mlbGame({
    gameDate: '2026-09-27T17:10:00Z',
    gamePk: 2,
    officialDate: '2026-09-27',
  });
  const pregame = new Date('2026-09-26T23:55:00Z');
  inEachProcessTimeZone((zone) => {
    const featured = featuredGame([tomorrow, game], pregame);
    assert.equal(featured?.gamePk, 1, zone);
    assert.equal(isWithinGetVideoWindow(featured, pregame, 15), true, zone);
  });
});

test('games at 00:00 to 00:15 UTC are featured before and after midnight UTC', () => {
  for (const start of ['2026-09-27T00:00:00Z', '2026-09-27T00:15:00Z']) {
    const game = mlbGame({ gameDate: start, officialDate: '2026-09-26' });
    inEachProcessTimeZone((zone) => {
      assert.equal(
        featuredGame([game], new Date('2026-09-26T23:50:00Z'))?.gamePk,
        1,
        `${start} ${zone} before`,
      );
      assert.equal(
        featuredGame([game], new Date('2026-09-27T00:05:00Z'))?.gamePk,
        1,
        `${start} ${zone} after`,
      );
    });
  }
});

test('a start delayed past 00:00 UTC stays selectable while still in Preview', () => {
  const delayed = mlbGame({
    gameDate: '2026-09-26T23:10:00Z',
    officialDate: '2026-09-26',
    status: 'Delayed Start: Rain',
  });
  const next = mlbGame({
    gameDate: '2026-09-27T17:10:00Z',
    gamePk: 2,
    officialDate: '2026-09-27',
  });
  inEachProcessTimeZone((zone) => {
    assert.equal(
      featuredGame([next, delayed], new Date('2026-09-27T00:40:00Z'))?.gamePk,
      1,
      zone,
    );
    // Still inside the post-start grace after midnight Eastern.
    assert.equal(
      featuredGame([next, delayed], new Date('2026-09-27T01:50:00Z'), {
        graceMinutes: 180,
      })?.gamePk,
      1,
      zone,
    );
  });
});

test('tomorrow\'s game is not featured on a UTC runner in the evening', () => {
  const final = mlbGame({
    abstractState: 'Final',
    gameDate: '2026-09-26T17:10:00Z',
    officialDate: '2026-09-26',
    status: 'Final',
  });
  const tomorrow = mlbGame({
    gameDate: '2026-09-27T17:10:00Z',
    gamePk: 2,
    officialDate: '2026-09-27',
  });
  inEachProcessTimeZone((zone) => {
    assert.equal(featuredGame([final, tomorrow], new Date('2026-09-27T01:00:00Z')), undefined, zone);
  });
});

test('a live game wins over a later game in the window', () => {
  const live = mlbGame({
    abstractState: 'Live',
    gameDate: '2026-09-26T17:10:00Z',
    officialDate: '2026-09-26',
    status: 'In Progress',
  });
  const nightcap = mlbGame({
    gameDate: '2026-09-26T21:10:00Z',
    gameNumber: 2,
    gamePk: 2,
    officialDate: '2026-09-26',
  });
  assert.equal(featuredGame([nightcap, live], new Date('2026-09-26T21:00:00Z'))?.gamePk, 1);
});

test('a suspended game reported as Live never outranks the game being played', () => {
  const suspended = mlbGame({
    abstractState: 'Live',
    gameDate: '2026-09-25T23:10:00Z',
    officialDate: '2026-09-25',
    status: 'Suspended: Rain',
  });
  const today = mlbGame({
    gameDate: '2026-09-26T17:10:00Z',
    gamePk: 2,
    officialDate: '2026-09-26',
  });
  assert.equal(featuredGame([suspended, today], new Date('2026-09-26T17:00:00Z'))?.gamePk, 2);
});

test('among live games today\'s official date wins', () => {
  const resumedLive = mlbGame({
    abstractState: 'Live',
    gameDate: '2026-09-26T16:05:00Z',
    officialDate: '2026-09-17',
    status: 'In Progress',
  });
  const todayLive = mlbGame({
    abstractState: 'Live',
    gameDate: '2026-09-26T17:10:00Z',
    gamePk: 2,
    officialDate: '2026-09-26',
    status: 'In Progress',
  });
  assert.equal(featuredGame([resumedLive, todayLive], new Date('2026-09-26T17:30:00Z'))?.gamePk, 2);
});

test('a pre-game delay from yesterday\'s official date stays selectable after midnight', () => {
  const delayed = mlbGame({
    gameDate: '2026-09-26T23:10:00Z',
    officialDate: '2026-09-26',
    status: 'Delayed Start: Rain',
  });
  const scheduled = { ...delayed, status: 'Scheduled' };
  // 1:30 AM Eastern, well past the 60-minute grace.
  const now = new Date('2026-09-27T05:30:00Z');
  inEachProcessTimeZone((zone) => {
    assert.equal(featuredGame([delayed], now, { graceMinutes: 60 })?.gamePk, 1, zone);
    assert.equal(featuredGame([scheduled], now, { graceMinutes: 60 }), undefined, zone);
  });
});

test('a resumed game with an older official date is featured when its restart nears', () => {
  const resumed = mlbGame({
    gameDate: '2026-09-21T17:10:00Z',
    officialDate: '2026-09-12',
    resumed: true,
  });
  assert.equal(featuredGame([resumed], new Date('2026-09-21T17:00:00Z'))?.gamePk, 1);
  assert.equal(featuredGame([resumed], new Date('2026-09-21T14:00:00Z')), undefined);
});

test('a time-TBA game sorts after an earlier game number on the same official date', () => {
  const tbaNightcap = mlbGame({
    gameDate: '2026-10-03T07:33:00Z',
    gameNumber: 2,
    gamePk: 2,
    officialDate: '2026-10-03',
    timeValid: false,
  });
  const opener = mlbGame({
    gameDate: '2026-10-03T17:10:00Z',
    officialDate: '2026-10-03',
    timeValid: true,
  });
  assert.equal(featuredGame([tbaNightcap, opener], new Date('2026-10-03T13:00:00Z'))?.gamePk, 1);
});

test('a time-TBA game is featured for today but stays outside the window', () => {
  const tba = mlbGame({
    gameDate: '2026-10-03T07:33:00Z',
    officialDate: '2026-10-03',
    timeValid: false,
  });
  const afternoon = new Date('2026-10-03T18:00:00Z');
  inEachProcessTimeZone((zone) => {
    const featured = featuredGame([tba], afternoon);
    assert.equal(featured?.gamePk, 1, zone);
    assert.equal(isWithinGetVideoWindow(featured, afternoon, 15), false, zone);
  });
});

test('official dates follow America/New_York across the November DST change', () => {
  assert.equal(officialDateInZone(new Date('2026-11-01T03:59:00Z'), 'America/New_York'), '2026-10-31');
  assert.equal(officialDateInZone(new Date('2026-11-01T04:00:00Z'), 'America/New_York'), '2026-11-01');
  assert.equal(officialDateInZone(new Date('2026-11-02T04:59:00Z'), 'America/New_York'), '2026-11-01');
  assert.equal(officialDateInZone(new Date('2026-11-02T05:00:00Z'), 'America/New_York'), '2026-11-02');
  assert.equal(officialDateInZone(new Date('2027-03-14T04:59:00Z'), 'America/New_York'), '2027-03-13');
  assert.equal(officialDateInZone(new Date('2027-03-15T03:59:00Z'), 'America/New_York'), '2027-03-14');
});

function cyclonesGame(overrides) {
  return {
    abstractState: 'Preview',
    gameNumber: 1,
    gamePk: 1,
    opponentName: 'Kansas State Wildcats',
    sport: 'mens-basketball',
    status: 'Scheduled',
    timeValid: true,
    ...overrides,
  };
}

test('Cyclones evening tips around the DST changes use the Chicago calendar', () => {
  const cases = [
    // 7:30 PM CDT Saturday, the night before DST ends.
    { gameDate: '2026-11-01T00:30:00Z', now: '2026-11-01T00:20:00Z', officialDate: '2026-10-31' },
    // 7:00 PM CST, the first Saturday after DST ends.
    { gameDate: '2026-11-08T01:00:00Z', now: '2026-11-08T00:50:00Z', officialDate: '2026-11-07' },
    // 6:00 PM CST tip.
    { gameDate: '2026-12-10T00:00:00Z', now: '2026-12-09T23:50:00Z', officialDate: '2026-12-09' },
    // 7:00 PM CDT on the day DST starts.
    { gameDate: '2027-03-15T00:00:00Z', now: '2027-03-14T23:50:00Z', officialDate: '2027-03-14' },
  ];
  for (const { gameDate, now, officialDate } of cases) {
    assert.equal(officialDateInZone(new Date(gameDate), 'America/Chicago'), officialDate);
    const game = cyclonesGame({ gameDate, officialDate });
    inEachProcessTimeZone((zone) => {
      assert.equal(featuredCyclonesGame([game], new Date(now))?.gamePk, 1, `${gameDate} ${zone}`);
    });
  }
});

test('a Cyclones game with no start time is an all-day game on its New York placeholder date', () => {
  const event = {
    competitions: [
      {
        competitors: [
          { homeAway: 'home', score: '0', team: { displayName: 'Iowa State Cyclones', id: '66' } },
          { homeAway: 'away', score: '0', team: { displayName: 'Drake Bulldogs', id: '2181' } },
        ],
        status: { type: { name: 'STATUS_SCHEDULED', state: 'pre' } },
        timeValid: false,
      },
    ],
    date: '2026-11-02T05:00:00Z',
    id: '401800001',
    timeValid: false,
  };
  const game = cyclonesGameFromEspnEvent(event, 'mens-basketball', 66);
  assert.equal(game.officialDate, '2026-11-02');
  assert.equal(game.timeValid, false);

  const timed = cyclonesGameFromEspnEvent(
    { ...event, competitions: [{ ...event.competitions[0], timeValid: true }], timeValid: true },
    'mens-basketball',
    66,
  );
  assert.equal(timed.officialDate, '2026-11-01');

  inEachProcessTimeZone((zone) => {
    // 10:30 PM CST on 11-01: not yet that game's day.
    assert.equal(featuredCyclonesGame([game], new Date('2026-11-02T04:30:00Z')), undefined, zone);
    // 12:30 AM and 11:30 PM CST on 11-02.
    assert.equal(featuredCyclonesGame([game], new Date('2026-11-02T06:30:00Z'))?.gamePk, 401800001, zone);
    assert.equal(featuredCyclonesGame([game], new Date('2026-11-03T05:30:00Z'))?.gamePk, 401800001, zone);
    assert.equal(isWithinGetVideoWindow(game, new Date('2026-11-02T20:00:00Z'), 15), false, zone);
  });
});

test('Cyclones selection is scoped to the dispatched sport', () => {
  const config = { sport: 'cyclones', leadMinutes: 15, postStartGraceMinutes: 240 };
  const football = cyclonesGame({
    gameDate: '2026-11-07T18:00:00Z',
    gamePk: 10,
    officialDate: '2026-11-07',
    opponentName: 'Iowa Hawkeyes',
    sport: 'football',
  });
  const basketball = cyclonesGame({
    gameDate: '2026-11-08T01:00:00Z',
    gamePk: 20,
    officialDate: '2026-11-07',
  });
  const now = new Date('2026-11-08T00:50:00Z');
  assert.equal(featuredGameForConfig(config, [football, basketball], now, 'mens-basketball')?.gamePk, 20);
  assert.equal(featuredGameForConfig(config, [football, basketball], now, 'football')?.gamePk, 10);
});

test('Patriots Thursday night kickoff keeps its New York date on a UTC runner', () => {
  const config = { sport: 'nfl', leadMinutes: 15, postStartGraceMinutes: 240 };
  const tnf = mlbGame({
    gameDate: '2026-09-11T00:15:00Z',
    officialDate: '2026-09-10',
    opponentName: 'Buffalo Bills',
  });
  inEachProcessTimeZone((zone) => {
    const featured = featuredGameForConfig(config, [tnf], new Date('2026-09-11T00:05:00Z'));
    assert.equal(featured?.gamePk, 1, zone);
  });
});

test('postStartGraceMinutes bounds how long an unstarted game from yesterday stays featured', () => {
  const config = { leadMinutes: 15, postStartGraceMinutes: 60 };
  const late = mlbGame({
    gameDate: '2026-09-27T02:10:00Z',
    officialDate: '2026-09-26',
    status: 'Pre-Game',
  });
  // 12:40 AM Eastern: 30 minutes after the scheduled start.
  assert.equal(featuredGameForConfig(config, [late], new Date('2026-09-27T04:40:00Z')), undefined);
  assert.equal(featuredGameForConfig(config, [late], new Date('2026-09-27T03:00:00Z'))?.gamePk, 1);
  // Defaults to 180 minutes when the config omits it.
  assert.equal(
    featuredGameForConfig({ leadMinutes: 15 }, [late], new Date('2026-09-27T04:40:00Z'))?.gamePk,
    1,
  );
});
