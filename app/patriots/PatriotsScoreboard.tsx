import { StyleSheet, Text, View } from 'react-native';
import type { LiveFootballScoreboard } from './espnScoreboard';
import { PATRIOTS_TEAM_ID } from './patriotsSnapshot';

const MAX_QUARTERS = 10;

function teamLabel(isPatriots: boolean, opponentName: string): string {
  if (isPatriots) {
    return 'PATRIOTS';
  }
  const parts = opponentName.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? opponentName).toUpperCase();
}

function periodLabel(period: number): string {
  if (period <= 0) {
    return '';
  }
  if (period <= 4) {
    return `Q${period}`;
  }
  return period === 5 ? 'OT' : `${period - 4}OT`;
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

export function PatriotsScoreboard({
  isHome,
  opponentName,
  scoreboard,
}: {
  isHome: boolean;
  opponentName: string;
  scoreboard: LiveFootballScoreboard;
}) {
  // period comes straight from ESPN and is only floored at 0 upstream, so a malformed
  // response would otherwise size this array arbitrarily and render a View per column.
  const quarterCount = Math.min(
    MAX_QUARTERS,
    Math.max(
      4,
      scoreboard.away.quarters.length,
      scoreboard.home.quarters.length,
      scoreboard.period,
    ),
  );
  const headers = Array.from({ length: quarterCount }, (_, index) =>
    index < 4 ? String(index + 1) : index === 4 ? 'OT' : `${index - 3}OT`,
  );
  const awayLabel = teamLabel(!isHome, opponentName);
  const homeLabel = teamLabel(isHome, opponentName);
  const possessionIsHome =
    scoreboard.possessionTeamId === undefined
      ? undefined
      : isHome
        ? scoreboard.possessionTeamId === PATRIOTS_TEAM_ID
        : scoreboard.possessionTeamId !== PATRIOTS_TEAM_ID;
  const clockLine = [periodLabel(scoreboard.period), scoreboard.clock]
    .filter(Boolean)
    .join(' ');
  const summary = [
    `${awayLabel} ${scoreboard.away.points}`,
    `${homeLabel} ${scoreboard.home.points}`,
    scoreboard.status,
    clockLine,
    scoreboard.situation,
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
          style={[styles.teamLabel, !isHome && styles.patriotsLabel]}
        >
          {possessionIsHome === false ? '▸ ' : ''}
          {awayLabel}
        </Text>
        {headers.map((_, index) => (
          <LedCell
            key={`a-${index}`}
            value={scoreboard.away.quarters[index]}
          />
        ))}
        <LedCell value={scoreboard.away.points} />
      </View>

      <View style={styles.gridRow}>
        <Text
          numberOfLines={1}
          style={[styles.teamLabel, isHome && styles.patriotsLabel]}
        >
          {possessionIsHome === true ? '▸ ' : ''}
          {homeLabel}
        </Text>
        {headers.map((_, index) => (
          <LedCell
            key={`h-${index}`}
            value={scoreboard.home.quarters[index]}
          />
        ))}
        <LedCell value={scoreboard.home.points} />
      </View>

      <View style={styles.situationBar}>
        <Text style={styles.situationText}>
          {clockLine || scoreboard.status}
        </Text>
        {scoreboard.situation ? (
          <Text style={styles.situationText}>{scoreboard.situation}</Text>
        ) : null}
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
  patriotsLabel: {
    color: '#E31937',
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
    gap: 4,
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
