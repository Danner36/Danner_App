import assert from 'node:assert/strict';

import {
  displayPercent,
  fetchEspnWinChance,
} from '../../app/leagues/espn/winChance.ts';
import { gameHasScore } from '../../app/team/engine/scoreHeader.ts';

const PATH = 'basketball/leagues/womens-college-basketball';
const realFetch = globalThis.fetch;

const prediction = {
  awayTeam: { statistics: [{ name: 'gameProjection', value: 0.1 }] },
  homeTeam: { statistics: [{ name: 'gameProjection', value: 99.9 }] },
};
const newest = { items: [{ awayWinPercentage: 0.4, homeWinPercentage: 0.6 }] };
const unsupported = { status: 400 };

// Answers by URL: `predictor`, the first probabilities page, then the numbered last page.
async function run({ first, last, predictor = { body: prediction, status: 200 } }, hasScore, live = true) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    const answer = url.includes('/predictor') ? predictor : url.includes('&page=') ? last : first;
    if (answer === 'throw') {
      throw new Error('offline');
    }
    return {
      json: async () => answer.body,
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
    };
  };
  try {
    return { calls, chance: await fetchEspnWinChance(PATH, '1', true, live, hasScore) };
  } finally {
    globalThis.fetch = realFetch;
  }
}

// Before the game: the prediction, and no probabilities request.
{
  const { calls, chance } = await run({}, false, false);
  assert.deepEqual(chance, { opponent: 0.1, team: 99.9 });
  assert.equal(calls.length, 1);
}

// Live with a feed: the newest entry, from the last page.
{
  const { calls, chance } = await run(
    { first: { body: { pageCount: 7 }, status: 200 }, last: { body: newest, status: 200 } },
    true,
  );
  assert.deepEqual(chance, { opponent: 40, team: 60 });
  assert.ok(calls[1].endsWith('&page=7'));
}
assert.deepEqual(
  (await run({ first: { body: { pageCount: 1, ...newest }, status: 200 } }, true)).chance,
  { opponent: 40, team: 60 },
);

// No live feed: the prediction until someone scores, then no number and no prediction request.
for (const first of [unsupported, { status: 404 }, { body: { pageCount: 0 }, status: 200 }]) {
  assert.deepEqual((await run({ first }, false)).chance, { opponent: 0.1, team: 99.9 });
  const scored = await run({ first }, true);
  assert.equal(scored.chance, null);
  assert.equal(scored.calls.some((url) => url.includes('/predictor')), false);
}

// A failed request is not missing data, so the caller keeps its number.
for (const first of ['throw', { status: 500 }, { body: {}, status: 200 }]) {
  assert.equal((await run({ first }, true)).chance, undefined);
}
assert.equal(
  (await run({ first: { body: { pageCount: 7 }, status: 200 }, last: 'throw' }, true)).chance,
  undefined,
);

// Shown percentages never claim certainty.
assert.equal(displayPercent(99.9), 99);
assert.equal(displayPercent(100), 99);
assert.equal(displayPercent(0.1), 1);
assert.equal(displayPercent(0), 1);
assert.equal(displayPercent(46.7), 47);

// The score that decides it comes from the live board when there is one.
const game = { abstractState: 'Live', isHome: true, opponentScore: 0, teamScore: 0 };
assert.equal(gameHasScore(game), false);
assert.equal(gameHasScore({ ...game, teamScore: 3 }), true);
assert.equal(
  gameHasScore({
    ...game,
    board: { away: { points: 7 }, home: { points: 0 }, kind: 'periods' },
  }),
  true,
);
assert.equal(
  gameHasScore({
    ...game,
    board: { away: { runs: 0 }, home: { runs: 0 }, kind: 'baseball' },
  }),
  false,
);
