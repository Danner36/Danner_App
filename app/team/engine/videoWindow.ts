import type { GameInterruption, RecapResult, TeamGame } from './types.ts';

const VIDEO_LEAD_TIME_MS = 15 * 60_000;
// The streams list refreshes on a minute cadence from this long before a start.
const STREAMS_POLL_LEAD_MS = 45 * 60_000;
// The Worker's window after a start, per league.
const STREAMS_POLL_GRACE_MS = { default: 240 * 60_000, mlb: 180 * 60_000 };

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

export function isCompletedGame(game: TeamGame): boolean {
  return game.abstractState === 'Final' && !gameInterruption(game.status);
}

// Final, canceled, postponed, and suspended games offer no Play, Listen, or Get video.
export function playbackBlocked(game: TeamGame): boolean {
  const interruption = gameInterruption(game.status);
  return (
    interruption === 'canceled' ||
    interruption === 'postponed' ||
    interruption === 'suspended' ||
    isCompletedGame(game)
  );
}

// A Live game opens video whether or not its start time is known; MLB keeps `startTimeTBD` on
// doubleheader game 2 after it starts.
export function isVideoWindowOpen(game: TeamGame, nowMs: number): boolean {
  if (playbackBlocked(game)) {
    return false;
  }
  return (
    game.abstractState === 'Live' ||
    (game.timeValid &&
      nowMs >= new Date(game.gameDate).getTime() - VIDEO_LEAD_TIME_MS)
  );
}

export function recapResult(game: TeamGame): RecapResult {
  if (game.teamScore > game.opponentScore) {
    return 'WIN';
  }
  if (game.teamScore < game.opponentScore) {
    return 'LOSS';
  }
  return 'TIE';
}

// True while a game is Live, or from 45 minutes before its start to the end of its grace period.
export function streamsPollWindowOpen(
  games: readonly TeamGame[],
  nowMs: number,
): boolean {
  return games.some((game) => {
    if (playbackBlocked(game)) {
      return false;
    }
    if (game.abstractState === 'Live') {
      return true;
    }
    if (!game.timeValid) {
      return false;
    }
    const startMs = new Date(game.gameDate).getTime();
    const graceMs =
      game.adapter === 'mlb'
        ? STREAMS_POLL_GRACE_MS.mlb
        : STREAMS_POLL_GRACE_MS.default;
    return nowMs >= startMs - STREAMS_POLL_LEAD_MS && nowMs <= startMs + graceMs;
  });
}
