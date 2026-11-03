import {
  basketballBoardFromScheduleEvent,
  basketballBoardFromSummary,
  type BasketballBoardPoll,
} from '../leagues/espn/basketballBoard';
import {
  basketballRulesFor,
  type BasketballAdapterKey,
} from '../leagues/espn/basketballRules';
import type {
  BasketballBoardModel,
  BasketballCapabilityFlags,
} from '../scoreboards/basketball/types';
import type { CyclonesSport } from './cyclonesSnapshot';

export type PeriodSideScore = {
  periods: Array<number | undefined>;
  points: number;
};

export type LiveFootballScoreboard = {
  away: PeriodSideScore;
  clock: string;
  distance?: number;
  down?: number;
  home: PeriodSideScore;
  kind: 'football';
  period: number;
  possessionTeamId?: number;
  situation?: string;
  status: string;
};

export type CyclonesBasketballSport = Exclude<CyclonesSport, 'football'>;

export type CyclonesLiveBoard = BasketballBoardModel | LiveFootballScoreboard;

const SUMMARY_TIMEOUT_MS = 6_000;

const SUMMARY_PATHS: Record<CyclonesSport, string> = {
  football: 'football/college-football',
  'mens-basketball': 'basketball/mens-college-basketball',
  'womens-basketball': 'basketball/womens-college-basketball',
};

const BASKETBALL_ADAPTERS: Record<CyclonesBasketballSport, BasketballAdapterKey> = {
  'mens-basketball': 'ncaa/mens-basketball',
  'womens-basketball': 'ncaa/womens-basketball',
};

function finiteCount(value: unknown): number | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const raw = value as { displayValue?: unknown; value?: unknown };
    return finiteCount(raw.value ?? raw.displayValue);
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

function periodValues(value: unknown): Array<number | undefined> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => {
    if (typeof entry === 'object' && entry !== null) {
      const raw = entry as { displayValue?: unknown; value?: unknown };
      return finiteCount(raw.value ?? raw.displayValue);
    }
    return finiteCount(entry);
  });
}

function sideScore(
  points: unknown,
  linescores: unknown,
): PeriodSideScore | undefined {
  const total = finiteCount(points);
  if (total === undefined) {
    return undefined;
  }
  return {
    periods: periodValues(linescores),
    points: total,
  };
}

function situationText(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const situation = value as {
    downDistanceText?: unknown;
    possessionText?: unknown;
    shortDownDistanceText?: unknown;
  };
  const downDistance =
    (typeof situation.downDistanceText === 'string' &&
      situation.downDistanceText.trim()) ||
    (typeof situation.shortDownDistanceText === 'string' &&
      situation.shortDownDistanceText.trim()) ||
    '';
  const possession =
    typeof situation.possessionText === 'string'
      ? situation.possessionText.trim()
      : '';
  const text = [downDistance, possession].filter(Boolean).join(' · ');
  return text || undefined;
}

function competitionFromDocument(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const document = value as {
    competitions?: unknown[];
    header?: { competitions?: unknown[] };
  };
  return document.header?.competitions?.[0] ?? document.competitions?.[0];
}

function sidesFromCompetition(competition: {
  competitors?: unknown[];
}): { away: PeriodSideScore; home: PeriodSideScore } | undefined {
  const competitors = Array.isArray(competition.competitors)
    ? competition.competitors
    : [];
  let away: PeriodSideScore | undefined;
  let home: PeriodSideScore | undefined;
  for (const entry of competitors) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const side = entry as {
      homeAway?: unknown;
      linescores?: unknown;
      score?: unknown;
    };
    const parsed = sideScore(side.score, side.linescores);
    if (!parsed) {
      continue;
    }
    if (side.homeAway === 'home') {
      home = parsed;
    } else if (side.homeAway === 'away') {
      away = parsed;
    }
  }
  if (!away || !home) {
    return undefined;
  }
  return { away, home };
}

export function liveFootballScoreboardFromEspn(
  value: unknown,
): LiveFootballScoreboard | undefined {
  const competition = competitionFromDocument(value);
  if (typeof competition !== 'object' || competition === null) {
    return undefined;
  }

  const contest = competition as {
    competitors?: unknown[];
    status?: {
      displayClock?: unknown;
      period?: unknown;
      type?: { detail?: unknown; shortDetail?: unknown };
    };
  };
  const sides = sidesFromCompetition(contest);
  if (!sides) {
    return undefined;
  }

  const document =
    typeof value === 'object' && value !== null
      ? (value as { situation?: unknown })
      : undefined;
  const situation = document?.situation;
  const situationRecord =
    typeof situation === 'object' && situation !== null
      ? (situation as {
          distance?: unknown;
          down?: unknown;
          possession?: unknown;
        })
      : undefined;
  const clock =
    typeof contest.status?.displayClock === 'string'
      ? contest.status.displayClock
      : '';
  const period = finiteCount(contest.status?.period) ?? 0;
  const status =
    (typeof contest.status?.type?.detail === 'string' &&
      contest.status.type.detail) ||
    (typeof contest.status?.type?.shortDetail === 'string' &&
      contest.status.type.shortDetail) ||
    'Live';
  const possessionTeamId = finiteCount(situationRecord?.possession);

  return {
    away: sides.away,
    clock,
    distance: finiteCount(situationRecord?.distance),
    down: finiteCount(situationRecord?.down),
    home: sides.home,
    kind: 'football',
    period,
    possessionTeamId:
      possessionTeamId && possessionTeamId > 0 ? possessionTeamId : undefined,
    situation: situationText(situation),
    status,
  };
}

