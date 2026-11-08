import { useEffect, useState, type ReactNode } from 'react';
import {
  AppState,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import {
  arenaBoardWidth,
  arenaLayout,
  type ArenaCenterSizes,
  type ArenaLayout,
  type ArenaTableSizes,
  type ArenaWellSize,
} from './arenaLayout';
import {
  CLOCK_MISSING,
  DASH,
  STALE_NOTE_AFTER_MS,
  bonusPills,
  boardTeamNames,
  centerSummary,
  countText,
  foulTone,
  jerseyText,
  lastFoulArrow,
  lineupCaptions,
  staleNote,
  tableRows,
  tableSummary,
  type BoardTeamNames,
  type FoulTone,
} from './arenaText';
import {
  BOARD_EDGE,
  BOARD_FRAME,
  BONUS_FILL,
  BONUS_TEXT,
  DIM_DIGIT,
  LABEL,
  LABEL_MUTED,
  LED_DIGIT,
  LED_WELL,
  MISSING_DIGIT,
  NOTE_TEXT,
  OUT_DIGIT,
  OUT_FILL,
  STAT_DIGIT,
  WARN_DIGIT,
  WARN_FILL,
  opponentStripeColor,
} from './arenaTokens';
import type { BasketballBoardModel, BoardPlayer, BoardSideKey } from './types';

// Basketball arena board: the center panel (team names, bonus pills, team fouls, timeouts and the
// last foul) and each team's player table, drawn from a BasketballBoardModel in split, arena or
// stacked mode (arenaLayout). The game card's header holds the score, clock and possession. Cells
// whose capability flag is off are omitted, and a game with no detail draws only the stale note.
// Three accessibility elements, the center panel and each table, each read a spoken summary;
// nothing on the board is touchable. The stale note sits under the board.

// Board border and padding on each side; the inner width W is the board's width less both.
const BOARD_BORDER = 1;
const BOARD_PADDING = 8;
// The board reaches this far into the card's 20 dp padding on each side.
const BOARD_BLEED = 12;
// Labels may grow with the system font size up to this factor; digits never grow.
const LABEL_MAX_FONT_MULTIPLIER = 1.3;
const CENTER_ROW_GAP = 6;
const INLINE_GAP = 4;
const PILL_ROW_HEIGHT = 22;
const SECTION_GAP = 8;
const MINUTE_MS = 60_000;

type SideColors = Record<BoardSideKey, string>;

function wellColors(tone: FoulTone): { digit: string; fill: string } {
  switch (tone) {
    case 'trouble':
      return { digit: WARN_DIGIT, fill: WARN_FILL };
    case 'out':
      return { digit: OUT_DIGIT, fill: OUT_FILL };
    default:
      return { digit: STAT_DIGIT, fill: LED_WELL };
  }
}

// Re-renders when the stale note text changes: 30 s after polledAt, then on each whole minute.
function useStaleNote(polledAt: number | undefined): string | undefined {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (polledAt === undefined) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      const elapsed = Date.now() - polledAt;
      const nextChange =
        elapsed < STALE_NOTE_AFTER_MS
          ? STALE_NOTE_AFTER_MS
          : (Math.floor(elapsed / MINUTE_MS) + 1) * MINUTE_MS;
      timer = setTimeout(() => {
        setTick((tick) => tick + 1);
        schedule();
      }, Math.max(250, nextChange - elapsed));
    };
    schedule();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        clearTimeout(timer);
        setTick((tick) => tick + 1);
        schedule();
      }
    });
    return () => {
      clearTimeout(timer);
      appState.remove();
    };
  }, [polledAt]);

  return staleNote(polledAt, Date.now());
}

