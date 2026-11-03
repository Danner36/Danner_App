import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { basketballRulesFor } from '../../app/leagues/espn/basketballRules.ts';
import {
  arenaBoardWidth,
  arenaLayout,
  arenaMode,
} from '../../app/scoreboards/basketball/arenaLayout.ts';
import {
  CLOCK_MISSING,
  DASH,
  TABLE_ROW_COUNT,
  boardTeamLabel,
  boardTeamNames,
  bonusPillText,
  bonusPills,
  centerSummary,
  clockText,
  clockWords,
  compareJerseys,
  countText,
  foulTone,
  jerseyText,
  lastFoulArrow,
  lineupCaptions,
  periodWellText,
  phaseText,
  spokenTeamName,
  staleNote,
  tableRows,
  tableSummary,
} from '../../app/scoreboards/basketball/arenaText.ts';
import {
  BOARD_FRAME,
  LABEL_MUTED,
  LED_DIGIT,
  LED_WELL,
  OUT_DIGIT,
  OUT_FILL,
  contrastRatio,
  normalizeHexColor,
  opponentStripeColor,
} from '../../app/scoreboards/basketball/arenaTokens.ts';

// The pure board modules import siblings for types only and never import React Native.
for (const file of ['arenaLayout.ts', 'arenaText.ts', 'arenaTokens.ts']) {
  const source = readFileSync(
    new URL(`../../app/scoreboards/basketball/${file}`, import.meta.url),
    'utf8',
  );
  assert.equal(source.includes('react-native'), false, file);
  for (const match of source.matchAll(/^import\s+(type\s+)?[^;]*?from\s+'([^']+)';/gm)) {
    assert.ok(match[1], `${file} imports ${match[2]} at runtime`);
  }
}

// Layout: W = min(window, 720) - 76.
assert.equal(arenaBoardWidth(360), 284);
assert.equal(arenaBoardWidth(320), 244);
assert.equal(arenaBoardWidth(1024), 644);
assert.equal(arenaBoardWidth(60), 0);
assert.equal(arenaBoardWidth(Number.NaN), 0);

// A 360 dp window: split, s = 1, 138 dp tables, no REB, and the plan's 360 dp sizes.
const phone = arenaLayout(arenaBoardWidth(360));
assert.equal(phone.mode, 'split');
assert.equal(phone.s, 1);
assert.equal(phone.tableWidth, 138);
assert.equal(phone.showReb, false);
assert.deepEqual(phone.sizes.center.scoreWell, { digit: 40, height: 56, width: 82 });
assert.deepEqual(phone.sizes.center.clockWell, { digit: 34, height: 56, width: 104 });
assert.equal(phone.sizes.center.statWell.height, 32);
assert.equal(phone.sizes.center.statWell.digit, 22);
assert.equal(phone.sizes.center.periodWell.height, 32);
assert.equal(phone.sizes.center.jerseyWell.digit, 22);
assert.equal(phone.sizes.center.width, 284);
assert.equal(
  2 * phone.sizes.center.sideColumn +
    phone.sizes.center.centerColumn +
    2 * phone.sizes.center.columnGap,
  284,
);
assert.equal(phone.sizes.table.width, 138);
assert.equal(phone.sizes.table.rowHeight, 28);
assert.equal(phone.sizes.table.digit, 20);
assert.equal(
  2 * phone.sizes.table.padding +
    phone.sizes.table.jersey +
    phone.sizes.table.fouls +
    phone.sizes.table.points +
    2 * phone.sizes.table.cellGap,
  138,
);
assert.equal(phone.sizes.label, 12);
assert.equal(phone.sizes.stripe, 4);

// Mode boundaries.
assert.equal(arenaMode(235), 'stacked');
assert.equal(arenaMode(236), 'split');
assert.equal(arenaMode(611), 'split');
assert.equal(arenaMode(612), 'arena');

