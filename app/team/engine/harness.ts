import { isSportKey } from '../../leagues/sports.ts';
import type {
  AdapterKey,
  LeagueAdapter,
  SportKey,
} from '../../leagues/types.ts';
import { adapterKeysForTile } from '../../selection/presets.ts';
import type { Tile } from '../../selection/types.ts';
import { adapterRecords, emptyRecord, snapshotFromGames } from './featured.ts';
import type { TeamGame, TeamRecord, TeamSnapshot } from './types.ts';

// Parses the development fixture server's games, behind the development test URL.

type HarnessValue = Partial<
  Omit<TeamGame, 'adapter' | 'board' | 'key' | 'scoreboard'>
> & {
  board?: unknown;
};

function adapterForGame(tile: Tile, sport: SportKey | undefined): AdapterKey | undefined {
  if (tile.kind === 'pro') {
    return tile.league;
  }
  return sport && tile.sports.includes(sport) ? `ncaa/${sport}` : undefined;
}

export function teamGameFromHarness(
  value: unknown,
  tile: Tile,
): (TeamGame & { rawBoard?: unknown }) | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const game = value as HarnessValue;
  const sport = isSportKey(game.sport) ? game.sport : undefined;
  const adapter = adapterForGame(tile, sport);
  if (
    !adapter ||
    typeof game.abstractState !== 'string' ||
    typeof game.gameId !== 'string' ||
    typeof game.gameDate !== 'string' ||
    Number.isNaN(new Date(game.gameDate).getTime()) ||
    typeof game.gameNumber !== 'number' ||
    !Number.isInteger(game.gameNumber) ||
    typeof game.status !== 'string' ||
    typeof game.isHome !== 'boolean' ||
    typeof game.teamScore !== 'number' ||
    typeof game.opponentName !== 'string' ||
    typeof game.opponentScore !== 'number' ||
    typeof game.officialDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(game.officialDate)
  ) {
    return undefined;
  }

  const parsed: TeamGame & { rawBoard?: unknown } = {
    abstractState: game.abstractState,
    adapter,
    gameDate: game.gameDate,
    gameId: game.gameId,
    gameNumber: game.gameNumber,
    isHome: game.isHome,
    key: `${adapter}:${game.gameId}:${game.officialDate}`,
    neutralSite: game.neutralSite === true,
    notes: typeof game.notes === 'string' ? game.notes : '',
    officialDate: game.officialDate,
    opponentName: game.opponentName,
    opponentScore: game.opponentScore,
    scoreboard:
      adapter === 'mlb'
        ? 'baseball'
        : adapter === 'nfl' || adapter === 'ncaa/football'
          ? 'periods'
          : 'basketball',
    scoresKnown: true,
    seasonType:
      typeof game.seasonType === 'number' && Number.isInteger(game.seasonType)
        ? game.seasonType
        : 2,
    status: game.status,
    teamScore: game.teamScore,
    timeValid: game.timeValid !== false,
  };
  if (sport) {
    parsed.sport = sport;
  }
  if (game.board !== undefined && game.board !== null) {
    parsed.rawBoard = game.board;
  }
  return parsed;
}

export type HarnessContext = {
  adapterFor: (key: AdapterKey) => LeagueAdapter | undefined;
  now?: Date;
  tile: Tile;
};

// A fixture board is parsed by the adapter's own parser with the fixture's capability flags; a game
// whose board does not parse is dropped.
function withBoard(
  parsed: (TeamGame & { rawBoard?: unknown }) | undefined,
  context: HarnessContext,
  flags: Record<string, boolean> | undefined,
): TeamGame | undefined {
  if (!parsed) {
    return undefined;
  }
  const { rawBoard, ...game } = parsed;
  if (rawBoard === undefined) {
    return game;
  }
  const board = context.adapterFor(game.adapter)?.harnessBoard(rawBoard, flags);
  return board ? { ...game, board } : undefined;
}

export function teamSnapshotFromHarness(
  value: unknown,
  context: HarnessContext,
): TeamSnapshot {
  const document = (value ?? {}) as {
    boardFlags?: unknown;
    liveGame?: unknown;
    records?: Partial<Record<AdapterKey, TeamRecord>>;
    upcomingGames?: unknown;
  };
  const flags =
    typeof document.boardFlags === 'object' && document.boardFlags !== null
      ? (document.boardFlags as Record<string, boolean>)
      : undefined;
  const liveGame = withBoard(
    teamGameFromHarness(document.liveGame, context.tile),
    context,
    flags,
  );
  if (document.liveGame !== undefined && !liveGame) {
    throw new Error('The test fixture is invalid.');
  }
  const upcomingGames = Array.isArray(document.upcomingGames)
    ? document.upcomingGames
        .map((entry) =>
          withBoard(teamGameFromHarness(entry, context.tile), context, flags),
        )
        .filter((game): game is TeamGame => Boolean(game))
    : [];
  const games = liveGame ? [liveGame, ...upcomingGames] : upcomingGames;

  const adapters = adapterKeysForTile(context.tile);
  const records = adapterRecords(games, adapters);
  for (const adapter of adapters) {
    records[adapter] =
      document.records?.[adapter] ?? records[adapter] ?? emptyRecord();
  }

  return snapshotFromGames(games, records, {
    conference: context.tile.team.conference,
    now: context.now,
    perGameCards: context.tile.kind === 'school',
  });
}
