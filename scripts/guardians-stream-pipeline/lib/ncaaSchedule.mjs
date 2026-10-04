import { officialDateInZone, selectFeaturedGame } from './gameWindow.mjs';

export const CYCLONES_TEAM_ID = 66;
export const CYCLONES_TIME_ZONE = 'America/Chicago';

const SCHEDULE_TYPES = [1, 2, 3];
const SCHEDULE_TIMEOUT_MS = 15_000;

const SPORT_PATHS = {
  football: 'football/college-football',
  'mens-basketball': 'basketball/mens-college-basketball',
  'womens-basketball': 'basketball/womens-college-basketball',
};

function chicagoDateString(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: CYCLONES_TIME_ZONE,
    year: 'numeric',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function footballSeasonYear(now) {
  return now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
}

function basketballSeasonYear(now) {
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

function seasonYearForSport(sport, now) {
  return sport === 'football' ? footballSeasonYear(now) : basketballSeasonYear(now);
}

function finiteScore(value) {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return finiteScore(value.value ?? value.displayValue);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.trunc(parsed));
    }
  }
  return 0;
}

function abstractStateFromEspn(state) {
  if (state === 'in') {
    return 'Live';
  }
  if (state === 'post') {
    return 'Final';
  }
  return 'Preview';
}

function espnText(value) {
  return typeof value === 'string' && value.trim() ? value : '';
}

function espnContestStatus(statusType = {}) {
  const statusName = espnText(statusType.name);
  const description = espnText(statusType.description);
  const detail = espnText(statusType.detail);
  const shortDetail = espnText(statusType.shortDetail);
  const haystack = `${statusName} ${description} ${detail} ${shortDetail}`.toLowerCase();
  if (haystack.includes('cancel')) {
    return description || detail || shortDetail || 'Canceled';
  }
  if (haystack.includes('delay')) {
    return description || detail || shortDetail || 'Delayed';
  }
  if (haystack.includes('postpon')) {
    return description || detail || shortDetail || 'Postponed';
  }
  if (haystack.includes('suspend')) {
    return description || detail || shortDetail || 'Suspended';
  }
  if (
    statusType.state === 'pre' ||
    statusName === 'STATUS_SCHEDULED' ||
    description === 'Scheduled'
  ) {
    return 'Scheduled';
  }
  return detail || shortDetail || description || 'Scheduled';
}

export function cyclonesGameFromEspnEvent(event, sport, teamId) {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors ?? [];
  const sides = competitors
    .map((entry) => {
      const id = Number(entry.team?.id ?? entry.id);
      const name = entry.team?.displayName;
      if (!Number.isInteger(id) || typeof name !== 'string' || !name) {
        return undefined;
      }
      return {
        homeAway: entry.homeAway === 'home' ? 'home' : 'away',
        id,
        name,
        score: finiteScore(entry.score),
      };
    })
    .filter(Boolean);
  const cyclones = sides.find((side) => side.id === teamId);
  const opponent = sides.find((side) => side.id !== teamId);
  if (
    !cyclones ||
    !opponent ||
    typeof event.date !== 'string' ||
    Number.isNaN(new Date(event.date).getTime())
  ) {
    return undefined;
  }

  const gamePk = Number(event.id);
  if (!Number.isInteger(gamePk)) {
    return undefined;
  }

  const statusType = competition?.status?.type;
  const status = espnContestStatus(statusType);
  const timeValid = event.timeValid !== false && competition?.timeValid !== false;
  // An unset start is an all-day game. ESPN's placeholder is midnight Eastern, which is still the
  // previous day in Chicago, so its date is read in America/New_York (the app does the same).
  const officialDate = timeValid
    ? chicagoDateString(new Date(event.date))
    : officialDateInZone(new Date(event.date), 'America/New_York');

  return {
    abstractState: abstractStateFromEspn(statusType?.state),
    cyclonesScore: cyclones.score,
    gameDate: event.date,
    gameNumber: 1,
    gamePk,
    isHome: cyclones.homeAway === 'home',
    officialDate,
    opponentName: opponent.name,
    opponentScore: opponent.score,
    seasonType:
      typeof event.seasonType?.type === 'number' ? event.seasonType.type : 2,
    sport,
    status,
    timeValid,
  };
}

function gameInterruption(status) {
  const normalized = String(status ?? '').toLowerCase();
  return (
    normalized.includes('cancel') ||
    normalized.includes('delay') ||
    normalized.includes('postpon') ||
    normalized.includes('suspend')
  );
}

function isBlockedCyclonesGame(game) {
  const normalized = String(game.status ?? '').toLowerCase();
  return (
    normalized.includes('cancel') ||
    normalized.includes('postpon') ||
    normalized.includes('suspend')
  );
}

// "Today" is the America/Chicago calendar date, independent of the process time zone. A game
// with no start time never enters the start window; it is featured all day on its official date.
export function featuredCyclonesGame(games, now = new Date(), options = {}) {
  return selectFeaturedGame(games, now, {
    graceMinutes: options.graceMinutes,
    isBlocked: isBlockedCyclonesGame,
    isComplete: (game) =>
      game.abstractState === 'Final' && !gameInterruption(game.status),
    leadMinutes: options.leadMinutes,
    timeZone: CYCLONES_TIME_ZONE,
  });
}

export async function fetchCyclonesGames(teamId = CYCLONES_TEAM_ID, now = new Date()) {
  const requests = [];
  for (const [sport, path] of Object.entries(SPORT_PATHS)) {
    for (const seasonType of SCHEDULE_TYPES) {
      requests.push({ path, seasonType, sport });
    }
  }

  const responses = await Promise.all(
    requests.map(({ path, seasonType, sport }) =>
      fetch(
        `https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${teamId}/schedule?season=${seasonYearForSport(sport, now)}&seasontype=${seasonType}`,
        { signal: AbortSignal.timeout(SCHEDULE_TIMEOUT_MS) },
      ),
    ),
  );
  if (responses.some((response) => !response.ok)) {
    throw new Error('ESPN NCAA schedule request failed.');
  }

  const documents = await Promise.all(responses.map((response) => response.json()));
  const unique = new Map();
  documents.forEach((document, index) => {
    const sport = requests[index].sport;
    for (const event of document.events ?? []) {
      const game = cyclonesGameFromEspnEvent(event, sport, teamId);
      if (game) {
        unique.set(`${game.sport}:${game.gamePk}`, game);
      }
    }
  });
  return [...unique.values()];
}
