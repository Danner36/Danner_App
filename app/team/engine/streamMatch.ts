import type { SportKey } from '../../leagues/types.ts';

// Fields of a streams entry that decide a match.
export type StreamIdentity = {
  eventId?: string;
  gameDates: string[];
  gameNumbers: number[];
  sport?: SportKey;
};

export type GameIdentity = {
  gameId: string;
  gameNumber: number;
  officialDate: string;
  sport?: SportKey;
};

// An entry with `eventId` needs that id and the game's current official date, so an entry for a
// rescheduled event stops matching. An entry without one needs the date and the game number. School
// files also need the same sport.
export function streamMatchesGame(
  stream: StreamIdentity,
  game: GameIdentity,
): boolean {
  if (!stream.gameDates.includes(game.officialDate)) {
    return false;
  }
  if (game.sport !== stream.sport) {
    return false;
  }
  return stream.eventId !== undefined
    ? stream.eventId === game.gameId
    : stream.gameNumbers.includes(game.gameNumber);
}

export function authorizedStreamsForGame<Stream extends StreamIdentity>(
  streams: readonly Stream[],
  game: GameIdentity,
): Stream[] {
  return streams.filter((stream) => streamMatchesGame(stream, game));
}
