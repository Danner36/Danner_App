import { officialDateInZone } from '../gameWindow.mjs';

const SITE_API = 'https://site.api.espn.com/apis/site/v2/sports';
const SCHEDULE_TIMEOUT_MS = 15_000;

// The season year under a catalog seasonYear rule, read in the official-date zone and not the
// process zone: shiftForwardFromMonth m means months m and later count toward year + 1, and
// shiftBackThroughMonth m means months through m count toward year - 1.
export function seasonYearFor(rule, now, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    timeZone,
    year: 'numeric',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  if (rule?.shiftForwardFromMonth && values.month >= rule.shiftForwardFromMonth) {
    return values.year + 1;
  }
  if (rule?.shiftBackThroughMonth && values.month <= rule.shiftBackThroughMonth) {
    return values.year - 1;
  }
  return values.year;
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

export function gameFromEspnEvent(event, team) {
  const espnId = Number(team.espnId);
  const competition = event.competitions?.[0];
  const sides = (competition?.competitors ?? [])
    .map((entry) => {
      const id = Number(entry.team?.id ?? entry.id);
      const name = entry.team?.displayName;
      return Number.isInteger(id) && typeof name === 'string' && name ? { id, name } : undefined;
    })
    .filter(Boolean);
  const ours = sides.find((side) => side.id === espnId);
  const opponent = sides.find((side) => side.id !== espnId);
  const gamePk = Number(event.id);
  if (
    !ours ||
    !opponent ||
    typeof event.date !== 'string' ||
    Number.isNaN(new Date(event.date).getTime()) ||
    !Number.isInteger(gamePk)
  ) {
    return undefined;
  }

  const statusType = competition?.status?.type;
  return {
    abstractState: abstractStateFromEspn(statusType?.state),
    gameDate: event.date,
    gameNumber: 1,
    gamePk,
    officialDate: officialDateInZone(new Date(event.date), team.officialDateZone),
    opponentName: opponent.name,
    ...(team.sport ? { sport: team.sport } : {}),
    status: espnContestStatus(statusType),
    timeValid: event.timeValid !== false && competition?.timeValid !== false,
  };
}

// Reads only the dispatched sport's lists. One failed list fails the run, because a partial
// schedule cannot prove a game is absent.
export async function fetchEspnGames(team, now, fetchImpl = fetch) {
  const { schedule } = team;
  const season = seasonYearFor(schedule.seasonYear, now, team.officialDateZone);
  const responses = await Promise.all(
    schedule.seasonTypes.map((seasonType) =>
      fetchImpl(
        `${SITE_API}/${schedule.sitePath}/teams/${team.espnId}/schedule?season=${season}&seasontype=${seasonType}`,
        { signal: AbortSignal.timeout(SCHEDULE_TIMEOUT_MS) },
      ),
    ),
  );
  if (responses.some((response) => !response.ok)) {
    throw new Error('ESPN schedule request failed.');
  }

  const documents = await Promise.all(responses.map((response) => response.json()));
  const unique = new Map();
  for (const document of documents) {
    for (const event of document.events ?? []) {
      const game = gameFromEspnEvent(event, team);
      if (game) {
        unique.set(game.gamePk, game);
      }
    }
  }
  return [...unique.values()];
}

export function isCompleteEspnGame(game) {
  const status = String(game.status ?? '').toLowerCase();
  return (
    game.abstractState === 'Final' &&
    !status.includes('cancel') &&
    !status.includes('delay') &&
    !status.includes('postpon') &&
    !status.includes('suspend')
  );
}
