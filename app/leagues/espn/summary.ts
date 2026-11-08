import { abstractStateRank } from '../../team/engine/liveMerge.ts';
import type { LiveBoard, TeamGame } from '../../team/engine/types.ts';
import type {
  BasketballBoardModel,
  BasketballCapabilityFlags,
} from '../../scoreboards/basketball/types.ts';
import type { PeriodBoard, PeriodSideScore } from '../../scoreboards/types.ts';
import {
  basketballBoardFromScheduleEvent,
  basketballBoardFromSummary,
  type BasketballBoardPoll,
} from './basketballBoard.ts';
import {
  basketballRulesFor,
  type BasketballAdapterKey,
} from './basketballRules.ts';
import { abstractStateFromEspn } from './game.ts';
import type { EspnAdapterRow } from './rows.ts';
import { fetchEspnJson } from './winChance.ts';

export type EspnGameState = 'in' | 'post' | 'pre';

export type LiveEspnSummary = {
  completed: boolean;
  scoreboard?: LiveBoard;
  state?: EspnGameState;
};

const SUMMARY_TIMEOUT_MS = 6_000;

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
  // ESPN's long text already ends with the spot of the ball, which is the possession text.
  const parts =
    possession && downDistance.includes(possession)
      ? [downDistance]
      : [downDistance, possession];
  const text = parts.filter(Boolean).join(' · ');
  return text || undefined;
}

// The Core situation names the team with the ball only as a link to the team.
function teamIdFromRef(team: unknown): number | undefined {
  const ref = (team as { $ref?: unknown } | null | undefined)?.$ref;
  const match = typeof ref === 'string' ? /\/teams\/(\d+)/.exec(ref) : null;
  return match ? Number(match[1]) : undefined;
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

export function periodBoardFromEspn(value: unknown): PeriodBoard | undefined {
  const competition = competitionFromDocument(value);
  if (typeof competition !== 'object' || competition === null) {
    return undefined;
  }

  const contest = competition as {
    competitors?: unknown[];
    situation?: unknown;
    status?: {
      displayClock?: unknown;
      period?: unknown;
      type?: { detail?: unknown; shortDetail?: unknown };
    };
  };
  const competitors = Array.isArray(contest.competitors)
    ? contest.competitors
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

  const document =
    typeof value === 'object' && value !== null
      ? (value as { situation?: unknown })
      : undefined;
  // The live poll adds the Core situation at the top level; schedule competitions carry it on the
  // competition instead.
  const situation = document?.situation ?? contest.situation;
  const situationRecord =
    typeof situation === 'object' && situation !== null
      ? (situation as {
          distance?: unknown;
          down?: unknown;
          possession?: unknown;
          team?: unknown;
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
  const possessionTeamId =
    finiteCount(situationRecord?.possession) ??
    teamIdFromRef(situationRecord?.team);

  return {
    away,
    clock,
    distance: finiteCount(situationRecord?.distance),
    down: finiteCount(situationRecord?.down),
    home,
    kind: 'periods',
    period,
    possessionTeamId:
      possessionTeamId && possessionTeamId > 0 ? possessionTeamId : undefined,
    situation: situationText(situation),
    status,
  };
}

export function periodBoardFromHarness(value: unknown): PeriodBoard | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const board = value as Partial<PeriodBoard> & {
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
    kind: 'periods',
    period: Math.max(0, Math.trunc(board.period)),
    possessionTeamId: finiteCount(board.possessionTeamId),
    situation: typeof board.situation === 'string' ? board.situation : undefined,
    status: board.status,
  };
}

// Arena board from an ESPN summary with the adapter's rules row; flagOverrides replace that row's
// capability flags (the development harness only). poll.now is stored as stale.polledAt.
export function basketballBoardFromEspnSummary(
  value: unknown,
  adapter: BasketballAdapterKey,
  poll: BasketballBoardPoll,
  flagOverrides?: Partial<BasketballCapabilityFlags>,
): BasketballBoardModel | undefined {
  const board = basketballBoardFromSummary(
    value,
    basketballRulesFor(adapter, flagOverrides),
    poll,
  );
  return board
    ? { ...board, stale: { ...board.stale, polledAt: poll.now } }
    : undefined;
}

// Arena board from an ESPN schedule event: scores, clock and period, with the adapter's regulation
// periods. polledAt is stored as stale.polledAt.
export function basketballBoardFromEspnEvent(
  event: unknown,
  adapter: BasketballAdapterKey,
  polledAt: number,
): BasketballBoardModel | undefined {
  const board = basketballBoardFromScheduleEvent(
    event,
    basketballRulesFor(adapter),
  );
  return board ? { ...board, stale: { ...board.stale, polledAt } } : undefined;
}

// Away and home points and the status line of a live board. Undefined points leave the card's
// score as it is.
export function boardTotals(board: LiveBoard): {
  away?: number;
  home?: number;
  status?: string;
} {
  if (board.kind === 'periods') {
    return {
      away: board.away.points,
      home: board.home.points,
      status: board.status,
    };
  }
  if (board.kind === 'basketball') {
    return {
      away: board.away.score,
      home: board.home.score,
      status: board.statusDetail,
    };
  }
  return { away: board.away.runs, home: board.home.runs, status: board.status };
}

function boardFromSummary(
  value: unknown,
  row: EspnAdapterRow,
  poll: BasketballBoardPoll,
): LiveBoard | undefined {
  return row.scoreboard === 'basketball'
    ? basketballBoardFromEspnSummary(
        value,
        row.key as BasketballAdapterKey,
        poll,
      )
    : periodBoardFromEspn(value);
}

// poll applies to basketball: its time stamps the board, and its previous board lets player cells
// carry across a shorter plays array.
export function liveSummaryFromEspn(
  value: unknown,
  row: EspnAdapterRow,
  poll: BasketballBoardPoll = { now: Date.now() },
): LiveEspnSummary | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
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
    scoreboard: boardFromSummary(value, row, poll),
    state:
      state === 'pre' || state === 'in' || state === 'post' ? state : undefined,
  };
}

