export type ScoreboardTotals = {
  errors: number;
  hits: number;
  runs: number;
};

export type ScoreboardInning = {
  away?: number;
  home?: number;
  num: number;
};

export type LiveScoreboard = {
  away: ScoreboardTotals;
  balls: number;
  batterNumber?: string;
  home: ScoreboardTotals;
  innings: ScoreboardInning[];
  outs: number;
  pitcherNumber?: string;
  status: string;
  strikes: number;
};

type ParsedLinescore = LiveScoreboard & {
  batterId?: number;
  pitcherId?: number;
};

const JERSEY_CACHE = new Map<number, string>();
const LINESCORE_TIMEOUT_MS = 6_000;

function finiteCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : undefined;
}

function totalsFromSide(value: unknown): ScoreboardTotals | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const side = value as { errors?: unknown; hits?: unknown; runs?: unknown };
  return {
    errors: finiteCount(side.errors) ?? 0,
    hits: finiteCount(side.hits) ?? 0,
    runs: finiteCount(side.runs) ?? 0,
  };
}

function playerId(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const id = (value as { id?: unknown }).id;
  return typeof id === 'number' && Number.isInteger(id) ? id : undefined;
}

function inningRuns(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  return finiteCount((value as { runs?: unknown }).runs);
}

export function liveScoreboardFromMlb(
  value: unknown,
): ParsedLinescore | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const linescore = value as {
    balls?: unknown;
    currentInningOrdinal?: unknown;
    defense?: { pitcher?: unknown };
    inningState?: unknown;
    innings?: unknown;
    offense?: { batter?: unknown };
    outs?: unknown;
    strikes?: unknown;
    teams?: { away?: unknown; home?: unknown };
  };
  const away = totalsFromSide(linescore.teams?.away);
  const home = totalsFromSide(linescore.teams?.home);
  if (!away || !home) {
    return undefined;
  }

  const rawInnings = Array.isArray(linescore.innings)
    ? linescore.innings
    : [];
  const innings: ScoreboardInning[] = [];
  for (const entry of rawInnings) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const num = finiteCount((entry as { num?: unknown }).num);
    if (num === undefined || num < 1) {
      continue;
    }
    innings.push({
      away: inningRuns((entry as { away?: unknown }).away),
      home: inningRuns((entry as { home?: unknown }).home),
      num,
    });
  }

  const inningState =
    typeof linescore.inningState === 'string' ? linescore.inningState : '';
  const inningOrdinal =
    typeof linescore.currentInningOrdinal === 'string'
      ? linescore.currentInningOrdinal
      : '';
  const status = [inningState, inningOrdinal].filter(Boolean).join(' ');

  return {
    away,
    balls: Math.min(4, finiteCount(linescore.balls) ?? 0),
    batterId: playerId(linescore.offense?.batter),
    home,
    innings,
    outs: Math.min(3, finiteCount(linescore.outs) ?? 0),
    pitcherId: playerId(linescore.defense?.pitcher),
    status: status || 'Live',
    strikes: Math.min(3, finiteCount(linescore.strikes) ?? 0),
  };
}

async function jerseyForPlayer(id: number): Promise<string | undefined> {
  const cached = JERSEY_CACHE.get(id);
  if (cached !== undefined) {
    return cached;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LINESCORE_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://statsapi.mlb.com/api/v1/people/${id}`,
      { headers: { Accept: 'application/json' }, signal: controller.signal },
    );
    if (!response.ok) {
      return undefined;
    }
    const document = (await response.json()) as {
      people?: Array<{ primaryNumber?: unknown }>;
    };
    const number = document.people?.[0]?.primaryNumber;
    if (typeof number !== 'string' || !number.trim()) {
      return undefined;
    }
    const jersey = number.trim();
    JERSEY_CACHE.set(id, jersey);
    return jersey;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

async function withJerseyNumbers(
  board: ParsedLinescore,
): Promise<LiveScoreboard> {
  const [batterNumber, pitcherNumber] = await Promise.all([
    board.batterId ? jerseyForPlayer(board.batterId) : undefined,
    board.pitcherId ? jerseyForPlayer(board.pitcherId) : undefined,
  ]);

  return {
    away: board.away,
    balls: board.balls,
    batterNumber: batterNumber ?? board.batterNumber,
    home: board.home,
    innings: board.innings,
    outs: board.outs,
    pitcherNumber: pitcherNumber ?? board.pitcherNumber,
    status: board.status,
    strikes: board.strikes,
  };
}

export function liveScoreboardFromHarness(
  value: unknown,
): LiveScoreboard | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const board = value as Partial<LiveScoreboard>;
  if (
    typeof board.balls !== 'number' ||
    typeof board.strikes !== 'number' ||
    typeof board.outs !== 'number' ||
    typeof board.status !== 'string' ||
    typeof board.away !== 'object' ||
    board.away === null ||
    typeof board.home !== 'object' ||
    board.home === null ||
    !Array.isArray(board.innings)
  ) {
    return undefined;
  }

  const innings: ScoreboardInning[] = [];
  for (const inning of board.innings) {
    if (typeof inning !== 'object' || inning === null) {
      continue;
    }
    const num = finiteCount((inning as ScoreboardInning).num);
    if (num === undefined) {
      continue;
    }
    innings.push({
      away: finiteCount((inning as ScoreboardInning).away),
      home: finiteCount((inning as ScoreboardInning).home),
      num,
    });
  }

  return {
    away: {
      errors: finiteCount(board.away.errors) ?? 0,
      hits: finiteCount(board.away.hits) ?? 0,
      runs: finiteCount(board.away.runs) ?? 0,
    },
    balls: Math.min(4, finiteCount(board.balls) ?? 0),
    batterNumber:
      typeof board.batterNumber === 'string' ? board.batterNumber : undefined,
    home: {
      errors: finiteCount(board.home.errors) ?? 0,
      hits: finiteCount(board.home.hits) ?? 0,
      runs: finiteCount(board.home.runs) ?? 0,
    },
    innings,
    outs: Math.min(3, finiteCount(board.outs) ?? 0),
    pitcherNumber:
      typeof board.pitcherNumber === 'string'
        ? board.pitcherNumber
        : undefined,
    status: board.status,
    strikes: Math.min(3, finiteCount(board.strikes) ?? 0),
  };
}

export async function fetchLiveScoreboard(
  gamePk: number,
): Promise<LiveScoreboard | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    LINESCORE_TIMEOUT_MS,
  );

  try {
    const response = await fetch(
      `https://statsapi.mlb.com/api/v1/game/${gamePk}/linescore`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      return undefined;
    }

    const parsed = liveScoreboardFromMlb(await response.json());
    if (!parsed) {
      return undefined;
    }
    return withJerseyNumbers(parsed);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
