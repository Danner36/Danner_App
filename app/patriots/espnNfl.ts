import { PATRIOTS_TEAM_ID, nflSeasonYear } from './patriotsSnapshot';

const SCHEDULE_TYPES = [1, 2, 3] as const;
const REGULAR_SEASON_TYPE = 2;
const SCHEDULE_TIMEOUT_MS = 10_000;

export type EspnPatriotsEvent = {
  event: unknown;
  // The schedule list that returned the event: 1 preseason, 2 regular season, 3 playoffs.
  seasonType: number;
};

export async function fetchEspnPatriotsEvents(
  now = new Date(),
): Promise<EspnPatriotsEvent[]> {
  const season = nflSeasonYear(now);
  // One budget for all three season types: without it a hung ESPN request leaves the caller
  // unsettled, so the refresh spinner never clears.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCHEDULE_TIMEOUT_MS);
  let results: Array<PromiseSettledResult<{ events?: unknown }>>;
  try {
    results = await Promise.allSettled(
      SCHEDULE_TYPES.map(async (seasonType) => {
        const response = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${PATRIOTS_TEAM_ID}/schedule?season=${season}&seasontype=${seasonType}`,
          { headers: { Accept: 'application/json' }, signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error('Patriots information is temporarily unavailable.');
        }
        return (await response.json()) as { events?: unknown };
      }),
    );
  } finally {
    clearTimeout(timeout);
  }

  // A failed preseason or playoff list leaves the rest of the season on screen. The regular
  // season carries the record, so without it the refresh fails.
  if (
    results[SCHEDULE_TYPES.indexOf(REGULAR_SEASON_TYPE)]?.status !== 'fulfilled'
  ) {
    throw new Error('Patriots information is temporarily unavailable.');
  }

  const unique = new Map<string, EspnPatriotsEvent>();
  results.forEach((result, index) => {
    if (result.status !== 'fulfilled') {
      return;
    }
    const events = result.value?.events;
    for (const event of Array.isArray(events) ? events : []) {
      if (typeof event !== 'object' || event === null) {
        continue;
      }
      const id = (event as { id?: unknown }).id;
      if (typeof id === 'string' || typeof id === 'number') {
        unique.set(String(id), { event, seasonType: SCHEDULE_TYPES[index] });
      }
    }
  });
  return [...unique.values()];
}
