import type {
  LiveFootballScoreboard,
  LiveFootballSummary,
} from './espnScoreboard';

export const PATRIOTS_TEAM_ID = 17;

export type PatriotsGame = {
  abstractState: string;
  gameDate: string;
  gameNumber: number;
  gamePk: number;
  isHome: boolean;
  officialDate: string;
  opponentName: string;
  opponentScore: number;
  patriotsScore: number;
  scoreboard?: LiveFootballScoreboard;
  // False when ESPN sent a score that does not parse; such a Final stays out of the record.
  scoresKnown: boolean;
  seasonType: number;
  status: string;
  timeValid: boolean;
};

export type PatriotsSnapshot = {
  featuredGame?: PatriotsGame;
  losses: number;
  ties: number;
  upcomingGames: PatriotsGame[];
  wins: number;
};

export type GameInterruption = 'canceled' | 'delayed' | 'postponed' | 'suspended';
export type RecapResult = 'LOSS' | 'TIE' | 'WIN';

export function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

export function nflSeasonYear(now = new Date()): number {
  return now.getMonth() <= 1 ? now.getFullYear() - 1 : now.getFullYear();
}

export function recordLabel(wins: number, losses: number, ties: number): string {
  return ties > 0 ? `${wins}–${losses}–${ties}` : `${wins}–${losses}`;
}

export function gameInterruption(status: string): GameInterruption | undefined {
  const normalized = status.toLowerCase();
  if (normalized.includes('cancel')) {
    return 'canceled';
  }
  if (normalized.includes('delay')) {
    return 'delayed';
  }
  if (normalized.includes('postpon')) {
    return 'postponed';
  }
  if (normalized.includes('suspend')) {
    return 'suspended';
  }
  return undefined;
}

export function isCompletedGame(game: PatriotsGame): boolean {
  return game.abstractState === 'Final' && !gameInterruption(game.status);
}

export function recapResult(game: PatriotsGame): RecapResult {
  if (game.patriotsScore > game.opponentScore) {
    return 'WIN';
  }
  if (game.patriotsScore < game.opponentScore) {
    return 'LOSS';
  }
  return 'TIE';
}

export function regularSeasonRecord(games: PatriotsGame[]): {
  losses: number;
  ties: number;
  wins: number;
} {
  let losses = 0;
  let ties = 0;
  let wins = 0;
  for (const game of games) {
    if (
      game.seasonType !== 2 ||
      !isCompletedGame(game) ||
      !game.scoresKnown
    ) {
      continue;
    }
    if (game.patriotsScore > game.opponentScore) {
      wins += 1;
    } else if (game.patriotsScore < game.opponentScore) {
      losses += 1;
    } else {
      ties += 1;
    }
  }
  return { losses, ties, wins };
}

function isSameLocalDay(date: Date, other: Date): boolean {
  return (
    date.getFullYear() === other.getFullYear() &&
    date.getMonth() === other.getMonth() &&
    date.getDate() === other.getDate()
  );
}

// A game without a kickoff time is an all-day game on its Eastern official date. ESPN's
// placeholder timestamp for it can fall on the previous local day west of Eastern time.
function isGameOnLocalDay(game: PatriotsGame, now: Date): boolean {
  return game.timeValid
    ? isSameLocalDay(new Date(game.gameDate), now)
    : game.officialDate === localDateString(now);
}

