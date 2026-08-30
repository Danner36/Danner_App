import { PATRIOTS_TEAM_ID, nflSeasonYear } from './patriotsSnapshot';

const SCHEDULE_TYPES = [1, 2, 3] as const;

export async function fetchEspnPatriotsEvents(
  now = new Date(),
): Promise<unknown[]> {
  const season = nflSeasonYear(now);
  const responses = await Promise.all(
    SCHEDULE_TYPES.map((seasonType) =>
      fetch(
        `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${PATRIOTS_TEAM_ID}/schedule?season=${season}&seasontype=${seasonType}`,
        { headers: { Accept: 'application/json' } },
      ),
    ),
  );
  if (responses.some((response) => !response.ok)) {
    throw new Error('Patriots information is temporarily unavailable.');
  }

  const documents = await Promise.all(
    responses.map((response) => response.json() as Promise<{ events?: unknown[] }>),
  );
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
