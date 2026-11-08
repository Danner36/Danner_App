import type { ArenaMode } from './arenaLayout';
import type {
  BasketballBoardModel,
  BoardPlayer,
  BoardSide,
  BoardSideKey,
  BonusLevel,
  LineupSource,
  PlayerOutReason,
} from './types';

// Text of the basketball arena board: team labels, well text, phase and period text, lineup
// captions, table row order, foul tone, bonus pills and the three spoken summaries. Pure, so
// tests run it under plain Node.

const OPPONENT_SPOKEN_FALLBACK = 'Opponent';

// Well text of a missing value.
export const DASH = '–';
export const CLOCK_MISSING = '-:--';
const NOT_AVAILABLE = 'not available';

// Every table draws five rows, padded with dash rows, so its height never changes.
export const TABLE_ROW_COUNT = 5;

// No note before 30 s without a successful poll.
export const STALE_NOTE_AFTER_MS = 30_000;

export type BoardTeamName = {
  // Board text, upper case.
  label: string;
  // Spoken name.
  spoken: string;
};

export type BoardTeamNames = Record<BoardSideKey, BoardTeamName>;

// FL cell tone: trouble at the foul limit minus one, out at the limit or with an out reason.
export type FoulTone = 'missing' | 'normal' | 'out' | 'trouble';

export type LineupCaptions = {
  // Per-table captions, set when the tables differ or in arena mode.
  away?: string;
  home?: string;
  // One caption over both tables, set in split and stacked modes when both tables agree.
  shared?: string;
};

export type LastFoulArrow = 'left' | 'right';

function opponentLastWord(opponentName: string): string | undefined {
  const parts = opponentName.trim().split(/\s+/);
  return parts[parts.length - 1];
}

// The followed team's label, else the last word of the opponent's name in upper case.
export function boardTeamLabel(
  isFollowed: boolean,
  opponentName: string,
  followedLabel: string,
): string {
  if (isFollowed) {
    return followedLabel;
  }
  return (opponentLastWord(opponentName) ?? opponentName).toUpperCase();
}

// Spoken form of the board label: the followed team's nickname, else the last word of the
// opponent's name as written.
export function spokenTeamName(
  isFollowed: boolean,
  opponentName: string,
  followedSpoken: string,
): string {
  if (isFollowed) {
    return followedSpoken;
  }
  return opponentLastWord(opponentName) || OPPONENT_SPOKEN_FALLBACK;
}

// Away and home names when the followed team is home (isHome) or away.
export function boardTeamNames(
  isHome: boolean,
  opponentName: string,
  followed: BoardTeamName,
): BoardTeamNames {
  return {
    away: {
      label: boardTeamLabel(!isHome, opponentName, followed.label),
      spoken: spokenTeamName(!isHome, opponentName, followed.spoken),
    },
    home: {
      label: boardTeamLabel(isHome, opponentName, followed.label),
      spoken: spokenTeamName(isHome, opponentName, followed.spoken),
    },
  };
}

function isCount(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

// Score, team-foul, timeout, foul, point and rebound well text.
export function countText(value?: number): string {
  return isCount(value) ? String(value) : DASH;
}

export function jerseyText(jersey?: string): string {
  return jersey?.trim() || DASH;
}

// ESPN displayClock as sent.
export function clockText(clock?: string): string {
  return clock?.trim() || CLOCK_MISSING;
}

function validPeriod(period?: number): number | undefined {
  return period !== undefined && Number.isInteger(period) && period > 0
    ? period
    : undefined;
}

export function ordinalNumber(value: number): string {
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 13) {
    return `${value}TH`;
  }
  switch (value % 10) {
    case 1:
      return `${value}ST`;
    case 2:
      return `${value}ND`;
    case 3:
      return `${value}RD`;
    default:
      return `${value}TH`;
  }
}

const ORDINAL_WORDS = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
];

function ordinalWord(value: number): string {
  return ORDINAL_WORDS[value - 1] ?? ordinalNumber(value).toLowerCase();
}

// PERIOD well: 1 to the regulation count, then OT, 2OT, 3OT.
export function periodWellText(period: number | undefined, regulationPeriods: number): string {
  const current = validPeriod(period);
  if (current === undefined) {
    return DASH;
  }
  if (current <= regulationPeriods) {
    return String(current);
  }
  const overtime = current - regulationPeriods;
  return overtime === 1 ? 'OT' : `${overtime}OT`;
}

function inPlayText(period: number, regulationPeriods: number): string {
  if (period <= regulationPeriods) {
    return `${ordinalNumber(period)} ${regulationPeriods === 2 ? 'HALF' : 'QTR'}`;
  }
  const overtime = period - regulationPeriods;
  return overtime === 1 ? 'OVERTIME' : `${ordinalNumber(overtime)} OT`;
}

