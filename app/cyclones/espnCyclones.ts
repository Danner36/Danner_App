import {
  basketballSeasonYear,
  CYCLONES_TEAM_ID,
  footballSeasonYear,
  type CyclonesSport,
} from './cyclonesSnapshot';

const SCHEDULE_TYPES = [1, 2, 3] as const;
const SCHEDULE_TIMEOUT_MS = 12_000;

const SPORT_PATHS: Record<CyclonesSport, string> = {
  football: 'football/college-football',
  'mens-basketball': 'basketball/mens-college-basketball',
  'womens-basketball': 'basketball/womens-college-basketball',
};

export type EspnCyclonesEvent = {
  event: unknown;
  sport: CyclonesSport;
};

function seasonYearForSport(sport: CyclonesSport, now: Date): number {
  return sport === 'football'
    ? footballSeasonYear(now)
    : basketballSeasonYear(now);
}

export async function fetchEspnCyclonesEvents(
  now = new Date(),
): Promise<EspnCyclonesEvent[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCHEDULE_TIMEOUT_MS);
  const requests: Array<{ sport: CyclonesSport; seasonType: number }> = [];
  for (const sport of Object.keys(SPORT_PATHS) as CyclonesSport[]) {
    for (const seasonType of SCHEDULE_TYPES) {
      requests.push({ seasonType, sport });
    }
  }

  try {
    const responses = await Promise.all(
      requests.map(({ sport, seasonType }) =>
        fetch(
          `https://site.api.espn.com/apis/site/v2/sports/${SPORT_PATHS[sport]}/teams/${CYCLONES_TEAM_ID}/schedule?season=${seasonYearForSport(sport, now)}&seasontype=${seasonType}`,
          { headers: { Accept: 'application/json' }, signal: controller.signal },
        ),
      ),
    );
    if (responses.some((response) => !response.ok)) {
      throw new Error('Cyclones information is temporarily unavailable.');
    }

    const documents = await Promise.all(
      responses.map(
        (response) => response.json() as Promise<{ events?: unknown[] }>,
      ),
    );
    const unique = new Map<string, EspnCyclonesEvent>();
    documents.forEach((document, index) => {
      const sport = requests[index].sport;
      for (const event of document.events ?? []) {
        if (typeof event !== 'object' || event === null) {
          continue;
        }
        const id = (event as { id?: unknown }).id;
        if (typeof id === 'string' || typeof id === 'number') {
          unique.set(`${sport}:${id}`, { event, sport });
        }
      }
    });
    return [...unique.values()];
  } finally {
    clearTimeout(timeout);
  }
}
