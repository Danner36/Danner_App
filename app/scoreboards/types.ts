import type { BasketballBoardModel } from './basketball/types.ts';

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

export type BaseballBoard = {
  away: ScoreboardTotals;
  balls: number;
  batterNumber?: string;
  home: ScoreboardTotals;
  innings: ScoreboardInning[];
  kind: 'baseball';
  outs: number;
  pitcherNumber?: string;
  status: string;
  strikes: number;
};

export type PeriodSideScore = {
  periods: Array<number | undefined>;
  points: number;
};

export type PeriodBoard = {
  away: PeriodSideScore;
  clock: string;
  distance?: number;
  down?: number;
  home: PeriodSideScore;
  kind: 'periods';
  period: number;
  possessionTeamId?: number;
  situation?: string;
  status: string;
};

export type LiveBoard = BaseballBoard | PeriodBoard | BasketballBoardModel;
