import {
  officialDateInZone,
  selectFeaturedGame,
  shiftGameDate,
} from './gameWindow.mjs';

export const GUARDIANS_TEAM_ID = 114;
export const GUARDIANS_TIME_ZONE = 'America/New_York';

const MLB_SCHEDULE_URL = 'https://statsapi.mlb.com/api/v1/schedule';
const SCHEDULE_TIMEOUT_MS = 15_000;

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

function isDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// A suspended game that resumes on a later day keeps its gamePk and its original officialDate,
// so the stream entry key (officialDate + gameNumber) is the same as the first day's. The
// pipeline treats that existing entry as stale and replaces it.
function isResumedGame(game, scheduleDate) {
  return (
    isDateString(game.resumedFrom) ||
    typeof game.resumedFromDate === 'string' ||
    isDateString(game.resumeDate) ||
    typeof game.resumeGameDate === 'string' ||
    (isDateString(scheduleDate) &&
      isDateString(game.officialDate) &&
      scheduleDate !== game.officialDate)
  );
}

function guardiansGameFromMlb(game, teamId, scheduleDate) {
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
    officialDate: isDateString(game.officialDate)
      ? game.officialDate
      : officialDateInZone(new Date(game.gameDate), GUARDIANS_TIME_ZONE),
    ...(isResumedGame(game, scheduleDate) ? { resumed: true } : {}),
    timeValid: game.status?.startTimeTBD !== true,
  };
}

export function guardiansGamesFromSchedule(schedule, teamId) {
  const games = [];
  for (const date of schedule?.dates ?? []) {
    for (const game of date?.games ?? []) {
      const parsed = guardiansGameFromMlb(game, teamId, date?.date);
      if (parsed) {
        games.push(parsed);
      }
    }
  }
  return games;
}

export async function fetchGuardiansGames(teamId, now = new Date()) {
  const today = officialDateInZone(now, GUARDIANS_TIME_ZONE);
  const season = today.slice(0, 4);
  const scheduleQuery = new URLSearchParams({
    endDate: `${season}-12-31`,
    hydrate: 'team',
    sportId: '1',
    startDate: shiftGameDate(today, -1),
    teamId: String(teamId),
  });

  // Without this a hung statsapi burns the whole 15-minute job timeout before failing.
  const response = await fetch(`${MLB_SCHEDULE_URL}?${scheduleQuery}`, {
    signal: AbortSignal.timeout(SCHEDULE_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`MLB schedule request failed with ${response.status}.`);
  }

  return guardiansGamesFromSchedule(await response.json(), teamId);
}

function isCompleteGame(game) {
  return game.abstractState === 'Final' && !gameInterruption(game.status);
}

// `options.timeZone` is the module's official-date zone. Guardians and Patriots both use
// America/New_York.
export function featuredGame(games, now = new Date(), options = {}) {
  return selectFeaturedGame(games, now, {
    graceMinutes: options.graceMinutes,
    isBlocked: isBlockedGame,
    isComplete: isCompleteGame,
    leadMinutes: options.leadMinutes,
    timeZone: options.timeZone ?? GUARDIANS_TIME_ZONE,
  });
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
