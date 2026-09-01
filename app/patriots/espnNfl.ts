import { PATRIOTS_TEAM_ID, nflSeasonYear } from './patriotsSnapshot';

const SCHEDULE_TYPES = [1, 2, 3] as const;
const SCHEDULE_TIMEOUT_MS = 10_000;

export async function fetchEspnPatriotsEvents(
  now = new Date(),
): Promise<unknown[]> {
  const season = nflSeasonYear(now);
  // One budget for all three season types: without it a hung ESPN request leaves the caller
  // unsettled, so the refresh spinner never clears.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCHEDULE_TIMEOUT_MS);
  let documents: Array<{ events?: unknown[] }>;
  try {
    const responses = await Promise.all(
      SCHEDULE_TYPES.map((seasonType) =>
        fetch(
          `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${PATRIOTS_TEAM_ID}/schedule?season=${season}&seasontype=${seasonType}`,
          { headers: { Accept: 'application/json' }, signal: controller.signal },
        ),
      ),
    );
    if (responses.some((response) => !response.ok)) {
      throw new Error('Patriots information is temporarily unavailable.');
    }

    documents = await Promise.all(
      responses.map(
        (response) => response.json() as Promise<{ events?: unknown[] }>,
      ),
    );
  } finally {
    clearTimeout(timeout);
  }
  const unique = new Map<string, unknown>();
  for (const document of documents) {
    for (const event of document.events ?? []) {
      if (typeof event !== 'object' || event === null) {
        continue;
      }
      const id = (event as { id?: unknown }).id;
      if (typeof id === 'string' || typeof id === 'number') {
        unique.set(String(id), event);
      }
    }
  }
  return [...unique.values()];
}
