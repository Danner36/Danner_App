export type FootballSideScore = {
  points: number;
  quarters: Array<number | undefined>;
};

export type LiveFootballScoreboard = {
  away: FootballSideScore;
  clock: string;
  down?: number;
  distance?: number;
  home: FootballSideScore;
  period: number;
  possessionTeamId?: number;
  situation?: string;
  status: string;
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

function quarterValues(value: unknown): Array<number | undefined> {
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
): FootballSideScore | undefined {
  const total = finiteCount(points);
  if (total === undefined) {
    return undefined;
  }
  return {
    points: total,
    quarters: quarterValues(linescores),
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

export function liveScoreboardFromEspn(
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
  const competitors = Array.isArray(contest.competitors)
    ? contest.competitors
    : [];
  let away: FootballSideScore | undefined;
  let home: FootballSideScore | undefined;
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
    away,
    clock,
    down: finiteCount(situationRecord?.down),
    distance: finiteCount(situationRecord?.distance),
    home,
    period,
    possessionTeamId:
      possessionTeamId && possessionTeamId > 0 ? possessionTeamId : undefined,
    situation: situationText(situation),
    status,
  };
}

export function liveScoreboardFromHarness(
  value: unknown,
): LiveFootballScoreboard | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const board = value as Partial<LiveFootballScoreboard>;
  if (
    typeof board.status !== 'string' ||
    typeof board.clock !== 'string' ||
    typeof board.period !== 'number' ||
    typeof board.away !== 'object' ||
    board.away === null ||
    typeof board.home !== 'object' ||
    board.home === null ||
    !Array.isArray(board.away.quarters) ||
    !Array.isArray(board.home.quarters)
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
      points: awayPoints,
      quarters: board.away.quarters.map((quarter) => finiteCount(quarter)),
    },
    clock: board.clock,
    down: finiteCount(board.down),
    distance: finiteCount(board.distance),
    home: {
      points: homePoints,
      quarters: board.home.quarters.map((quarter) => finiteCount(quarter)),
    },
    period: Math.max(0, Math.trunc(board.period)),
    possessionTeamId: finiteCount(board.possessionTeamId),
    situation:
      typeof board.situation === 'string' ? board.situation : undefined,
    status: board.status,
  };
}

export async function fetchLiveFootballScoreboard(
  gamePk: number,
): Promise<LiveFootballScoreboard | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${gamePk}`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      return undefined;
    }
    return liveScoreboardFromEspn(await response.json());
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
