import { easternDateString } from '../../team/engine/dates.ts';
import type { TeamGame } from '../../team/engine/types.ts';
import { gameInterruption } from '../../team/engine/videoWindow.ts';
import type { TeamRef } from '../types.ts';
import type { EspnAdapterRow } from './rows.ts';

function finiteScore(value: unknown): number | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const raw = value as { displayValue?: unknown; value?: unknown };
    return finiteScore(raw.value ?? raw.displayValue);
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
  return undefined;
}

export function abstractStateFromEspn(
  state: unknown,
  completed?: unknown,
): string {
  if (completed === true || state === 'post') {
    return 'Final';
  }
  if (state === 'in') {
    return 'Live';
  }
  return 'Preview';
}

function espnText(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : '';
}

function notesFromUnknown(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (!Array.isArray(value)) {
    return '';
  }
  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry.trim();
      }
      if (typeof entry !== 'object' || entry === null) {
        return '';
      }
      const note = entry as { headline?: unknown; text?: unknown };
      return espnText(note.headline) || espnText(note.text);
    })
    .filter(Boolean)
    .join(' ');
}

function espnContestStatus(statusType: {
  description?: unknown;
  detail?: unknown;
  name?: unknown;
  shortDetail?: unknown;
  state?: unknown;
}): string {
  const statusName = espnText(statusType.name);
  const description = espnText(statusType.description);
  const detail = espnText(statusType.detail);
  const shortDetail = espnText(statusType.shortDetail);
  const interruption = gameInterruption(
    `${statusName} ${description} ${detail} ${shortDetail}`,
  );
  if (interruption) {
    if (interruption === 'canceled') {
      return description || detail || shortDetail || 'Canceled';
    }
    if (interruption === 'delayed') {
      return description || detail || shortDetail || 'Delayed';
    }
    if (interruption === 'postponed') {
      return description || detail || shortDetail || 'Postponed';
    }
    return description || detail || shortDetail || 'Suspended';
  }
  // ESPN puts the kickoff clock in detail and shortDetail for STATUS_SCHEDULED; schedule rows
  // already print the phone-local date and hide the status Scheduled.
  if (
    statusType.state === 'pre' ||
    statusName === 'STATUS_SCHEDULED' ||
    description === 'Scheduled'
  ) {
    return 'Scheduled';
  }
  return detail || shortDetail || description || 'Scheduled';
}

// seasonType is the schedule list the event came from (1 preseason, 2 regular season, 3 postseason).
// The event's own seasonType field is not trusted for the record.
export function teamGameFromEspnEvent(
  event: unknown,
  row: EspnAdapterRow,
  team: Pick<TeamRef, 'espnId'>,
  seasonType: number,
): TeamGame | undefined {
  if (typeof event !== 'object' || event === null) {
    return undefined;
  }

  const raw = event as {
    competitions?: unknown[];
    date?: unknown;
    id?: unknown;
    name?: unknown;
    notes?: unknown;
    seasonType?: { name?: unknown };
    shortName?: unknown;
    timeValid?: unknown;
  };
  const eventNumber = Number(raw.id);
  if (!Number.isInteger(eventNumber) || eventNumber <= 0) {
    return undefined;
  }
  if (
    typeof raw.date !== 'string' ||
    Number.isNaN(new Date(raw.date).getTime())
  ) {
    return undefined;
  }

  const competition = raw.competitions?.[0];
  if (typeof competition !== 'object' || competition === null) {
    return undefined;
  }
  const contest = competition as {
    competitors?: unknown[];
    neutralSite?: unknown;
    notes?: unknown;
    status?: {
      type?: {
        completed?: unknown;
        description?: unknown;
        detail?: unknown;
        name?: unknown;
        shortDetail?: unknown;
        state?: unknown;
      };
    };
    timeValid?: unknown;
    type?: { abbreviation?: unknown; text?: unknown };
  };
  const competitors = Array.isArray(contest.competitors)
    ? contest.competitors
    : [];
  const sides = competitors
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        return undefined;
      }
      const side = entry as {
        homeAway?: unknown;
        id?: unknown;
        score?: unknown;
        team?: {
          displayName?: unknown;
          id?: unknown;
          logo?: unknown;
          logos?: Array<{ href?: unknown }>;
        };
      };
      const teamId = Number(side.team?.id ?? side.id);
      const name =
        typeof side.team?.displayName === 'string'
          ? side.team.displayName
          : undefined;
      if (!Number.isInteger(teamId) || !name) {
        return undefined;
      }
      return {
        homeAway: side.homeAway === 'home' ? 'home' : 'away',
        id: teamId,
        logo: side.team?.logos?.[0]?.href ?? side.team?.logo,
        name,
        score: finiteScore(side.score),
      };
    })
    .filter((side): side is NonNullable<typeof side> => Boolean(side));
  const teamId = Number(team.espnId);
  const followed = sides.find((side) => side.id === teamId);
  const opponent = sides.find((side) => side.id !== teamId);
  if (!followed || !opponent) {
    return undefined;
  }

  const statusType = contest.status?.type ?? {};
  const timeValid = raw.timeValid !== false && contest.timeValid !== false;
  const notes = [
    espnText(raw.name),
    espnText(raw.shortName),
    espnText(raw.seasonType?.name),
    espnText(contest.type?.text),
    espnText(contest.type?.abbreviation),
    notesFromUnknown(raw.notes),
    notesFromUnknown(contest.notes),
  ]
    .filter(Boolean)
    .join(' ');

  const gameId = String(eventNumber);
  const officialDate = easternDateString(new Date(raw.date));
  const game: TeamGame = {
    abstractState: abstractStateFromEspn(statusType.state, statusType.completed),
    adapter: row.key,
    gameDate: raw.date,
    gameId,
    gameNumber: 1,
    isHome: followed.homeAway === 'home',
    key: `${row.key}:${gameId}:${officialDate}`,
    neutralSite: contest.neutralSite === true,
    notes,
    officialDate,
    opponentName: opponent.name,
    opponentScore: opponent.score ?? 0,
    scoreboard: row.scoreboard,
    scoresKnown: followed.score !== undefined && opponent.score !== undefined,
    seasonType,
    status: espnContestStatus(statusType),
    teamScore: followed.score ?? 0,
    timeValid,
  };
  if (row.sport) {
    game.sport = row.sport;
  }
  if (typeof opponent.logo === 'string') {
    game.opponentLogo = opponent.logo;
  }
  return game;
}
