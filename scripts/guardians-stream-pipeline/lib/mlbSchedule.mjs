export const GUARDIANS_TEAM_ID = 114;

const MLB_SCHEDULE_URL = 'https://statsapi.mlb.com/api/v1/schedule';

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

  const response = await fetch(`${MLB_SCHEDULE_URL}?${scheduleQuery}`);
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

export function isWithinProbeWindow(game, now, leadMinutes, postStartGraceMinutes) {
  const startMs = new Date(game.gameDate).getTime();
  const leadMs = leadMinutes * 60_000;
  const graceMs = postStartGraceMinutes * 60_000;
  const nowMs = now.getTime();
  return nowMs >= startMs - leadMs && nowMs <= startMs + graceMs;
}

export function opponentSearchTerms(opponentName) {
  const terms = new Set();
  const normalized = opponentName.trim();
  if (normalized) {
    terms.add(normalized);
  }

  for (const part of normalized.split(/\s+/)) {
    if (part.length >= 4) {
      terms.add(part);
    }
  }

  const aliases = {
    'Los Angeles Angels': ['Angels', 'LAA'],
    'New York Yankees': ['Yankees', 'NYY'],
    'New York Mets': ['Mets', 'NYM'],
    'Chicago White Sox': ['White Sox', 'CWS'],
    'Chicago Cubs': ['Cubs', 'CHC'],
    'San Francisco Giants': ['Giants', 'SF'],
    'Tampa Bay Rays': ['Rays', 'TB'],
    'Kansas City Royals': ['Royals', 'KC'],
    'St. Louis Cardinals': ['Cardinals', 'STL'],
    'Boston Red Sox': ['Red Sox', 'BOS'],
  };

  for (const [fullName, values] of Object.entries(aliases)) {
    if (normalized === fullName || normalized.includes(fullName)) {
      for (const value of values) {
        terms.add(value);
      }
    }
  }

  return [...terms];
}
