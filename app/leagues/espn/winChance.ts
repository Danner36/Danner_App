// Percent chance, 0 to 100, that each side wins. ESPN leaves a gap for a tie in football.
export type WinChance = {
  opponent: number;
  team: number;
};

const REQUEST_TIMEOUT_MS = 6_000;
const MIN_SHOWN_PERCENT = 1;
const MAX_SHOWN_PERCENT = 99;
// ESPN answers 400 for an event it keeps no probabilities for.
const NO_FEED_STATUSES: readonly number[] = [400, 404];

// Neither team is ever shown as certain.
export function displayPercent(value: number): number {
  return Math.min(MAX_SHOWN_PERCENT, Math.max(MIN_SHOWN_PERCENT, Math.round(value)));
}

async function fetchEspn(
  url: string,
): Promise<{ body?: unknown; status: number } | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    return {
      body: response.ok ? await response.json() : undefined,
      status: response.status,
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchEspnJson(url: string): Promise<unknown> {
  return (await fetchEspn(url))?.body;
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

// `corePath` is the league's ESPN core path; `eventId` the ESPN event. Before the game this is the
// prediction. Live it is ESPN's newest probability; a game with no live feed keeps the prediction
// only until someone scores, because after that it no longer describes the game. Returns null when
// ESPN has no number for this moment, and undefined when a request failed, so the caller can keep
// what it already shows.
export async function fetchEspnWinChance(
  corePath: string,
  eventId: string,
  isHome: boolean,
  live: boolean,
  hasScore: boolean,
): Promise<WinChance | null | undefined> {
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
  const first = await fetchEspn(base);
  if (!first) {
    return undefined;
  }
  const pageCount = (first.body as { pageCount?: unknown } | undefined)?.pageCount;
  if (NO_FEED_STATUSES.includes(first.status) || pageCount === 0) {
    return hasScore ? null : pregame();
  }
  if (typeof pageCount !== 'number' || pageCount < 1) {
    return undefined;
  }
  const last =
    pageCount === 1 ? first : await fetchEspn(`${base}&page=${Math.trunc(pageCount)}`);
  const items = (last?.body as { items?: unknown[] } | undefined)?.items;
  return winChanceFromProbability(items?.[0], isHome);
}