function endOfPeriodText(period: number | undefined, regulationPeriods: number): string {
  if (period === undefined) {
    return 'END OF PERIOD';
  }
  if (period < regulationPeriods) {
    return `END OF ${regulationPeriods === 2 ? 'H' : 'Q'}${period}`;
  }
  if (period === regulationPeriods) {
    return 'END OF REG';
  }
  return `END OF ${periodWellText(period, regulationPeriods)}`;
}

// Phase text under the clock: 3RD QTR, 2ND HALF, OVERTIME, 2ND OT, HALFTIME, END OF Q1,
// END OF REG, END OF OT, FINAL; ESPN status detail in upper case when the status name is
// unrecognized; empty before the game.
export function phaseText(model: BasketballBoardModel): string {
  const period = validPeriod(model.period);
  switch (model.phase) {
    case 'inPlay':
      return period === undefined ? '' : inPlayText(period, model.regulationPeriods);
    case 'endOfPeriod':
      return endOfPeriodText(period, model.regulationPeriods);
    case 'halftime':
      return 'HALFTIME';
    case 'final':
      return 'FINAL';
    case 'pregame':
      return '';
    case 'unknown':
      return model.statusDetail?.trim().toUpperCase() ?? '';
  }
}

function periodWords(period: number, regulationPeriods: number): string {
  if (period <= regulationPeriods) {
    return `${ordinalWord(period)} ${regulationPeriods === 2 ? 'half' : 'quarter'}`;
  }
  const overtime = period - regulationPeriods;
  return overtime === 1 ? 'overtime' : `${ordinalWord(overtime)} overtime`;
}

function endOfPeriodWords(period: number | undefined, regulationPeriods: number): string {
  if (period === undefined) {
    return 'end of the period';
  }
  if (period === regulationPeriods) {
    return 'end of regulation';
  }
  if (period === regulationPeriods + 1) {
    return 'end of overtime';
  }
  return `end of the ${periodWords(period, regulationPeriods)}`;
}

