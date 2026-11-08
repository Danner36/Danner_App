// Percent chance, 0 to 100, that each side wins. ESPN leaves a gap for a tie in football.
export type WinChance = {
  opponent: number;
  team: number;
};

const REQUEST_TIMEOUT_MS = 6_000;

export async function fetchEspnJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    return response.ok ? await response.json() : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function percentage(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(100, value)
    : undefined;
}

function sideProjection(side: unknown): number | undefined {
  const statistics = (side as { statistics?: unknown } | undefined)?.statistics;
  if (!Array.isArray(statistics)) {
    return undefined;
  }
  const projection = statistics.find(
    (entry) => (entry as { name?: unknown } | null)?.name === 'gameProjection',
  ) as { value?: unknown } | undefined;
  return percentage(projection?.value);
}

export function winChanceFromPredictor(
  value: unknown,
  isHome: boolean,
): WinChance | undefined {
  const document = value as { awayTeam?: unknown; homeTeam?: unknown } | null;
  const home = sideProjection(document?.homeTeam);
  const away = sideProjection(document?.awayTeam);
  if (home === undefined || away === undefined) {
    return undefined;
  }
  return isHome ? { opponent: away, team: home } : { opponent: home, team: away };
}

export function winChanceFromProbability(
  value: unknown,
  isHome: boolean,
): WinChance | undefined {
  const item = value as {
    awayWinPercentage?: unknown;
    homeWinPercentage?: unknown;
  } | null;
  const home = percentage(
    typeof item?.homeWinPercentage === 'number'
      ? item.homeWinPercentage * 100
      : undefined,
  );
  const away = percentage(
    typeof item?.awayWinPercentage === 'number'
      ? item.awayWinPercentage * 100
      : undefined,
  );
  if (home === undefined || away === undefined) {
    return undefined;
  }
  return isHome ? { opponent: away, team: home } : { opponent: home, team: away };
}

// `corePath` is the league's ESPN core path; `eventId` the ESPN event. Live reads ESPN's newest
// probability, then the pre-game prediction; before the game only the prediction.
export async function fetchEspnWinChance(
  corePath: string,
  eventId: string,
  isHome: boolean,
  live: boolean,
): Promise<WinChance | undefined> {
  const competition = `https://sports.core.api.espn.com/v2/sports/${corePath}/events/${eventId}/competitions/${eventId}`;
  const pregame = async () =>
    winChanceFromPredictor(
      await fetchEspnJson(`${competition}/predictor`),
      isHome,
    );
  if (!live) {
    return pregame();
  }

  // ESPN lists one probability per play; the last page of a one-item page size is the newest.
  const base = `${competition}/probabilities?limit=1`;
  const first = (await fetchEspnJson(base)) as {
    items?: unknown[];
    pageCount?: unknown;
  } | null;
  const pageCount =
    typeof first?.pageCount === 'number' ? Math.trunc(first.pageCount) : 0;
  if (pageCount >= 1) {
    const last =
      pageCount === 1
        ? first
        : ((await fetchEspnJson(`${base}&page=${pageCount}`)) as {
            items?: unknown[];
          } | null);
    const chance = winChanceFromProbability(last?.items?.[0], isHome);
    if (chance) {
      return chance;
    }
  }
  return pregame();
}
