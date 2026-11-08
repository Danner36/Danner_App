import type { SportKey } from '../../leagues/types.ts';
import { compareGames, gameDay, gameSortTime, localDateString } from './dates.ts';
import type { SportStatus, TeamGame } from './types.ts';
import { isCompletedGame, recapResult } from './videoWindow.ts';

const CONFERENCE_TOURNAMENT_WAIT_MS = 14 * 86_400_000;
const NCAA_CHAMPIONSHIP_NOTE = /\b(?:men|women)['’]?s basketball championship\b/;

function notesHaystack(game: TeamGame): string {
  return `${game.notes} ${game.status} ${game.opponentName}`.toLowerCase();
}

function isConferenceTournament(game: TeamGame, conference?: string): boolean {
  if (game.sport === 'football') {
    return false;
  }
  const hay = notesHaystack(game);
  if (hay.includes('conference tournament')) {
    return true;
  }
  const namesEvent = hay.includes('tournament') || hay.includes('championship');
  if (game.seasonType === 2 && namesEvent) {
    return true;
  }
  return (
    conference !== undefined &&
    conference !== '' &&
    namesEvent &&
    hay.includes(conference.toLowerCase())
  );
}

// Only the College Football Playoff is a football knockout; any other bowl ends the season.
function knockoutTournament(
  game: TeamGame,
  conference?: string,
): string | undefined {
  const hay = notesHaystack(game);
  if (game.sport === 'football') {
    return hay.includes('college football playoff') || /\bcfp\b/.test(hay)
      ? 'College Football Playoff'
      : undefined;
  }
  if (isConferenceTournament(game, conference)) {
    return undefined;
  }
  if (
    /\bncaa\b[^-]*\btournament\b/.test(hay) ||
    hay.includes('march madness') ||
    NCAA_CHAMPIONSHIP_NOTE.test(hay)
  ) {
    return 'NCAA Tournament';
  }
  if (/\bwnit\b/.test(hay)) {
    return 'WNIT';
  }
  if (/\bwbit\b/.test(hay)) {
    return 'WBIT';
  }
  if (game.seasonType === 3 && /\bnit\b/.test(hay)) {
    return 'NIT';
  }
  if (game.seasonType === 3 && hay.includes('tournament')) {
    return 'tournament';
  }
  return undefined;
}

// Only the final round counts as winning a tournament; ESPN writes "Championship" in every NCAA
// round note.
function isTitleGame(game: TeamGame, tournament: string): boolean {
  const hay = notesHaystack(game);
  if (
    hay.includes('national championship') ||
    hay.includes('championship game')
  ) {
    return true;
  }
  return (
    (tournament === 'NIT' || tournament === 'WNIT' || tournament === 'WBIT') &&
    /\b(?:nit|wnit|wbit)\s*[-–—:]\s*(?:championship|final)\b/.test(hay)
  );
}

export function sportStatus(
  games: readonly TeamGame[],
  sport: SportKey,
  now = new Date(),
  conference?: string,
): SportStatus | undefined {
  const sportGames = games
    .filter((game) => game.sport === sport)
    .sort(compareGames);
  const today = localDateString(now);
  const hasLiveOrFuture = sportGames.some(
    (game) =>
      game.abstractState === 'Live' ||
      (!isCompletedGame(game) && gameDay(game) >= today),
  );
  if (hasLiveOrFuture) {
    return undefined;
  }

  const completed = sportGames.filter((game) => isCompletedGame(game));
  const last = completed.at(-1);
  if (!last) {
    return undefined;
  }

  const hay = notesHaystack(last);
  if (
    hay.includes('selection sunday') ||
    hay.includes('pairing') ||
    hay.includes('awaiting next')
  ) {
    return {
      kind: 'awaiting-next',
      label: 'Awaiting next tournament game',
    };
  }

  // A conference tournament result waits on the NCAA, NIT, and WBIT fields, which post the next
  // game within days of Selection Sunday.
  if (isConferenceTournament(last, conference)) {
    if (now.getTime() - gameSortTime(last) < CONFERENCE_TOURNAMENT_WAIT_MS) {
      return {
        kind: 'awaiting-next',
        label: 'Awaiting next tournament game',
      };
    }
    return {
      kind: 'season-complete',
      label: 'Season complete',
    };
  }

  const tournament = knockoutTournament(last, conference);
  const result = recapResult(last);
  if (tournament) {
    if (result === 'WIN') {
      if (isTitleGame(last, tournament)) {
        return {
          kind: 'won-tournament',
          label: `Won the ${tournament}`,
        };
      }
      return {
        kind: 'awaiting-next',
        label: `Awaiting next ${tournament} game`,
      };
    }
    if (result === 'LOSS') {
      return {
        kind: 'eliminated',
        label: `Eliminated from the ${tournament}`,
      };
    }
  }

  return {
    kind: 'season-complete',
    label: 'Season complete',
  };
}
