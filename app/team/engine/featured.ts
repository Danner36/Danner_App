import type { AdapterKey } from '../../leagues/types.ts';
import {
  compareGames,
  gameDay,
  localDateString,
  recapDay,
} from './dates.ts';
import { sportStatus } from './postseason.ts';
import { EMPTY_RECORD, regularSeasonRecord } from './records.ts';
import type {
  SportStatus,
  TeamGame,
  TeamRecord,
  TeamSnapshot,
} from './types.ts';
import { gameInterruption, isCompletedGame } from './videoWindow.ts';

export type FeaturedOptions = {
  conference?: string;
  now?: Date;
  // School tiles feature every game today; pro tiles feature one.
  perGameCards?: boolean;
};

export function adapterRecords(
  games: readonly TeamGame[],
  adapters: readonly AdapterKey[],
): Partial<Record<AdapterKey, TeamRecord>> {
  const records: Partial<Record<AdapterKey, TeamRecord>> = {};
  for (const adapter of adapters) {
    records[adapter] = regularSeasonRecord(
      games.filter((game) => game.adapter === adapter),
    );
  }
  return records;
}

export function emptyRecord(): TeamRecord {
  return { ...EMPTY_RECORD };
}

export function adapterStatuses(
  games: readonly TeamGame[],
  adapters: readonly AdapterKey[],
  now: Date,
  conference?: string,
): Partial<Record<AdapterKey, SportStatus>> {
  const statuses: Partial<Record<AdapterKey, SportStatus>> = {};
  for (const adapter of adapters) {
    if (!adapter.startsWith('ncaa/')) {
      continue;
    }
    const sport = adapter.slice('ncaa/'.length) as Parameters<typeof sportStatus>[1];
    const status = sportStatus(games, sport, now, conference);
    if (status && status.kind !== 'season-complete') {
      statuses[adapter] = status;
    }
  }
  return statuses;
}

export function snapshotFromGames(
  games: readonly TeamGame[],
  records: TeamSnapshot['records'],
  options: FeaturedOptions = {},
): TeamSnapshot {
  const now = options.now ?? new Date();
  const perGameCards = options.perGameCards === true;
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const todayOfficial = localDateString(now);
  const yesterdayOfficial = localDateString(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
  );
  // A start delayed past local midnight keeps its card until the game goes Live.
  const isCarriedOverDelay = (game: TeamGame) =>
    game.abstractState === 'Preview' &&
    gameInterruption(game.status) === 'delayed' &&
    game.officialDate === yesterdayOfficial;
  const remainingGames = games
    .filter((game) => {
      const startsTodayOrLater = game.timeValid
        ? new Date(game.gameDate).getTime() >= todayStart
        : game.officialDate >= todayOfficial;
      return (
        !isCompletedGame(game) &&
        (game.abstractState === 'Live' ||
          startsTodayOrLater ||
          isCarriedOverDelay(game))
      );
    })
    .sort(compareGames);
  const todayFinals = games
    .filter(
      (game) => isCompletedGame(game) && recapDay(game) === todayOfficial,
    )
    .sort(compareGames);
  // A suspended or postponed game can still report Live; it never outranks a game in progress.
  const liveGames = remainingGames.filter((game) => {
    const interruption = gameInterruption(game.status);
    return (
      game.abstractState === 'Live' &&
      interruption !== 'canceled' &&
      interruption !== 'postponed' &&
      interruption !== 'suspended'
    );
  });
  const live = new Set(liveGames);
  const todayGames = remainingGames.filter(
    (game) =>
      !live.has(game) &&
      (isCarriedOverDelay(game) || gameDay(game) === todayOfficial),
  );

  let featuredGames: TeamGame[];
  if (perGameCards) {
    featuredGames = [...liveGames, ...todayGames, ...todayFinals];
  } else {
    const featured =
      liveGames.find((game) => game.officialDate === todayOfficial) ??
      liveGames[0] ??
      todayGames[0] ??
      todayFinals.at(-1);
    featuredGames = featured ? [featured] : [];
  }

  // Another entry with a featured game's id is a makeup or resumption when it starts later, and
  // stays in the schedule; an earlier one is the same game's interrupted first date.
  const featuredSet = new Set(featuredGames);
  const upcomingGames = remainingGames.filter(
    (game) =>
      !featuredSet.has(game) &&
      !featuredGames.some(
        (shown) =>
          shown.adapter === game.adapter &&
          shown.gameId === game.gameId &&
          new Date(game.gameDate).getTime() <= new Date(shown.gameDate).getTime(),
      ),
  );

  const adapters = [...new Set(games.map((game) => game.adapter))];
  return {
    featuredGames,
    records,
    statuses: adapterStatuses(games, adapters, now, options.conference),
    upcomingGames,
  };
}
