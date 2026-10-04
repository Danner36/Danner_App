export const DEFAULT_LEAD_MINUTES = 15;
export const DEFAULT_POST_START_GRACE_MINUTES = 180;

// Calendar date of `date` in `timeZone`, independent of the process time zone.
export function officialDateInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function shiftGameDate(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startMs(game) {
  return new Date(game.gameDate).getTime();
}

// Same order as the app: a placeholder time for an unset start can sort ahead of an earlier
// game number on the same official date, so the game number orders those games.
export function compareGames(first, second) {
  if (
    first.officialDate === second.officialDate &&
    (first.timeValid === false || second.timeValid === false) &&
    first.gameNumber !== second.gameNumber
  ) {
    return first.gameNumber - second.gameNumber;
  }
  const byStart = startMs(first) - startMs(second);
  return byStart !== 0 ? byStart : first.gameNumber - second.gameNumber;
}

// Picks the game a Get video run serves, matching the app's featured card:
// 1. A game in progress. Canceled, postponed, and suspended games never count as in progress
//    (MLB can report a suspended game as Live); today's official date wins over an older one.
// 2. The first unfinished game whose start is inside [now - grace, now + lead].
// 3. The first unfinished game on the module's official "today" (a game with no start time is
//    an all-day game on its official date), or a pre-game delay carried over from yesterday's
//    official date. An early run then reports too_early.
// Unblocked games win within tiers 2 and 3.
export function selectFeaturedGame(games, now, options) {
  const {
    graceMinutes = DEFAULT_POST_START_GRACE_MINUTES,
    isBlocked = () => false,
    isComplete,
    leadMinutes = DEFAULT_LEAD_MINUTES,
    timeZone,
  } = options;
  const nowMs = now.getTime();
  const today = officialDateInZone(now, timeZone);
  const yesterday = shiftGameDate(today, -1);
  const open = games
    .filter((game) => !isComplete(game) && !Number.isNaN(startMs(game)))
    .sort(compareGames);

  const live = open.filter((game) => game.abstractState === 'Live' && !isBlocked(game));
  const featuredLive = live.find((game) => game.officialDate === today) ?? live[0];
  if (featuredLive) {
    return featuredLive;
  }

  const inWindow = (game) =>
    game.timeValid !== false &&
    startMs(game) >= nowMs - graceMinutes * 60_000 &&
    startMs(game) <= nowMs + leadMinutes * 60_000;
  const isCarriedOverDelay = (game) =>
    game.abstractState === 'Preview' &&
    /delay/i.test(String(game.status ?? '')) &&
    game.officialDate === yesterday;
  const windowed = open.filter(inWindow);
  const todayGames = open.filter(
    (game) =>
      !inWindow(game) && (game.officialDate === today || isCarriedOverDelay(game)),
  );

  return (
    windowed.find((game) => !isBlocked(game)) ??
    todayGames.find((game) => !isBlocked(game)) ??
    windowed[0] ??
    todayGames[0]
  );
}
