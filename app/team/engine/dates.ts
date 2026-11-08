import type { TeamGame } from './types.ts';

export function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// The official-date key of an ESPN game. ESPN stores a game without a start time at midnight
// Eastern of its calendar day.
export function easternDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/New_York',
    year: 'numeric',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function localDateFromOfficialDate(officialDate: string): Date {
  const [year, month, day] = officialDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// A game without a start time is an all-day game on its official date. The provider's placeholder
// timestamp for it can fall on the previous local day west of Eastern time.
export function gameDay(game: TeamGame): string {
  return game.timeValid
    ? localDateString(new Date(game.gameDate))
    : game.officialDate;
}

export function gameSortTime(game: TeamGame): number {
  return game.timeValid
    ? new Date(game.gameDate).getTime()
    : localDateFromOfficialDate(game.officialDate).getTime();
}

// The day a Final stays as today's recap: the phone-local date of the start when it is known, else
// the official date. MLB keeps the statsapi official date.
export function recapDay(game: TeamGame): string {
  return game.adapter === 'mlb' ? game.officialDate : gameDay(game);
}

// A placeholder start time can sort ahead of an earlier game number on the same official date, so
// the game number orders those games.
export function compareGames(first: TeamGame, second: TeamGame): number {
  if (
    first.officialDate === second.officialDate &&
    (!first.timeValid || !second.timeValid) &&
    first.gameNumber !== second.gameNumber
  ) {
    return first.gameNumber - second.gameNumber;
  }
  const byStart = gameSortTime(first) - gameSortTime(second);
  return byStart !== 0 ? byStart : first.gameNumber - second.gameNumber;
}

export function gameDayLabel(game: TeamGame, locale?: string): string {
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  };
  if (game.timeValid) {
    return new Intl.DateTimeFormat(locale, options).format(
      new Date(game.gameDate),
    );
  }
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: 'UTC',
  }).format(new Date(`${game.officialDate}T12:00:00Z`));
}

export function gameTimeLabel(gameDate: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(gameDate));
}

// Schedule row text in the phone's time zone. MLB rows read as one date-and-time format.
export function gameDateLabel(game: TeamGame, locale?: string): string {
  if (!game.timeValid) {
    return `${gameDayLabel(game, locale)} · Time TBA`;
  }
  if (game.adapter === 'mlb') {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      month: 'short',
      weekday: 'short',
    }).format(new Date(game.gameDate));
  }
  return `${gameDayLabel(game, locale)} ${gameTimeLabel(game.gameDate, locale)}`;
}

export function countdownLabel(gameDate: string, nowMs: number): string {
  const remainingSeconds = Math.max(
    0,
    Math.ceil((new Date(gameDate).getTime() - nowMs) / 1_000),
  );
  if (remainingSeconds === 0) {
    return 'Starting soon';
  }

  const hours = Math.floor(remainingSeconds / 3_600);
  const minutes = Math.floor((remainingSeconds % 3_600) / 60);
  const seconds = remainingSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}
