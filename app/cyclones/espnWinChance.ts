import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  gameInterruption,
  type CyclonesGame,
  type CyclonesSport,
} from './cyclonesSnapshot';

// Percent chance, 0 to 100, that each side wins. ESPN leaves a gap for a tie in football.
export type WinChance = {
  opponent: number;
  team: number;
};

const EVENT_PATHS: Record<CyclonesSport, string> = {
  football: 'football/leagues/college-football',
  'mens-basketball': 'basketball/leagues/mens-college-basketball',
  'womens-basketball': 'basketball/leagues/womens-college-basketball',
};
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

function eventsUrl(sport: CyclonesSport): string {
  return `https://sports.core.api.espn.com/v2/sports/${EVENT_PATHS[sport]}/events`;
}

async function fetchPregameWinChance(
  sport: CyclonesSport,
  gamePk: number,
  isHome: boolean,
): Promise<WinChance | undefined> {
  return winChanceFromPredictor(
    await fetchJson(
      `${eventsUrl(sport)}/${gamePk}/competitions/${gamePk}/predictor`,
    ),
    isHome,
  );
}

// ESPN lists one probability per play; the last page of a one-item page size is the newest.
async function fetchLiveWinChance(
  sport: CyclonesSport,
  gamePk: number,
  isHome: boolean,
): Promise<WinChance | undefined> {
  const base = `${eventsUrl(sport)}/${gamePk}/competitions/${gamePk}/probabilities?limit=1`;
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
export function useWinChance(game: CyclonesGame | undefined): WinChance | undefined {
  const gamePk = game?.gamePk;
  const sport = game?.sport;
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
      sport === undefined
    ) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      if (AppState.currentState !== 'active') {
        return;
      }
      const chance =
        state === 'Live'
          ? ((await fetchLiveWinChance(sport, gamePk, isHome)) ??
            (await fetchPregameWinChance(sport, gamePk, isHome)))
          : await fetchPregameWinChance(sport, gamePk, isHome);
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
  }, [gamePk, isHome, sport, state, wanted]);

  return wanted && found && found.gamePk === gamePk ? found.chance : undefined;
}
