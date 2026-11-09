// Hub grid math. `cells` counts every tile: the team tiles, any custom module, and `+`.

const GAP_RATIO = 28 / 101.2;
const MAX_TILE = 101.2;
const MIN_TILE = 64;
const MIN_TILE_FOR_LOGO_STEP = 72;
const LOGO_STEPS = [210, 180, 150, 120] as const;
const LOGO_SIZE = 210;
const SIDE_MARGIN = 16;
const LANDSCAPE_RATIO = 1.1;
const LANDSCAPE_LOGO_PANE = 0.35;
const TOP_RESERVE = 16;
const TOP_RESERVE_BUSY = 112;
const LOGO_GAP = 24;
const WARNING_ABOVE_LOGO = 53;

export type HubLayoutInput = {
  cells: number;
  height: number;
  insetLeft?: number;
  insetRight?: number;
  // The signing warning or the update spinner is showing.
  topBusy?: boolean;
  width: number;
};

export type HubRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export type HubLayout = {
  cols: number;
  // The block that holds the tiles, in hub coordinates, or the scroll frame's content in scroll mode.
  grid: HubRect;
  gap: number;
  logo: { left: number; size: number; top: number };
  mode: 'portrait' | 'landscape';
  rows: number;
  // Set in scroll mode: the frame of the ScrollView that holds the grid.
  scrollFrame?: HubRect;
  tile: number;
  warning: { left: number; top: number; width: number };
};

function span(count: number): number {
  return count + (count - 1) * GAP_RATIO;
}

function rowsFor(cells: number, cols: number): number {
  return Math.ceil(cells / cols);
}

// A lone `+` gets one column so it sits centered.
function naturalColumns(cells: number): number {
  return cells === 1 ? 1 : Math.max(2, Math.ceil(Math.sqrt(cells)));
}

// The largest column count, no more than `cols`, whose tile is still at least the minimum.
function scrollColumns(cols: number, width: number): number {
  for (let candidate = cols; candidate > 2; candidate -= 1) {
    if ((width - 2 * SIDE_MARGIN) / span(candidate) >= MIN_TILE) {
      return candidate;
    }
  }
  return 2;
}

function tileFor(width: number, regionHeight: number, cols: number, rows: number): number {
  return Math.min(MAX_TILE, (width - 2 * SIDE_MARGIN) / span(cols), regionHeight / span(rows));
}

function gridSize(tile: number, cols: number, rows: number): { height: number; width: number } {
  return { height: tile * span(rows), width: tile * span(cols) };
}

function scrollLayout(
  areaLeft: number,
  areaWidth: number,
  regionTop: number,
  regionHeight: number,
  cols: number,
  cells: number,
): Pick<HubLayout, 'cols' | 'gap' | 'grid' | 'rows' | 'scrollFrame' | 'tile'> {
  const used = scrollColumns(cols, areaWidth);
  const rows = rowsFor(cells, used);
  const tile = Math.min(MAX_TILE, (areaWidth - 2 * SIDE_MARGIN) / span(used));
  const size = gridSize(tile, used, rows);
  return {
    cols: used,
    gap: tile * GAP_RATIO,
    grid: { height: size.height, left: (areaWidth - size.width) / 2, top: 0, width: size.width },
    rows,
    scrollFrame: {
      height: Math.max(0, regionHeight),
      left: areaLeft,
      top: regionTop,
      width: areaWidth,
    },
    tile,
  };
}

