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

export type LiveBasketballScoreboard = {
  away: PeriodSideScore;
  clock: string;
  home: PeriodSideScore;
  kind: 'basketball';
  period: number;
  status: string;
};

const SUMMARY_TIMEOUT_MS = 6_000;

const SUMMARY_PATHS: Record<CyclonesSport, string> = {
  football: 'football/college-football',
  'mens-basketball': 'basketball/mens-college-basketball',
  'womens-basketball': 'basketball/womens-college-basketball',
};

function finiteCount(value: unknown): number | undefined {
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

export function liveBasketballScoreboardFromEspn(
  value: unknown,
): LiveBasketballScoreboard | undefined {
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

  return {
    away: sides.away,
    clock,
    home: sides.home,
    kind: 'basketball',
    period,
    status,
  };
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

export function liveBasketballScoreboardFromHarness(
  value: unknown,
): LiveBasketballScoreboard | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const board = value as Partial<LiveBasketballScoreboard> & {
    away?: { points?: unknown; periods?: unknown };
    home?: { points?: unknown; periods?: unknown };
  };
  if (
    typeof board.status !== 'string' ||
    typeof board.clock !== 'string' ||
    typeof board.period !== 'number' ||
    !Array.isArray(board.away?.periods) ||
    !Array.isArray(board.home?.periods)
  ) {
    return undefined;
  }

  const awayPoints = finiteCount(board.away.points);
  const homePoints = finiteCount(board.home.points);
  if (awayPoints === undefined || homePoints === undefined) {
    return undefined;
  }

  return {
    away: {
      periods: board.away.periods.map((period) => finiteCount(period)),
      points: awayPoints,
    },
    clock: board.clock,
    home: {
      periods: board.home.periods.map((period) => finiteCount(period)),
      points: homePoints,
    },
    kind: 'basketball',
    period: Math.max(0, Math.trunc(board.period)),
    status: board.status,
  };
}

export async function fetchLiveCyclonesScoreboard(
  gamePk: number,
  sport: CyclonesSport,
): Promise<LiveBasketballScoreboard | LiveFootballScoreboard | undefined> {
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
    const document = await response.json();
    return sport === 'football'
      ? liveFootballScoreboardFromEspn(document)
      : liveBasketballScoreboardFromEspn(document);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
