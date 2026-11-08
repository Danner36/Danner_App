// Adapter rows against the catalog, then each adapter's schedule fixture under the nine phone zones,
// then the basketball board model of each committed live capture.
// Usage: node run.mjs [--league <adapter folder or key>]
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

import { ADAPTERS as CATALOG_ADAPTERS } from '../../scripts/team-catalog/leagues.mjs';
import { basketballBoardFromSummary } from '../../app/leagues/espn/basketballBoard.ts';
import { basketballRulesFor } from '../../app/leagues/espn/basketballRules.ts';
import { teamGameFromEspnEvent } from '../../app/leagues/espn/game.ts';
import { ESPN_ADAPTER_ROWS } from '../../app/leagues/espn/rows.ts';
import { teamGameFromMlb } from '../../app/leagues/mlb/game.ts';
import { SUPPORTED_ADAPTER_KEYS } from '../../app/leagues/registry.ts';
import { CYCLONES_TILE, GUARDIANS_TILE, PATRIOTS_TILE } from '../../app/selection/presets.ts';
import { gameDateLabel } from '../../app/team/engine/dates.ts';
import { snapshotFromGames } from '../../app/team/engine/featured.ts';

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

const leagueFilterIndex = process.argv.indexOf('--league');
const leagueFilter =
  leagueFilterIndex >= 0 ? process.argv[leagueFilterIndex + 1]?.replace('/', '-') : undefined;
const includes = (folder) => !leagueFilter || leagueFilter === folder;
const folderOf = (key) => key.replace('/', '-');

function readFixture(folder, name) {
  return JSON.parse(readFileSync(new URL(`./${folder}/${name}`, import.meta.url), 'utf8'));
}

function inTimeZone(timeZone, run) {
  const original = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    run();
  } finally {
    process.env.TZ = original;
  }
}

// App adapter rows equal the catalog's.
for (const row of ESPN_ADAPTER_ROWS) {
  const catalog = CATALOG_ADAPTERS[row.key];
  assert.ok(catalog, `catalog row for ${row.key}`);
  assert.equal(row.sitePath, catalog.sitePath, row.key);
  assert.equal(row.corePath, catalog.corePath, row.key);
  assert.deepEqual([...row.seasonTypes], catalog.seasonTypes, row.key);
  assert.deepEqual(row.seasonYear, catalog.seasonYear, row.key);
  assert.equal(row.sport, catalog.sport, row.key);
}
assert.deepEqual(
  [...SUPPORTED_ADAPTER_KEYS].sort(),
  Object.keys(CATALOG_ADAPTERS).sort(),
  'the app supports exactly the catalog adapters',
);

const TEAM_BY_ADAPTER = {
  nfl: PATRIOTS_TILE.team,
  'ncaa/football': CYCLONES_TILE.team,
  'ncaa/mens-basketball': CYCLONES_TILE.team,
  'ncaa/womens-basketball': CYCLONES_TILE.team,
};

function parsedEspnGames(row, fixture) {
  const team = TEAM_BY_ADAPTER[row.key];
  return Object.entries(fixture.lists).flatMap(([seasonType, events]) =>
    events.map((event) => teamGameFromEspnEvent(event, row, team, Number(seasonType))),
  );
}

let adapterCases = 0;
for (const row of ESPN_ADAPTER_ROWS) {
  const folder = folderOf(row.key);
  if (!includes(folder)) {
    continue;
  }
  const fixture = readFixture(folder, 'schedule.fixture.json');
  const baseline = parsedEspnGames(row, fixture);
  assert.deepEqual(
    baseline.map((game) => [game.gameId, game.seasonType, game.officialDate, game.abstractState, game.timeValid]),
    [
      ['1001', 1, '2026-08-20', 'Final', true],
      ['2001', 2, '2026-09-05', 'Final', true],
      ['2002', 2, '2026-09-10', 'Preview', true],
      ['2003', 2, '2026-12-20', 'Preview', false],
      ['2004', 2, '2026-10-03', 'Final', true],
      ['3001', 3, '2027-01-09', 'Preview', true],
    ],
    row.key,
  );
  for (const game of baseline) {
    assert.equal(game.adapter, row.key);
    assert.equal(game.key, `${row.key}:${game.gameId}:${game.officialDate}`);
    assert.equal(game.gameNumber, 1);
    assert.equal(game.scoreboard, row.scoreboard);
    assert.equal(game.sport, row.sport);
  }
  assert.equal(baseline[1].teamScore, 31);
  assert.equal(baseline[1].opponentScore, 14);

  for (const timeZone of PHONE_TIME_ZONES) {
    inTimeZone(timeZone, () => {
      const games = parsedEspnGames(row, fixture);
      assert.deepEqual(games, baseline, `${row.key} parses the same in ${timeZone}`);
      assert.equal(gameDateLabel(games[3], 'en-US'), 'Sun, Dec 20 · Time TBA', timeZone);

      // Featuring follows the phone's own calendar.
      const start = new Date(games[2].gameDate);
      const sameDay = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 1, 0, 0);
      const adapterRecords = { [row.key]: { losses: 0, ties: 0, wins: 0 } };
      const options = { now: sameDay, perGameCards: row.sport !== undefined };
      const snapshot = snapshotFromGames(games, adapterRecords, options);
      assert.ok(
        snapshot.featuredGames.some((game) => game.gameId === '2002'),
        `${row.key} features today's game in ${timeZone}`,
      );

      // A game without a start time is an all-day game on its official date.
      const tbaDay = new Date(2026, 11, 20, 9, 0, 0);
      const tbaSnapshot = snapshotFromGames(games, adapterRecords, {
        now: tbaDay,
        perGameCards: row.sport !== undefined,
      });
      assert.ok(tbaSnapshot.featuredGames.some((game) => game.gameId === '2003'), timeZone);
      adapterCases += 1;
    });
  }
}