function Well({
  digitColor,
  fill = LED_WELL,
  size,
  struck = false,
  text,
}: {
  digitColor: string;
  fill?: string;
  size: ArenaWellSize;
  struck?: boolean;
  text: string;
}) {
  const missing = (text === DASH || text === CLOCK_MISSING) && fill === LED_WELL;
  return (
    <View
      style={[
        styles.well,
        { backgroundColor: fill, height: size.height, width: size.width },
      ]}
    >
      <Text
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1}
        minimumFontScale={0.6}
        numberOfLines={1}
        style={[
          styles.wellText,
          { color: missing ? MISSING_DIGIT : digitColor, fontSize: size.digit },
          struck && styles.struck,
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

function Label({
  align = 'center',
  color = LABEL_MUTED,
  size,
  style,
  text,
}: {
  align?: TextStyle['textAlign'];
  color?: string;
  size: number;
  style?: StyleProp<TextStyle>;
  text: string;
}) {
  return (
    <Text
      adjustsFontSizeToFit
      maxFontSizeMultiplier={LABEL_MAX_FONT_MULTIPLIER}
      minimumFontScale={0.7}
      numberOfLines={1}
      style={[styles.label, { color, fontSize: size, textAlign: align }, style]}
    >
      {text}
    </Text>
  );
}

// Triangle pointing left or right, drawn with borders so no glyph or emoji font is involved.
function Arrow({ direction, size }: { direction: 'left' | 'right'; size: number }) {
  return (
    <View
      style={[
        styles.arrow,
        { borderBottomWidth: size * 0.6, borderTopWidth: size * 0.6 },
        direction === 'left'
          ? { borderRightColor: LABEL, borderRightWidth: size }
          : { borderLeftColor: LABEL, borderLeftWidth: size },
      ]}
    />
  );
}

// Away cell, middle cell and home cell at the center panel's column widths.
function CenterRow({
  center,
  left,
  minHeight,
  right,
  sizes,
}: {
  center?: ReactNode;
  left?: ReactNode;
  minHeight?: number;
  right?: ReactNode;
  sizes: ArenaCenterSizes;
}) {
  return (
    <View style={[styles.centerRow, minHeight !== undefined && { minHeight }]}>
      <View style={[styles.sideCell, styles.awayCell, { width: sizes.sideColumn }]}>
        {left}
      </View>
      <View
        style={[
          styles.middleCell,
          { marginHorizontal: sizes.columnGap, width: sizes.centerColumn },
        ]}
      >
        {center}
      </View>
      <View style={[styles.sideCell, styles.homeCell, { width: sizes.sideColumn }]}>
        {right}
      </View>
    </View>
  );
}

// Label and well side by side; the home side mirrors the away side.
function LabeledWell({
  children,
  label,
  labelSize,
  side,
}: {
  children: ReactNode;
  label: string;
  labelSize: number;
  side: BoardSideKey | 'center';
}) {
  return (
    <View style={[styles.inline, side === 'home' && styles.inlineMirrored]}>
      <Label size={labelSize} style={styles.inlineLabel} text={label} />
      {children}
    </View>
  );
}

function CenterPanel({
  layout,
  model,
  names,
  stripes,
  style,
}: {
  layout: ArenaLayout;
  model: BasketballBoardModel;
  names: BoardTeamNames;
  stripes: SideColors;
  style?: StyleProp<ViewStyle>;
}) {
  const sizes = layout.sizes.center;
  const labelSize = layout.sizes.label;
  const { flags } = model;
  const pills = bonusPills(model);
  const arrow = lastFoulArrow(model);

  const stripe = (side: BoardSideKey) => (
    <View
      style={[
        styles.stripe,
        { backgroundColor: stripes[side], height: layout.sizes.stripe },
      ]}
    />
  );
  const teamName = (side: BoardSideKey) => (
    <Label
      align={side === 'away' ? 'left' : 'right'}
      color={LABEL}
      size={labelSize}
      style={styles.teamName}
      text={names[side].label}
    />
  );
  const pill = (side: BoardSideKey) => {
    const text = pills[side];
    return text ? (
      <View style={styles.pill}>
        <Text
          adjustsFontSizeToFit
          maxFontSizeMultiplier={LABEL_MAX_FONT_MULTIPLIER}
          numberOfLines={1}
          style={[styles.pillText, { fontSize: labelSize }]}
        >
          {text}
        </Text>
      </View>
    ) : null;
  };
  const teamFouls = (side: BoardSideKey) =>
    flags.teamFouls ? (
      <LabeledWell label="FOULS" labelSize={labelSize} side={side}>
        <Well
          digitColor={STAT_DIGIT}
          size={sizes.statWell}
          text={countText(model[side].teamFouls)}
        />
      </LabeledWell>
    ) : null;
  const timeouts = (side: BoardSideKey) =>
    flags.timeouts ? (
      <LabeledWell label="T.O.L." labelSize={labelSize} side={side}>
        <Well
          digitColor={STAT_DIGIT}
          size={sizes.statWell}
          text={countText(model[side].timeoutsLeft)}
        />
      </LabeledWell>
    ) : null;

  const lastFoul = model.lastFoul;
  const lastFoulTone = lastFoul ? foulTone(lastFoul, model.foulLimit) : 'missing';
  const lastFoulCount = wellColors(lastFoulTone);
  const lastFoulOut = lastFoulTone === 'out';

  return (
    <View
      accessibilityLabel={centerSummary(model, names)}
      accessibilityRole="text"
      accessible
      style={[styles.center, style]}
    >
      <CenterRow left={stripe('away')} right={stripe('home')} sizes={sizes} />
      <CenterRow left={teamName('away')} right={teamName('home')} sizes={sizes} />
      {pills.away || pills.home ? (
        <CenterRow
          left={pill('away')}
          minHeight={PILL_ROW_HEIGHT}
          right={pill('home')}
          sizes={sizes}
        />
      ) : null}
      {flags.teamFouls ? (
        <CenterRow left={teamFouls('away')} right={teamFouls('home')} sizes={sizes} />
      ) : null}
      {flags.lastFoul ? (
        <CenterRow
          center={
            <View style={styles.inline}>
              {arrow === 'left' ? <Arrow direction="left" size={labelSize} /> : null}
              <Label size={labelSize} text="LAST FOUL" />
              {arrow === 'right' ? <Arrow direction="right" size={labelSize} /> : null}
            </View>
          }
          sizes={sizes}
        />
      ) : null}
      {flags.lastFoul || flags.timeouts ? (
        <CenterRow
          center={
            flags.lastFoul ? (
              <View style={styles.inline}>
                <Well
                  digitColor={lastFoulOut ? DIM_DIGIT : STAT_DIGIT}
                  size={sizes.jerseyWell}
                  struck={lastFoulOut}
                  text={jerseyText(lastFoul?.jersey)}
                />
                <Well
                  digitColor={lastFoulCount.digit}
                  fill={lastFoulCount.fill}
                  size={sizes.statWell}
                  text={countText(lastFoul?.fouls)}
                />
              </View>
            ) : null
          }
          left={timeouts('away')}
          right={timeouts('home')}
          sizes={sizes}
        />
      ) : null}
    </View>
  );
}

function PlayerRow({
  foulLimit,
  player,
  rebounds,
  table,
}: {
  foulLimit: number;
  player?: BoardPlayer;
  rebounds: boolean;
  table: ArenaTableSizes;
}) {
  const size = (width: number): ArenaWellSize => ({
    digit: table.digit,
    height: table.rowHeight,
    width,
  });
  const tone = player ? foulTone(player, foulLimit) : 'missing';
  const out = tone === 'out';
  const fouls = wellColors(tone);
  const dimmed = out ? DIM_DIGIT : undefined;
  return (
    <View
      style={[
        styles.tableRow,
        { gap: table.cellGap, marginTop: table.rowGap, paddingHorizontal: table.padding },
      ]}
    >
      <Well
        digitColor={dimmed ?? STAT_DIGIT}
        size={size(table.jersey)}
        struck={out}
        text={player ? jerseyText(player.jersey) : DASH}
      />
      <Well
        digitColor={fouls.digit}
        fill={fouls.fill}
        size={size(table.fouls)}
        text={countText(player?.fouls)}
      />
      <Well
        digitColor={dimmed ?? LED_DIGIT}
        size={size(table.points)}
        text={countText(player?.points)}
      />
      {rebounds ? (
        <Well
          digitColor={dimmed ?? STAT_DIGIT}
          size={size(table.rebounds)}
          text={countText(player?.rebounds)}
        />
      ) : null}
    </View>
  );
}

function PlayerTable({
  caption,
  layout,
  model,
  names,
  rebounds,
  side,
  stripe,
}: {
  caption?: string;
  layout: ArenaLayout;
  model: BasketballBoardModel;
  names: BoardTeamNames;
  rebounds: boolean;
  side: BoardSideKey;
  stripe: string;
}) {
  const table = layout.sizes.table;
  const labelSize = layout.sizes.label;
  const header = (text: string, width: number) => (
    <Label size={labelSize} style={{ width }} text={text} />
  );
  return (
    <View
      accessibilityLabel={tableSummary(model, side, names, layout.showReb)}
      accessibilityRole="text"
      accessible
      style={{ width: table.width }}
    >
      {caption !== undefined ? (
        <Label size={labelSize} style={styles.caption} text={caption} />
      ) : null}
      <View
        style={[styles.stripe, { backgroundColor: stripe, height: layout.sizes.stripe }]}
      />
      <Label
        align="left"
        color={LABEL}
        size={labelSize}
        style={[styles.teamName, { paddingHorizontal: table.padding }]}
        text={names[side].label}
      />
      <View
        style={[
          styles.tableRow,
          { gap: table.cellGap, paddingHorizontal: table.padding },
        ]}
      >
        {header('#', table.jersey)}
        {header('FL', table.fouls)}
        {header('PTS', table.points)}
        {rebounds ? header('REB', table.rebounds) : null}
      </View>
      {tableRows(model[side]).map((player, index) => (
        <PlayerRow
          foulLimit={model.foulLimit}
          key={player?.athleteId ?? `dash-${index}`}
          player={player}
          rebounds={rebounds}
          table={table}
        />
      ))}
    </View>
  );
}

export function BasketballArenaBoard({
  accentColor,
  isHome,
  model,
  opponentName,
  teamLabel,
  teamSpokenName,
}: {
  // The followed team's 4 dp stripe.
  accentColor: string;
  // The followed team is the home side.
  isHome: boolean;
  model: BasketballBoardModel;
  opponentName: string;
  // Board text and spoken form of the followed team's name.
  teamLabel: string;
  teamSpokenName: string;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number>();
  const showTables = model.flags.players;
  const layout = arenaLayout(measuredWidth ?? arenaBoardWidth(windowWidth), {
    tables: showTables,
  });
  const names = boardTeamNames(isHome, opponentName, {
    label: teamLabel,
    spoken: teamSpokenName,
  });
  const opponentSide: BoardSideKey = isHome ? 'away' : 'home';
  const opponentStripe = opponentStripeColor(
    model[opponentSide].color,
    model[opponentSide].alternateColor,
  );
  const followedStripe = opponentStripeColor(
    accentColor,
    model[isHome ? 'home' : 'away'].alternateColor,
  );
  const stripes: SideColors = {
    away: isHome ? opponentStripe : followedStripe,
    home: isHome ? followedStripe : opponentStripe,
  };
  const rebounds = layout.showReb && model.flags.rebounds;
  const captions = lineupCaptions(layout.mode, model.away.lineup, model.home.lineup);
  const note = useStaleNote(model.stale.polledAt);
  const { flags } = model;
  const hasDetail =
    flags.players || flags.teamFouls || flags.bonus || flags.lastFoul || flags.timeouts;

  const onLayout = (event: LayoutChangeEvent) => {
    const inner = Math.max(
      0,
      event.nativeEvent.layout.width - 2 * (BOARD_BORDER + BOARD_PADDING),
    );
    setMeasuredWidth((current) =>
      current !== undefined && Math.abs(current - inner) < 0.5 ? current : inner,
    );
  };
  const table = (side: BoardSideKey) => (
    <PlayerTable
      caption={captions[side]}
      layout={layout}
      model={model}
      names={names}
      rebounds={rebounds}
      side={side}
      stripe={stripes[side]}
    />
  );
  const center = (style?: StyleProp<ViewStyle>) => (
    <CenterPanel
      layout={layout}
      model={model}
      names={names}
      stripes={stripes}
      style={style}
    />
  );

  if (!hasDetail) {
    return note ? <Text style={styles.staleNote}>{note}</Text> : null;
  }

  return (
    <>
      <View onLayout={onLayout} style={styles.board}>
        {!showTables ? (
          center()
        ) : layout.mode === 'arena' ? (
          <View style={styles.arenaRow}>
            {table('away')}
            {center(styles.arenaCenter)}
            {table('home')}
          </View>
        ) : (
          <>
            {center()}
            <View style={styles.divider} />
            {captions.shared !== undefined ? (
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Label
                  size={layout.sizes.label}
                  style={styles.caption}
                  text={captions.shared}
                />
              </View>
            ) : null}
            <View
              style={layout.mode === 'split' ? styles.tablesRow : styles.tablesColumn}
            >
              {table('away')}
              {table('home')}
            </View>
          </>
        )}
      </View>
      {note ? <Text style={styles.staleNote}>{note}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  board: {
    backgroundColor: BOARD_FRAME,
    borderColor: BOARD_EDGE,
    borderRadius: 12,
    borderWidth: BOARD_BORDER,
    marginHorizontal: -BOARD_BLEED,
    marginTop: 16,
    overflow: 'hidden',
    padding: BOARD_PADDING,
  },
  arenaRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  arenaCenter: {
    flex: 1,
    marginHorizontal: SECTION_GAP,
  },
  center: {
    alignItems: 'center',
    gap: CENTER_ROW_GAP,
  },
  centerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  sideCell: {
    justifyContent: 'center',
  },
  awayCell: {
    alignItems: 'flex-start',
  },
  homeCell: {
    alignItems: 'flex-end',
  },
  middleCell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripe: {
    alignSelf: 'stretch',
    borderRadius: 2,
  },
  teamName: {
    alignSelf: 'stretch',
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  label: {
    fontWeight: '800',
    includeFontPadding: false,
    letterSpacing: 0.3,
  },
  inline: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: INLINE_GAP,
  },
  inlineMirrored: {
    flexDirection: 'row-reverse',
  },
  inlineLabel: {
    flexShrink: 1,
  },
  well: {
    alignItems: 'center',
    borderRadius: 4,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  wellText: {
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  struck: {
    textDecorationLine: 'line-through',
  },
  pill: {
    backgroundColor: BONUS_FILL,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  pillText: {
    color: BONUS_TEXT,
    fontWeight: '900',
    includeFontPadding: false,
    letterSpacing: 0.4,
  },
  arrow: {
    borderBottomColor: 'transparent',
    borderTopColor: 'transparent',
    height: 0,
    width: 0,
  },
  divider: {
    backgroundColor: BOARD_EDGE,
    height: 1,
    marginBottom: SECTION_GAP,
    marginTop: SECTION_GAP + 2,
  },
  caption: {
    marginBottom: 6,
  },
  tablesRow: {
    flexDirection: 'row',
    gap: SECTION_GAP,
    justifyContent: 'center',
  },
  tablesColumn: {
    alignItems: 'center',
    gap: SECTION_GAP,
  },
  tableRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  staleNote: {
    color: NOTE_TEXT,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 8,
    textAlign: 'center',
  },
});