// Applies one five-second summary poll. The state only moves forward, so a stale cached summary
// cannot put a finished game back on the live board, and a summary that still reports pre-game
// leaves scores and status alone. A post-game summary without a board has no score or status to
// show (ESPN also reports postponed and canceled games as post), so Final then waits for the
// schedule refresh the poll starts.
export function gameWithLiveSummary(
  game: TeamGame,
  summary: LiveEspnSummary,
): TeamGame {
  const polledState =
    summary.state !== undefined || summary.completed
      ? abstractStateFromEspn(summary.state, summary.completed)
      : game.abstractState;
  const polledRank = abstractStateRank(polledState);
  const currentRank = abstractStateRank(game.abstractState);
  if (polledRank < currentRank) {
    return game;
  }
  const board = polledRank > 0 ? summary.scoreboard : undefined;
  if (!board) {
    return polledState === 'Live' && currentRank === 0
      ? { ...game, abstractState: polledState }
      : game;
  }
  const totals = boardTotals(board);
  return {
    ...game,
    abstractState: polledState,
    board,
    opponentScore:
      (game.isHome ? totals.away : totals.home) ?? game.opponentScore,
    scoresKnown: true,
    status: totals.status || (summary.completed ? 'Final' : game.status),
    teamScore: (game.isHome ? totals.home : totals.away) ?? game.teamScore,
  };
}

export async function fetchLiveEspnSummary(
  row: EspnAdapterRow,
  gameId: string,
  previousBoard?: BasketballBoardModel,
): Promise<LiveEspnSummary | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT_MS);

  // The football summary has no down, distance, or team with the ball. A failed request leaves the
  // board without them.
  const situationRequest =
    row.scoreboard === 'periods'
      ? fetchEspnJson(
          `https://sports.core.api.espn.com/v2/sports/${row.corePath}/events/${gameId}/competitions/${gameId}/situation`,
        )
      : Promise.resolve(undefined);

  try {
    const response = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/${row.sitePath}/summary?event=${gameId}`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      return undefined;
    }
    const [summary, situation] = await Promise.all([
      response.json() as Promise<unknown>,
      situationRequest,
    ]);
    const document =
      typeof summary === 'object' && summary !== null && situation !== undefined
        ? { situation, ...summary }
        : summary;
    return liveSummaryFromEspn(document, row, {
      now: Date.now(),
      previous: previousBoard,
    });
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
