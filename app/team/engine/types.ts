import type { AdapterKey, SportKey } from '../../leagues/types.ts';
import type { LiveBoard } from '../../scoreboards/types.ts';

export type { LiveBoard } from '../../scoreboards/types.ts';

export type ScoreboardKind = 'baseball' | 'periods' | 'basketball';

export type TeamGame = {
  abstractState: string;
  adapter: AdapterKey;
  board?: LiveBoard;
  gameDate: string;
  // ESPN event id or MLB gamePk.
  gameId: string;
  // MLB doubleheader number; 1 for ESPN.
  gameNumber: number;
  isHome: boolean;
  // `${adapter}:${gameId}:${officialDate}`.
  key: string;
  neutralSite: boolean;
  notes: string;
  // Hidden matching key: the MLB official date, or the America/New_York date of an ESPN start.
  officialDate: string;
  opponentName: string;
  opponentScore: number;
  scoreboard: ScoreboardKind;
  // False when ESPN sent a score that does not parse; such a Final stays out of the record.
  scoresKnown: boolean;
  // The schedule list the game came from: 1 preseason, 2 regular season, 3 postseason.
  seasonType: number;
  sport?: SportKey;
  status: string;
  teamScore: number;
  timeValid: boolean;
};

export type TeamRecord = {
  losses: number;
  ties: number;
  wins: number;
};

export type SportStatusKind =
  | 'awaiting-next'
  | 'eliminated'
  | 'season-complete'
  | 'won-tournament';

export type SportStatus = {
  kind: SportStatusKind;
  label: string;
};

export type TeamSnapshot = {
  // Pro tiles hold at most one card. School tiles hold one card per game: Live games, then today's
  // games that have not finished, then today's finals, each group in start order.
  featuredGames: TeamGame[];
  records: Partial<Record<AdapterKey, TeamRecord>>;
  statuses: Partial<Record<AdapterKey, SportStatus>>;
  unavailable?: AdapterKey[];
  upcomingGames: TeamGame[];
};

export type GameInterruption =
  | 'canceled'
  | 'delayed'
  | 'postponed'
  | 'suspended';

export type RecapResult = 'LOSS' | 'TIE' | 'WIN';
