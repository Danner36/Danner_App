import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { gameInterruption, type GuardiansGame } from './guardiansSnapshot';

// Percent chance, 0 to 100, that each side wins.
export type WinChance = {
  opponent: number;
  team: number;
};

const ESPN_GUARDIANS_TEAM_ID = '5';
const EVENTS_URL =
  'https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/events';
const SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard';
const START_TIME_TOLERANCE_MS = 30 * 60_000;

// ESPN event ids by MLB game, found once from the scoreboard of the official date.
const eventIds = new Map<number, string>();

type GameIdentity = Pick<GuardiansGame, 'gameDate' | 'gamePk' | 'officialDate'>;
const REQUEST_TIMEOUT_MS = 6_000;
const PREGAME_REFRESH_MS = 600_000;
const LIVE_REFRESH_MS = 30_000;

async function fetchJson(url: string): Promise<unknown> {
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

// The ESPN event for the Guardians game on that date whose start time is closest to MLB's,
// so each game of a doubleheader keeps its own prediction.
async function findEspnEventId(game: GameIdentity): Promise<string | undefined> {
  const known = eventIds.get(game.gamePk);
  if (known) {
    return known;
  }
  const document = (await fetchJson(
    `${SCOREBOARD_URL}?dates=${game.officialDate.replace(/-/g, '')}`,
  )) as { events?: unknown[] } | null;
  const startMs = new Date(game.gameDate).getTime();
  let best: { diff: number; id: string } | undefined;
  for (const entry of document?.events ?? []) {
    const event = entry as {
      competitions?: Array<{ competitors?: Array<{ team?: { id?: unknown } }> }>;
      date?: unknown;
      id?: unknown;
    };
    const playsGuardians = event.competitions?.[0]?.competitors?.some(
      (competitor) => String(competitor.team?.id) === ESPN_GUARDIANS_TEAM_ID,
    );
    if (!playsGuardians || typeof event.id !== 'string') {
      continue;
    }
    const diff = Math.abs(new Date(String(event.date)).getTime() - startMs);
    if (Number.isFinite(diff) && (!best || diff < best.diff)) {
      best = { diff, id: event.id };
    }
  }
  if (!best || best.diff > START_TIME_TOLERANCE_MS) {
    return undefined;
  }
  eventIds.set(game.gamePk, best.id);
  return best.id;
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

async function fetchPregameWinChance(
  eventId: string,
  isHome: boolean,
): Promise<WinChance | undefined> {
  return winChanceFromPredictor(
    await fetchJson(`${EVENTS_URL}/${eventId}/competitions/${eventId}/predictor`),
    isHome,
  );
}

// ESPN lists one probability per play; the last page of a one-item page size is the newest.
async function fetchLiveWinChance(
  eventId: string,
  isHome: boolean,
): Promise<WinChance | undefined> {
  const base = `${EVENTS_URL}/${eventId}/competitions/${eventId}/probabilities?limit=1`;
  const first = (await fetchJson(base)) as {
    items?: unknown[];
    pageCount?: unknown;
  } | null;
  const pageCount =
    typeof first?.pageCount === 'number' ? Math.trunc(first.pageCount) : 0;
  if (pageCount < 1) {
    return undefined;
  }
  const last =
    pageCount === 1
      ? first
      : ((await fetchJson(`${base}&page=${pageCount}`)) as {
          items?: unknown[];
        } | null);
  return winChanceFromProbability(last?.items?.[0], isHome);
}

// The win chance for the featured game: ESPN's pre-game prediction, then the live
// probability once the game starts. Nothing is returned after Final, for a postponed or
// canceled game, or when ESPN has no number.
export function useWinChance(game: GuardiansGame | undefined): WinChance | undefined {
  const gamePk = game?.gamePk;
  const officialDate = game?.officialDate;
  const gameDate = game?.gameDate;
  const isHome = game?.isHome;
  const state = game?.abstractState;
  const interruption = game ? gameInterruption(game.status) : undefined;
  const wanted =
    (state === 'Preview' || state === 'Live') &&
    interruption !== 'postponed' &&
    interruption !== 'canceled';
  const [found, setFound] = useState<{ chance: WinChance; gamePk: number }>();

  useEffect(() => {
    if (
      !wanted ||
      gamePk === undefined ||
      isHome === undefined ||
      officialDate === undefined ||
      gameDate === undefined
    ) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      if (AppState.currentState !== 'active') {
        return;
      }
      const eventId = await findEspnEventId({ gameDate, gamePk, officialDate });
      if (!eventId) {
        return;
      }
      const chance =
        state === 'Live'
          ? ((await fetchLiveWinChance(eventId, isHome)) ??
            (await fetchPregameWinChance(eventId, isHome)))
          : await fetchPregameWinChance(eventId, isHome);
      if (!cancelled && chance) {
        setFound({ chance, gamePk });
      }
    };
    void load();
    const timer = setInterval(
      () => void load(),
      state === 'Live' ? LIVE_REFRESH_MS : PREGAME_REFRESH_MS,
    );
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [gameDate, gamePk, isHome, officialDate, state, wanted]);

  return wanted && found && found.gamePk === gamePk ? found.chance : undefined;
}
