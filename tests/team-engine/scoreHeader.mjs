import assert from 'node:assert/strict';

import { scoreHeaderFor } from '../../app/team/engine/scoreHeader.ts';

const TEAM_ID = 66;

function game(overrides = {}) {
  return {
    abstractState: 'Live',
    isHome: true,
    opponentName: 'Eastern Illinois Panthers',
    opponentScore: 40,
    status: '9:42 - 4th Quarter',
    teamScore: 50,
    timeValid: true,
    ...overrides,
  };
}

function basketball(overrides = {}) {
  return {
    away: { score: 44 },
    clock: '9:42',
    flags: { possessionArrow: false },
    home: { score: 55 },
    kind: 'basketball',
    period: 4,
    phase: 'inPlay',
    regulationPeriods: 4,
    ...overrides,
  };
}

function periods(overrides = {}) {
  return {
    away: { periods: [], points: 7 },
    clock: '0:59',
    home: { periods: [], points: 10 },
    kind: 'periods',
    period: 2,
    status: '0:59 - 2nd',
    ...overrides,
  };
}

const header = (overrides) => scoreHeaderFor(game(overrides), 'Cyclones', TEAM_ID);

// Rows run away then home, and the board's score wins during a game.
{
  const live = header({ board: basketball() });
  assert.equal(live.status, '4TH · 9:42');
  assert.deepEqual(
    live.rows.map((row) => [row.name, row.score, row.isFollowed]),
    [
      ['Eastern Illinois Panthers', 44, false],
      ['Cyclones', 55, true],
    ],
  );
  const away = header({ board: basketball(), isHome: false });
  assert.deepEqual(away.rows.map((row) => row.name), ['Cyclones', 'Eastern Illinois Panthers']);
}

// Basketball status: halves, overtime, stoppages and a missing clock.
assert.equal(header({ board: basketball({ period: 2, regulationPeriods: 2 }) }).status, '2ND · 9:42');
assert.equal(header({ board: basketball({ period: 5 }) }).status, 'OT · 9:42');
assert.equal(header({ board: basketball({ period: 6 }) }).status, '2OT · 9:42');
assert.equal(header({ board: basketball({ phase: 'halftime' }) }).status, 'HALFTIME');
assert.equal(header({ board: basketball({ clock: undefined }) }).status, '4TH');

// A basketball score the board does not have falls back to the game's score.
assert.deepEqual(
  header({ board: basketball({ away: {}, home: {} }) }).rows.map((row) => row.score),
  [40, 50],
);

// Football status, situation and possession.
{
  const held = header({
    board: periods({ possessionTeamId: TEAM_ID, situation: '1st & 10 at IND 36' }),
  });
  assert.equal(held.status, '2ND · 0:59');
  assert.equal(held.situation, '1st & 10 at IND 36');
  assert.equal(held.tracksPossession, true);
  assert.deepEqual(held.rows.map((row) => row.hasPossession), [false, true]);

  const other = header({ board: periods({ possessionTeamId: 11 }) });
  assert.deepEqual(other.rows.map((row) => row.hasPossession), [true, false]);

  const awayHeld = header({ board: periods({ possessionTeamId: TEAM_ID }), isHome: false });
  assert.deepEqual(awayHeld.rows.map((row) => row.hasPossession), [true, false]);

  const none = header({ board: periods() });
  assert.deepEqual(none.rows.map((row) => row.hasPossession), [false, false]);
}
assert.equal(header({ board: periods({ period: 5 }) }).status, 'OT · 0:59');
assert.equal(header({ board: periods({ status: 'Halftime' }) }).status, 'Halftime');
assert.equal(header({ board: periods({ clock: '0:00', status: 'End of 3rd' }) }).status, 'End of 3rd');
assert.equal(header({ board: periods({ period: 0, status: 'Starting' }) }).status, 'Starting');

// Baseball uses the board's inning text.
{
  const board = {
    away: { runs: 1 },
    home: { runs: 3 },
    kind: 'baseball',
    status: 'Top 4th',
  };
  const live = header({ board });
  assert.equal(live.status, 'Top 4th');
  assert.deepEqual(live.rows.map((row) => row.score), [1, 3]);
  assert.equal(live.tracksPossession, false);
}

// No board yet shows ESPN's status; a final uses the schedule's result over a stale board.
assert.equal(header({}).status, '9:42 - 4th Quarter');
{
  const final = header({ abstractState: 'Final', board: basketball(), status: 'Final' });
  assert.equal(final.status, 'Final');
  assert.deepEqual(final.rows.map((row) => row.score), [40, 50]);
  assert.equal(final.situation, undefined);
}

// A scheduled game has no scores; its status is empty unless the time is unknown.
{
  const scheduled = header({ abstractState: 'Preview', status: 'Scheduled' });
  assert.equal(scheduled.status, '');
  assert.deepEqual(scheduled.rows.map((row) => row.score), [undefined, undefined]);
  assert.equal(
    header({ abstractState: 'Preview', status: 'Scheduled', timeValid: false }).status,
    'Time TBA',
  );
}

// A delay in the game status wins over the board.
assert.equal(
  header({ board: periods(), status: 'Weather Delay' }).status,
  'Weather Delay',
);