const narrowSplit = arenaLayout(236);
assert.equal(narrowSplit.mode, 'split');
assert.equal(narrowSplit.tableWidth, 114);
assert.equal(narrowSplit.sizes.table.digit, 16);
assert.equal(narrowSplit.s, 236 / 284);

const stacked = arenaLayout(235);
assert.equal(stacked.mode, 'stacked');
assert.equal(stacked.tableWidth, 235);
assert.equal(stacked.showReb, true);
assert.equal(arenaLayout(200).s, 0.8);
assert.equal(arenaLayout(179).showReb, false);
assert.equal(arenaLayout(180).showReb, true);
assert.equal(arenaLayout(180).sizes.table.digit, 20);

assert.equal(arenaLayout(354).s, 354 / 284);
assert.equal(arenaLayout(354).tableWidth, 173);
assert.equal(arenaLayout(354).showReb, false);
assert.equal(arenaLayout(400).s, 1.25);
assert.equal(arenaLayout(367).showReb, false);
assert.equal(arenaLayout(368).showReb, true);
assert.equal(arenaLayout(611).mode, 'split');

// Arena: two 180 dp tables with REB; the center gets W - 376 and s follows that width.
const tablet = arenaLayout(arenaBoardWidth(800));
assert.equal(tablet.mode, 'arena');
assert.equal(tablet.tableWidth, 180);
assert.equal(tablet.showReb, true);
assert.equal(tablet.s, 268 / 284);
assert.equal(tablet.sizes.table.digit, 20);
assert.equal(
  2 * tablet.sizes.table.padding +
    tablet.sizes.table.jersey +
    tablet.sizes.table.fouls +
    tablet.sizes.table.points +
    tablet.sizes.table.rebounds +
    3 * tablet.sizes.table.cellGap,
  180,
);
assert.equal(arenaLayout(612).s, 236 / 284);
assert.equal(arenaLayout(2000).s, 1.25);

// With the tables omitted (players flag off) the center panel spans W in every mode.
const centerOnly = arenaLayout(arenaBoardWidth(720), { tables: false });
assert.equal(arenaBoardWidth(720), 644);
assert.equal(centerOnly.mode, 'arena');
assert.equal(centerOnly.s, 1.25);
assert.deepEqual(centerOnly.sizes.center.scoreWell, { digit: 50, height: 70, width: 102.5 });
assert.equal(arenaLayout(644).s, 268 / 284);
assert.equal(arenaLayout(612, { tables: false }).s, 1.25);
assert.equal(arenaLayout(284, { tables: false }).s, 1);
assert.equal(arenaLayout(284, { tables: true }).s, 1);
assert.equal(arenaLayout(200, { tables: false }).s, 0.8);

// Labels: the Phase 1c rule.
assert.equal(boardTeamLabel(true, 'Kansas Jayhawks'), 'CYCLONES');
assert.equal(boardTeamLabel(false, 'Kansas Jayhawks'), 'JAYHAWKS');
assert.equal(boardTeamLabel(false, '  Miami (OH) RedHawks '), 'REDHAWKS');
assert.equal(spokenTeamName(false, 'Miami (OH) RedHawks'), 'RedHawks');
assert.equal(spokenTeamName(true, 'Kansas Jayhawks'), 'Cyclones');
assert.equal(spokenTeamName(false, ''), 'Opponent');
assert.deepEqual(boardTeamNames(false, 'Kansas Jayhawks'), {
  away: { label: 'CYCLONES', spoken: 'Cyclones' },
  home: { label: 'JAYHAWKS', spoken: 'Jayhawks' },
});
assert.deepEqual(boardTeamNames(true, 'Kansas Jayhawks'), {
  away: { label: 'JAYHAWKS', spoken: 'Jayhawks' },
  home: { label: 'CYCLONES', spoken: 'Cyclones' },
});

