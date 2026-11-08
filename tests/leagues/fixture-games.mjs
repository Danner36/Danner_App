// Parses an adapter's committed probe fixtures with the app's own adapters. The result is what
// expected-games.json holds. Shared by run.mjs and capture-fixtures.mjs.
import { readFileSync, readdirSync } from 'node:fs';

import { adapterDirName } from '../../scripts/team-catalog/leagues.mjs';
import { teamGameFromEspnEvent } from '../../app/leagues/espn/game.ts';
import { ESPN_ADAPTER_ROWS } from '../../app/leagues/espn/rows.ts';
import { teamGameFromMlb } from '../../app/leagues/mlb/game.ts';
import { CYCLONES_TILE, GUARDIANS_TILE, PATRIOTS_TILE } from '../../app/selection/presets.ts';

const SCHEDULE_FILE = /^schedule-\d{4}-(\d+)\.json$/;

export const STATSAPI_SCHEDULE_FILE = 'statsapi-schedule.json';

function presetTeam(adapter) {
  return adapter === 'mlb' ? GUARDIANS_TILE.team : adapter === 'nfl' ? PATRIOTS_TILE.team : CYCLONES_TILE.team;
}

// Types are compared as plain JSON: expected-games.json cannot hold undefined fields.
export function gamesFromFixtures(adapter) {
  const dir = new URL(`./${adapterDirName(adapter)}/`, import.meta.url);
  const read = (name) => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
  const team = presetTeam(adapter);
  let games;
  if (adapter === 'mlb') {
    games = read(STATSAPI_SCHEDULE_FILE).dates.flatMap((date) =>
      date.games.map((game) => teamGameFromMlb(game, team)),
    );
  } else {
    const row = ESPN_ADAPTER_ROWS.find((entry) => entry.key === adapter);
    games = readdirSync(dir)
      .filter((name) => SCHEDULE_FILE.test(name))
      .sort()
      .flatMap((name) => {
        const seasonType = Number(SCHEDULE_FILE.exec(name)[1]);
        return read(name).events.map((event) => teamGameFromEspnEvent(event, row, team, seasonType));
      });
  }
  return JSON.parse(JSON.stringify(games.filter((game) => game !== undefined)));
}
