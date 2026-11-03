// Basketball arena board layout: the mode, the center-panel scale and the dp sizes the board draws
// at a given inner board width W. Pure, so tests run it under plain Node.

// split: center panel across the board, both player tables side by side under it.
// arena: away table, center panel and home table in one row, like the gym board.
// stacked: center panel, then the away table, then the home table, each at full width.
export type ArenaMode = 'arena' | 'split' | 'stacked';

export type ArenaWellSize = {
  digit: number;
  height: number;
  width: number;
};

export type ArenaCenterSizes = {
  // Middle column: the clock well, phase text and PERIOD cell.
  centerColumn: number;
  clockWell: ArenaWellSize;
  // Gap between the side columns and the middle column.
  columnGap: number;
  // LAST FOUL jersey well.
  jerseyWell: ArenaWellSize;
  periodWell: ArenaWellSize;
  scoreWell: ArenaWellSize;
  // Each team's column: stripe, name, score well, bonus pill and FOULS cell.
  sideColumn: number;
  // FOULS, T.O.L. and LAST FOUL count wells.
  statWell: ArenaWellSize;
  // Width of the center panel's grid: two side columns, the middle column and two gaps.
  width: number;
};

export type ArenaTableSizes = {
  // Gap between cells in a row.
  cellGap: number;
  // Digit size of every table cell.
  digit: number;
  // FL well width.
  fouls: number;
  // # well width.
  jersey: number;
  // Left and right padding inside the table.
  padding: number;
  // PTS well width.
  points: number;
  // REB well width; the column is drawn only when showReb is true and the rebounds flag is on.
  rebounds: number;
  rowGap: number;
  rowHeight: number;
  width: number;
};

export type ArenaSizes = {
  center: ArenaCenterSizes;
  // Labels (FOULS, PERIOD, LAST FOUL, captions, column headers and team names); not scaled.
  label: number;
  // Team stripe height; not scaled.
  stripe: number;
  table: ArenaTableSizes;
};

export type ArenaLayout = {
  mode: ArenaMode;
  // Center-panel scale, clamp(center width / 284, 0.8, 1.25).
  s: number;
  // Tables are wide enough for the REB column. The column also needs the rebounds flag.
  showReb: boolean;
  sizes: ArenaSizes;
  tableWidth: number;
};

// The 720 dp content column, less its 18 dp padding, the card's 3 dp border and 20 dp padding,
// the board's 12 dp bleed into that padding, and the board's 1 dp border and 8 dp padding, on
// both sides.
export const ARENA_MAX_COLUMN_WIDTH = 720;
export const ARENA_WIDTH_INSET = 76;

export const ARENA_SPLIT_MIN_WIDTH = 236;
export const ARENA_ARENA_MIN_WIDTH = 612;
export const ARENA_CENTER_BASE_WIDTH = 284;
export const ARENA_MIN_SCALE = 0.8;
export const ARENA_MAX_SCALE = 1.25;
// Gap between the two tables, and between each table and the center panel in arena mode.
export const ARENA_TABLE_GAP = 8;
// Each table's width in arena mode.
export const ARENA_SIDE_TABLE_WIDTH = 180;
export const ARENA_REB_MIN_TABLE_WIDTH = 180;

const LABEL_SIZE = 12;
const STRIPE_HEIGHT = 4;

// Center panel at s = 1.
const SIDE_COLUMN = 82;
const CENTER_COLUMN = 104;
const COLUMN_GAP = 8;
const SCORE_WELL = { digit: 40, height: 56, width: 82 };
const CLOCK_WELL = { digit: 34, height: 56, width: 104 };
const STAT_WELL = { digit: 22, height: 32, width: 34 };
const PERIOD_WELL = { digit: 22, height: 32, width: 40 };
const JERSEY_WELL = { digit: 22, height: 32, width: 44 };

// Player tables at k = 1: the 138 dp table of a 360 dp window (6 + 40 + 4 + 32 + 4 + 46 + 6), and
// the 180 dp table with REB (5 + 40 + 4 + 32 + 4 + 46 + 4 + 40 + 5).
const TABLE_PADDING = 6;
const REB_TABLE_PADDING = 5;
const TABLE_CELL_GAP = 4;
const TABLE_ROW_GAP = 4;
const TABLE_ROW_HEIGHT = 28;
const TABLE_DIGIT = 20;
const JERSEY_CELL = 40;
const FOULS_CELL = 32;
const POINTS_CELL = 46;
const REBOUNDS_CELL = 40;
const TABLE_MIN_SCALE = 0.8;
const TABLE_MAX_SCALE = 1.2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Rounds to the nearest 0.5 dp.
function half(value: number): number {
  return Math.round(value * 2) / 2;
}

