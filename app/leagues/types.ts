import type {
  LiveBoard,
  ScoreboardKind,
  TeamGame,
  TeamRecord,
} from '../team/engine/types.ts';
import type { WinChance } from './espn/winChance.ts';

export type LeagueKey =
  | 'mlb'
  | 'nfl'
  | 'nba'
  | 'wnba'
  | 'nhl'
  | 'mls'
  | 'nwsl'
  | 'ncaa';
export type SportKey = 'football' | 'mens-basketball' | 'womens-basketball';
export type AdapterKey = Exclude<LeagueKey, 'ncaa'> | `ncaa/${SportKey}`;
export type TeamKey = string; // '<league>-<espnId>'

// Snapshot of catalog display data, refreshed by key.
export type TeamRef = {
  espnId: string;
  name: string;
  nickname: string;
  location: string;
  abbreviation: string;
  color?: string;
  alternateColor?: string;
  logo?: string;
  conference?: string;
  statsapi?: { teamId: number; leagueId: 103 | 104 };
};

// One adapter's schedule. `complete` is false when any list failed, and `answered` is false when
// no list came back at all.
export type AdapterSchedule = {
  adapter: AdapterKey;
  answered: boolean;
  complete: boolean;
  games: TeamGame[];
  record?: TeamRecord;
};

// One five-second poll. `apply` moves the shown game forward; `board` is set when the poll carried
// one; `final` asks for a schedule refresh.
export type LivePoll = {
  apply: (game: TeamGame) => TeamGame;
  board?: LiveBoard;
  final: boolean;
};

export type LeagueAdapter = {
  fetchLive: (
    game: TeamGame,
    previousBoard?: LiveBoard,
  ) => Promise<LivePoll | undefined>;
  fetchSchedule: (team: TeamRef, now: Date) => Promise<AdapterSchedule>;
  fetchWinChance: (
    game: TeamGame,
    team: TeamRef,
    live: boolean,
  ) => Promise<WinChance | undefined>;
  // Parses a fixture board; a harness-only path behind the development test URL.
  harnessBoard: (
    value: unknown,
    flags?: Record<string, boolean>,
  ) => LiveBoard | undefined;
  key: AdapterKey;
  scoreboard: ScoreboardKind;
};