// Well text.
assert.equal(countText(36), '36');
assert.equal(countText(0), '0');
assert.equal(countText(undefined), DASH);
assert.equal(jerseyText('00'), '00');
assert.equal(jerseyText(undefined), DASH);
assert.equal(clockText('2:09'), '2:09');
assert.equal(clockText(' 57.1 '), '57.1');
assert.equal(clockText(''), CLOCK_MISSING);
assert.equal(clockText(undefined), '-:--');

assert.equal(periodWellText(3, 4), '3');
assert.equal(periodWellText(2, 2), '2');
assert.equal(periodWellText(5, 4), 'OT');
assert.equal(periodWellText(6, 4), '2OT');
assert.equal(periodWellText(3, 2), 'OT');
assert.equal(periodWellText(4, 2), '2OT');
assert.equal(periodWellText(undefined, 4), DASH);
assert.equal(periodWellText(0, 2), DASH);

// Clock words.
assert.equal(clockWords('2:09'), '2 minutes 9 seconds left');
assert.equal(clockWords('2:00'), '2 minutes left');
assert.equal(clockWords('1:01'), '1 minute 1 second left');
assert.equal(clockWords('0:45'), '45 seconds left');
assert.equal(clockWords('20:00'), '20 minutes left');
assert.equal(clockWords('0:00'), '0 seconds left');
assert.equal(clockWords('45.3'), '45.3 seconds left');
assert.equal(clockWords('0.4'), '0.4 seconds left');
assert.equal(clockWords(''), 'clock not available');
assert.equal(clockWords(undefined), 'clock not available');
assert.equal(clockWords('1:2'), 'clock 1:2');

function flags(overrides = {}) {
  return basketballRulesFor('ncaa/womens-basketball', overrides).flags;
}

const LAUNCH_FLAGS = flags();
const BOARD_FLAGS = flags({ bonus: true, lastFoul: true, players: true, teamFouls: true });

function side(overrides = {}) {
  return { bonus: 'none', lineup: 'floor', players: [], ...overrides };
}

function board(overrides = {}) {
  return {
    away: side(),
    flags: BOARD_FLAGS,
    foulLimit: 5,
    home: side(),
    kind: 'basketball',
    phase: 'inPlay',
    regulationPeriods: 4,
    source: 'summary',
    stale: {},
    ...overrides,
  };
}

function player(jersey, fouls, points, extra = {}) {
  return {
    athleteId: `a${jersey}`,
    fouls,
    jersey,
    points,
    shortName: `P. Number${jersey}`,
    ...extra,
  };
}

// Phase text.
assert.equal(phaseText(board({ period: 3 })), '3RD QTR');
assert.equal(phaseText(board({ period: 1 })), '1ST QTR');
assert.equal(phaseText(board({ period: 1, regulationPeriods: 2 })), '1ST HALF');
assert.equal(phaseText(board({ period: 2, regulationPeriods: 2 })), '2ND HALF');
assert.equal(phaseText(board({ period: 5 })), 'OVERTIME');
assert.equal(phaseText(board({ period: 6 })), '2ND OT');
assert.equal(phaseText(board({ period: 7 })), '3RD OT');
assert.equal(phaseText(board({ period: 3, regulationPeriods: 2 })), 'OVERTIME');
assert.equal(phaseText(board({ period: 4, regulationPeriods: 2 })), '2ND OT');
assert.equal(phaseText(board({ period: undefined })), '');
assert.equal(phaseText(board({ period: 2, phase: 'halftime' })), 'HALFTIME');
assert.equal(phaseText(board({ period: 1, phase: 'endOfPeriod' })), 'END OF Q1');
assert.equal(phaseText(board({ period: 3, phase: 'endOfPeriod' })), 'END OF Q3');
assert.equal(phaseText(board({ period: 4, phase: 'endOfPeriod' })), 'END OF REG');
assert.equal(
  phaseText(board({ period: 2, phase: 'endOfPeriod', regulationPeriods: 2 })),
  'END OF REG',
);
assert.equal(phaseText(board({ period: 5, phase: 'endOfPeriod' })), 'END OF OT');
assert.equal(phaseText(board({ period: 6, phase: 'endOfPeriod' })), 'END OF 2OT');
assert.equal(phaseText(board({ phase: 'final' })), 'FINAL');
assert.equal(phaseText(board({ phase: 'pregame' })), '');
assert.equal(phaseText(board({ phase: 'unknown', statusDetail: 'Delayed' })), 'DELAYED');
assert.equal(phaseText(board({ phase: 'unknown' })), '');