function scaledWell(
  well: { digit: number; height: number; width: number },
  scale: number,
): ArenaWellSize {
  return {
    digit: half(well.digit * scale),
    height: half(well.height * scale),
    width: half(well.width * scale),
  };
}

// Inner board width W for a window width: min(window width, 720) - 76.
export function arenaBoardWidth(windowWidth: number): number {
  const width = Number.isFinite(windowWidth) ? windowWidth : 0;
  return Math.max(0, Math.min(width, ARENA_MAX_COLUMN_WIDTH) - ARENA_WIDTH_INSET);
}

export function arenaMode(boardWidth: number): ArenaMode {
  if (boardWidth >= ARENA_ARENA_MIN_WIDTH) {
    return 'arena';
  }
  return boardWidth >= ARENA_SPLIT_MIN_WIDTH ? 'split' : 'stacked';
}

function tableSizes(tableWidth: number, showReb: boolean): ArenaTableSizes {
  const cells = showReb
    ? JERSEY_CELL + FOULS_CELL + POINTS_CELL + REBOUNDS_CELL
    : JERSEY_CELL + FOULS_CELL + POINTS_CELL;
  const gaps = (showReb ? 3 : 2) * TABLE_CELL_GAP;
  const padding = showReb ? REB_TABLE_PADDING : TABLE_PADDING;
  // Cell widths and digits follow the table width: k = 1 at 138 dp without REB and at 180 dp
  // with it, and the 0.8 floor gives 16 dp digits at the 114 dp tables of W = 236.
  const k = clamp(
    (tableWidth - 2 * padding - gaps) / cells,
    TABLE_MIN_SCALE,
    TABLE_MAX_SCALE,
  );
  return {
    cellGap: TABLE_CELL_GAP,
    digit: half(TABLE_DIGIT * k),
    fouls: half(FOULS_CELL * k),
    jersey: half(JERSEY_CELL * k),
    padding,
    points: half(POINTS_CELL * k),
    rebounds: half(REBOUNDS_CELL * k),
    rowGap: TABLE_ROW_GAP,
    rowHeight: TABLE_ROW_HEIGHT,
    width: tableWidth,
  };
}

// Layout for inner board width W (arenaBoardWidth). In split and stacked modes the center panel
// spans W; in arena mode it gets W less two 180 dp tables and their 8 dp gaps, and s follows that
// width.
export function arenaLayout(boardWidth: number): ArenaLayout {
  const width = Number.isFinite(boardWidth) ? Math.max(0, boardWidth) : 0;
  const mode = arenaMode(width);
  let tableWidth: number;
  let centerWidth: number;
  if (mode === 'arena') {
    tableWidth = ARENA_SIDE_TABLE_WIDTH;
    centerWidth = width - 2 * (ARENA_SIDE_TABLE_WIDTH + ARENA_TABLE_GAP);
  } else if (mode === 'split') {
    tableWidth = (width - ARENA_TABLE_GAP) / 2;
    centerWidth = width;
  } else {
    tableWidth = width;
    centerWidth = width;
  }
  const s = clamp(
    centerWidth / ARENA_CENTER_BASE_WIDTH,
    ARENA_MIN_SCALE,
    ARENA_MAX_SCALE,
  );
  const showReb = tableWidth >= ARENA_REB_MIN_TABLE_WIDTH;
  return {
    mode,
    s,
    showReb,
    sizes: {
      center: {
        centerColumn: half(CENTER_COLUMN * s),
        clockWell: scaledWell(CLOCK_WELL, s),
        columnGap: half(COLUMN_GAP * s),
        jerseyWell: scaledWell(JERSEY_WELL, s),
        periodWell: scaledWell(PERIOD_WELL, s),
        scoreWell: scaledWell(SCORE_WELL, s),
        sideColumn: half(SIDE_COLUMN * s),
        statWell: scaledWell(STAT_WELL, s),
        width: half(ARENA_CENTER_BASE_WIDTH * s),
      },
      label: LABEL_SIZE,
      stripe: STRIPE_HEIGHT,
      table: tableSizes(tableWidth, showReb),
    },
    tableWidth,
  };
}
