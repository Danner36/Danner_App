import {
  clockText,
  CLOCK_MISSING,
  ordinalNumber,
  phaseText,
} from '../../scoreboards/basketball/arenaText.ts';
import type { BasketballBoardModel } from '../../scoreboards/basketball/types.ts';
import type { PeriodBoard } from '../../scoreboards/types.ts';
import type { TeamGame } from './types.ts';
import { gameInterruption } from './videoWindow.ts';

const FOOTBALL_REGULATION_PERIODS = 4;
const STATUS_WITHOUT_CLOCK = /half|end of|delay/i;

export type ScoreHeaderRow = {
  hasPossession: boolean;
  isFollowed: boolean;
  name: string;
  // Undefined before the game starts.
  score?: number;
};

export type ScoreHeader = {
  // Away first, home second.
  rows: [ScoreHeaderRow, ScoreHeaderRow];
  // Down, distance and spot in football.
  situation?: string;
  // Empty for a scheduled game with a known start, which shows its countdown instead.
  status: string;
  // The sport reports which team has the ball, so the rows keep room for the mark.
  tracksPossession: boolean;
};

function periodName(period: number, regulationPeriods: number): string {
  if (period <= regulationPeriods) {
    return ordinalNumber(period);
  }
  const overtime = period - regulationPeriods;
  return overtime === 1 ? 'OT' : `${overtime}OT`;
}

function periodsStatus(board: PeriodBoard): string {
  if (board.period <= 0 || !board.clock || STATUS_WITHOUT_CLOCK.test(board.status)) {
    return board.status;
  }
  return `${periodName(board.period, FOOTBALL_REGULATION_PERIODS)} · ${board.clock}`;
}

function basketballStatus(
  model: BasketballBoardModel,
  fallback: string,
): string {
  const period = model.period;
  if (model.phase === 'inPlay' && period !== undefined && period > 0) {
    const name = periodName(period, model.regulationPeriods);
    const clock = clockText(model.clock);
    return clock === CLOCK_MISSING ? name : `${name} · ${clock}`;
  }
  return phaseText(model) || fallback;
}

function liveStatus(game: TeamGame): string {
  switch (game.board?.kind) {
    case 'baseball':
      return game.board.status || game.status;
    case 'periods':
      return periodsStatus(game.board);
    case 'basketball':
      return basketballStatus(game.board, game.status);
    default:
      return game.status;
  }
}

function headerStatus(game: TeamGame): string {
  if (gameInterruption(game.status) || game.abstractState === 'Final') {
    return game.status;
  }
  if (game.abstractState === 'Live') {
    return liveStatus(game);
  }
  return game.timeValid ? '' : 'Time TBA';
}

// A board can run ahead of the schedule data during a game; a final uses the schedule's result.
function sideScores(game: TeamGame): { away: number; home: number } {
  const board = game.abstractState === 'Live' ? game.board : undefined;
  const fromGame = {
    away: game.isHome ? game.opponentScore : game.teamScore,
    home: game.isHome ? game.teamScore : game.opponentScore,
  };
  switch (board?.kind) {
    case 'baseball':
      return { away: board.away.runs, home: board.home.runs };
    case 'periods':
      return { away: board.away.points, home: board.home.points };
    case 'basketball':
      return {
        away: board.away.score ?? fromGame.away,
        home: board.home.score ?? fromGame.home,
      };
    default:
      return fromGame;
  }
}

export function gameHasScore(game: TeamGame): boolean {
  const { away, home } = sideScores(game);
  return away + home > 0;
}

function possessionSide(
  game: TeamGame,
  espnTeamId: number,
): 'away' | 'home' | undefined {
  const board = game.abstractState === 'Live' ? game.board : undefined;
  if (board?.kind === 'basketball') {
    return board.possessionArrow;
  }
  if (board?.kind !== 'periods' || board.possessionTeamId === undefined) {
    return undefined;
  }
  const followedHasBall = board.possessionTeamId === espnTeamId;
  return followedHasBall === game.isHome ? 'home' : 'away';
}

export function scoreHeaderFor(
  game: TeamGame,
  teamName: string,
  espnTeamId: number,
): ScoreHeader {
  const showScores =
    game.abstractState === 'Live' || game.abstractState === 'Final';
  const scores = showScores ? sideScores(game) : undefined;
  const possession = possessionSide(game, espnTeamId);
  const row = (side: 'away' | 'home'): ScoreHeaderRow => {
    const isFollowed = game.isHome === (side === 'home');
    return {
      hasPossession: possession === side,
      isFollowed,
      name: isFollowed ? teamName : game.opponentName,
      score: scores?.[side],
    };
  };
  const board = game.abstractState === 'Live' ? game.board : undefined;
  const situation = board?.kind === 'periods' ? board.situation : undefined;
  return {
    rows: [row('away'), row('home')],
    situation,
    status: headerStatus(game),
    tracksPossession:
      board?.kind === 'periods' ||
      (board?.kind === 'basketball' && board.flags.possessionArrow),
  };
}
