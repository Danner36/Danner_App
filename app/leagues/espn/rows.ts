import type { ScoreboardKind } from '../../team/engine/types.ts';
import type { AdapterKey, SportKey } from '../types.ts';

export type SeasonYearRule = {
  // Months 1-12. Through this month the season is the previous calendar year.
  shiftBackThroughMonth?: number;
  // From this month on the season is the next calendar year.
  shiftForwardFromMonth?: number;
};

export type EspnAdapterRow = {
  corePath: string;
  key: AdapterKey;
  scoreboard: ScoreboardKind;
  seasonTypes: readonly number[];
  seasonYear: SeasonYearRule;
  sitePath: string;
  sport?: SportKey;
};

const SEASON_TYPES = [1, 2, 3] as const;
const BASKETBALL_SEASON: SeasonYearRule = { shiftForwardFromMonth: 7 };

// These values equal the league rows in `scripts/team-catalog/leagues.mjs`; tests/leagues asserts it.
export const ESPN_ADAPTER_ROWS: readonly EspnAdapterRow[] = [
  {
    corePath: 'football/leagues/nfl',
    key: 'nfl',
    scoreboard: 'periods',
    seasonTypes: SEASON_TYPES,
    seasonYear: { shiftBackThroughMonth: 2 },
    sitePath: 'football/nfl',
  },
  {
    corePath: 'football/leagues/college-football',
    key: 'ncaa/football',
    scoreboard: 'periods',
    seasonTypes: SEASON_TYPES,
    seasonYear: { shiftBackThroughMonth: 1 },
    sitePath: 'football/college-football',
    sport: 'football',
  },
  {
    corePath: 'basketball/leagues/mens-college-basketball',
    key: 'ncaa/mens-basketball',
    scoreboard: 'basketball',
    seasonTypes: SEASON_TYPES,
    seasonYear: BASKETBALL_SEASON,
    sitePath: 'basketball/mens-college-basketball',
    sport: 'mens-basketball',
  },
  {
    corePath: 'basketball/leagues/womens-college-basketball',
    key: 'ncaa/womens-basketball',
    scoreboard: 'basketball',
    seasonTypes: SEASON_TYPES,
    seasonYear: BASKETBALL_SEASON,
    sitePath: 'basketball/womens-college-basketball',
    sport: 'womens-basketball',
  },
];

export function seasonYearFor(rule: SeasonYearRule, now: Date): number {
  const month = now.getMonth() + 1;
  if (
    rule.shiftBackThroughMonth !== undefined &&
    month <= rule.shiftBackThroughMonth
  ) {
    return now.getFullYear() - 1;
  }
  if (
    rule.shiftForwardFromMonth !== undefined &&
    month >= rule.shiftForwardFromMonth
  ) {
    return now.getFullYear() + 1;
  }
  return now.getFullYear();
}
