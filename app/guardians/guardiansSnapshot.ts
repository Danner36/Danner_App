import type {
  LiveGameReport,
  LiveScoreboard,
  MlbGameStatus,
} from './mlbLinescore';

export const GUARDIANS_TEAM_ID = 114;

type MlbTeamSide = {
  score?: number;
  team?: {
    id?: number;
    name?: string;
  };
};

type MlbGame = {
  gameDate?: string;
  gameNumber?: number;
  gamePk?: number;
  linescore?: unknown;
  officialDate?: string;
  status?: MlbGameStatus;
  teams?: {
    away?: MlbTeamSide;
    home?: MlbTeamSide;
  };
};

export type GuardiansGame = {
  abstractState: string;
  gameDate: string;
  gameNumber: number;
  gamePk: number;
  guardiansScore: number;
  isHome: boolean;
  officialDate: string;
  opponentName: string;
  opponentScore: number;
  scoreboard?: LiveScoreboard;
  status: string;
  timeValid: boolean;
};

export type GuardiansSnapshot = {
  featuredGame?: GuardiansGame;
  losses: number;
  upcomingGames: GuardiansGame[];
  wins: number;
};

export type GameInterruption = 'canceled' | 'delayed' | 'postponed' | 'suspended';
export type RecapResult = 'LOSS' | 'TIE' | 'WIN';

export function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function gameInterruption(status: string): GameInterruption | undefined {
  const normalized = status.toLowerCase();
  if (normalized.includes('cancel')) {
    return 'canceled';
  }
  if (normalized.includes('delay')) {
    return 'delayed';
  }
  if (normalized.includes('postpon')) {
    return 'postponed';
  }
  if (normalized.includes('suspend')) {
    return 'suspended';
  }
  return undefined;
}

export function isCompletedGame(game: GuardiansGame): boolean {
  return game.abstractState === 'Final' && !gameInterruption(game.status);
}

/** Final, canceled, postponed, and suspended games offer no Play, Listen, or Get video. */
export function blocksPlayback(game: GuardiansGame): boolean {
  const interruption = gameInterruption(game.status);
  return (
    interruption === 'canceled' ||
    interruption === 'postponed' ||
    interruption === 'suspended' ||
    isCompletedGame(game)
  );
}

/**
 * Identifies the featured game across refreshes. MLB keeps a gamePk when a game moves to
 * another day, so the official date is part of the identity.
 */
export function gameKey(game: Pick<GuardiansGame, 'gamePk' | 'officialDate'>): string {
  return `${game.gamePk}:${game.officialDate}`;
}

/** MLB reports Warmup (`PW`) as Live before first pitch; the card treats it as pre-game. */
export function abstractStateFromMlb(status: MlbGameStatus | undefined): string {
  const abstractState = status?.abstractGameState ?? 'Preview';
  if (
    abstractState === 'Live' &&
    (status?.statusCode === 'PW' ||
      status?.codedGameState === 'PW' ||
      status?.detailedState === 'Warmup')
  ) {
    return 'Preview';
  }
  return abstractState;
}

/**
 * Applies the five-second live poll. The game's status stays MLB's detailed state, so a
 * delay or suspension remains visible; the inning text lives only on the scoreboard.
 */
export function gameWithLiveReport(
  game: GuardiansGame,
  report: LiveGameReport,
): GuardiansGame {
  const homeRuns = report.scoreboard?.home.runs ?? report.homeScore;
  const awayRuns = report.scoreboard?.away.runs ?? report.awayScore;
  const guardiansRuns = game.isHome ? homeRuns : awayRuns;
  const opponentRuns = game.isHome ? awayRuns : homeRuns;
  return {
    ...game,
    abstractState: abstractStateFromMlb(report.status),
    guardiansScore: guardiansRuns ?? game.guardiansScore,
    opponentScore: opponentRuns ?? game.opponentScore,
    scoreboard: report.scoreboard ?? game.scoreboard,
    status: report.status.detailedState || game.status,
  };
}

export function recapResult(game: GuardiansGame): RecapResult {
  if (game.guardiansScore > game.opponentScore) {
    return 'WIN';
  }
  if (game.guardiansScore < game.opponentScore) {
    return 'LOSS';
  }
  return 'TIE';
}

function isSameLocalDay(date: Date, other: Date): boolean {
  return (
    date.getFullYear() === other.getFullYear() &&
    date.getMonth() === other.getMonth() &&
    date.getDate() === other.getDate()
  );
}

// A game without a start time is an all-day game on its official date. MLB's placeholder
// timestamp for it can fall on the previous local day west of Eastern time.
function isGameOnLocalDay(game: GuardiansGame, now: Date): boolean {
  return game.timeValid
    ? isSameLocalDay(new Date(game.gameDate), now)
    : game.officialDate === localDateString(now);
}

