import type {
  LiveBasketballScoreboard,
  LiveFootballScoreboard,
} from './espnCyclonesScoreboard';

export const CYCLONES_TEAM_ID = 66;

export const CYCLONES_SPORTS = [
  'football',
  'mens-basketball',
  'womens-basketball',
] as const;

export type CyclonesSport = (typeof CYCLONES_SPORTS)[number];

export type CyclonesGame = {
  abstractState: string;
  cyclonesScore: number;
  gameDate: string;
  gameNumber: number;
  gamePk: number;
  isHome: boolean;
  neutralSite: boolean;
  notes: string;
  officialDate: string;
  opponentName: string;
  opponentScore: number;
  scoreboard?: LiveBasketballScoreboard | LiveFootballScoreboard;
  seasonType: number;
  sport: CyclonesSport;
  status: string;
  timeValid: boolean;
};

export type SportRecord = {
  losses: number;
  ties: number;
  wins: number;
};

export type SportStatusKind =
  | 'awaiting-next'
  | 'eliminated'
  | 'season-complete'
  | 'won-tournament';

export type SportStatus = {
  kind: SportStatusKind;
  label: string;
};

export type CyclonesSnapshot = {
  featuredGame?: CyclonesGame;
  records: Record<CyclonesSport, SportRecord>;
  statuses: Partial<Record<CyclonesSport, SportStatus>>;
  unavailableSports?: CyclonesSport[];
  upcomingGames: CyclonesGame[];
};

export type GameInterruption = 'canceled' | 'delayed' | 'postponed' | 'suspended';
export type RecapResult = 'LOSS' | 'TIE' | 'WIN';