// Lineup captions.
assert.deepEqual(lineupCaptions('split', 'floor', 'floor'), {
  shared: 'PLAYERS ON THE FLOOR',
});
assert.deepEqual(lineupCaptions('stacked', 'topScorers', 'topScorers'), {
  shared: 'TOP SCORERS (LINEUP UNKNOWN)',
});
assert.deepEqual(lineupCaptions('split', 'starters', 'starters'), { shared: 'STARTERS' });
assert.deepEqual(lineupCaptions('split', 'unavailable', 'unavailable'), {
  shared: 'PLAYER STATS NOT AVAILABLE',
});
assert.deepEqual(lineupCaptions('split', 'topScorers', 'floor'), {
  away: 'TOP SCORERS',
  home: 'ON THE FLOOR',
});
assert.deepEqual(lineupCaptions('arena', 'floor', 'floor'), {
  away: 'ON THE FLOOR',
  home: 'ON THE FLOOR',
});

// Row order: jersey order on the floor (0 before 00), points then jersey for leaders.
assert.deepEqual(
  ['10', '00', 'A', undefined, '3', '0', '', '1'].sort(compareJerseys),
  ['0', '00', '1', '3', '10', 'A', '', undefined],
);
const floorSide = side({
  players: [player('41', 4, 8), player('22', 0, 9), player('3', 2, 8), player('24', 3, 5)],
});
const floorRows = tableRows(floorSide);
assert.equal(floorRows.length, TABLE_ROW_COUNT);
assert.deepEqual(
  floorRows.map((row) => row?.jersey),
  ['3', '22', '24', '41', undefined],
);
const leaderRows = tableRows(
  side({
    lineup: 'topScorers',
    players: [
      player('5', 1, 9),
      player('22', 3, 14),
      player('2', 2, 18),
      player('10', 5, 9),
      player('14', 0, undefined),
    ],
  }),
);
assert.deepEqual(
  leaderRows.map((row) => row?.jersey),
  ['2', '22', '5', '10', '14'],
);
assert.deepEqual(
  tableRows(side({ lineup: 'unavailable' })),
  [undefined, undefined, undefined, undefined, undefined],
);

// Foul tone: trouble at limit - 1, out at the limit or with an out reason.
assert.equal(foulTone({ fouls: 3 }, 5), 'normal');
assert.equal(foulTone({ fouls: 4 }, 5), 'trouble');
assert.equal(foulTone({ fouls: 5 }, 5), 'out');
assert.equal(foulTone({ fouls: 4 }, 6), 'normal');
assert.equal(foulTone({ fouls: 5 }, 6), 'trouble');
assert.equal(foulTone({ fouls: 6 }, 6), 'out');
assert.equal(foulTone({}, 5), 'missing');
assert.equal(foulTone({ fouls: 1, out: 'ejected' }, 6), 'out');

// Bonus pills: under the team that shoots, only in play and with the bonus flag on.
assert.equal(bonusPillText('bonus'), 'BONUS');
assert.equal(bonusPillText('double'), '2× BONUS');
assert.equal(bonusPillText('none'), undefined);
const bonusBoard = board({
  away: side({ bonus: 'double' }),
  home: side({ bonus: 'bonus' }),
  period: 2,
  regulationPeriods: 2,
});
assert.deepEqual(bonusPills(bonusBoard), { away: '2× BONUS', home: 'BONUS' });
assert.deepEqual(bonusPills({ ...bonusBoard, phase: 'halftime' }), {});
assert.deepEqual(bonusPills({ ...bonusBoard, phase: 'endOfPeriod' }), {});
assert.deepEqual(bonusPills({ ...bonusBoard, flags: LAUNCH_FLAGS }), {});