function landscapeLayout(input: HubLayoutInput, cells: number, reserve: number): HubLayout {
  const insetLeft = input.insetLeft ?? 0;
  const width = input.width - insetLeft - (input.insetRight ?? 0);
  const { height } = input;
  const paneWidth = width * LANDSCAPE_LOGO_PANE;
  const areaLeft = insetLeft + paneWidth;
  const areaWidth = width - paneWidth;
  const logoSize = Math.max(0, Math.min(LOGO_SIZE, paneWidth - 2 * SIDE_MARGIN, height - 2 * SIDE_MARGIN));
  const logoTop = Math.max(reserve, (height - logoSize) / 2);
  const logo = { left: insetLeft + (paneWidth - logoSize) / 2, size: logoSize, top: logoTop };
  const warning = {
    left: insetLeft + SIDE_MARGIN,
    top: Math.max(8, logoTop - WARNING_ABOVE_LOGO),
    width: Math.max(0, paneWidth - 2 * SIDE_MARGIN),
  };
  const regionHeight = height - 2 * SIDE_MARGIN;
  const cols = naturalColumns(cells);
  const rows = rowsFor(cells, cols);
  const tile = tileFor(areaWidth, regionHeight, cols, rows);

  if (tile < MIN_TILE) {
    return {
      ...scrollLayout(areaLeft, areaWidth, SIDE_MARGIN, regionHeight, cols, cells),
      logo,
      mode: 'landscape',
      warning,
    };
  }

  const size = gridSize(tile, cols, rows);
  return {
    cols,
    gap: tile * GAP_RATIO,
    grid: {
      height: size.height,
      left: areaLeft + (areaWidth - size.width) / 2,
      top: (height - size.height) / 2,
      width: size.width,
    },
    logo,
    mode: 'landscape',
    rows,
    tile,
    warning,
  };
}

function portraitLayout(input: HubLayoutInput, cells: number, reserve: number): HubLayout {
  const { height, width } = input;
  const logoTop = Math.max(reserve, height / 3 - LOGO_SIZE / 2);
  const warning = {
    left: 24,
    top: Math.max(8, logoTop - WARNING_ABOVE_LOGO),
    width: Math.max(0, width - 48),
  };
  const cols = naturalColumns(cells);
  const rows = rowsFor(cells, cols);

  let logoSize: number = LOGO_STEPS[0];
  let tile = 0;
  for (const candidate of LOGO_STEPS) {
    const regionHeight = height - (logoTop + candidate + LOGO_GAP) - SIDE_MARGIN;
    logoSize = candidate;
    tile = tileFor(width, regionHeight, cols, rows);
    const widthTile = Math.min(MAX_TILE, (width - 2 * SIDE_MARGIN) / span(cols));
    if (tile >= widthTile || tile >= MIN_TILE_FOR_LOGO_STEP) {
      break;
    }
  }

  if (tile < MIN_TILE) {
    const regionTop = logoTop + LOGO_SIZE + LOGO_GAP;
    return {
      ...scrollLayout(0, width, regionTop, height - regionTop - SIDE_MARGIN, cols, cells),
      logo: { left: (width - LOGO_SIZE) / 2, size: LOGO_SIZE, top: logoTop },
      mode: 'portrait',
      warning,
    };
  }

  const regionTop = logoTop + logoSize + LOGO_GAP;
  const size = gridSize(tile, cols, rows);
  const centered = (2 * height) / 3 - size.height / 2;
  const top = Math.max(regionTop, Math.min(centered, height - SIDE_MARGIN - size.height));
  return {
    cols,
    gap: tile * GAP_RATIO,
    grid: { height: size.height, left: (width - size.width) / 2, top, width: size.width },
    logo: { left: (width - logoSize) / 2, size: logoSize, top: logoTop },
    mode: 'portrait',
    rows,
    tile,
    warning,
  };
}

export function hubLayout(input: HubLayoutInput): HubLayout {
  const cells = Math.max(1, input.cells);
  const reserve = input.topBusy ? TOP_RESERVE_BUSY : TOP_RESERVE;
  return input.width >= LANDSCAPE_RATIO * input.height
    ? landscapeLayout(input, cells, reserve)
    : portraitLayout(input, cells, reserve);
}

// One tile's position inside the grid block. Rows fill from the left, so columns stay put as tiles
// are added.
export function hubCellPosition(
  layout: Pick<HubLayout, 'cols' | 'gap' | 'tile'>,
  index: number,
): { left: number; top: number } {
  const column = index % layout.cols;
  const row = Math.floor(index / layout.cols);
  const step = layout.tile + layout.gap;
  return { left: column * step, top: row * step };
}