const EMPTY_RECORD: SportRecord = { losses: 0, ties: 0, wins: 0 };
const VIDEO_LEAD_TIME_MS = 15 * 60_000;
const CONFERENCE_TOURNAMENT_WAIT_MS = 14 * 86_400_000;
const NCAA_CHAMPIONSHIP_NOTE = /\b(?:men|women)['’]?s basketball championship\b/;

export function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function zonedDateString(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function chicagoDateString(date: Date): string {
  return zonedDateString(date, 'America/Chicago');
}

// ESPN stores a game without a start time at midnight Eastern of its calendar day.
export function easternDateString(date: Date): string {
  return zonedDateString(date, 'America/New_York');
}

export function localDateFromOfficialDate(officialDate: string): Date {
  const [year, month, day] = officialDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// A game without a start time is an all-day game on its official date.
function gameDay(game: CyclonesGame): string {
  return game.timeValid
    ? localDateString(new Date(game.gameDate))
    : game.officialDate;
}

function gameSortTime(game: CyclonesGame): number {
  return game.timeValid
    ? new Date(game.gameDate).getTime()
    : localDateFromOfficialDate(game.officialDate).getTime();
}

export function footballSeasonYear(now = new Date()): number {
  return now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
}

export function basketballSeasonYear(now = new Date()): number {
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

export function recordLabel(wins: number, losses: number, ties: number): string {
  return ties > 0 ? `${wins}–${losses}–${ties}` : `${wins}–${losses}`;
}

export function sportLabel(sport: CyclonesSport): string {
  if (sport === 'football') {
    return 'Football';
  }
  if (sport === 'mens-basketball') {
    return "Men's basketball";
  }
  return "Women's basketball";
}

export function isCyclonesSport(value: unknown): value is CyclonesSport {
  return (
    value === 'football' ||
    value === 'mens-basketball' ||
    value === 'womens-basketball'
  );
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

export function isCompletedGame(game: CyclonesGame): boolean {
  return game.abstractState === 'Final' && !gameInterruption(game.status);
}

export function playbackBlocked(game: CyclonesGame): boolean {
  const interruption = gameInterruption(game.status);
  return (
    interruption === 'canceled' ||
    interruption === 'postponed' ||
    interruption === 'suspended' ||
    isCompletedGame(game)
  );
}

export function isVideoWindowOpen(game: CyclonesGame, nowMs: number): boolean {
  if (playbackBlocked(game)) {
    return false;
  }
  return (
    game.abstractState === 'Live' ||
    (game.timeValid &&
      nowMs >= new Date(game.gameDate).getTime() - VIDEO_LEAD_TIME_MS)
  );
}

export function recapResult(game: CyclonesGame): RecapResult {
  if (game.cyclonesScore > game.opponentScore) {
    return 'WIN';
  }
  if (game.cyclonesScore < game.opponentScore) {
    return 'LOSS';
  }
  return 'TIE';
}

export function regularSeasonRecord(games: CyclonesGame[]): SportRecord {
  let losses = 0;
  let ties = 0;
  let wins = 0;
  for (const game of games) {
    if (game.seasonType !== 2 || !isCompletedGame(game)) {
      continue;
    }
    if (game.cyclonesScore > game.opponentScore) {
      wins += 1;
    } else if (game.cyclonesScore < game.opponentScore) {
      losses += 1;
    } else {
      ties += 1;
    }
  }
  return { losses, ties, wins };
}

export function recordsFromGames(
  games: CyclonesGame[],
): Record<CyclonesSport, SportRecord> {
  return {
    football: regularSeasonRecord(
      games.filter((game) => game.sport === 'football'),
    ),
    'mens-basketball': regularSeasonRecord(
      games.filter((game) => game.sport === 'mens-basketball'),
    ),
    'womens-basketball': regularSeasonRecord(
      games.filter((game) => game.sport === 'womens-basketball'),
    ),
  };
}

function compareGames(first: CyclonesGame, second: CyclonesGame): number {
  const byStart = gameSortTime(first) - gameSortTime(second);
  return byStart !== 0 ? byStart : first.gameNumber - second.gameNumber;
}

function notesHaystack(game: CyclonesGame): string {
  return `${game.notes} ${game.status} ${game.opponentName}`.toLowerCase();
}

function isConferenceTournament(game: CyclonesGame): boolean {
  if (game.sport === 'football') {
    return false;
  }
  const hay = notesHaystack(game);
  return (
    hay.includes('conference tournament') ||
    hay.includes('big 12 tournament') ||
    /\bbig 12 (?:(?:men|women)['’]?s )?(?:basketball )?championship\b/.test(hay)
  );
}

// Only the College Football Playoff is a football knockout; any other bowl ends the season.
function knockoutTournament(game: CyclonesGame): string | undefined {
  const hay = notesHaystack(game);
  if (game.sport === 'football') {
    return hay.includes('college football playoff') || /\bcfp\b/.test(hay)
      ? 'College Football Playoff'
      : undefined;
  }
  if (isConferenceTournament(game)) {
    return undefined;
  }
  if (
    /\bncaa\b[^-]*\btournament\b/.test(hay) ||
    hay.includes('march madness') ||
    NCAA_CHAMPIONSHIP_NOTE.test(hay)
  ) {
    return 'NCAA Tournament';
  }
  if (/\bwnit\b/.test(hay)) {
    return 'WNIT';
  }
  if (/\bwbit\b/.test(hay)) {
    return 'WBIT';
  }
  if (game.seasonType === 3 && /\bnit\b/.test(hay)) {
    return 'NIT';
  }
  if (game.seasonType === 3 && hay.includes('tournament')) {
    return 'tournament';
  }
  return undefined;
}

// Only the final round counts as winning a tournament; ESPN writes "Championship" in every
// NCAA round note.
function isTitleGame(game: CyclonesGame, tournament: string): boolean {
  const hay = notesHaystack(game);
  if (
    hay.includes('national championship') ||
    hay.includes('championship game')
  ) {
    return true;
  }
  return (
    (tournament === 'NIT' || tournament === 'WNIT' || tournament === 'WBIT') &&
    /\b(?:nit|wnit|wbit)\s*[-–—:]\s*(?:championship|final)\b/.test(hay)
  );
}

export function sportStatus(
  games: CyclonesGame[],
  sport: CyclonesSport,
  now = new Date(),
): SportStatus | undefined {
  const sportGames = games
    .filter((game) => game.sport === sport)
    .sort(compareGames);
  const today = localDateString(now);
  const hasLiveOrFuture = sportGames.some(
    (game) =>
      game.abstractState === 'Live' ||
      (!isCompletedGame(game) && gameDay(game) >= today),
  );
  if (hasLiveOrFuture) {
    return undefined;
  }

  const completed = sportGames.filter((game) => isCompletedGame(game));
  const last = completed.at(-1);
  if (!last) {
    return undefined;
  }

  const hay = notesHaystack(last);
  if (
    hay.includes('selection sunday') ||
    hay.includes('pairing') ||
    hay.includes('awaiting next')
  ) {
    return {
      kind: 'awaiting-next',
      label: 'Awaiting next tournament game',
    };
  }

  // A conference tournament result waits on the NCAA, NIT, and WBIT fields, which post the
  // next game within days of Selection Sunday.
  if (isConferenceTournament(last)) {
    if (now.getTime() - gameSortTime(last) < CONFERENCE_TOURNAMENT_WAIT_MS) {
      return {
        kind: 'awaiting-next',
        label: 'Awaiting next tournament game',
      };
    }
    return {
      kind: 'season-complete',
      label: 'Season complete',
    };
  }

  const tournament = knockoutTournament(last);
  const result = recapResult(last);
  if (tournament) {
    if (result === 'WIN') {
      if (isTitleGame(last, tournament)) {
        return {
          kind: 'won-tournament',
          label: `Won the ${tournament}`,
        };
      }
      return {
        kind: 'awaiting-next',
        label: `Awaiting next ${tournament} game`,
      };
    }
    if (result === 'LOSS') {
      return {
        kind: 'eliminated',
        label: `Eliminated from the ${tournament}`,
      };
    }
  }

  return {
    kind: 'season-complete',
    label: 'Season complete',
  };
}

export function statusesFromGames(
  games: CyclonesGame[],
  now = new Date(),
): Partial<Record<CyclonesSport, SportStatus>> {
  const statuses: Partial<Record<CyclonesSport, SportStatus>> = {};
  for (const sport of CYCLONES_SPORTS) {
    const status = sportStatus(games, sport, now);
    if (status && status.kind !== 'season-complete') {
      statuses[sport] = status;
    }
  }
  return statuses;
}

export function snapshotFromGames(
  games: CyclonesGame[],
  records: Record<CyclonesSport, SportRecord> = recordsFromGames(games),
  now = new Date(),
): CyclonesSnapshot {
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
    remainingGames.find((game) => gameDay(game) === todayOfficial) ??
    todayRecap;

  return {
    featuredGame,
    records,
    statuses: statusesFromGames(games, now),
    upcomingGames: featuredGame
      ? remainingGames.filter((game) => game.gamePk !== featuredGame.gamePk)
      : remainingGames,
  };
}

function finiteScore(value: unknown): number {
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
  return 0;
}

function abstractStateFromEspn(state: unknown): string {
  if (state === 'in') {
    return 'Live';
  }
  if (state === 'post') {
    return 'Final';
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
  if (
    statusType.state === 'pre' ||
    statusName === 'STATUS_SCHEDULED' ||
    description === 'Scheduled'
  ) {
    return 'Scheduled';
  }
  return detail || shortDetail || description || 'Scheduled';
}

export function cyclonesGameFromEspnEvent(
  event: unknown,
  sport: CyclonesSport,
): CyclonesGame | undefined {
  if (typeof event !== 'object' || event === null) {
    return undefined;
  }

  const raw = event as {
    competitions?: unknown[];
    date?: unknown;
    id?: unknown;
    name?: unknown;
    notes?: unknown;
    seasonType?: { name?: unknown; type?: unknown };
    shortName?: unknown;
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
    neutralSite?: unknown;
    notes?: unknown;
    status?: {
      type?: {
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
  const cyclones = sides.find((side) => side.id === CYCLONES_TEAM_ID);
  const opponent = sides.find((side) => side.id !== CYCLONES_TEAM_ID);
  if (!cyclones || !opponent) {
    return undefined;
  }

  const statusType = contest.status?.type ?? {};
  const statusDetail = espnContestStatus(statusType);
  const seasonType =
    typeof raw.seasonType?.type === 'number' &&
    Number.isInteger(raw.seasonType.type)
      ? raw.seasonType.type
      : 2;
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

  return {
    abstractState: abstractStateFromEspn(statusType?.state),
    cyclonesScore: cyclones.score,
    gameDate: raw.date,
    gameNumber: 1,
    gamePk,
    isHome: cyclones.homeAway === 'home',
    neutralSite: contest.neutralSite === true,
    notes,
    officialDate: timeValid
      ? chicagoDateString(new Date(raw.date))
      : easternDateString(new Date(raw.date)),
    opponentName: opponent.name,
    opponentScore: opponent.score,
    seasonType,
    sport,
    status: statusDetail,
    timeValid,
  };
}

export function cyclonesGameFromHarness(
  value: unknown,
): CyclonesGame | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const game = value as Partial<CyclonesGame> & { scoreboard?: unknown };
  if (
    !isCyclonesSport(game.sport) ||
    typeof game.abstractState !== 'string' ||
    typeof game.gamePk !== 'number' ||
    !Number.isInteger(game.gamePk) ||
    typeof game.gameDate !== 'string' ||
    Number.isNaN(new Date(game.gameDate).getTime()) ||
    typeof game.gameNumber !== 'number' ||
    !Number.isInteger(game.gameNumber) ||
    typeof game.status !== 'string' ||
    typeof game.isHome !== 'boolean' ||
    typeof game.cyclonesScore !== 'number' ||
    typeof game.opponentName !== 'string' ||
    typeof game.opponentScore !== 'number' ||
    typeof game.officialDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(game.officialDate)
  ) {
    return undefined;
  }

  const parsed: CyclonesGame = {
    abstractState: game.abstractState,
    cyclonesScore: game.cyclonesScore,
    gameDate: game.gameDate,
    gameNumber: game.gameNumber,
    gamePk: game.gamePk,
    isHome: game.isHome,
    neutralSite: game.neutralSite === true,
    notes: typeof game.notes === 'string' ? game.notes : '',
    officialDate: game.officialDate,
    opponentName: game.opponentName,
    opponentScore: game.opponentScore,
    seasonType:
      typeof game.seasonType === 'number' && Number.isInteger(game.seasonType)
        ? game.seasonType
        : 2,
    sport: game.sport,
    status: game.status,
    timeValid: game.timeValid !== false,
  };
  if (
    game.scoreboard !== undefined &&
    typeof game.scoreboard === 'object' &&
    game.scoreboard !== null
  ) {
    parsed.scoreboard = game.scoreboard as
      | LiveBasketballScoreboard
      | LiveFootballScoreboard;
  }
  return parsed;
}

export function emptyRecords(): Record<CyclonesSport, SportRecord> {
  return {
    football: { ...EMPTY_RECORD },
    'mens-basketball': { ...EMPTY_RECORD },
    'womens-basketball': { ...EMPTY_RECORD },
  };
}