function unitWords(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

function countWords(value: number | undefined, unit: string): string {
  return isCount(value) ? unitWords(value, unit) : `${unit}s ${NOT_AVAILABLE}`;
}

// Spoken clock: 2:09 is "2 minutes 9 seconds left", 2:00 "2 minutes left", 0:45 "45 seconds
// left", 45.3 "45.3 seconds left". A missing clock is "clock not available"; any other shape is
// read as sent.
export function clockWords(clock?: string): string {
  const text = clock?.trim();
  if (!text) {
    return `clock ${NOT_AVAILABLE}`;
  }
  const minutesMatch = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (minutesMatch) {
    const minutes = Number(minutesMatch[1]);
    const seconds = Number(minutesMatch[2]);
    if (seconds < 60) {
      if (minutes === 0) {
        return `${unitWords(seconds, 'second')} left`;
      }
      return seconds === 0
        ? `${unitWords(minutes, 'minute')} left`
        : `${unitWords(minutes, 'minute')} ${unitWords(seconds, 'second')} left`;
    }
  }
  const tenthsMatch = /^(\d{1,2})\.(\d)$/.exec(text);
  if (tenthsMatch) {
    return `${Number(tenthsMatch[1])}.${tenthsMatch[2]} seconds left`;
  }
  return `clock ${text}`;
}

function phaseWords(model: BasketballBoardModel): string | undefined {
  const period = validPeriod(model.period);
  switch (model.phase) {
    case 'inPlay':
      return [
        period === undefined
          ? `period ${NOT_AVAILABLE}`
          : periodWords(period, model.regulationPeriods),
        clockWords(model.clock),
      ].join(', ');
    case 'endOfPeriod':
      return endOfPeriodWords(period, model.regulationPeriods);
    case 'halftime':
      return 'halftime';
    case 'final':
      return 'final';
    case 'pregame':
      return undefined;
    case 'unknown':
      return [model.statusDetail?.trim(), clockWords(model.clock)]
        .filter(Boolean)
        .join(', ');
  }
}

const SHARED_CAPTIONS: Record<LineupSource, string> = {
  floor: 'PLAYERS ON THE FLOOR',
  starters: 'STARTERS',
  topScorers: 'TOP SCORERS (LINEUP UNKNOWN)',
  unavailable: 'PLAYER STATS NOT AVAILABLE',
};

const TABLE_CAPTIONS: Record<LineupSource, string> = {
  floor: 'ON THE FLOOR',
  starters: 'STARTERS',
  topScorers: 'TOP SCORERS',
  unavailable: 'NO PLAYER STATS',
};

// Split and stacked modes: one caption over both tables when both teams have the same lineup
// source, else a caption on each table in the same row. Arena mode: each table's title row.
export function lineupCaptions(
  mode: ArenaMode,
  away: LineupSource,
  home: LineupSource,
): LineupCaptions {
  if (mode !== 'arena' && away === home) {
    return { shared: SHARED_CAPTIONS[away] };
  }
  return { away: TABLE_CAPTIONS[away], home: TABLE_CAPTIONS[home] };
}

// Jersey order: numeric jerseys by value, with 0 before 00, then other jerseys as text, then
// missing ones.
export function compareJerseys(first?: string, second?: string): number {
  const a = first?.trim();
  const b = second?.trim();
  if (!a || !b) {
    return a ? -1 : b ? 1 : 0;
  }
  const aNumeric = /^\d+$/.test(a);
  const bNumeric = /^\d+$/.test(b);
  if (aNumeric && bNumeric) {
    return Number(a) - Number(b) || a.length - b.length;
  }
  if (aNumeric !== bNumeric) {
    return aNumeric ? -1 : 1;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

function byJersey(a: BoardPlayer, b: BoardPlayer): number {
  return (
    compareJerseys(a.jersey, b.jersey) ||
    (a.athleteId < b.athleteId ? -1 : a.athleteId > b.athleteId ? 1 : 0)
  );
}

function byPointsThenJersey(a: BoardPlayer, b: BoardPlayer): number {
  const aPoints = isCount(a.points) ? a.points : -1;
  const bPoints = isCount(b.points) ? b.points : -1;
  return bPoints - aPoints || byJersey(a, b);
}

// Five table rows: players on the floor and starters in jersey order, top scorers by points then
// jersey; undefined entries are dash rows.
export function tableRows(side: BoardSide): (BoardPlayer | undefined)[] {
  const players = side.lineup === 'unavailable' ? [] : [...side.players];
  players.sort(side.lineup === 'topScorers' ? byPointsThenJersey : byJersey);
  const rows: (BoardPlayer | undefined)[] = players.slice(0, TABLE_ROW_COUNT);
  while (rows.length < TABLE_ROW_COUNT) {
    rows.push(undefined);
  }
  return rows;
}

// Tone of a player's FL cell or the LAST FOUL count well.
export function foulTone(
  entry: { fouls?: number; out?: PlayerOutReason },
  foulLimit: number,
): FoulTone {
  if (entry.out !== undefined) {
    return 'out';
  }
  if (!isCount(entry.fouls)) {
    return 'missing';
  }
  if (entry.fouls >= foulLimit) {
    return 'out';
  }
  return entry.fouls === foulLimit - 1 ? 'trouble' : 'normal';
}

function toneWords(
  entry: { fouls?: number; out?: PlayerOutReason },
  foulLimit: number,
): string | undefined {
  switch (foulTone(entry, foulLimit)) {
    case 'trouble':
      return 'foul trouble';
    case 'out':
      return entry.out === 'ejected' ? 'ejected' : 'fouled out';
    default:
      return undefined;
  }
}

// Bonus a side shoots as drawn: none unless the bonus flag is on and the phase is inPlay, so
// pills stay hidden at halftime and between periods.
export function shownBonus(model: BasketballBoardModel, side: BoardSideKey): BonusLevel {
  return model.flags.bonus && model.phase === 'inPlay' ? model[side].bonus : 'none';
}

export function bonusPillText(level: BonusLevel): string | undefined {
  switch (level) {
    case 'bonus':
      return 'BONUS';
    case 'double':
      return '2× BONUS';
    case 'none':
      return undefined;
  }
}

// Pill text under each team that shoots.
export function bonusPills(model: BasketballBoardModel): Partial<Record<BoardSideKey, string>> {
  const pills: Partial<Record<BoardSideKey, string>> = {};
  for (const side of ['away', 'home'] as const) {
    const text = bonusPillText(shownBonus(model, side));
    if (text) {
      pills[side] = text;
    }
  }
  return pills;
}

// The LAST FOUL arrow points to the fouling team: away is drawn on the left, home on the right.
export function lastFoulArrow(model: BasketballBoardModel): LastFoulArrow | undefined {
  if (!model.flags.lastFoul || !model.lastFoul) {
    return undefined;
  }
  return model.lastFoul.side === 'away' ? 'left' : 'right';
}

function bonusLevelWords(level: BonusLevel): string {
  return level === 'double' ? 'double bonus' : 'bonus';
}

function bonusSentences(model: BasketballBoardModel, names: BoardTeamNames): string[] {
  const away = shownBonus(model, 'away');
  const home = shownBonus(model, 'home');
  if (away !== 'none' && away === home) {
    return [`both teams in the ${bonusLevelWords(away)}`];
  }
  const sentences: string[] = [];
  for (const [side, level] of [
    ['away', away],
    ['home', home],
  ] as const) {
    if (level !== 'none') {
      sentences.push(`${names[side].spoken} in the ${bonusLevelWords(level)}`);
    }
  }
  return sentences;
}

function lastFoulSentence(model: BasketballBoardModel, names: BoardTeamNames): string {
  const foul = model.lastFoul;
  if (!foul) {
    return `last foul: ${NOT_AVAILABLE}`;
  }
  return [
    `last foul: ${names[foul.side].spoken} number ${foul.jersey?.trim() || NOT_AVAILABLE}`,
    countWords(foul.fouls, 'foul'),
    toneWords(foul, model.foulLimit),
  ]
    .filter(Boolean)
    .join(', ');
}

function sidePairWords(
  names: BoardTeamNames,
  away: number | undefined,
  home: number | undefined,
): string {
  const spokenCount = (value: number | undefined) =>
    isCount(value) ? String(value) : NOT_AVAILABLE;
  return `${names.away.spoken} ${spokenCount(away)}, ${names.home.spoken} ${spokenCount(home)}`;
}

function sentencesText(sentences: string[]): string {
  return sentences
    .filter(Boolean)
    .map((sentence) => `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`)
    .join(' ');
}

// Center panel's spoken summary: scores, phase and clock, then team fouls, bonus, timeouts,
// possession arrow and last foul, each only with its flag on.
export function centerSummary(model: BasketballBoardModel, names: BoardTeamNames): string {
  const scoreWords = (side: BoardSideKey) =>
    isCount(model[side].score)
      ? `${names[side].spoken} ${model[side].score}`
      : `${names[side].spoken} score ${NOT_AVAILABLE}`;
  const sentences = [`${scoreWords('away')}, ${scoreWords('home')}`];
  const phase = phaseWords(model);
  if (phase) {
    sentences.push(phase);
  }
  if (model.flags.teamFouls) {
    sentences.push(
      `team fouls: ${sidePairWords(names, model.away.teamFouls, model.home.teamFouls)}`,
    );
  }
  if (model.flags.bonus) {
    sentences.push(...bonusSentences(model, names));
  }
  if (model.flags.timeouts) {
    sentences.push(
      `timeouts left: ${sidePairWords(names, model.away.timeoutsLeft, model.home.timeoutsLeft)}`,
    );
  }
  if (model.flags.possessionArrow) {
    sentences.push(
      `possession arrow: ${
        model.possessionArrow ? names[model.possessionArrow].spoken : NOT_AVAILABLE
      }`,
    );
  }
  if (model.flags.lastFoul) {
    sentences.push(lastFoulSentence(model, names));
  }
  return sentencesText(sentences);
}

function lineupHeading(lineup: LineupSource, name: string): string {
  switch (lineup) {
    case 'floor':
      return `${name} players on the floor`;
    case 'starters':
      return `${name} starters`;
    case 'topScorers':
      return `${name} top scorers, lineup ${NOT_AVAILABLE}`;
    case 'unavailable':
      return `${name} player stats ${NOT_AVAILABLE}`;
  }
}

function playerSentence(player: BoardPlayer, foulLimit: number, rebounds: boolean): string {
  return [
    `number ${player.jersey?.trim() || NOT_AVAILABLE}`,
    player.shortName?.trim(),
    countWords(player.points, 'point'),
    rebounds ? countWords(player.rebounds, 'rebound') : undefined,
    countWords(player.fouls, 'foul'),
    toneWords(player, foulLimit),
  ]
    .filter(Boolean)
    .join(', ');
}

// A table's spoken summary: the lineup heading, then each row in table order; dash rows are
// skipped. Rebounds are spoken when the layout draws REB (showReb) and the rebounds flag is on.
// Empty with the players flag off, because no table is drawn.
export function tableSummary(
  model: BasketballBoardModel,
  side: BoardSideKey,
  names: BoardTeamNames,
  showReb: boolean,
): string {
  if (!model.flags.players) {
    return '';
  }
  const rebounds = showReb && model.flags.rebounds;
  const sentences = [lineupHeading(model[side].lineup, names[side].spoken)];
  for (const player of tableRows(model[side])) {
    if (player) {
      sentences.push(playerSentence(player, model.foulLimit, rebounds));
    }
  }
  return sentencesText(sentences);
}

// Note under the board: none until 30 s without a successful poll, then "Not updated for 30 s",
// then "Not updated for N min" with N the whole minutes since that poll.
export function staleNote(polledAt: number | undefined, nowMs: number): string | undefined {
  if (polledAt === undefined || !Number.isFinite(polledAt)) {
    return undefined;
  }
  const elapsed = nowMs - polledAt;
  if (elapsed < STALE_NOTE_AFTER_MS) {
    return undefined;
  }
  return elapsed < 60_000
    ? 'Not updated for 30 s'
    : `Not updated for ${Math.floor(elapsed / 60_000)} min`;
}
