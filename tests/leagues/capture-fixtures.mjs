// Writes each adapter's trimmed probe fixtures under tests/leagues/<adapter>/ from fresh read-only
// ESPN and statsapi requests, then expected-games.json from the app's adapters.
// Usage: node capture-fixtures.mjs [--expected-only] [--league <adapter>]
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

import { pickRecentEvent } from '../../scripts/team-catalog/probe.mjs';
import {
  ADAPTERS,
  STATSAPI,
  adapterDirName,
  scheduleUrl,
  seasonYearFor,
  summaryUrl,
  teamsUrl,
} from '../../scripts/team-catalog/leagues.mjs';
import { STATSAPI_SCHEDULE_FILE, gamesFromFixtures } from './fixture-games.mjs';

const expectedOnly = process.argv.includes('--expected-only');
const filterIndex = process.argv.indexOf('--league');
const filter = filterIndex >= 0 ? process.argv[filterIndex + 1] : undefined;
const MAX_TEAMS = 12;
const MAX_PLAYS = 40;
const MAX_PROBABILITIES = 2;
const MAX_EVENTS = 40;
const MLB_REGULAR_SEASON = 2;
const STATSAPI_TEAM_ID = '114';
const NOISE_KEYS = new Set([
  '$ref',
  'alternateIds',
  'broadcast',
  'broadcasts',
  'geoBroadcasts',
  'headlines',
  'headshot',
  'highlights',
  'links',
  'logo',
  'logos',
  'odds',
  'tickets',
  'uid',
  'venues',
  'weather',
]);
const SUMMARY_KEYS = ['boxscore', 'format', 'header', 'meta', 'plays', 'situation', 'timeouts', 'winprobability'];

function stripNoise(value) {
  if (Array.isArray(value)) {
    return value.map(stripNoise);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !NOISE_KEYS.has(key))
        .map(([key, entry]) => [key, stripNoise(entry)]),
    );
  }
  return value;
}

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  assert.ok(response.ok, `${url} answered ${response.status}`);
  return response.json();
}

function write(dir, name, body) {
  writeFileSync(new URL(name, dir), `${JSON.stringify(body)}\n`);
}

// Keeps a few teams with the preset among them, and the fields the catalog reads.
function trimTeams(body, presetEspnId) {
  const league = body.sports[0].leagues[0];
  const teams = league.teams;
  const preset = teams.filter((entry) => String(entry.team.id) === presetEspnId);
  const others = teams.filter((entry) => String(entry.team.id) !== presetEspnId).slice(0, MAX_TEAMS - preset.length);
  return {
    sports: [{ ...stripNoise(body.sports[0]), leagues: [{ ...stripNoise(league), teams: stripNoise([...preset, ...others]) }] }],
  };
}

function trimSummary(body, row) {
  const kept = Object.fromEntries(SUMMARY_KEYS.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
  if (Array.isArray(kept.plays)) {
    kept.plays = kept.plays.slice(-MAX_PLAYS);
  }
  if (Array.isArray(kept.winprobability)) {
    kept.winprobability = kept.winprobability.slice(-MAX_PROBABILITIES);
  }
  if (!row.basketball) {
    delete kept.boxscore;
  }
  return stripNoise(kept);
}

// A 162-game list adds nothing a shorter one does not.
function trimEvents(events) {
  return events.length > MAX_EVENTS
    ? [...events.slice(0, MAX_EVENTS / 2), ...events.slice(-MAX_EVENTS / 2)]
    : events;
}

function trimStatsapi(body) {
  const dates = (body.dates ?? []).filter((date) => date.games?.length);
  const games = (date) =>
    date.games.map((game) => ({
      dayNight: game.dayNight,
      doubleHeader: game.doubleHeader,
      gameDate: game.gameDate,
      gameNumber: game.gameNumber,
      gamePk: game.gamePk,
      gameType: game.gameType,
      officialDate: game.officialDate,
      status: game.status,
      teams: {
        away: { score: game.teams.away.score, team: { id: game.teams.away.team.id, name: game.teams.away.team.name } },
        home: { score: game.teams.home.score, team: { id: game.teams.home.team.id, name: game.teams.home.team.name } },
      },
    }));
  const days = [...dates.slice(0, 8), ...dates.slice(-8)];
  return { dates: days.map((date) => ({ date: date.date, games: games(date) })) };
}

async function capture(key, row, dir) {
  const season = seasonYearFor(row.seasonYear, new Date());
  write(dir, 'teams.json', trimTeams(await getJson(teamsUrl(row)), row.presetEspnId));
  const events = [];
  for (const seasonType of key === 'mlb' ? [MLB_REGULAR_SEASON] : row.seasonTypes) {
    const body = await getJson(scheduleUrl(row, row.presetEspnId, season, seasonType));
    if ((body.events ?? []).length > 0) {
      write(dir, `schedule-${season}-${seasonType}.json`, { events: stripNoise(trimEvents(body.events)) });
      events.push(...body.events);
    }
  }
  const recent = pickRecentEvent(events);
  assert.ok(recent, `${key} has a live or final event in ${season}`);
  write(dir, 'summary.json', trimSummary(await getJson(summaryUrl(row, recent.id)), row));
  if (key === 'mlb') {
    const query = new URLSearchParams({
      endDate: `${season}-10-05`,
      gameType: 'R',
      hydrate: 'linescore,team',
      sportId: '1',
      startDate: `${season}-08-01`,
      teamId: STATSAPI_TEAM_ID,
    });
    write(dir, STATSAPI_SCHEDULE_FILE, trimStatsapi(await getJson(`${STATSAPI}/schedule?${query}`)));
  }
}

for (const [key, row] of Object.entries(ADAPTERS)) {
  if (filter && filter !== key) {
    continue;
  }
  const dir = new URL(`./${adapterDirName(key)}/`, import.meta.url);
  if (!expectedOnly) {
    await capture(key, row, dir);
  }
  const games = gamesFromFixtures(key);
  assert.ok(games.length > 0, `${key} parsed no games`);
  write(dir, 'expected-games.json', games);
  process.stdout.write(`${key}: ${games.length} games\n`);
}
