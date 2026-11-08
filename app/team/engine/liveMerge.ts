import type { BasketballBoardModel } from '../../scoreboards/basketball/types.ts';
import type { LiveBoard, TeamGame, TeamSnapshot } from './types.ts';

// The five-second board stays on the card this long after it was applied, while a schedule refresh
// brings a board without the poll's cells.
export const LIVE_BOARD_FRESH_MS = 30_000;

// When the five-second poll last applied a board, and when it was requested.
export type LiveBoardStamp = {
  appliedAt: number;
  key: string;
  requestedAt?: number;
};

export function abstractStateRank(state: string): number {
  if (state === 'Final') {
    return 2;
  }
  return state === 'Live' ? 1 : 0;
}

// A basketball board built from a schedule event has no team colors; it takes the stripe colors of
// the previous board of the same game.
function withStripeColors(
  next: BasketballBoardModel,
  previous: LiveBoard | undefined,
): BasketballBoardModel {
  if (
    previous?.kind !== 'basketball' ||
    (next.eventId !== undefined &&
      previous.eventId !== undefined &&
      next.eventId !== previous.eventId)
  ) {
    return next;
  }
  const side = (key: 'away' | 'home') => {
    const filled = { ...next[key] };
    if (filled.color === undefined && previous[key].color !== undefined) {
      filled.color = previous[key].color;
    }
    if (
      filled.alternateColor === undefined &&
      previous[key].alternateColor !== undefined
    ) {
      filled.alternateColor = previous[key].alternateColor;
    }
    return filled;
  };
  return { ...next, away: side('away'), home: side('home') };
}

// The schedule carries no jersey numbers or stripe colors; those come from the previous board.
function filledBoard(incoming: LiveBoard, kept: LiveBoard | undefined): LiveBoard {
  if (incoming.kind === 'basketball') {
    return withStripeColors(incoming, kept);
  }
  if (incoming.kind === 'baseball' && kept?.kind === 'baseball') {
    return {
      ...incoming,
      batterNumber: incoming.batterNumber ?? kept.batterNumber,
      pitcherNumber: incoming.pitcherNumber ?? kept.pitcherNumber,
    };
  }
  return incoming;
}

function mergeFeaturedGame(
  previousGame: TeamGame,
  nextGame: TeamGame,
  stamp: LiveBoardStamp | undefined,
  nowMs: number,
  snapshotRequestedAt: number,
): TeamGame {
  // The five-second poll reports Live and Final before the schedule does; a schedule that lags
  // never moves the card backwards.
  const scheduleLags =
    abstractStateRank(previousGame.abstractState) >
    abstractStateRank(nextGame.abstractState);
  const pollIsNewer =
    stamp?.requestedAt !== undefined && stamp.requestedAt > snapshotRequestedAt;
  // A fresh polled board carries cells that the schedule board lacks (down, distance and
  // possession; basketball players and fouls).
  const keepLiveBoard =
    previousGame.abstractState === 'Live' &&
    nextGame.abstractState === 'Live' &&
    previousGame.board !== undefined &&
    stamp !== undefined &&
    nowMs - stamp.appliedAt < LIVE_BOARD_FRESH_MS;
  if (scheduleLags || pollIsNewer || keepLiveBoard) {
    return {
      ...nextGame,
      abstractState: previousGame.abstractState,
      board: previousGame.board ?? nextGame.board,
      opponentScore: previousGame.opponentScore,
      scoresKnown: previousGame.scoresKnown,
      status: previousGame.status,
      teamScore: previousGame.teamScore,
    };
  }
  if (!previousGame.board) {
    return nextGame;
  }
  return {
    ...nextGame,
    board: nextGame.board
      ? filledBoard(nextGame.board, previousGame.board)
      : previousGame.board,
  };
}

// Merges a refreshed schedule snapshot into the shown one, card by card: each featured game that
// was already shown keeps what the five-second poll applied to it.
export function snapshotWithPreservedBoards(
  previous: TeamSnapshot | undefined,
  next: TeamSnapshot,
  liveBoards: readonly LiveBoardStamp[],
  nowMs = Date.now(),
  snapshotRequestedAt = Number.POSITIVE_INFINITY,
): TeamSnapshot {
  if (!previous || previous.featuredGames.length === 0) {
    return next;
  }
  const shown = new Map(previous.featuredGames.map((game) => [game.key, game]));
  let changed = false;
  const featuredGames = next.featuredGames.map((nextGame) => {
    const previousGame = shown.get(nextGame.key);
    if (!previousGame) {
      return nextGame;
    }
    const merged = mergeFeaturedGame(
      previousGame,
      nextGame,
      liveBoards.find((stamp) => stamp.key === nextGame.key),
      nowMs,
      snapshotRequestedAt,
    );
    if (merged !== nextGame) {
      changed = true;
    }
    return merged;
  });
  return changed ? { ...next, featuredGames } : next;
}
