import type { BasketballCapabilityFlags } from '../../scoreboards/basketball/types.ts';
import { gameHasScore } from '../../team/engine/scoreHeader.ts';
import type { LiveBoard, TeamGame } from '../../team/engine/types.ts';
import type { LeagueAdapter } from '../types.ts';
import type { BasketballAdapterKey } from './basketballRules.ts';
import { ESPN_ADAPTER_ROWS, type EspnAdapterRow } from './rows.ts';
import { fetchEspnSchedule } from './schedule.ts';
import {
  basketballBoardFromEspnEvent,
  basketballBoardFromEspnSummary,
  fetchLiveEspnSummary,
  gameWithLiveSummary,
  periodBoardFromEspn,
  periodBoardFromHarness,
} from './summary.ts';
import { fetchEspnWinChance } from './winChance.ts';

// The last basketball board applied from a summary of this game: its plays length and player cells
// let the parser hold those cells across a shorter plays array for up to 30 s.
function summaryBoard(board: LiveBoard | undefined) {
  return board?.kind === 'basketball' && board.source === 'summary'
    ? board
    : undefined;
}

function boardFromEvent(row: EspnAdapterRow) {
  return (event: unknown, polledAt: number): TeamGame['board'] =>
    row.scoreboard === 'basketball'
      ? basketballBoardFromEspnEvent(
          event,
          row.key as BasketballAdapterKey,
          polledAt,
        )
      : periodBoardFromEspn(event);
}

export function espnAdapter(row: EspnAdapterRow): LeagueAdapter {
  return {
    fetchLive: async (game, previousBoard) => {
      const summary = await fetchLiveEspnSummary(
        row,
        game.gameId,
        summaryBoard(previousBoard),
      );
      if (!summary) {
        return undefined;
      }
      return {
        apply: (shown) => gameWithLiveSummary(shown, summary),
        board: summary.scoreboard,
        final: summary.completed || summary.state === 'post',
      };
    },
    fetchSchedule: (team, now) =>
      fetchEspnSchedule(row, team, now, boardFromEvent(row)),
    fetchWinChance: (game, _team, live) =>
      fetchEspnWinChance(
        row.corePath,
        game.gameId,
        game.isHome,
        live,
        gameHasScore(game),
      ),
    harnessBoard: (value, flags) =>
      row.scoreboard === 'basketball'
        ? basketballBoardFromEspnSummary(
            value,
            row.key as BasketballAdapterKey,
            { now: Date.now() },
            flags as Partial<BasketballCapabilityFlags> | undefined,
          )
        : periodBoardFromHarness(value),
    key: row.key,
    scoreboard: row.scoreboard,
  };
}

export const ESPN_ADAPTERS: readonly LeagueAdapter[] =
  ESPN_ADAPTER_ROWS.map(espnAdapter);