// LAST FOUL arrow points to the fouling team.
const lastFoulAway = { athleteId: 'a41', fouls: 4, jersey: '41', side: 'away' };
assert.equal(lastFoulArrow(board({ lastFoul: lastFoulAway })), 'left');
assert.equal(lastFoulArrow(board({ lastFoul: { ...lastFoulAway, side: 'home' } })), 'right');
assert.equal(lastFoulArrow(board()), undefined);
assert.equal(lastFoulArrow(board({ flags: LAUNCH_FLAGS, lastFoul: lastFoulAway })), undefined);

// Spoken center summary: the plan's example (women's game, third quarter).
const jayhawksNames = boardTeamNames(false, 'Kansas Jayhawks');
const cyclonesPlayers = [
  player('41', 4, 8),
  player('11', 1, 6),
  player('3', 2, 8),
  player('24', 3, 5),
  player('22', 0, 9),
];
const jayhawksPlayers = [
  player('1', 1, 2),
  player('4', 0, 3),
  player('10', 2, 0),
  player('21', 1, 4),
  player('32', 3, 0),
];
const example = board({
  away: side({ players: cyclonesPlayers, score: 36, teamFouls: 6 }),
  clock: '2:09',
  home: side({ bonus: 'bonus', players: jayhawksPlayers, score: 9, teamFouls: 3 }),
  lastFoul: lastFoulAway,
  period: 3,
});
assert.equal(
  centerSummary(example, jayhawksNames),
  'Cyclones 36, Jayhawks 9. Third quarter, 2 minutes 9 seconds left. Team fouls: Cyclones 6, ' +
    'Jayhawks 3. Jayhawks in the bonus. Last foul: Cyclones number 41, 4 fouls, foul trouble.',
);
// Launch flags drop every clause whose flag is off.
assert.equal(
  centerSummary({ ...example, flags: LAUNCH_FLAGS }, jayhawksNames),
  'Cyclones 36, Jayhawks 9. Third quarter, 2 minutes 9 seconds left.',
);
assert.equal(
  centerSummary({ ...example, flags: { ...BOARD_FLAGS, timeouts: true } }, jayhawksNames),
  'Cyclones 36, Jayhawks 9. Third quarter, 2 minutes 9 seconds left. Team fouls: Cyclones 6, ' +
    'Jayhawks 3. Jayhawks in the bonus. Timeouts left: Cyclones not available, Jayhawks not ' +
    'available. Last foul: Cyclones number 41, 4 fouls, foul trouble.',
);

