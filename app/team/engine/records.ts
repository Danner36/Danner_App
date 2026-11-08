import type { TeamGame, TeamRecord } from './types.ts';
import { isCompletedGame } from './videoWindow.ts';

export const EMPTY_RECORD: TeamRecord = { losses: 0, ties: 0, wins: 0 };

export function recordLabel(wins: number, losses: number, ties: number): string {
  return ties > 0 ? `${wins}–${losses}–${ties}` : `${wins}–${losses}`;
}

// Regular-season Finals with a published score. Anything else stays out of the record.
export function regularSeasonRecord(games: readonly TeamGame[]): TeamRecord {
  let losses = 0;
  let ties = 0;
  let wins = 0;
  for (const game of games) {
    if (game.seasonType !== 2 || !isCompletedGame(game) || !game.scoresKnown) {
      continue;
    }
    if (game.teamScore > game.opponentScore) {
      wins += 1;
    } else if (game.teamScore < game.opponentScore) {
      losses += 1;
    } else {
      ties += 1;
    }
  }
  return { losses, ties, wins };
}
