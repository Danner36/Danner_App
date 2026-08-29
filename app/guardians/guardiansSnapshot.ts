import type { LiveScoreboard } from './mlbLinescore';

export const GUARDIANS_TEAM_ID = 114;

type MlbTeamSide = {
  score?: number;
  team?: {
    id?: number;
    name?: string;
  };
};

type MlbPerson = {
  fullName?: string;
};

type MlbGame = {
  decisions?: {
    loser?: MlbPerson;
    save?: MlbPerson;
    winner?: MlbPerson;
  };
  gameDate?: string;
  gameNumber?: number;
  gamePk?: number;
  linescore?: unknown;
  officialDate?: string;
  status?: {
    abstractGameState?: string;
    detailedState?: string;
  };
  teams?: {
    away?: MlbTeamSide;
    home?: MlbTeamSide;
  };
};

export type GameDecisions = {
  loser?: string;
  save?: string;
  winner?: string;
};

export type GuardiansGame = {
  abstractState: string;
  decisions?: GameDecisions;
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
};

export type GuardiansSnapshot = {
  featuredGame?: GuardiansGame;
  losses: number;
  upcomingGames: GuardiansGame[];
  wins: number;
};

export type GameInterruption = 'canceled' | 'delayed' | 'postponed' | 'suspended';
export type RecapResult = 'LOSS' | 'TIE' | 'WIN';

const NAME_SUFFIXES = new Set(['ii', 'iii', 'iv', 'jr', 'jr.', 'sr', 'sr.']);

export function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function lastNameFromFullName(fullName: string): string | undefined {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  while (
    parts.length > 1 &&
    NAME_SUFFIXES.has((parts[parts.length - 1] ?? '').toLowerCase())
  ) {
    parts.pop();
  }
  const last = parts[parts.length - 1];
  return last || undefined;
}

function decisionsFromMlb(value: MlbGame['decisions']): GameDecisions | undefined {
  if (!value) {
    return undefined;
  }

  const winner =
    typeof value.winner?.fullName === 'string'
      ? lastNameFromFullName(value.winner.fullName)
      : undefined;
  const loser =
    typeof value.loser?.fullName === 'string'
      ? lastNameFromFullName(value.loser.fullName)
      : undefined;
  const save =
    typeof value.save?.fullName === 'string'
      ? lastNameFromFullName(value.save.fullName)
      : undefined;
  if (!winner && !loser && !save) {
    return undefined;
  }

  return { loser, save, winner };
}

function decisionsFromHarness(value: unknown): GameDecisions | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const raw = value as Partial<GameDecisions>;
  const winner =
    typeof raw.winner === 'string' ? lastNameFromFullName(raw.winner) : undefined;
  const loser =
    typeof raw.loser === 'string' ? lastNameFromFullName(raw.loser) : undefined;
  const save =
    typeof raw.save === 'string' ? lastNameFromFullName(raw.save) : undefined;
  if (
    (raw.winner !== undefined && !winner) ||
    (raw.loser !== undefined && !loser) ||
    (raw.save !== undefined && !save)
  ) {
    return undefined;
  }
  if (!winner && !loser && !save) {
    return undefined;
  }

  return { loser, save, winner };
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

export function recapResult(game: GuardiansGame): RecapResult {
  if (game.guardiansScore > game.opponentScore) {
    return 'WIN';
  }
  if (game.guardiansScore < game.opponentScore) {
    return 'LOSS';
  }
  return 'TIE';
}

export function recapDecisionLine(game: GuardiansGame): string | undefined {
  const result = recapResult(game);
  if (result === 'WIN' && game.decisions?.winner) {
    return game.decisions.save
      ? `Win ${game.decisions.winner} · Save ${game.decisions.save}`
      : `Win ${game.decisions.winner}`;
  }
  if (result === 'LOSS' && game.decisions?.loser) {
    return `Loss ${game.decisions.loser}`;
  }
  return undefined;
}

function isSameLocalDay(date: Date, other: Date): boolean {
  return (
    date.getFullYear() === other.getFullYear() &&
    date.getMonth() === other.getMonth() &&
    date.getDate() === other.getDate()
  );
}

function compareGames(first: GuardiansGame, second: GuardiansGame): number {
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
  const remainingGames = games
    .filter((game) => {
      const startsTodayOrLater =
        new Date(game.gameDate).getTime() >= todayStart;
      return (
        !isCompletedGame(game) &&
        (game.abstractState === 'Live' || startsTodayOrLater)
      );
    })
    .sort(compareGames);
  const todayRecap = games
    .filter(
      (game) => isCompletedGame(game) && game.officialDate === todayOfficial,
    )
    .sort(compareGames)
    .at(-1);
  const featuredGame =
    remainingGames.find((game) => game.abstractState === 'Live') ??
    remainingGames.find((game) =>
      isSameLocalDay(new Date(game.gameDate), now),
    ) ??
    todayRecap;

  return {
    featuredGame,
    losses,
    upcomingGames: featuredGame
      ? remainingGames.filter((game) => game.gamePk !== featuredGame.gamePk)
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
    abstractState: game.status?.abstractGameState ?? 'Preview',
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
  };
  const decisions = decisionsFromMlb(game.decisions);
  if (decisions) {
    parsed.decisions = decisions;
  }
  return parsed;
}

export function guardiansGameFromHarness(
  value: unknown,
): GuardiansGame | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const game = value as Partial<GuardiansGame> & { decisions?: unknown };
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
  };
  if (game.decisions !== undefined) {
    const decisions = decisionsFromHarness(game.decisions);
    if (!decisions) {
      return undefined;
    }
    parsed.decisions = decisions;
  }
  if (game.scoreboard !== undefined) {
    parsed.scoreboard = game.scoreboard;
  }

  return parsed;
}
