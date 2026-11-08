import type { TeamGame } from '../../team/engine/types.ts';
import type { AdapterSchedule, TeamRef } from '../types.ts';
import { teamGameFromEspnEvent } from './game.ts';
import { seasonYearFor, type EspnAdapterRow } from './rows.ts';

const SCHEDULE_TIMEOUT_MS = 12_000;

// One budget per adapter, so a hung request cannot leave the refresh spinner running. A failed
// season-type list leaves `complete` false, so the caller carries the adapter's previous games.
export async function fetchEspnSchedule(
  row: EspnAdapterRow,
  team: Pick<TeamRef, 'espnId'>,
  now: Date,
  boardFor?: (event: unknown, polledAt: number) => TeamGame['board'],
): Promise<AdapterSchedule> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCHEDULE_TIMEOUT_MS);
  const season = seasonYearFor(row.seasonYear, now);
  let results: Array<PromiseSettledResult<unknown[]>>;
  try {
    results = await Promise.allSettled(
      row.seasonTypes.map(async (seasonType) => {
        const response = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/${row.sitePath}/teams/${team.espnId}/schedule?season=${season}&seasontype=${seasonType}`,
          { headers: { Accept: 'application/json' }, signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error('The schedule is unavailable.');
        }
        const document = (await response.json()) as { events?: unknown } | null;
        return Array.isArray(document?.events) ? document.events : [];
      }),
    );
  } finally {
    clearTimeout(timeout);
  }

  const fetchedAt = Date.now();
  const unique = new Map<string, TeamGame>();
  results.forEach((result, index) => {
    if (result.status !== 'fulfilled') {
      return;
    }
    for (const event of result.value) {
      const game = teamGameFromEspnEvent(
        event,
        row,
        team,
        row.seasonTypes[index],
      );
      if (game) {
        const board = boardFor?.(event, fetchedAt);
        unique.set(game.gameId, board ? { ...game, board } : game);
      }
    }
  });

  const answered = results.some((result) => result.status === 'fulfilled');
  const complete = results.every((result) => result.status === 'fulfilled');
  return { adapter: row.key, answered, complete, games: [...unique.values()] };
}
