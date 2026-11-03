import type {
  BasketballBoardModel,
  BasketballCapabilityFlags,
  BoardPhase,
  BoardPlayer,
  BoardSide,
  BoardSideKey,
  BoardStaleInfo,
  BonusLevel,
  LastFoul,
  LineupSource,
  PlayerOutReason,
} from '../../scoreboards/basketball/types';
import type { BasketballRules, TeamFoulPlayMatch } from './basketballRules';

// Basketball arena board model from an ESPN basketball summary (header, format, boxscore, plays
// and any situation), recomputed from the full arrays of each response so late-inserted plays
// and corrections apply, and from a scoreboard event for the schedule path. Pure: sibling
// modules are imported for types only.

// The previous model's player tables, team fouls, bonus and last foul carry forward for less
// than this long after they were applied, while a response for the same event has a shorter
// plays array or no box players for a team.
export const PLAYER_CELLS_CARRY_MS = 30_000;

export type BasketballBoardPoll = {
  // Epoch milliseconds of this poll. Stored as stale.playerCellsAppliedAt when the response's
  // player cells apply.
  now: number;
  // The model last applied from a summary, for any event.
  previous?: BasketballBoardModel;
};

type JsonRecord = Record<string, unknown>;

type SideCells = Pick<BoardSide, 'bonus' | 'lineup' | 'players' | 'teamFouls'>;

type PlayerCells = {
  away: SideCells;
  home: SideCells;
  lastFoul?: LastFoul;
};

type PlayView = {
  clockSeconds?: number;
  // Athlete ids by position; a participant without an id keeps its slot as undefined.
  participants: Array<string | undefined>;
  period?: number;
  teamId?: string;
  text: string;
  typeId?: string;
  // Lowercase type.text.
  typeText: string;
  wallclockMs?: number;
};

type RosterEntry = {
  active: boolean;
  athleteId: string;
  fouls?: number;
  jersey?: string;
  points?: number;
  rebounds?: number;
  shortName?: string;
  side: BoardSideKey;
  starter: boolean;
};

type Roster = {
  byId: Map<string, RosterEntry>;
  // Box order per team; undefined when the box has no athletes for that team.
  bySide: Record<BoardSideKey, RosterEntry[] | undefined>;
};

type StatusView = {
  clock?: string;
  detail?: string;
  name?: string;
  period?: number;
  state?: string;
};

type CompetitionView = {
  competition: JsonRecord;
  competitors: Record<BoardSideKey, JsonRecord>;
};

type LineupReplay = {
  passed: boolean;
  // The set shown as on the floor when passed is true.
  shown: Set<string>;
};

const SIDES: readonly BoardSideKey[] = ['away', 'home'];

const LINEUP_SIZE = 5;

const SUBSTITUTION_TYPE_ID = '584';
const EJECTION_TYPE_ID = '517';
const END_PERIOD_TYPE_ID = '412';
const END_GAME_TYPE_ID = '402';

const SUBBING_IN = /\bsubbing in\b/i;
const SUBBING_OUT = /\bsubbing out\b/i;

const PHASE_BY_STATUS_NAME = new Map<string, BoardPhase>([
  ['STATUS_END_PERIOD', 'endOfPeriod'],
  ['STATUS_FINAL', 'final'],
  ['STATUS_FIRST_HALF', 'inPlay'],
  ['STATUS_HALFTIME', 'halftime'],
  ['STATUS_IN_PROGRESS', 'inPlay'],
  ['STATUS_SCHEDULED', 'pregame'],
  ['STATUS_SECOND_HALF', 'inPlay'],
]);

// Box columns by keys, else by labels; never by position, because the order differs between
// seasons.
const BOX_COLUMNS = {
  fouls: { key: 'fouls', label: 'PF' },
  points: { key: 'points', label: 'PTS' },
  rebounds: { key: 'rebounds', label: 'REB' },
} as const;

function record(value: unknown): JsonRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function nonEmptyText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

// ESPN ids and jerseys as strings; a finite number is written in decimal.
function idText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

// Same parse as finiteCount in app/cyclones/espnCyclonesScoreboard.ts.
function finiteCount(value: unknown): number | undefined {
  const raw = record(value);
  if (raw) {
    return finiteCount(raw.value ?? raw.displayValue);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.trunc(parsed));
    }
  }
  return undefined;
}