const guestNames = boardTeamNames(true, 'Guest');
assert.equal(
  centerSummary(
    board({
      away: side({ score: 47, teamFouls: 8 }),
      clock: '3:41',
      home: side({ bonus: 'bonus', score: 52, teamFouls: 5 }),
      lastFoul: { athleteId: 'h23', fouls: 4, jersey: '23', side: 'home' },
      period: 2,
      regulationPeriods: 2,
    }),
    guestNames,
  ),
  'Guest 47, Cyclones 52. Second half, 3 minutes 41 seconds left. Team fouls: Guest 8, ' +
    'Cyclones 5. Cyclones in the bonus. Last foul: Cyclones number 23, 4 fouls, foul trouble.',
);
assert.equal(
  centerSummary(
    board({
      away: side({ bonus: 'bonus', score: 28, teamFouls: 7 }),
      clock: '0:00',
      home: side({ score: 31, teamFouls: 5 }),
      lastFoul: { athleteId: 'a10', fouls: 2, jersey: '10', side: 'away' },
      period: 1,
      phase: 'halftime',
      regulationPeriods: 2,
    }),
    guestNames,
  ),
  'Guest 28, Cyclones 31. Halftime. Team fouls: Guest 7, Cyclones 5. Last foul: Guest number ' +
    '10, 2 fouls.',
);
assert.equal(
  centerSummary(
    board({
      away: side({ score: 79, teamFouls: 3 }),
      clock: '0:48',
      flags: flags({ bonus: true, lastFoul: true, teamFouls: true }),
      foulLimit: 6,
      home: side({ bonus: 'bonus', score: 81, teamFouls: 2 }),
      lastFoul: { athleteId: 'a15', fouls: 6, jersey: '15', side: 'away' },
      period: 5,
    }),
    guestNames,
  ),
  'Guest 79, Cyclones 81. Overtime, 48 seconds left. Team fouls: Guest 3, Cyclones 2. ' +
    'Cyclones in the bonus. Last foul: Guest number 15, 6 fouls, fouled out.',
);
assert.equal(
  centerSummary({ ...bonusBoard, clock: '57.1' }, guestNames),
  'Guest score not available, Cyclones score not available. Second half, 57.1 seconds left. ' +
    'Team fouls: Guest not available, Cyclones not available. Guest in the double bonus. ' +
    'Cyclones in the bonus. Last foul: not available.',
);
assert.equal(
  centerSummary(
    board({
      away: side({ bonus: 'bonus', score: 58 }),
      home: side({ bonus: 'bonus', score: 60 }),
      lastFoul: { athleteId: 'a10', jersey: '10', out: 'ejected', side: 'away' },
      period: 6,
      phase: 'endOfPeriod',
    }),
    guestNames,
  ),
  'Guest 58, Cyclones 60. End of the second overtime. Team fouls: Guest not available, ' +
    'Cyclones not available. Last foul: Guest number 10, fouls not available, ejected.',
);
assert.equal(
  centerSummary(
    board({
      away: side({ bonus: 'bonus', score: 58 }),
      clock: '1:12',
      flags: flags({ bonus: true }),
      home: side({ bonus: 'bonus', score: 60 }),
      period: 1,
      phase: 'endOfPeriod',
    }),
    guestNames,
  ),
  'Guest 58, Cyclones 60. End of the first quarter.',
);
assert.equal(
  centerSummary(
    board({
      away: side({ bonus: 'bonus', score: 58 }),
      clock: '1:12',
      flags: flags({ bonus: true }),
      home: side({ bonus: 'bonus', score: 60 }),
      period: 2,
      regulationPeriods: 2,
    }),
    guestNames,
  ),
  'Guest 58, Cyclones 60. Second half, 1 minute 12 seconds left. Both teams in the bonus.',
);
assert.equal(
  centerSummary(
    board({
      away: side({ score: 70 }),
      flags: flags({ possessionArrow: true }),
      home: side({ score: 70 }),
      period: 4,
      phase: 'endOfPeriod',
      possessionArrow: 'home',
    }),
    jayhawksNames,
  ),
  'Cyclones 70, Jayhawks 70. End of regulation. Possession arrow: Jayhawks.',
);