export function gameDayLabel(game: PatriotsGame, locale?: string): string {
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

function compareGames(first: PatriotsGame, second: PatriotsGame): number {
  const byStart =
    new Date(first.gameDate).getTime() - new Date(second.gameDate).getTime();
  return byStart !== 0 ? byStart : first.gameNumber - second.gameNumber;
}

export function snapshotFromGames(
  games: PatriotsGame[],
  wins: number,
  losses: number,
  ties = 0,
  now = new Date(),
): PatriotsSnapshot {
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const todayOfficial = localDateString(now);
  const remainingGames = games
    .filter((game) => {
      const startsTodayOrLater = game.timeValid
        ? new Date(game.gameDate).getTime() >= todayStart
        : game.officialDate >= todayOfficial;
      return (
        !isCompletedGame(game) &&
        (game.abstractState === 'Live' || startsTodayOrLater)
      );
    })
    .sort(compareGames);
  const todayRecap = games
    .filter(
      (game) => isCompletedGame(game) && game.officialDate === todayOfficial,
    )
    .sort(compareGames)
    .at(-1);
  const featuredGame =
    remainingGames.find((game) => game.abstractState === 'Live') ??
    remainingGames.find((game) => isGameOnLocalDay(game, now)) ??
    todayRecap;

  return {
    featuredGame,
    losses,
    ties,
    upcomingGames: featuredGame
      ? remainingGames.filter((game) => game.gamePk !== featuredGame.gamePk)
      : remainingGames,
    wins,
  };
}

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

export function abstractStateRank(state: string): number {
  if (state === 'Final') {
    return 2;
  }
  return state === 'Live' ? 1 : 0;
}

// Applies one five-second summary poll to the featured game. The state only moves forward, so
// a stale cached summary cannot put a finished game back on the live board, and a summary that
// still reports pre-game leaves scores and status alone. A post-game summary without a board
// has no score or status to show (ESPN also reports postponed and canceled games as post), so
// Final then waits for the schedule refresh the poll starts.
export function gameWithLiveSummary(
  game: PatriotsGame,
  summary: LiveFootballSummary,
): PatriotsGame {
  const polledState =
    summary.state !== undefined || summary.completed
      ? abstractStateFromEspn(summary.state, summary.completed)
      : game.abstractState;
  const polledRank = abstractStateRank(polledState);
  const currentRank = abstractStateRank(game.abstractState);
  if (polledRank < currentRank) {
    return game;
  }
  const scoreboard = polledRank > 0 ? summary.scoreboard : undefined;
  if (!scoreboard) {
    return polledState === 'Live' && currentRank === 0
      ? { ...game, abstractState: polledState }
      : game;
  }
  return {
    ...game,
    abstractState: polledState,
    opponentScore: game.isHome
      ? scoreboard.away.points
      : scoreboard.home.points,
    patriotsScore: game.isHome
      ? scoreboard.home.points
      : scoreboard.away.points,
    scoreboard,
    scoresKnown: true,
    status: scoreboard.status || game.status,
  };
}

function espnText(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : '';
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
  // ESPN puts the kickoff clock in detail/shortDetail for STATUS_SCHEDULED.
  // Upcoming rows already print the phone-local date and hide status Scheduled.
  if (
    statusType.state === 'pre' ||
    statusName === 'STATUS_SCHEDULED' ||
    description === 'Scheduled'
  ) {
    return 'Scheduled';
  }
  return detail || shortDetail || description || 'Scheduled';
}

// seasonType is the schedule list the event came from (1 preseason, 2 regular season,
// 3 playoffs). The event's own seasonType field is not trusted for the record.
export function patriotsGameFromEspnEvent(
  event: unknown,
  seasonType: number,
): PatriotsGame | undefined {
  if (typeof event !== 'object' || event === null) {
    return undefined;
  }

  const raw = event as {
    competitions?: unknown[];
    date?: unknown;
    id?: unknown;
    timeValid?: unknown;
  };
  const gamePk = Number(raw.id);
  if (!Number.isInteger(gamePk) || gamePk <= 0) {
    return undefined;
  }
  if (typeof raw.date !== 'string' || Number.isNaN(new Date(raw.date).getTime())) {
    return undefined;
  }

  const competition = raw.competitions?.[0];
  if (typeof competition !== 'object' || competition === null) {
    return undefined;
  }
  const contest = competition as {
    competitors?: unknown[];
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
        team?: { displayName?: unknown; id?: unknown };
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
        name,
        score: finiteScore(side.score),
      };
    })
    .filter((side): side is NonNullable<typeof side> => Boolean(side));
  const patriots = sides.find((side) => side.id === PATRIOTS_TEAM_ID);
  const opponent = sides.find((side) => side.id !== PATRIOTS_TEAM_ID);
  if (!patriots || !opponent) {
    return undefined;
  }

  const statusType = contest.status?.type ?? {};
  const statusDetail = espnContestStatus(statusType);

  const timeValid = raw.timeValid !== false && contest.timeValid !== false;
  return {
    abstractState: abstractStateFromEspn(
      statusType?.state,
      statusType?.completed,
    ),
    gameDate: raw.date,
    gameNumber: 1,
    gamePk,
    isHome: patriots.homeAway === 'home',
    officialDate: easternDateString(new Date(raw.date)),
    opponentName: opponent.name,
    opponentScore: opponent.score ?? 0,
    patriotsScore: patriots.score ?? 0,
    scoresKnown: patriots.score !== undefined && opponent.score !== undefined,
    seasonType,
    status: statusDetail,
    timeValid,
  };
}

export function patriotsGameFromHarness(
  value: unknown,
): PatriotsGame | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const game = value as Partial<PatriotsGame> & { scoreboard?: unknown };
  if (
    typeof game.abstractState !== 'string' ||
    typeof game.gamePk !== 'number' ||
    !Number.isInteger(game.gamePk) ||
    typeof game.gameDate !== 'string' ||
    Number.isNaN(new Date(game.gameDate).getTime()) ||
    typeof game.gameNumber !== 'number' ||
    !Number.isInteger(game.gameNumber) ||
    typeof game.status !== 'string' ||
    typeof game.isHome !== 'boolean' ||
    typeof game.patriotsScore !== 'number' ||
    typeof game.opponentName !== 'string' ||
    typeof game.opponentScore !== 'number' ||
    typeof game.officialDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(game.officialDate)
  ) {
    return undefined;
  }

  const parsed: PatriotsGame = {
    abstractState: game.abstractState,
    gameDate: game.gameDate,
    gameNumber: game.gameNumber,
    gamePk: game.gamePk,
    isHome: game.isHome,
    officialDate: game.officialDate,
    opponentName: game.opponentName,
    opponentScore: game.opponentScore,
    patriotsScore: game.patriotsScore,
    scoresKnown: true,
    seasonType:
      typeof game.seasonType === 'number' && Number.isInteger(game.seasonType)
        ? game.seasonType
        : 2,
    status: game.status,
    timeValid: game.timeValid !== false,
  };
  if (
    game.scoreboard !== undefined &&
    typeof game.scoreboard === 'object' &&
    game.scoreboard !== null
  ) {
    parsed.scoreboard = game.scoreboard as LiveFootballScoreboard;
  }
  return parsed;
}
