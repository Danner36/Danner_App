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

export type MlbGameStatus = {
  abstractGameState?: string;
  codedGameState?: string;
  detailedState?: string;
  startTimeTBD?: boolean;
  statusCode?: string;
};

/** One five-second poll of the featured game: MLB's status, score, and scoreboard. */
export type LiveGameReport = {
  awayScore?: number;
  homeScore?: number;
  scoreboard?: LiveScoreboard;
  status: MlbGameStatus;
};

export type LiveGameIdentity = {
  gameDate: string;
  gamePk: number;
  officialDate: string;
};

type ParsedLinescore = LiveScoreboard & {
  batterId?: number;
  pitcherId?: number;
};

type ParsedLiveGame = Omit<LiveGameReport, 'scoreboard'> & {
  linescore?: ParsedLinescore;
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

function statusFromMlb(value: unknown): MlbGameStatus {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  const status = value as Record<string, unknown>;
  const text = (field: unknown) =>
    typeof field === 'string' && field ? field : undefined;
  return {
    abstractGameState: text(status.abstractGameState),
    codedGameState: text(status.codedGameState),
    detailedState: text(status.detailedState),
    startTimeTBD:
      typeof status.startTimeTBD === 'boolean' ? status.startTimeTBD : undefined,
    statusCode: text(status.statusCode),
  };
}

function sideScore(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  return finiteCount((value as { score?: unknown }).score);
}

/**
 * Picks the featured game's entry from `schedule?gamePk=`. A postponed or suspended game
 * appears under each date it was scheduled with the same gamePk, so the entry that shares
 * the official date wins, then the one starting closest to the featured start time. MLB
 * moves a postponed entry's official date to the makeup date, so an entry with another
 * official date still answers when it is the only one.
 */
export function liveGameFromSchedule(
  value: unknown,
  game: LiveGameIdentity,
): ParsedLiveGame | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const dates = (value as { dates?: unknown }).dates;
  if (!Array.isArray(dates)) {
    return undefined;
  }

  const targetMs = new Date(game.gameDate).getTime();
  let best: Record<string, unknown> | undefined;
  let bestRank: [number, number] = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ];
  for (const date of dates) {
    const games =
      typeof date === 'object' && date !== null
        ? (date as { games?: unknown }).games
        : undefined;
    if (!Array.isArray(games)) {
      continue;
    }
    for (const entry of games) {
      if (typeof entry !== 'object' || entry === null) {
        continue;
      }
      const candidate = entry as Record<string, unknown>;
      if (candidate.gamePk !== game.gamePk) {
        continue;
      }
      const otherDate =
        candidate.officialDate !== undefined &&
        candidate.officialDate !== game.officialDate
          ? 1
          : 0;
      const startMs =
        typeof candidate.gameDate === 'string'
          ? new Date(candidate.gameDate).getTime()
          : Number.NaN;
      const distance = Number.isNaN(startMs)
        ? Number.MAX_VALUE
        : Math.abs(startMs - targetMs);
      if (
        otherDate < bestRank[0] ||
        (otherDate === bestRank[0] && distance <= bestRank[1])
      ) {
        best = candidate;
        bestRank = [otherDate, distance];
      }
    }
  }
  if (!best) {
    return undefined;
  }
  // Without MLB's game state the report cannot move the card between pre-game, Live, and
  // Final, so it is dropped.
  const status = statusFromMlb(best.status);
  if (!status.abstractGameState) {
    return undefined;
  }

  const teams =
    typeof best.teams === 'object' && best.teams !== null
      ? (best.teams as { away?: unknown; home?: unknown })
      : {};
  return {
    awayScore: sideScore(teams.away),
    homeScore: sideScore(teams.home),
    linescore: liveScoreboardFromMlb(best.linescore),
    status,
  };
}

export async function fetchLiveGameReport(
  game: LiveGameIdentity,
): Promise<LiveGameReport | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    LINESCORE_TIMEOUT_MS,
  );

  try {
    const query = new URLSearchParams({
      gamePk: String(game.gamePk),
      hydrate: 'linescore',
    });
    const response = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?${query}`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      return undefined;
    }

    const parsed = liveGameFromSchedule(await response.json(), game);
    if (!parsed) {
      return undefined;
    }
    return {
      awayScore: parsed.awayScore,
      homeScore: parsed.homeScore,
      scoreboard: parsed.linescore
        ? await withJerseyNumbers(parsed.linescore)
        : undefined,
      status: parsed.status,
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
