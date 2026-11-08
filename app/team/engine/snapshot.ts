import type {
  AdapterSchedule,
  LeagueAdapter,
  TeamRef,
} from '../../leagues/types.ts';
import { adapterRecords, emptyRecord, snapshotFromGames } from './featured.ts';
import type { TeamGame, TeamSnapshot } from './types.ts';

export type TeamSnapshotResult = {
  // False when an adapter is missing a list, so the next minute tick retries.
  complete: boolean;
  snapshot: TeamSnapshot;
};

export type TeamSnapshotInput = {
  adapters: readonly LeagueAdapter[];
  now?: Date;
  perGameCards: boolean;
  previous?: TeamSnapshot;
  team: TeamRef;
  unavailableMessage: string;
};

async function scheduleOrFailure(
  adapter: LeagueAdapter,
  team: TeamRef,
  now: Date,
): Promise<AdapterSchedule> {
  try {
    return await adapter.fetchSchedule(team, now);
  } catch {
    return { adapter: adapter.key, answered: false, complete: false, games: [] };
  }
}

// An adapter whose schedule is missing a list keeps its previous games, record and status, so a
// record is never computed from part of a schedule. A refresh with no list at all fails, and so
// does a first load with no adapter complete.
export async function fetchTeamSnapshot(
  input: TeamSnapshotInput,
): Promise<TeamSnapshotResult> {
  const { adapters, perGameCards, previous, team } = input;
  const now = input.now ?? new Date();
  const schedules = await Promise.all(
    adapters.map((adapter) => scheduleOrFailure(adapter, team, now)),
  );
  const failed = schedules.filter((schedule) => !schedule.complete);
  if (
    failed.length === schedules.length &&
    (!previous || failed.every((schedule) => !schedule.answered))
  ) {
    throw new Error(input.unavailableMessage);
  }

  const failedKeys = new Set(failed.map((schedule) => schedule.adapter));
  const games = schedules
    .filter((schedule) => schedule.complete)
    .flatMap((schedule) => schedule.games);
  const records = adapterRecords(
    games,
    schedules
      .filter((schedule) => schedule.complete)
      .map((schedule) => schedule.adapter),
  );
  for (const schedule of schedules) {
    if (schedule.complete && schedule.record) {
      records[schedule.adapter] = schedule.record;
    }
  }

  const carriedGames: TeamGame[] = [];
  const unavailable: LeagueAdapter['key'][] = [];
  for (const adapter of failedKeys) {
    if (!previous || previous.unavailable?.includes(adapter)) {
      unavailable.push(adapter);
      records[adapter] = emptyRecord();
      continue;
    }
    records[adapter] = previous.records[adapter] ?? emptyRecord();
    for (const game of [...previous.featuredGames, ...previous.upcomingGames]) {
      if (game.adapter === adapter) {
        carriedGames.push(game);
      }
    }
  }

  const snapshot = snapshotFromGames([...games, ...carriedGames], records, {
    conference: team.conference,
    now,
    perGameCards,
  });
  for (const adapter of failedKeys) {
    const status = previous?.statuses[adapter];
    if (status) {
      snapshot.statuses[adapter] = status;
    } else {
      delete snapshot.statuses[adapter];
    }
  }
  if (unavailable.length > 0) {
    snapshot.unavailable = unavailable;
  }
  return { complete: failed.length === 0, snapshot };
}
