import { localDateString } from '../../team/engine/dates.ts';
import { gameHasScore } from '../../team/engine/scoreHeader.ts';
import type { TeamGame, TeamRecord } from '../../team/engine/types.ts';
import { fetchEspnJson, fetchEspnWinChance } from '../espn/winChance.ts';
import type { AdapterSchedule, LeagueAdapter, TeamRef } from '../types.ts';
import { abstractStateFromMlb, gameWithLiveReport, teamGameFromMlb } from './game.ts';
import {
  baseballBoardFromHarness,
  baseballBoardFromMlb,
  fetchLiveGameReport,
} from './linescore.ts';

const SNAPSHOT_FETCH_TIMEOUT_MS = 10_000;
const ESPN_MLB_CORE_PATH = 'baseball/leagues/mlb';
const ESPN_SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard';
const START_TIME_TOLERANCE_MS = 30 * 60_000;

// ESPN event ids by game key, found once from the scoreboard of the official date.
const espnEventIds = new Map<string, string>();

async function fetchMlbSchedule(
  team: TeamRef,
  now: Date,
): Promise<AdapterSchedule> {
  const teamId = team.statsapi?.teamId;
  const leagueId = team.statsapi?.leagueId;
  if (teamId === undefined || leagueId === undefined) {
    return { adapter: 'mlb', answered: false, complete: false, games: [] };
  }

  const scheduleStart = new Date(now);
  scheduleStart.setDate(scheduleStart.getDate() - 1);
  const season = now.getFullYear();
  const scheduleEnd = new Date(season, 11, 31);
  const scheduleQuery = new URLSearchParams({
    endDate: localDateString(scheduleEnd),
    hydrate: 'linescore,team',
    sportId: '1',
    startDate: localDateString(scheduleStart),
    teamId: String(teamId),
  });
  const standingsQuery = new URLSearchParams({
    hydrate: 'team',
    leagueId: String(leagueId),
    season: String(season),
    standingsTypes: 'regularSeason',
  });

  // One budget for the pair: without it a hung statsapi leaves the load unsettled, so the refresh
  // spinner never clears and the 60 s poll stacks more requests behind it.
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    SNAPSHOT_FETCH_TIMEOUT_MS,
  );
  let schedule: { dates?: Array<{ games?: unknown[] }> };
  let standings: {
    records?: Array<{
      teamRecords?: Array<{
        losses?: number;
        team?: { id?: number };
        wins?: number;
      }>;
    }>;
  };
  try {
    const [scheduleResponse, standingsResponse] = await Promise.all([
      fetch(`https://statsapi.mlb.com/api/v1/schedule?${scheduleQuery}`, {
        signal: controller.signal,
      }),
      fetch(`https://statsapi.mlb.com/api/v1/standings?${standingsQuery}`, {
        signal: controller.signal,
      }),
    ]);

    if (!scheduleResponse.ok || !standingsResponse.ok) {
      throw new Error('The schedule is unavailable.');
    }

    schedule = await scheduleResponse.json();
    standings = await standingsResponse.json();
  } finally {
    clearTimeout(timeout);
  }

  const games = (schedule.dates?.flatMap((date) => date.games ?? []) ?? [])
    .map((rawGame) => {
      const parsed = teamGameFromMlb(rawGame, team);
      if (!parsed) {
        return undefined;
      }
      const linescore =
        typeof rawGame === 'object' && rawGame !== null
          ? (rawGame as { linescore?: unknown }).linescore
          : undefined;
      const board = baseballBoardFromMlb(linescore);
      return board ? { ...parsed, board } : parsed;
    })
    .filter((game): game is TeamGame => Boolean(game));
  const teamRecord = standings.records
    ?.flatMap((record) => record.teamRecords ?? [])
    .find((record) => record.team?.id === teamId);
  const record: TeamRecord = {
    losses: teamRecord?.losses ?? 0,
    ties: 0,
    wins: teamRecord?.wins ?? 0,
  };

  return { adapter: 'mlb', answered: true, complete: true, games, record };
}

// The ESPN event for this team on that date whose start time is closest to MLB's, so each game of
// a doubleheader keeps its own prediction. Keyed by the game key, because a postponed game keeps
// its gamePk on a new date.
async function findEspnEventId(
  game: TeamGame,
  team: TeamRef,
): Promise<string | undefined> {
  const known = espnEventIds.get(game.key);
  if (known) {
    return known;
  }
  const document = (await fetchEspnJson(
    `${ESPN_SCOREBOARD_URL}?dates=${game.officialDate.replace(/-/g, '')}`,
  )) as { events?: unknown[] } | null;
  const startMs = new Date(game.gameDate).getTime();
  let best: { diff: number; id: string } | undefined;
  for (const entry of document?.events ?? []) {
    const event = entry as {
      competitions?: Array<{ competitors?: Array<{ team?: { id?: unknown } }> }>;
      date?: unknown;
      id?: unknown;
    };
    const playsTeam = event.competitions?.[0]?.competitors?.some(
      (competitor) => String(competitor.team?.id) === team.espnId,
    );
    if (!playsTeam || typeof event.id !== 'string') {
      continue;
    }
    const diff = Math.abs(new Date(String(event.date)).getTime() - startMs);
    if (Number.isFinite(diff) && (!best || diff < best.diff)) {
      best = { diff, id: event.id };
    }
  }
  if (!best || best.diff > START_TIME_TOLERANCE_MS) {
    return undefined;
  }
  espnEventIds.set(game.key, best.id);
  return best.id;
}

export const MLB_ADAPTER: LeagueAdapter = {
  fetchLive: async (game) => {
    const report = await fetchLiveGameReport({
      gameDate: game.gameDate,
      gamePk: Number(game.gameId),
      officialDate: game.officialDate,
    });
    if (!report) {
      return undefined;
    }
    return {
      apply: (shown) => gameWithLiveReport(shown, report),
      board: report.scoreboard,
      final: abstractStateFromMlb(report.status) === 'Final',
    };
  },
  fetchSchedule: fetchMlbSchedule,
  fetchWinChance: async (game, team, live) => {
    const eventId = await findEspnEventId(game, team);
    return eventId
      ? fetchEspnWinChance(
          ESPN_MLB_CORE_PATH,
          eventId,
          game.isHome,
          live,
          gameHasScore(game),
        )
      : undefined;
  },
  harnessBoard: (value) => baseballBoardFromHarness(value),
  key: 'mlb',
  scoreboard: 'baseball',
};