// MLB's placeholder time for an unset start can sort ahead of an earlier game number on
// the same official date, so the game number orders those games.
function compareGames(first: GuardiansGame, second: GuardiansGame): number {
  if (
    first.officialDate === second.officialDate &&
    (!first.timeValid || !second.timeValid) &&
    first.gameNumber !== second.gameNumber
  ) {
    return first.gameNumber - second.gameNumber;
  }
  const byStart =
    new Date(first.gameDate).getTime() - new Date(second.gameDate).getTime();
  return byStart !== 0 ? byStart : first.gameNumber - second.gameNumber;
}

export function snapshotFromGames(
  games: GuardiansGame[],
  wins: number,
  losses: number,
  now = new Date(),
): GuardiansSnapshot {
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const todayOfficial = localDateString(now);
  const yesterdayOfficial = localDateString(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
  );
  // A start delayed past local midnight keeps its card until MLB marks the game Live.
  const isCarriedOverDelay = (game: GuardiansGame) =>
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
  const todayRecap = games
    .filter(
      (game) => isCompletedGame(game) && game.officialDate === todayOfficial,
    )
    .sort(compareGames)
    .at(-1);
  // A suspended or postponed game can still report Live; it never outranks a game in
  // progress, and today's official date wins over an older one.
  const liveGames = remainingGames.filter((game) => {
    const interruption = gameInterruption(game.status);
    return (
      game.abstractState === 'Live' &&
      interruption !== 'canceled' &&
      interruption !== 'postponed' &&
      interruption !== 'suspended'
    );
  });
  const featuredGame =
    liveGames.find((game) => game.officialDate === todayOfficial) ??
    liveGames[0] ??
    remainingGames.find(
      (game) => isCarriedOverDelay(game) || isGameOnLocalDay(game, now),
    ) ??
    todayRecap;

  // Another entry with the featured gamePk is a makeup or resumption when it starts later,
  // and stays in the schedule; an earlier one is the same game's interrupted first date.
  const featuredStart = featuredGame
    ? new Date(featuredGame.gameDate).getTime()
    : 0;
  return {
    featuredGame,
    losses,
    upcomingGames: featuredGame
      ? remainingGames.filter(
          (game) =>
            game !== featuredGame &&
            (game.gamePk !== featuredGame.gamePk ||
              new Date(game.gameDate).getTime() > featuredStart),
        )
      : remainingGames,
    wins,
  };
}

export function guardiansGameFromMlb(value: unknown): GuardiansGame | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const game = value as MlbGame;
  if (
    typeof game.gamePk !== 'number' ||
    typeof game.gameDate !== 'string' ||
    Number.isNaN(new Date(game.gameDate).getTime()) ||
    !game.teams?.away?.team ||
    !game.teams.home?.team
  ) {
    return undefined;
  }

  const isHome = game.teams.home.team.id === GUARDIANS_TEAM_ID;
  const guardians = isHome ? game.teams.home : game.teams.away;
  const opponent = isHome ? game.teams.away : game.teams.home;

  if (guardians.team?.id !== GUARDIANS_TEAM_ID || !opponent.team?.name) {
    return undefined;
  }

  const parsed: GuardiansGame = {
    abstractState: abstractStateFromMlb(game.status),
    gameDate: game.gameDate,
    gameNumber: game.gameNumber ?? 1,
    gamePk: game.gamePk,
    guardiansScore: guardians.score ?? 0,
    isHome,
    officialDate:
      game.officialDate ?? localDateString(new Date(game.gameDate)),
    opponentName: opponent.team.name,
    opponentScore: opponent.score ?? 0,
    status: game.status?.detailedState ?? 'Scheduled',
    timeValid: game.status?.startTimeTBD !== true,
  };
  return parsed;
}

export function guardiansGameFromHarness(
  value: unknown,
): GuardiansGame | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const game = value as Partial<GuardiansGame>;
  if (
    typeof game.abstractState !== 'string' ||
    typeof game.gamePk !== 'number' ||
    !Number.isInteger(game.gamePk) ||
    typeof game.gameDate !== 'string' ||
    Number.isNaN(new Date(game.gameDate).getTime()) ||
    typeof game.gameNumber !== 'number' ||
    !Number.isInteger(game.gameNumber) ||
    typeof game.status !== 'string' ||
    typeof game.isHome !== 'boolean' ||
    typeof game.guardiansScore !== 'number' ||
    typeof game.opponentName !== 'string' ||
    typeof game.opponentScore !== 'number' ||
    typeof game.officialDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(game.officialDate)
  ) {
    return undefined;
  }

  const parsed: GuardiansGame = {
    abstractState: game.abstractState,
    gameDate: game.gameDate,
    gameNumber: game.gameNumber,
    gamePk: game.gamePk,
    guardiansScore: game.guardiansScore,
    isHome: game.isHome,
    officialDate: game.officialDate,
    opponentName: game.opponentName,
    opponentScore: game.opponentScore,
    status: game.status,
    timeValid: game.timeValid !== false,
  };
  if (game.scoreboard !== undefined) {
    parsed.scoreboard = game.scoreboard;
  }

  return parsed;
}