// Arena board from an ESPN summary with the sport's NCAA rules row; flagOverrides replace that
// row's capability flags (the development harness only). poll.now is stored as stale.polledAt.
export function basketballBoardFromCyclonesSummary(
  value: unknown,
  sport: CyclonesBasketballSport,
  poll: BasketballBoardPoll,
  flagOverrides?: Partial<BasketballCapabilityFlags>,
): BasketballBoardModel | undefined {
  const board = basketballBoardFromSummary(
    value,
    basketballRulesFor(BASKETBALL_ADAPTERS[sport], flagOverrides),
    poll,
  );
  return board
    ? { ...board, stale: { ...board.stale, polledAt: poll.now } }
    : undefined;
}

// Arena board from an ESPN schedule event: scores, clock and period, with the sport's regulation
// periods. polledAt is stored as stale.polledAt.
export function basketballBoardFromCyclonesEvent(
  event: unknown,
  sport: CyclonesBasketballSport,
  polledAt: number,
): BasketballBoardModel | undefined {
  const board = basketballBoardFromScheduleEvent(
    event,
    basketballRulesFor(BASKETBALL_ADAPTERS[sport]),
  );
  return board ? { ...board, stale: { ...board.stale, polledAt } } : undefined;
}

export function liveFootballScoreboardFromHarness(
  value: unknown,
): LiveFootballScoreboard | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const board = value as Partial<LiveFootballScoreboard> & {
    away?: { points?: unknown; periods?: unknown; quarters?: unknown };
    home?: { points?: unknown; periods?: unknown; quarters?: unknown };
  };
  const awayPeriods = Array.isArray(board.away?.periods)
    ? board.away.periods
    : board.away?.quarters;
  const homePeriods = Array.isArray(board.home?.periods)
    ? board.home.periods
    : board.home?.quarters;
  if (
    typeof board.status !== 'string' ||
    typeof board.clock !== 'string' ||
    typeof board.period !== 'number' ||
    !Array.isArray(awayPeriods) ||
    !Array.isArray(homePeriods)
  ) {
    return undefined;
  }

  const awayPoints = finiteCount(board.away?.points);
  const homePoints = finiteCount(board.home?.points);
  if (awayPoints === undefined || homePoints === undefined) {
    return undefined;
  }

  return {
    away: {
      periods: awayPeriods.map((period) => finiteCount(period)),
      points: awayPoints,
    },
    clock: board.clock,
    distance: finiteCount(board.distance),
    down: finiteCount(board.down),
    home: {
      periods: homePeriods.map((period) => finiteCount(period)),
      points: homePoints,
    },
    kind: 'football',
    period: Math.max(0, Math.trunc(board.period)),
    possessionTeamId: finiteCount(board.possessionTeamId),
    situation:
      typeof board.situation === 'string' ? board.situation : undefined,
    status: board.status,
  };
}

export type LiveCyclonesSummary = {
  completed: boolean;
  scoreboard?: CyclonesLiveBoard;
  state?: 'in' | 'post' | 'pre';
};

// Away and home points and the status line of a live board, for the featured card. Undefined
// points leave the card's score as it is.
export function liveBoardTotals(scoreboard: CyclonesLiveBoard): {
  away?: number;
  home?: number;
  status?: string;
} {
  if (scoreboard.kind === 'football') {
    return {
      away: scoreboard.away.points,
      home: scoreboard.home.points,
      status: scoreboard.status,
    };
  }
  return {
    away: scoreboard.away.score,
    home: scoreboard.home.score,
    status: scoreboard.statusDetail,
  };
}

// poll applies to basketball: its time stamps the board, and its previous board lets player cells
// carry across a shorter plays array.
export function liveCyclonesSummaryFromEspn(
  value: unknown,
  sport: CyclonesSport,
  poll: BasketballBoardPoll = { now: Date.now() },
): LiveCyclonesSummary {
  const competition = competitionFromDocument(value);
  const statusType =
    typeof competition === 'object' && competition !== null
      ? (
          competition as {
            status?: { type?: { completed?: unknown; state?: unknown } };
          }
        ).status?.type
      : undefined;
  const state = statusType?.state;
  return {
    completed: statusType?.completed === true,
    scoreboard:
      sport === 'football'
        ? liveFootballScoreboardFromEspn(value)
        : basketballBoardFromCyclonesSummary(value, sport, poll),
    state:
      state === 'in' || state === 'post' || state === 'pre' ? state : undefined,
  };
}

// previousBoard is the basketball board last applied from a summary for this game.
export async function fetchLiveCyclonesSummary(
  gamePk: number,
  sport: CyclonesSport,
  previousBoard?: BasketballBoardModel,
): Promise<LiveCyclonesSummary | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/${SUMMARY_PATHS[sport]}/summary?event=${gamePk}`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      return undefined;
    }
    const document: unknown = await response.json();
    return liveCyclonesSummaryFromEspn(document, sport, {
      now: Date.now(),
      previous: previousBoard,
    });
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
