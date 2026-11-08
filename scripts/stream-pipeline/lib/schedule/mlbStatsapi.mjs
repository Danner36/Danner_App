import { officialDateInZone, shiftGameDate } from '../gameWindow.mjs';

const MLB_SCHEDULE_URL = 'https://statsapi.mlb.com/api/v1/schedule';
const SCHEDULE_TIMEOUT_MS = 15_000;

function isDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// A suspended game that resumes on a later day keeps its gamePk and its original officialDate,
// so its streams entry has the same key as the first day's. The pipeline replaces that entry.
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

function gameFromMlb(game, teamId, scheduleDate, timeZone) {
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
  const team = isHome ? game.teams.home : game.teams.away;
  const opponent = isHome ? game.teams.away : game.teams.home;
  if (team.team?.id !== teamId || !opponent.team?.name) {
    return undefined;
  }

  return {
    abstractState: game.status?.abstractGameState ?? 'Preview',
    gameDate: game.gameDate,
    gameNumber: game.gameNumber ?? 1,
    gamePk: game.gamePk,
    officialDate: isDateString(game.officialDate)
      ? game.officialDate
      : officialDateInZone(new Date(game.gameDate), timeZone),
    opponentName: opponent.team.name,
    ...(isResumedGame(game, scheduleDate) ? { resumed: true } : {}),
    status: game.status?.detailedState ?? 'Scheduled',
    timeValid: game.status?.startTimeTBD !== true,
  };
}

export function mlbGamesFromSchedule(schedule, teamId, timeZone = 'America/New_York') {
  const games = [];
  for (const date of schedule?.dates ?? []) {
    for (const game of date?.games ?? []) {
      const parsed = gameFromMlb(game, teamId, date?.date, timeZone);
      if (parsed) {
        games.push(parsed);
      }
    }
  }
  return games;
}

export async function fetchMlbGames(team, now, fetchImpl = fetch) {
  const today = officialDateInZone(now, team.officialDateZone);
  const query = new URLSearchParams({
    endDate: `${today.slice(0, 4)}-12-31`,
    hydrate: 'team',
    sportId: String(team.schedule.sportId ?? 1),
    startDate: shiftGameDate(today, -1),
    teamId: String(team.statsapi.teamId),
  });

  const response = await fetchImpl(`${MLB_SCHEDULE_URL}?${query}`, {
    signal: AbortSignal.timeout(SCHEDULE_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`MLB schedule request failed with ${response.status}.`);
  }
  return mlbGamesFromSchedule(await response.json(), team.statsapi.teamId, team.officialDateZone);
}

// Whether statsapi lists this game, on this official date, as a resumed game. Any failure answers
// false: the worst case is that the older entry stays until an operator forces a run.
export async function isResumedMlbGame(team, eventId, officialDate, fetchImpl = fetch) {
  try {
    const query = new URLSearchParams({ gamePk: eventId, sportId: String(team.schedule.sportId ?? 1) });
    const response = await fetchImpl(`${MLB_SCHEDULE_URL}?${query}`, {
      signal: AbortSignal.timeout(SCHEDULE_TIMEOUT_MS),
    });
    if (!response.ok) {
      return false;
    }
    const games = mlbGamesFromSchedule(await response.json(), team.statsapi.teamId, team.officialDateZone);
    return games.some(
      (game) => String(game.gamePk) === eventId && game.officialDate === officialDate && game.resumed === true,
    );
  } catch {
    return false;
  }
}

export function isCompleteMlbGame(game) {
  const status = String(game.status ?? '').toLowerCase();
  return (
    game.abstractState === 'Final' &&
    !status.includes('cancel') &&
    !status.includes('postpon') &&
    !status.includes('suspend')
  );
}
