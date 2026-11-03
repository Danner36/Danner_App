import type {
  BasketballCapabilityFlag,
  BasketballCapabilityFlags,
} from '../../scoreboards/basketball/types';

// Capability flags and foul rules per basketball adapter, passed to basketballBoardFromSummary.
// Rows exist for the two NCAA adapters. Foul limits, windows and bonus thresholds are rule-book
// values that ESPN data does not confirm. A flag turns on only after a live capture for that
// adapter holds the paths it needs; no row has one yet, so every flag is off.

export const BASKETBALL_ADAPTER_KEYS = [
  'ncaa/mens-basketball',
  'ncaa/womens-basketball',
] as const;

export type BasketballAdapterKey = (typeof BASKETBALL_ADAPTER_KEYS)[number];

// Team fouls reset at the start of each regulation period: a half when regulationPeriods is 2,
// a quarter when it is 4. continuesLastPeriod adds overtime fouls to the last regulation
// period's count; eachPeriod counts each overtime period on its own.
export type FoulWindowRule = {
  overtime: 'continuesLastPeriod' | 'eachPeriod';
};

// Thresholds on the opponent's team fouls in the current foul window.
export type BonusRule = {
  // At or above: BONUS.
  bonusAt: number;
  // At or above: 2× BONUS.
  doubleBonusAt?: number;
  // Inside the last secondsLeft of any period, foulsInSpan opponent fouls committed inside that
  // span also give BONUS.
  lateFouls?: {
    foulsInSpan: number;
    secondsLeft: number;
  };
  // At or above in an overtime period: BONUS. Absent: bonusAt applies in overtime.
  overtimeBonusAt?: number;
};

// Plays counted as team fouls, charged to the play's team.id. typeIds matches type.id exactly.
// text matches a lowercase type.text that contains includes and none of excludes.
export type TeamFoulPlayMatch =
  | {
      kind: 'typeIds';
      typeIds: readonly string[];
    }
  | {
      excludes: readonly string[];
      includes: string;
      kind: 'text';
    };

export type BasketballRules = {
  adapter: BasketballAdapterKey;
  bonus: BonusRule;
  flags: BasketballCapabilityFlags;
  foulWindow: FoulWindowRule;
  // A player at this many fouls is out; one below is foul trouble.
  playerFoulLimit: number;
  // Regulation periods the row's foul window and bonus assume; bonus pills stay hidden when
  // ESPN format.regulation.periods differs.
  regulationPeriods: 2 | 4;
  teamFoulPlays: TeamFoulPlayMatch;
  // Technical fouls count toward playerFoulLimit (NCAA box PF includes them; NBA and WNBA box
  // PF does not). When false, the lineup check also skips technical and ejection plays, which
  // can name a player on the bench.
  technicalsCountTowardFoulLimit: boolean;
};

const FLAGS_OFF: BasketballCapabilityFlags = {
  activeLineup: false,
  bonus: false,
  lastFoul: false,
  players: false,
  possessionArrow: false,
  rebounds: false,
  teamFouls: false,
  timeouts: false,
};

// Men's flags after the live capture of event 401909771 (tests/leagues/ncaa-mens-basketball/
// captures/): the substitution replay matched ESPN's active players on every captured poll and
// passed the lineup check on every play-array prefix. ESPN sent zeros for the header fouls and
// timeouts fields and for the Core situation resource, so timeouts stay off; activeLineup stays
// off until more live games pass its test.
const NCAA_MENS_FLAGS: BasketballCapabilityFlags = {
  ...FLAGS_OFF,
  bonus: true,
  lastFoul: true,
  players: true,
  rebounds: true,
  teamFouls: true,
};

// NCAA: PersonalFoul (519) and Technical Foul (521).
const NCAA_TEAM_FOUL_PLAYS: TeamFoulPlayMatch = {
  kind: 'typeIds',
  typeIds: ['519', '521'],
};

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value)) {
      deepFreeze(entry);
    }
  }
  return value;
}

const RULES: Readonly<Record<BasketballAdapterKey, BasketballRules>> = deepFreeze({
  'ncaa/mens-basketball': {
    adapter: 'ncaa/mens-basketball',
    bonus: {
      bonusAt: 6,
      doubleBonusAt: 9,
    },
    flags: NCAA_MENS_FLAGS,
    foulWindow: { overtime: 'continuesLastPeriod' },
    playerFoulLimit: 5,
    regulationPeriods: 2,
    teamFoulPlays: NCAA_TEAM_FOUL_PLAYS,
    technicalsCountTowardFoulLimit: true,
  },
  'ncaa/womens-basketball': {
    adapter: 'ncaa/womens-basketball',
    bonus: { bonusAt: 4 },
    flags: FLAGS_OFF,
    foulWindow: { overtime: 'continuesLastPeriod' },
    playerFoulLimit: 5,
    regulationPeriods: 4,
    teamFoulPlays: NCAA_TEAM_FOUL_PLAYS,
    technicalsCountTowardFoulLimit: true,
  },
});

// The adapter's rules with a fresh flags object. Boolean entries in flagOverrides replace the
// row's flags; other entries are ignored. The nested rule objects are frozen and shared.
export function basketballRulesFor(
  adapter: BasketballAdapterKey,
  flagOverrides?: Partial<BasketballCapabilityFlags>,
): BasketballRules {
  const row = RULES[adapter];
  const flags: BasketballCapabilityFlags = { ...row.flags };
  if (flagOverrides) {
    for (const name of Object.keys(flags) as BasketballCapabilityFlag[]) {
      const value = flagOverrides[name];
      if (typeof value === 'boolean') {
        flags[name] = value;
      }
    }
  }
  return { ...row, flags };
}
