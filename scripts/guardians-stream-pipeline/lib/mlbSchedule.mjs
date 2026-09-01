export const GUARDIANS_TEAM_ID = 114;

const MLB_SCHEDULE_URL = 'https://statsapi.mlb.com/api/v1/schedule';
const SCHEDULE_TIMEOUT_MS = 15_000;

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function gameInterruption(status) {
  const normalized = status.toLowerCase();
  if (normalized.includes('cancel')) {
    return 'canceled';
  }
  if (normalized.includes('postpon')) {
    return 'postponed';
  }
  if (normalized.includes('suspend')) {
    return 'suspended';
  }
  return undefined;
}

function guardiansGameFromMlb(game, teamId) {
  if (
    typeof game.gamePk !== 'number' ||
    typeof game.gameDate !== 'string' ||
    Number.isNaN(new Date(game.gameDate).getTime()) ||
    !game.teams?.away?.team ||
    !game.teams?.home?.team
  ) {
    return undefined;
  }

  const isHome = game.teams.home.team.id === teamId;
  const guardians = isHome ? game.teams.home : game.teams.away;
  const opponent = isHome ? game.teams.away : game.teams.home;

  if (guardians.team?.id !== teamId || !opponent.team?.name) {
    return undefined;
  }

  return {
    abstractState: game.status?.abstractGameState ?? 'Preview',
    gamePk: game.gamePk,
    gameDate: game.gameDate,
    gameNumber: game.gameNumber ?? 1,
    status: game.status?.detailedState ?? 'Scheduled',
    isHome,
    opponentName: opponent.team.name,
    officialDate:
      game.officialDate ?? localDateString(new Date(game.gameDate)),
  };
}

export async function fetchGuardiansGames(teamId, now = new Date()) {
  const scheduleStart = new Date(now);
  scheduleStart.setDate(scheduleStart.getDate() - 1);
  const season = now.getFullYear();
  const scheduleEnd = new Date(season, 11, 31);
  const scheduleQuery = new URLSearchParams({
    endDate: localDateString(scheduleEnd),
    hydrate: 'team',
    sportId: '1',
    startDate: localDateString(scheduleStart),
    teamId: String(teamId),
  });

  // Without this a hung statsapi burns the whole 15-minute job timeout before failing.
  const response = await fetch(`${MLB_SCHEDULE_URL}?${scheduleQuery}`, {
    signal: AbortSignal.timeout(SCHEDULE_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`MLB schedule request failed with ${response.status}.`);
  }

  const schedule = await response.json();
  const rawGames = schedule.dates?.flatMap((date) => date.games ?? []) ?? [];
  return rawGames
    .map((game) => guardiansGameFromMlb(game, teamId))
    .filter(Boolean);
}

function isSameLocalDay(date, other) {
  return (
    date.getFullYear() === other.getFullYear() &&
    date.getMonth() === other.getMonth() &&
    date.getDate() === other.getDate()
  );
}

export function featuredGame(games, now = new Date()) {
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const remainingGames = games
    .filter((game) => {
      const interruption = gameInterruption(game.status);
      const isComplete = game.abstractState === 'Final' && !interruption;
      const startsTodayOrLater =
        new Date(game.gameDate).getTime() >= todayStart;
      return (
        !isComplete &&
        (game.abstractState === 'Live' || startsTodayOrLater)
      );
    })
    .sort(
      (first, second) =>
        new Date(first.gameDate).getTime() -
        new Date(second.gameDate).getTime(),
    );

  return (
    remainingGames.find((game) => game.abstractState === 'Live') ??
    remainingGames.find((game) =>
      isSameLocalDay(new Date(game.gameDate), now),
    )
  );
}

export async function getFeaturedGuardiansGame(teamId = GUARDIANS_TEAM_ID, now = new Date()) {
  const games = await fetchGuardiansGames(teamId, now);
  return featuredGame(games, now);
}

export function isBlockedGame(game) {
  const interruption = gameInterruption(game.status);
  return (
    interruption === 'canceled' ||
    interruption === 'postponed' ||
    interruption === 'suspended'
  );
}