if (includes('mlb')) {
  const document = readFixture('mlb', 'schedule.fixture.json');
  const rawGames = document.dates.flatMap((date) => date.games);
  const parse = () => rawGames.map((game) => teamGameFromMlb(game, GUARDIANS_TILE.team));
  const baseline = parse();
  assert.deepEqual(
    baseline.map((game) => [game.gameId, game.gameNumber, game.officialDate, game.abstractState, game.timeValid]),
    [
      ['824001', 1, '2026-08-29', 'Final', true],
      ['824002', 2, '2026-08-29', 'Preview', true],
      ['824003', 1, '2026-10-03', 'Preview', false],
    ],
  );
  for (const timeZone of PHONE_TIME_ZONES) {
    inTimeZone(timeZone, () => {
      const games = parse();
      assert.deepEqual(games, baseline, `mlb parses the same in ${timeZone}`);
      assert.match(gameDateLabel(games[2], 'en-US'), /Oct 3 · Time TBA/, timeZone);
      // MLB recaps follow the official date, and the game 2 card follows the final of game 1.
      const earlyEvening = new Date(new Date(games[1].gameDate).getTime() - 30 * 60_000);
      const shifted = games.map((game) => ({
        ...game,
        officialDate: game.gameId === '824003' ? game.officialDate : localDate(earlyEvening),
      }));
      const snapshot = snapshotFromGames(shifted, { mlb: { losses: 0, ties: 0, wins: 0 } }, { now: earlyEvening });
      assert.ok(['824002', '824001'].includes(snapshot.featuredGames[0]?.gameId), timeZone);
      adapterCases += 1;
    });
  }
}

function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Basketball boards from committed live captures, per poll: an in-progress poll, the end of a
// period, and a final.
const EXPECTED_BOARD = {
  'ncaa-mens-basketball/401909771': {
    '001.json.gz': { clock: '3:36', phase: 'inPlay', period: 2, statusDetail: '3:36 - 2nd Half' },
    '019.json.gz': { clock: '0:00', phase: 'endOfPeriod', period: 2, statusDetail: 'End of 2nd Half' },
    '021.json.gz': { phase: 'final', statusDetail: 'Final' },
  },
};
let boardCases = 0;
for (const adapter of ['ncaa/mens-basketball', 'ncaa/womens-basketball']) {
  const folder = folderOf(adapter);
  const capturesUrl = new URL(`./${folder}/captures/`, import.meta.url);
  if (!includes(folder) || !existsSync(capturesUrl)) {
    continue;
  }
  const rules = basketballRulesFor(adapter);
  for (const event of readdirSync(capturesUrl)) {
    for (const file of Object.keys(EXPECTED_BOARD[`${folder}/${event}`] ?? {})) {
      const summary = JSON.parse(
        gunzipSync(readFileSync(new URL(`${event}/${file}`, capturesUrl))).toString('utf8'),
      );
      const model = basketballBoardFromSummary(summary, rules, { now: 0 });
      assert.ok(model, `${event}/${file}`);
      const expected = EXPECTED_BOARD[`${folder}/${event}`][file];
      for (const [field, value] of Object.entries(expected)) {
        assert.equal(model[field], value, `${event}/${file} ${field}`);
      }
      const competition = summary.header.competitions[0];
      for (const side of ['away', 'home']) {
        const competitor = competition.competitors.find((entry) => entry.homeAway === side);
        assert.equal(model[side].score, Number(competitor.score), `${event}/${file} ${side}`);
        assert.equal(model[side].teamId, String(competitor.team.id));
      }
      assert.equal(model.regulationPeriods, 2);
      boardCases += 1;
    }
  }
}

process.stdout.write(
  `League assertions passed: ${adapterCases} adapter-zone cases, ${boardCases} board captures.\n`,
);
