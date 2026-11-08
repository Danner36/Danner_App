import { localDateString } from '../../team/engine/dates.ts';
import type { TeamGame } from '../../team/engine/types.ts';
import type { TeamRef } from '../types.ts';
import type { LiveGameReport, MlbGameStatus } from './linescore.ts';

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

// MLB reports Warmup (`PW`) as Live before first pitch; the card treats it as pre-game.
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

// Applies the five-second live poll. The game's status stays MLB's detailed state, so a delay or
// suspension remains visible; the inning text lives only on the board.
export function gameWithLiveReport(
  game: TeamGame,
  report: LiveGameReport,
): TeamGame {
  const homeRuns = report.scoreboard?.home.runs ?? report.homeScore;
  const awayRuns = report.scoreboard?.away.runs ?? report.awayScore;
  const teamRuns = game.isHome ? homeRuns : awayRuns;
  const opponentRuns = game.isHome ? awayRuns : homeRuns;
  return {
    ...game,
    abstractState: abstractStateFromMlb(report.status),
    board: report.scoreboard ?? game.board,
    opponentScore: opponentRuns ?? game.opponentScore,
    status: report.status.detailedState || game.status,
    teamScore: teamRuns ?? game.teamScore,
  };
}

export function teamGameFromMlb(
  value: unknown,
  team: Pick<TeamRef, 'statsapi'>,
): TeamGame | undefined {
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

  const teamId = team.statsapi?.teamId;
  const isHome = game.teams.home.team.id === teamId;
  const followed = isHome ? game.teams.home : game.teams.away;
  const opponent = isHome ? game.teams.away : game.teams.home;

  if (followed.team?.id !== teamId || !opponent.team?.name) {
    return undefined;
  }

  const gameId = String(game.gamePk);
  const officialDate =
    game.officialDate ?? localDateString(new Date(game.gameDate));
  return {
    abstractState: abstractStateFromMlb(game.status),
    adapter: 'mlb',
    gameDate: game.gameDate,
    gameId,
    gameNumber: game.gameNumber ?? 1,
    isHome,
    key: `mlb:${gameId}:${officialDate}`,
    neutralSite: false,
    notes: '',
    officialDate,
    opponentName: opponent.team.name,
    opponentScore: opponent.score ?? 0,
    scoreboard: 'baseball',
    scoresKnown: true,
    seasonType: 2,
    status: game.status?.detailedState ?? 'Scheduled',
    teamScore: followed.score ?? 0,
    timeValid: game.status?.startTimeTBD !== true,
  };
}