function positiveCount(value: unknown): number | undefined {
  const count = finiteCount(value);
  return count !== undefined && count > 0 ? count : undefined;
}

// Seconds left on a play clock: M:SS, or SS.t under a minute in NBA and WNBA.
function clockSeconds(value: unknown): number | undefined {
  const raw = nonEmptyText(value)?.trim();
  const match = raw ? /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(raw) : null;
  if (!match) {
    return undefined;
  }
  return Number(match[1] ?? 0) * 60 + Number(match[2]);
}

function hexColor(value: unknown): string | undefined {
  const raw = nonEmptyText(value)?.trim().replace(/^#/, '');
  return raw && /^[0-9a-f]{6}$/i.test(raw) ? `#${raw.toUpperCase()}` : undefined;
}

// Drops own properties whose value is undefined, so absent cells are absent keys.
function compact<T extends object>(value: T): T {
  const target = value as Record<string, unknown>;
  for (const key of Object.keys(target)) {
    if (target[key] === undefined) {
      delete target[key];
    }
  }
  return value;
}

function competitionView(document: unknown): CompetitionView | undefined {
  const root = record(document);
  const competition =
    record(arrayOf(record(root?.header)?.competitions)[0]) ??
    record(arrayOf(root?.competitions)[0]);
  if (!competition) {
    return undefined;
  }
  let away: JsonRecord | undefined;
  let home: JsonRecord | undefined;
  for (const entry of arrayOf(competition.competitors)) {
    const competitor = record(entry);
    if (competitor?.homeAway === 'home') {
      home ??= competitor;
    } else if (competitor?.homeAway === 'away') {
      away ??= competitor;
    }
  }
  if (!away || !home) {
    return undefined;
  }
  return { competition, competitors: { away, home } };
}

function statusView(competition: JsonRecord): StatusView {
  const status = record(competition.status);
  const type = record(status?.type);
  return {
    clock: nonEmptyText(status?.displayClock),
    detail: nonEmptyText(type?.detail) ?? nonEmptyText(type?.shortDetail),
    name: nonEmptyText(type?.name),
    period: positiveCount(status?.period),
    state: nonEmptyText(type?.state),
  };
}

function teamIdOf(competitor: JsonRecord): string | undefined {
  return idText(record(competitor.team)?.id) ?? idText(competitor.id);
}

function sideForTeam(
  teamIds: Record<BoardSideKey, string | undefined>,
  teamId: string | undefined,
): BoardSideKey | undefined {
  if (teamId === undefined) {
    return undefined;
  }
  return SIDES.find((side) => teamIds[side] === teamId);
}

function otherSide(side: BoardSideKey): BoardSideKey {
  return side === 'away' ? 'home' : 'away';
}

function sideIdentity(
  competitor: JsonRecord,
  withColors: boolean,
): Pick<
  BoardSide,
  | 'abbreviation'
  | 'alternateColor'
  | 'color'
  | 'displayName'
  | 'nickname'
  | 'score'
  | 'teamId'
> {
  const team = record(competitor.team);
  return {
    abbreviation: nonEmptyText(team?.abbreviation),
    alternateColor: withColors ? hexColor(team?.alternateColor) : undefined,
    color: withColors ? hexColor(team?.color) : undefined,
    displayName: nonEmptyText(team?.displayName),
    nickname: nonEmptyText(team?.name),
    score: finiteCount(competitor.score),
    teamId: teamIdOf(competitor),
  };
}

// ESPN format.regulation.periods when it is 2 or 4.
function formatRegulationPeriods(root: JsonRecord | undefined): number | undefined {
  const periods = finiteCount(record(record(root?.format)?.regulation)?.periods);
  return periods === 2 || periods === 4 ? periods : undefined;
}

function playView(value: unknown): PlayView {
  const play = record(value);
  const type = record(play?.type);
  const wallclock =
    typeof play?.wallclock === 'string' ? Date.parse(play.wallclock) : NaN;
  return {
    clockSeconds: clockSeconds(record(play?.clock)?.displayValue),
    participants: arrayOf(play?.participants).map((entry) =>
      idText(record(record(entry)?.athlete)?.id),
    ),
    period: positiveCount(record(play?.period)?.number),
    teamId: idText(record(play?.team)?.id),
    text: typeof play?.text === 'string' ? play.text : '',
    typeId: idText(type?.id),
    typeText: typeof type?.text === 'string' ? type.text.toLowerCase() : '',
    wallclockMs: Number.isFinite(wallclock) ? wallclock : undefined,
  };
}

function boardPhase(
  status: StatusView,
  plays: readonly PlayView[] | undefined,
  regulationPeriods: number,
): BoardPhase {
  const named = status.name ? PHASE_BY_STATUS_NAME.get(status.name) : undefined;
  if (named) {
    return named;
  }
  if (status.state === 'pre') {
    return 'pregame';
  }
  if (status.state === 'post') {
    return 'final';
  }
  if (status.name) {
    return 'unknown';
  }
  const last = plays?.[plays.length - 1];
  if (!last) {
    return status.state === 'in' ? 'inPlay' : 'unknown';
  }
  if (last.typeId === END_GAME_TYPE_ID) {
    return 'final';
  }
  if (last.typeId === END_PERIOD_TYPE_ID) {
    return last.period !== undefined && last.period * 2 === regulationPeriods
      ? 'halftime'
      : 'endOfPeriod';
  }
  return 'inPlay';
}

function columnIndex(
  group: JsonRecord | undefined,
  column: { key: string; label: string },
): number | undefined {
  const byKey = arrayOf(group?.keys).indexOf(column.key);
  if (byKey >= 0) {
    return byKey;
  }
  const byLabel = arrayOf(group?.labels).indexOf(column.label);
  return byLabel >= 0 ? byLabel : undefined;
}

function rosterFromBox(
  root: JsonRecord | undefined,
  teamIds: Record<BoardSideKey, string | undefined>,
): Roster {
  const roster: Roster = {
    byId: new Map(),
    bySide: { away: undefined, home: undefined },
  };
  for (const entry of arrayOf(record(root?.boxscore)?.players)) {
    const box = record(entry);
    const side = sideForTeam(teamIds, idText(record(box?.team)?.id));
    if (!side || roster.bySide[side]) {
      continue;
    }
    const group = record(arrayOf(box?.statistics)[0]);
    const points = columnIndex(group, BOX_COLUMNS.points);
    const fouls = columnIndex(group, BOX_COLUMNS.fouls);
    const rebounds = columnIndex(group, BOX_COLUMNS.rebounds);
    const entries: RosterEntry[] = [];
    for (const raw of arrayOf(group?.athletes)) {
      const line = record(raw);
      const athlete = record(line?.athlete);
      const athleteId = idText(athlete?.id);
      if (!athleteId || roster.byId.has(athleteId)) {
        continue;
      }
      const stats = arrayOf(line?.stats);
      const rosterEntry: RosterEntry = compact({
        active: line?.active === true,
        athleteId,
        fouls: fouls === undefined ? undefined : finiteCount(stats[fouls]),
        jersey: idText(athlete?.jersey),
        points: points === undefined ? undefined : finiteCount(stats[points]),
        rebounds:
          rebounds === undefined ? undefined : finiteCount(stats[rebounds]),
        shortName: nonEmptyText(athlete?.shortName),
        side,
        starter: line?.starter === true,
      });
      entries.push(rosterEntry);
      roster.byId.set(athleteId, rosterEntry);
    }
    if (entries.length > 0) {
      roster.bySide[side] = entries;
    }
  }
  return roster;
}

function isSubstitution(play: PlayView): boolean {
  return play.typeId === SUBSTITUTION_TYPE_ID;
}

// Last foul matcher: type.text with foul or charge and neither turnover nor free throw.
function isFoulPlay(play: PlayView): boolean {
  return (
    /foul|charge/.test(play.typeText) && !/turnover|free throw/.test(play.typeText)
  );
}

function isTeamFoulPlay(play: PlayView, match: TeamFoulPlayMatch): boolean {
  if (match.kind === 'typeIds') {
    return play.typeId !== undefined && match.typeIds.includes(play.typeId);
  }
  return (
    play.typeText.includes(match.includes) &&
    !match.excludes.some((word) => play.typeText.includes(word))
  );
}

// Technical fouls and ejections can name a player on the bench.
function mayNameBenchPlayer(play: PlayView): boolean {
  return play.typeId === EJECTION_TYPE_ID || play.typeText.includes('technical');
}

// Play index at which each player is out: the foul play that reaches the foul limit (counted
// with the last foul matcher, technicals left out where they do not count), or an Ejection play.
function outAnchors(
  plays: readonly PlayView[],
  rules: BasketballRules,
): Map<string, number> {
  const counts = new Map<string, number>();
  const anchors = new Map<string, number>();
  plays.forEach((play, index) => {
    const athleteId = play.participants[0];
    if (athleteId === undefined) {
      return;
    }
    if (play.typeId === EJECTION_TYPE_ID) {
      if (!anchors.has(athleteId)) {
        anchors.set(athleteId, index);
      }
      return;
    }
    if (
      !isFoulPlay(play) ||
      (!rules.technicalsCountTowardFoulLimit &&
        play.typeText.includes('technical'))
    ) {
      return;
    }
    const count = (counts.get(athleteId) ?? 0) + 1;
    counts.set(athleteId, count);
    if (count >= rules.playerFoulLimit && !anchors.has(athleteId)) {
      anchors.set(athleteId, index);
    }
  });
  return anchors;
}

// True when the game clock has run past anchor by play: a later period, or a lower clock in the
// same period.
function clockRunPast(anchor: PlayView, play: PlayView): boolean {
  if (anchor.period === undefined || play.period === undefined) {
    return false;
  }
  if (play.period !== anchor.period) {
    return play.period > anchor.period;
  }
  return (
    anchor.clockSeconds !== undefined &&
    play.clockSeconds !== undefined &&
    play.clockSeconds < anchor.clockSeconds
  );
}

// Starters, then each substitution play in array order. The check fails a team on: other than
// 5 starters; a swap that adds a player already in, removes one not in, names an id off the
// roster, or has no subbing in or subbing out text; a set other than 5 at a non-substitution
// play; a team's player in a non-substitution play who is not in the set (late inserts, whose
// wallclock precedes the previous play's, and technical and ejection plays are skipped); a
// player who is out still in the set at a non-substitution play after the game clock has run
// past the play that put him out. The
// shown set is the set after the last play, or while a pending substitution group leaves other
// than 5, the set as of the last non-substitution play.
function replayLineups(
  plays: readonly PlayView[],
  roster: Roster,
  rules: BasketballRules,
  teamIds: Record<BoardSideKey, string | undefined>,
): Record<BoardSideKey, LineupReplay> {
  const state = {} as Record<
    BoardSideKey,
    { failed: boolean; set: Set<string>; settled: Set<string> }
  >;
  for (const side of SIDES) {
    const starters = (roster.bySide[side] ?? [])
      .filter((entry) => entry.starter)
      .map((entry) => entry.athleteId);
    state[side] = {
      failed: starters.length !== LINEUP_SIZE,
      set: new Set(starters),
      settled: new Set(starters),
    };
  }
  const failPlayTeam = (play: PlayView) => {
    const side = sideForTeam(teamIds, play.teamId);
    for (const key of side ? [side] : SIDES) {
      state[key].failed = true;
    }
  };
  const anchors = outAnchors(plays, rules);

  plays.forEach((play, index) => {
    if (isSubstitution(play)) {
      const [first, second] = play.participants;
      if (play.participants.length === 2) {
        const entering = first === undefined ? undefined : roster.byId.get(first);
        const leaving = second === undefined ? undefined : roster.byId.get(second);
        if (!entering || !leaving || entering.side !== leaving.side) {
          failPlayTeam(play);
          return;
        }
        const team = state[entering.side];
        if (team.set.has(entering.athleteId) || !team.set.has(leaving.athleteId)) {
          team.failed = true;
        }
        team.set.delete(leaving.athleteId);
        team.set.add(entering.athleteId);
        return;
      }
      const player =
        play.participants.length === 1 && first !== undefined
          ? roster.byId.get(first)
          : undefined;
      if (!player) {
        failPlayTeam(play);
        return;
      }
      const team = state[player.side];
      if (SUBBING_IN.test(play.text)) {
        if (team.set.has(player.athleteId)) {
          team.failed = true;
        }
        team.set.add(player.athleteId);
      } else if (SUBBING_OUT.test(play.text)) {
        if (!team.set.has(player.athleteId)) {
          team.failed = true;
        }
        team.set.delete(player.athleteId);
      } else {
        team.failed = true;
      }
      return;
    }

    for (const side of SIDES) {
      if (state[side].set.size !== LINEUP_SIZE) {
        state[side].failed = true;
      }
    }
    const previousWallclock = plays[index - 1]?.wallclockMs;
    const lateInsert =
      play.wallclockMs !== undefined &&
      previousWallclock !== undefined &&
      play.wallclockMs < previousWallclock;
    if (!lateInsert && !mayNameBenchPlayer(play)) {
      for (const athleteId of play.participants) {
        const player = athleteId === undefined ? undefined : roster.byId.get(athleteId);
        if (player && !state[player.side].set.has(player.athleteId)) {
          state[player.side].failed = true;
        }
      }
    }
    for (const [athleteId, anchorIndex] of anchors) {
      const player = roster.byId.get(athleteId);
      const anchor = plays[anchorIndex];
      if (
        player &&
        anchor &&
        anchorIndex < index &&
        state[player.side].set.has(athleteId) &&
        clockRunPast(anchor, play)
      ) {
        state[player.side].failed = true;
      }
    }
    for (const side of SIDES) {
      state[side].settled = new Set(state[side].set);
    }
  });

  const result = {} as Record<BoardSideKey, LineupReplay>;
  for (const side of SIDES) {
    const team = state[side];
    const shown = team.set.size === LINEUP_SIZE ? team.set : team.settled;
    result[side] = {
      passed: !team.failed && shown.size === LINEUP_SIZE,
      shown,
    };
  }
  return result;
}

// Fallback 1: exactly five active athletes that include every player of the team in its plays
// since the team's last substitution play.
function activeFive(
  side: BoardSideKey,
  entries: readonly RosterEntry[],
  plays: readonly PlayView[],
  roster: Roster,
  teamIds: Record<BoardSideKey, string | undefined>,
): Set<string> | undefined {
  const active = new Set(
    entries.filter((entry) => entry.active).map((entry) => entry.athleteId),
  );
  if (active.size !== LINEUP_SIZE) {
    return undefined;
  }
  let lastSubstitution = -1;
  plays.forEach((play, index) => {
    if (!isSubstitution(play)) {
      return;
    }
    const first = play.participants[0];
    const playSide =
      (first === undefined ? undefined : roster.byId.get(first)?.side) ??
      sideForTeam(teamIds, play.teamId);
    if (playSide === side) {
      lastSubstitution = index;
    }
  });
  for (const play of plays.slice(lastSubstitution + 1)) {
    for (const athleteId of play.participants) {
      const player = athleteId === undefined ? undefined : roster.byId.get(athleteId);
      if (player?.side === side && !active.has(player.athleteId)) {
        return undefined;
      }
    }
  }
  return active;
}

function topScorers(entries: readonly RosterEntry[]): RosterEntry[] {
  return entries
    .map((entry, order) => ({ entry, order }))
    .sort(
      (left, right) =>
        (right.entry.points ?? -1) - (left.entry.points ?? -1) ||
        left.order - right.order,
    )
    .slice(0, LINEUP_SIZE)
    .map(({ entry }) => entry);
}

function ejectedIds(plays: readonly PlayView[]): Set<string> {
  const ids = new Set<string>();
  for (const play of plays) {
    const athleteId = play.participants[0];
    if (play.typeId === EJECTION_TYPE_ID && athleteId !== undefined) {
      ids.add(athleteId);
    }
  }
  return ids;
}

function outReason(
  entry: RosterEntry,
  ejected: ReadonlySet<string>,
  rules: BasketballRules,
): PlayerOutReason | undefined {
  if (ejected.has(entry.athleteId)) {
    return 'ejected';
  }
  return entry.fouls !== undefined && entry.fouls >= rules.playerFoulLimit
    ? 'fouledOut'
    : undefined;
}

function boardPlayer(
  entry: RosterEntry,
  ejected: ReadonlySet<string>,
  flags: BasketballCapabilityFlags,
  rules: BasketballRules,
): BoardPlayer {
  return compact({
    athleteId: entry.athleteId,
    fouls: entry.fouls,
    jersey: entry.jersey,
    out: outReason(entry, ejected, rules),
    points: entry.points,
    rebounds: flags.rebounds ? entry.rebounds : undefined,
    shortName: entry.shortName,
  });
}

function sideTable(
  side: BoardSideKey,
  input: {
    ejected: ReadonlySet<string>;
    flags: BasketballCapabilityFlags;
    plays: readonly PlayView[];
    replay: Record<BoardSideKey, LineupReplay> | undefined;
    roster: Roster;
    rules: BasketballRules;
    teamIds: Record<BoardSideKey, string | undefined>;
  },
): Pick<BoardSide, 'lineup' | 'players'> {
  const { ejected, flags, plays, replay, roster, rules, teamIds } = input;
  const entries = roster.bySide[side];
  if (!flags.players || !entries) {
    return { lineup: 'unavailable', players: [] };
  }
  const table = (lineup: LineupSource, chosen: RosterEntry[]) => ({
    lineup,
    players: chosen.map((entry) => boardPlayer(entry, ejected, flags, rules)),
  });
  const inBoxOrder = (ids: ReadonlySet<string>) =>
    entries.filter((entry) => ids.has(entry.athleteId));
  if (plays.length === 0) {
    const starters = entries.filter((entry) => entry.starter);
    return starters.length === LINEUP_SIZE
      ? table('starters', starters)
      : table('topScorers', topScorers(entries));
  }
  const replayed = replay?.[side];
  if (replayed?.passed) {
    return table('floor', inBoxOrder(replayed.shown));
  }
  const active = flags.activeLineup
    ? activeFive(side, entries, plays, roster, teamIds)
    : undefined;
  if (active) {
    return table('floor', inBoxOrder(active));
  }
  return table('topScorers', topScorers(entries));
}

// Team fouls per side in the current foul window, and those committed inside the late-foul
// span of the current period. Undefined without a plays array or a period.
function teamFoulCounts(
  plays: readonly PlayView[] | undefined,
  period: number | undefined,
  regulationPeriods: number,
  rules: BasketballRules,
  teamIds: Record<BoardSideKey, string | undefined>,
):
  | { late: Record<BoardSideKey, number>; window: Record<BoardSideKey, number> }
  | undefined {
  if (!plays || period === undefined) {
    return undefined;
  }
  const window = { away: 0, home: 0 };
  const late = { away: 0, home: 0 };
  const lateSpan = rules.bonus.lateFouls?.secondsLeft;
  for (const play of plays) {
    if (play.period === undefined || !isTeamFoulPlay(play, rules.teamFoulPlays)) {
      continue;
    }
    const side = sideForTeam(teamIds, play.teamId);
    if (!side) {
      continue;
    }
    const inWindow =
      period <= regulationPeriods || rules.foulWindow.overtime === 'eachPeriod'
        ? play.period === period
        : play.period >= regulationPeriods && play.period <= period;
    if (inWindow) {
      window[side] += 1;
    }
    if (
      lateSpan !== undefined &&
      play.period === period &&
      play.clockSeconds !== undefined &&
      play.clockSeconds <= lateSpan
    ) {
      late[side] += 1;
    }
  }
  return { late, window };
}

// Bonus the team shoots, from the opponent's fouls. Hidden outside inPlay, when the game's
// regulation format differs from the rules row, and without a count.
function bonusLevel(input: {
  clock: string | undefined;
  formatPeriods: number | undefined;
  opponentFouls: number | undefined;
  opponentLateFouls: number | undefined;
  period: number | undefined;
  phase: BoardPhase;
  regulationPeriods: number;
  rules: BasketballRules;
}): BonusLevel {
  const { opponentFouls, period, rules } = input;
  if (
    !rules.flags.bonus ||
    input.phase !== 'inPlay' ||
    (input.formatPeriods !== undefined &&
      input.formatPeriods !== rules.regulationPeriods) ||
    opponentFouls === undefined ||
    period === undefined
  ) {
    return 'none';
  }
  const { bonusAt, doubleBonusAt, lateFouls, overtimeBonusAt } = rules.bonus;
  if (doubleBonusAt !== undefined && opponentFouls >= doubleBonusAt) {
    return 'double';
  }
  const threshold =
    period > input.regulationPeriods ? (overtimeBonusAt ?? bonusAt) : bonusAt;
  if (opponentFouls >= threshold) {
    return 'bonus';
  }
  const secondsLeft = clockSeconds(input.clock);
  if (
    lateFouls &&
    secondsLeft !== undefined &&
    secondsLeft <= lateFouls.secondsLeft &&
    (input.opponentLateFouls ?? 0) >= lateFouls.foulsInSpan
  ) {
    return 'bonus';
  }
  return 'none';
}

// Newest foul play in array order with a participant; participants[0] committed it.
function lastFoulFrom(
  plays: readonly PlayView[],
  roster: Roster,
  ejected: ReadonlySet<string>,
  rules: BasketballRules,
  teamIds: Record<BoardSideKey, string | undefined>,
): LastFoul | undefined {
  for (let index = plays.length - 1; index >= 0; index -= 1) {
    const play = plays[index];
    const athleteId = play?.participants[0];
    if (!play || athleteId === undefined || !isFoulPlay(play)) {
      continue;
    }
    const entry = roster.byId.get(athleteId);
    const side = entry?.side ?? sideForTeam(teamIds, play.teamId);
    if (!side) {
      return undefined;
    }
    return compact({
      athleteId,
      fouls: entry?.fouls,
      jersey: entry?.jersey,
      out: entry ? outReason(entry, ejected, rules) : undefined,
      side,
    });
  }
  return undefined;
}

// Remaining timeouts from situation.homeTimeouts and awayTimeouts, top-level or on the
// competition. Unverified paths, read only with the timeouts flag on.
function timeoutsLeft(
  root: JsonRecord | undefined,
  competition: JsonRecord,
  side: BoardSideKey,
): number | undefined {
  const field = side === 'home' ? 'homeTimeouts' : 'awayTimeouts';
  for (const situation of [record(root?.situation), record(competition.situation)]) {
    const value = finiteCount(situation?.[field]);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

// Possession arrow only with possessionArrowAvailable true and exactly one competitor holding
// possession.
function possessionArrowSide(view: CompetitionView): BoardSideKey | undefined {
  if (view.competition.possessionArrowAvailable !== true) {
    return undefined;
  }
  const holders = SIDES.filter((side) => view.competitors[side].possession === true);
  return holders.length === 1 ? holders[0] : undefined;
}

function sideCellsOf(side: BoardSide): SideCells {
  return compact({
    bonus: side.bonus,
    lineup: side.lineup,
    players: side.players,
    teamFouls: side.teamFouls,
  });
}

// The previous model's cells when this response has a shorter plays array than the last
// applied one, or no box players for a team that had a table, for the same event and within
// PLAYER_CELLS_CARRY_MS of when those cells were applied.
function carriedCells(
  poll: BasketballBoardPoll | undefined,
  eventId: string | undefined,
  playsLength: number,
  roster: Roster,
): { cells: PlayerCells; stale: BoardStaleInfo } | undefined {
  const previous = poll?.previous;
  const appliedAt = previous?.stale.playerCellsAppliedAt;
  if (
    !poll ||
    !previous ||
    previous.source !== 'summary' ||
    eventId === undefined ||
    previous.eventId !== eventId ||
    appliedAt === undefined ||
    poll.now - appliedAt >= PLAYER_CELLS_CARRY_MS
  ) {
    return undefined;
  }
  const baseline = previous.stale.playsLength;
  const shorter = baseline !== undefined && playsLength < baseline;
  const playersMissing = SIDES.some(
    (side) =>
      roster.bySide[side] === undefined &&
      previous[side].lineup !== 'unavailable',
  );
  if (!shorter && !playersMissing) {
    return undefined;
  }
  return {
    cells: compact({
      away: sideCellsOf(previous.away),
      home: sideCellsOf(previous.home),
      lastFoul: previous.lastFoul,
    }),
    stale: compact({ playerCellsAppliedAt: appliedAt, playsLength: baseline }),
  };
}

// Board model from an ESPN summary. Undefined when the document has no competition with an away
// and a home competitor. Cells whose flag is off in rules are left out: no players (lineup
// unavailable), no rebounds, team fouls, last foul, timeouts or possession arrow, and bonus
// none. poll.now stamps the applied player cells; poll.previous supplies the carry-forward.
export function basketballBoardFromSummary(
  summary: unknown,
  rules: BasketballRules,
  poll?: BasketballBoardPoll,
): BasketballBoardModel | undefined {
  const view = competitionView(summary);
  if (!view) {
    return undefined;
  }
  const root = record(summary);
  const flags: BasketballCapabilityFlags = { ...rules.flags };
  const formatPeriods = formatRegulationPeriods(root);
  const regulationPeriods = formatPeriods ?? rules.regulationPeriods;
  const plays = Array.isArray(root?.plays) ? root.plays.map(playView) : undefined;
  const allPlays = plays ?? [];
  const status = statusView(view.competition);
  const period = status.period ?? allPlays[allPlays.length - 1]?.period;
  const phase = boardPhase(status, plays, regulationPeriods);
  const eventId = idText(record(root?.header)?.id) ?? idText(view.competition.id);
  const teamIds = {
    away: teamIdOf(view.competitors.away),
    home: teamIdOf(view.competitors.home),
  };
  const roster = rosterFromBox(root, teamIds);

  const carried = carriedCells(poll, eventId, allPlays.length, roster);
  let cells: PlayerCells;
  let stale: BoardStaleInfo;
  if (carried) {
    cells = carried.cells;
    stale = carried.stale;
  } else {
    const ejected = ejectedIds(allPlays);
    const replay =
      flags.players && allPlays.length > 0
        ? replayLineups(allPlays, roster, rules, teamIds)
        : undefined;
    const fouls = teamFoulCounts(plays, period, regulationPeriods, rules, teamIds);
    const tableInput = { ejected, flags, plays: allPlays, replay, roster, rules, teamIds };
    const sideCells = (side: BoardSideKey): SideCells =>
      compact({
        ...sideTable(side, tableInput),
        bonus: bonusLevel({
          clock: status.clock,
          formatPeriods,
          opponentFouls: fouls?.window[otherSide(side)],
          opponentLateFouls: fouls?.late[otherSide(side)],
          period,
          phase,
          regulationPeriods,
          rules,
        }),
        teamFouls: flags.teamFouls ? fouls?.window[side] : undefined,
      });
    cells = compact({
      away: sideCells('away'),
      home: sideCells('home'),
      lastFoul: flags.lastFoul
        ? lastFoulFrom(allPlays, roster, ejected, rules, teamIds)
        : undefined,
    });
    stale = compact({ playerCellsAppliedAt: poll?.now, playsLength: plays?.length });
  }

  const side = (key: BoardSideKey): BoardSide => {
    const sideCellValues = cells[key];
    return compact({
      ...sideIdentity(view.competitors[key], true),
      ...sideCellValues,
      bonus: phase === 'inPlay' ? sideCellValues.bonus : 'none',
      timeoutsLeft: flags.timeouts
        ? timeoutsLeft(root, view.competition, key)
        : undefined,
    });
  };

  return compact({
    away: side('away'),
    clock: status.clock,
    eventId,
    flags,
    foulLimit: rules.playerFoulLimit,
    home: side('home'),
    kind: 'basketball' as const,
    lastFoul: cells.lastFoul,
    period,
    phase,
    possessionArrow: flags.possessionArrow ? possessionArrowSide(view) : undefined,
    regulationPeriods,
    source: 'summary' as const,
    stale,
    statusDetail: status.detail,
    statusName: status.name,
  });
}

// Board model from an ESPN scoreboard event: scores, clock, period and phase, with no player
// tables or foul cells, because the event has no boxscore or plays. Regulation periods come from
// the rules row. Undefined when the event has no away and home competitor.
export function basketballBoardFromScheduleEvent(
  event: unknown,
  rules: BasketballRules,
): BasketballBoardModel | undefined {
  const view = competitionView(event);
  if (!view) {
    return undefined;
  }
  const status = statusView(view.competition);
  const side = (key: BoardSideKey): BoardSide =>
    compact({
      ...sideIdentity(view.competitors[key], false),
      bonus: 'none' as const,
      lineup: 'unavailable' as const,
      players: [],
    });
  return compact({
    away: side('away'),
    clock: status.clock,
    eventId: idText(record(event)?.id) ?? idText(view.competition.id),
    flags: { ...rules.flags },
    foulLimit: rules.playerFoulLimit,
    home: side('home'),
    kind: 'basketball' as const,
    period: status.period,
    phase: boardPhase(status, undefined, rules.regulationPeriods),
    regulationPeriods: rules.regulationPeriods,
    source: 'schedule' as const,
    stale: {},
    statusDetail: status.detail,
    statusName: status.name,
  });
}
