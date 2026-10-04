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

export type EspnCyclonesSchedule = {
  events: EspnCyclonesEvent[];
  failedSports: CyclonesSport[];
};

function seasonYearForSport(sport: CyclonesSport, now: Date): number {
  return sport === 'football'
    ? footballSeasonYear(now)
    : basketballSeasonYear(now);
}

// A sport with any failed season request is left out whole so its record and postseason
// status are never computed from part of its schedule. Only a failure of every sport throws.
export async function fetchEspnCyclonesEvents(
  now = new Date(),
): Promise<EspnCyclonesSchedule> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCHEDULE_TIMEOUT_MS);
  const sports = Object.keys(SPORT_PATHS) as CyclonesSport[];
  const requests: Array<{ sport: CyclonesSport; seasonType: number }> = [];
  for (const sport of sports) {
    for (const seasonType of SCHEDULE_TYPES) {
      requests.push({ seasonType, sport });
    }
  }

  try {
    const results = await Promise.allSettled(
      requests.map(async ({ sport, seasonType }) => {
        const response = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/${SPORT_PATHS[sport]}/teams/${CYCLONES_TEAM_ID}/schedule?season=${seasonYearForSport(sport, now)}&seasontype=${seasonType}`,
          { headers: { Accept: 'application/json' }, signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error('Cyclones information is temporarily unavailable.');
        }
        const document = (await response.json()) as { events?: unknown } | null;
        return Array.isArray(document?.events) ? document.events : [];
      }),
    );
    const failedSports = new Set<CyclonesSport>();
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        failedSports.add(requests[index].sport);
      }
    });
    if (failedSports.size === sports.length) {
      throw new Error('Cyclones information is temporarily unavailable.');
    }

    const unique = new Map<string, EspnCyclonesEvent>();
    results.forEach((result, index) => {
      const sport = requests[index].sport;
      if (result.status !== 'fulfilled' || failedSports.has(sport)) {
        return;
      }
      for (const event of result.value) {
        if (typeof event !== 'object' || event === null) {
          continue;
        }
        const id = (event as { id?: unknown }).id;
        if (typeof id === 'string' || typeof id === 'number') {
          unique.set(`${sport}:${id}`, { event, sport });
        }
      }
    });
    return { events: [...unique.values()], failedSports: [...failedSports] };
  } finally {
    clearTimeout(timeout);
  }
}
