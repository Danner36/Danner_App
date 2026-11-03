// Basketball arena board model, built by basketballBoardFromSummary
// (app/leagues/espn/basketballBoard.ts) and drawn by BasketballArenaBoard. Types only.

export type BoardSideKey = 'away' | 'home';

// Capability flags of one basketball adapter row (app/leagues/espn/basketballRules.ts). A flag
// that is off omits its row or cell instead of dashing it; with players off the board is the
// center panel only.
export type BasketballCapabilityFlags = {
  // Fallback 1: five `active: true` athletes stand in for a failed substitution replay.
  activeLineup: boolean;
  // BONUS and 2× BONUS pills.
  bonus: boolean;
  // LAST FOUL jersey and foul-count wells with the arrow.
  lastFoul: boolean;
  // Player tables.
  players: boolean;
  // Possession arrow in the center panel.
  possessionArrow: boolean;
  // REB column on tables of 180 dp or more.
  rebounds: boolean;
  // FOULS wells.
  teamFouls: boolean;
  // T.O.L. wells.
  timeouts: boolean;
};

export type BasketballCapabilityFlag = keyof BasketballCapabilityFlags;

// Where a table's players come from:
// - floor: the substitution replay passed its consistency check, or with activeLineup on the
//   `active: true` athletes passed theirs; captioned as on the floor.
// - topScorers: the check failed; the five top scorers, never captioned as on the floor.
// - starters: no play yet; the five starters.
// - unavailable: no player data; dash rows under PLAYER STATS NOT AVAILABLE.
export type LineupSource = 'floor' | 'starters' | 'topScorers' | 'unavailable';

// Pill under the team that shoots: none hides it, bonus shows BONUS, double shows 2× BONUS.
export type BonusLevel = 'bonus' | 'double' | 'none';

// fouledOut: box PF at or above the adapter's foul limit. ejected: an Ejection play (type 517)
// names the player.
export type PlayerOutReason = 'ejected' | 'fouledOut';

// Game phase from ESPN status.type.name, else the last play (type 412 ends a period).
export type BoardPhase =
  | 'endOfPeriod'
  | 'final'
  | 'halftime'
  | 'inPlay'
  | 'pregame'
  | 'unknown';

// summary: built from an ESPN summary with boxscore and plays. schedule: built from a scoreboard
// event, with scores, clock and period only.
export type BoardSource = 'schedule' | 'summary';

export type BoardPlayer = {
  // ESPN athlete id.
  athleteId: string;
  // Box score PF; undefined shows a dash.
  fouls?: number;
  // ESPN athlete.jersey as a string, because 0 and 00 differ; undefined shows a dash.
  jersey?: string;
  out?: PlayerOutReason;
  // Box score PTS; undefined shows a dash.
  points?: number;
  // Box score REB; undefined shows a dash.
  rebounds?: number;
  // ESPN athlete.shortName, spoken only; the table shows jersey numbers.
  shortName?: string;
};

export type LastFoul = {
  athleteId: string;
  // That player's box score PF.
  fouls?: number;
  jersey?: string;
  out?: PlayerOutReason;
  // The fouling team; the LAST FOUL arrow points to it.
  side: BoardSideKey;
};

export type BoardSide = {
  abbreviation?: string;
  // '#RRGGBB' from the summary's team alternateColor.
  alternateColor?: string;
  // Bonus this team shoots, from the opponent's fouls in the current foul window.
  bonus: BonusLevel;
  // '#RRGGBB' from the summary's team color.
  color?: string;
  // ESPN team displayName.
  displayName?: string;
  lineup: LineupSource;
  // ESPN team name (the mascot).
  nickname?: string;
  // At most five, unsorted; empty when lineup is unavailable.
  players: BoardPlayer[];
  score?: number;
  // Team fouls in the current foul window; undefined shows a dash.
  teamFouls?: number;
  // ESPN team id; callers find the followed team by it.
  teamId?: string;
  // Remaining timeouts, only from an ESPN field that holds them.
  timeoutsLeft?: number;
};

// Poll bookkeeping in epoch milliseconds. The parser sets playsLength, and playerCellsAppliedAt
// from the poll time the caller passes; the caller sets polledAt.
export type BoardStaleInfo = {
  // When the player tables, team fouls, bonus and last foul were applied.
  playerCellsAppliedAt?: number;
  // Length of the plays array those cells were derived from.
  playsLength?: number;
  // Last successful poll; the stale note under the board counts from it.
  polledAt?: number;
};

export type BasketballBoardModel = {
  away: BoardSide;
  // ESPN status.displayClock as sent; undefined shows -:--.
  clock?: string;
  // ESPN event id.
  eventId?: string;
  // Flags of the rules row the model was built with.
  flags: BasketballCapabilityFlags;
  // Player foul limit of that rules row; foul trouble is one below it.
  foulLimit: number;
  home: BoardSide;
  kind: 'basketball';
  // Undefined shows dash wells and no arrow.
  lastFoul?: LastFoul;
  // ESPN status.period, else the last play's period.number; above regulationPeriods is
  // overtime.
  period?: number;
  phase: BoardPhase;
  // Side holding the possession arrow, set only with possessionArrow on.
  possessionArrow?: BoardSideKey;
  // ESPN format.regulation.periods (2 or 4), else the sport's count.
  regulationPeriods: number;
  source: BoardSource;
  stale: BoardStaleInfo;
  // ESPN status.type.detail, the phase text when statusName is unrecognized.
  statusDetail?: string;
  // ESPN status.type.name, such as STATUS_HALFTIME.
  statusName?: string;
};