// Spoken table summaries: rows in table order, dash rows skipped.
assert.equal(
  tableSummary(example, 'away', jayhawksNames, false),
  'Cyclones players on the floor. Number 3, P. Number3, 8 points, 2 fouls. Number 11, ' +
    'P. Number11, 6 points, 1 foul. Number 22, P. Number22, 9 points, 0 fouls. Number 24, ' +
    'P. Number24, 5 points, 3 fouls. Number 41, P. Number41, 8 points, 4 fouls, foul trouble.',
);
assert.equal(tableSummary({ ...example, flags: LAUNCH_FLAGS }, 'away', jayhawksNames, false), '');
assert.equal(
  tableSummary(
    board({
      away: side({
        lineup: 'topScorers',
        players: [
          player('2', 2, 18),
          player('15', 5, 14, { shortName: undefined }),
          player('9', 1, undefined),
        ],
      }),
    }),
    'away',
    guestNames,
    false,
  ),
  'Guest top scorers, lineup not available. Number 2, P. Number2, 18 points, 2 fouls. ' +
    'Number 15, 14 points, 5 fouls, fouled out. Number 9, P. Number9, points not available, ' +
    '1 foul.',
);
const reboundBoard = board({
  flags: flags({ players: true, rebounds: true }),
  home: side({ players: [player('1', 1, 12, { rebounds: 3 })] }),
});
assert.equal(
  tableSummary(reboundBoard, 'home', guestNames, true),
  'Cyclones players on the floor. Number 1, P. Number1, 12 points, 3 rebounds, 1 foul.',
);
assert.equal(
  tableSummary(reboundBoard, 'home', guestNames, false),
  'Cyclones players on the floor. Number 1, P. Number1, 12 points, 1 foul.',
);
assert.equal(
  tableSummary(
    { ...reboundBoard, flags: flags({ players: true }) },
    'home',
    guestNames,
    true,
  ),
  'Cyclones players on the floor. Number 1, P. Number1, 12 points, 1 foul.',
);
assert.equal(
  tableSummary(board({ home: side({ lineup: 'unavailable' }) }), 'home', guestNames, false),
  'Cyclones player stats not available.',
);
assert.equal(
  tableSummary(
    board({ home: side({ lineup: 'starters', players: [player('5', 0, 0)] }) }),
    'home',
    guestNames,
    false,
  ),
  'Cyclones starters. Number 5, P. Number5, 0 points, 0 fouls.',
);

// Stale note under the board.
const polledAt = Date.UTC(2026, 10, 3, 1, 0, 0);
assert.equal(staleNote(undefined, polledAt), undefined);
assert.equal(staleNote(polledAt, polledAt + 29_999), undefined);
assert.equal(staleNote(polledAt, polledAt + 30_000), 'Not updated for 30 s');
assert.equal(staleNote(polledAt, polledAt + 59_999), 'Not updated for 30 s');
assert.equal(staleNote(polledAt, polledAt + 60_000), 'Not updated for 1 min');
assert.equal(staleNote(polledAt, polledAt + 150_000), 'Not updated for 2 min');

// Contrast: the plan's ratios, and the opponent stripe pick at 3:1 on the panel.
assert.equal(contrastRatio(LED_DIGIT, LED_WELL).toFixed(2), '13.71');
assert.equal(contrastRatio(LABEL_MUTED, BOARD_FRAME).toFixed(2), '9.88');
assert.equal(contrastRatio(OUT_DIGIT, OUT_FILL).toFixed(2), '7.05');
assert.equal(contrastRatio('#AE192D', BOARD_FRAME).toFixed(2), '2.15');
assert.equal(contrastRatio('#FFFFFF', '#FFFFFF'), 1);
assert.equal(contrastRatio('#000000', '#FFFFFF'), 21);
assert.equal(contrastRatio('red', BOARD_FRAME), undefined);
assert.equal(normalizeHexColor('ae192d'), '#AE192D');
assert.equal(normalizeHexColor(' #e8000d '), '#E8000D');
assert.equal(normalizeHexColor('#abc'), undefined);
assert.equal(normalizeHexColor(null), undefined);
assert.equal(opponentStripeColor('ffc82d', '0051ba'), '#FFC82D');
assert.equal(opponentStripeColor('0051ba', 'e8000d'), '#E8000D');
assert.equal(opponentStripeColor('0051ba', '13294b'), LABEL_MUTED);
assert.equal(opponentStripeColor('not a color', '#ffffff'), '#FFFFFF');
assert.equal(opponentStripeColor(undefined, undefined), '#C7D2DD');

console.log('layout.mjs: passed');
