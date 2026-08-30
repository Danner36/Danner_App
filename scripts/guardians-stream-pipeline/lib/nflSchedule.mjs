export const PATRIOTS_TEAM_ID = 17;

const SCHEDULE_TYPES = [1, 2, 3];

function easternDateString(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/New_York',
    year: 'numeric',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function nflSeasonYear(now) {
  return now.getMonth() <= 1 ? now.getFullYear() - 1 : now.getFullYear();
}

function finiteScore(value) {
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

function patriotsGameFromEspnEvent(event, teamId) {
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
  const patriots = sides.find((side) => side.id === teamId);
  const opponent = sides.find((side) => side.id !== teamId);
  if (
    !patriots ||
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
  const statusName = typeof statusType?.name === 'string' ? statusType.name : '';
  const status =
    statusType?.detail ||
    statusType?.shortDetail ||
    statusType?.description ||
    (statusName.includes('DELAY')
      ? 'Delayed'
      : statusName.includes('POSTPON')
        ? 'Postponed'
        : statusName.includes('CANCEL')
          ? 'Canceled'
          : statusName.includes('SUSPEND')
            ? 'Suspended'
            : 'Scheduled');

  return {
    abstractState: abstractStateFromEspn(statusType?.state),
    gameDate: event.date,
    gameNumber: 1,
    gamePk,
    isHome: patriots.homeAway === 'home',
    officialDate: easternDateString(new Date(event.date)),
    opponentName: opponent.name,
    opponentScore: opponent.score,
    patriotsScore: patriots.score,
    seasonType:
      typeof event.seasonType?.type === 'number' ? event.seasonType.type : 2,
    status,
    timeValid: event.timeValid !== false && competition?.timeValid !== false,
  };
}

export async function fetchPatriotsGames(teamId, now = new Date()) {
  const season = nflSeasonYear(now);
  const responses = await Promise.all(
    SCHEDULE_TYPES.map((seasonType) =>
      fetch(
        `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/schedule?season=${season}&seasontype=${seasonType}`,
      ),
    ),
  );
  if (responses.some((response) => !response.ok)) {
    throw new Error('ESPN NFL schedule request failed.');
  }

  const documents = await Promise.all(responses.map((response) => response.json()));
  const unique = new Map();
  for (const document of documents) {
    for (const event of document.events ?? []) {
      const game = patriotsGameFromEspnEvent(event, teamId);
      if (game) {
        unique.set(game.gamePk, game);
      }
    }
  }
  return [...unique.values()];
}

export function opponentSearchTerms(opponentName) {
  const terms = new Set();
  const normalized = opponentName.trim();
  if (normalized) {
    terms.add(normalized);
  }

  for (const part of normalized.split(/\s+/)) {
    if (part.length >= 3) {
      terms.add(part);
    }
  }

  terms.add('Patriots');
  terms.add('NE');
  terms.add('New England');
  return [...terms];
}
