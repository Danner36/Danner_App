import { StyleSheet, Text, View } from 'react-native';
import type { LiveBasketballScoreboard } from './espnCyclonesScoreboard';

const MAX_PERIODS = 10;

function teamLabel(isCyclones: boolean, opponentName: string): string {
  if (isCyclones) {
    return 'CYCLONES';
  }
  const parts = opponentName.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? opponentName).toUpperCase();
}

function periodLabel(period: number, regulationPeriods: number): string {
  if (period <= 0) {
    return '';
  }
  if (period <= regulationPeriods) {
    return regulationPeriods === 2 ? `H${period}` : `Q${period}`;
  }
  return period === regulationPeriods + 1
    ? 'OT'
    : `${period - regulationPeriods}OT`;
}

function LedCell({ value }: { value?: number | string }) {
  const shown =
    value === undefined || value === '' ? '' : String(value).slice(0, 3);

  return (
    <View style={styles.led}>
      <Text numberOfLines={1} style={styles.ledText}>
        {shown}
      </Text>
    </View>
  );
}

export function CyclonesBasketballScoreboard({
  isHome,
  opponentName,
  regulationPeriods,
  scoreboard,
}: {
  isHome: boolean;
  opponentName: string;
  regulationPeriods: 2 | 4;
  scoreboard: LiveBasketballScoreboard;
}) {
  const periodCount = Math.min(
    MAX_PERIODS,
    Math.max(
      regulationPeriods,
      scoreboard.away.periods.length,
      scoreboard.home.periods.length,
      scoreboard.period,
    ),
  );
  const headers = Array.from({ length: periodCount }, (_, index) =>
    index < regulationPeriods
      ? String(index + 1)
      : index === regulationPeriods
        ? 'OT'
        : `${index - regulationPeriods + 1}OT`,
  );
  const awayLabel = teamLabel(!isHome, opponentName);
  const homeLabel = teamLabel(isHome, opponentName);
  const clockLine = [
    periodLabel(scoreboard.period, regulationPeriods),
    scoreboard.clock,
  ]
    .filter(Boolean)
    .join(' ');
  const summary = [
    `${awayLabel} ${scoreboard.away.points}`,
    `${homeLabel} ${scoreboard.home.points}`,
    scoreboard.status,
    clockLine,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View
      accessibilityLabel={summary}
      accessibilityRole="text"
      style={styles.board}
    >
      <View style={styles.gridRow}>
        <View style={styles.teamSpacer} />
        {headers.map((header) => (
          <Text key={`h-${header}`} style={styles.periodHeader}>
            {header}
          </Text>
        ))}
        <Text style={styles.totalHeader}>T</Text>
      </View>

      <View style={styles.gridRow}>
        <Text
          numberOfLines={1}
          style={[styles.teamLabel, !isHome && styles.cyclonesLabel]}
        >
          {awayLabel}
        </Text>
        {headers.map((_, index) => (
          <LedCell
            key={`a-${index}`}
            value={scoreboard.away.periods[index]}
          />
        ))}
        <LedCell value={scoreboard.away.points} />
      </View>

      <View style={styles.gridRow}>
        <Text
          numberOfLines={1}
          style={[styles.teamLabel, isHome && styles.cyclonesLabel]}
        >
          {homeLabel}
        </Text>
        {headers.map((_, index) => (
          <LedCell
            key={`h-${index}`}
            value={scoreboard.home.periods[index]}
          />
        ))}
        <LedCell value={scoreboard.home.points} />
      </View>

      <View style={styles.situationBar}>
        <Text style={styles.situationText}>
          {clockLine || scoreboard.status}
        </Text>
      </View>
    </View>
  );
}

const LED_WIDTH = 32;
const TEAM_WIDTH = 86;

const styles = StyleSheet.create({
  board: {
    backgroundColor: '#07264A',
    borderColor: '#F4F7FA',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 16,
    overflow: 'hidden',
    paddingBottom: 12,
    paddingHorizontal: 8,
    paddingTop: 10,
  },
  gridRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 4,
  },
  teamSpacer: {
    width: TEAM_WIDTH,
  },
  periodHeader: {
    color: '#F4F7FA',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    width: LED_WIDTH,
  },
  totalHeader: {
    color: '#F4F7FA',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    width: LED_WIDTH,
  },
  teamLabel: {
    color: '#F4F7FA',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
    paddingRight: 4,
    width: TEAM_WIDTH,
  },
  cyclonesLabel: {
    color: '#AE192D',
  },
  led: {
    alignItems: 'center',
    backgroundColor: '#05070A',
    height: 22,
    justifyContent: 'center',
    marginHorizontal: 1,
    width: LED_WIDTH - 2,
  },
  ledText: {
    color: '#FFCF4A',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  situationBar: {
    borderTopColor: 'rgba(244, 247, 250, 0.35)',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 10,
    paddingTop: 10,
  },
  situationText: {
    color: '#F4F7FA',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
});
