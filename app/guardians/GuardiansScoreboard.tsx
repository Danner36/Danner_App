import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LiveScoreboard } from './mlbLinescore';

function teamLabel(isGuardians: boolean, opponentName: string): string {
  if (isGuardians) {
    return 'GUARDIANS';
  }
  const parts = opponentName.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? opponentName).toUpperCase();
}

function LedCell({
  compact,
  value,
}: {
  compact?: boolean;
  value?: number | string;
}) {
  const shown =
    value === undefined || value === '' ? '' : String(value).slice(0, 2);

  return (
    <View style={[styles.led, compact && styles.ledCompact]}>
      <Text numberOfLines={1} style={styles.ledText}>
        {shown}
      </Text>
    </View>
  );
}

function CountLamps({
  cap,
  filled,
  label,
}: {
  cap: number;
  filled: number;
  label: string;
}) {
  const lit = Math.min(cap, filled);

  return (
    <View style={styles.lampGroup}>
      <Text style={styles.boardLabel}>{label}</Text>
      <View style={styles.lampRow}>
        {Array.from({ length: cap }, (_, index) => (
          <View
            key={`${label}-${index}`}
            style={[styles.lamp, index < lit && styles.lampOn]}
          />
        ))}
      </View>
    </View>
  );
}

export function GuardiansScoreboard({
  isHome,
  opponentName,
  scoreboard,
}: {
  isHome: boolean;
  opponentName: string;
  scoreboard: LiveScoreboard;
}) {
  const inningCount = Math.max(
    9,
    ...scoreboard.innings.map((inning) => inning.num),
  );
  const innings = Array.from({ length: inningCount }, (_, index) => {
    const num = index + 1;
    return (
      scoreboard.innings.find((inning) => inning.num === num) ?? { num }
    );
  });
  const awayLabel = teamLabel(!isHome, opponentName);
  const homeLabel = teamLabel(isHome, opponentName);
  const summary = [
    `${awayLabel} ${scoreboard.away.runs}`,
    `${homeLabel} ${scoreboard.home.runs}`,
    scoreboard.status,
    `${scoreboard.balls} balls`,
    `${scoreboard.strikes} strikes`,
    `${scoreboard.outs} outs`,
    scoreboard.batterNumber ? `at bat ${scoreboard.batterNumber}` : '',
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View
      accessibilityLabel={summary}
      accessibilityRole="text"
      style={styles.board}
    >
      <ScrollView
        bounces={false}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        <View>
          <View style={styles.gridRow}>
            <View style={styles.teamSpacer} />
            {innings.map((inning) => (
              <Text key={`h-${inning.num}`} style={styles.inningHeader}>
                {inning.num}
              </Text>
            ))}
            <Text style={styles.totalHeader}>R</Text>
            <Text style={styles.totalHeader}>H</Text>
            <Text style={styles.totalHeader}>E</Text>
          </View>

          <View style={styles.gridRow}>
            <Text
              numberOfLines={1}
              style={[
                styles.teamLabel,
                !isHome && styles.guardiansLabel,
              ]}
            >
              {awayLabel}
            </Text>
            {innings.map((inning) => (
              <LedCell key={`a-${inning.num}`} value={inning.away} />
            ))}
            <LedCell value={scoreboard.away.runs} />
            <LedCell value={scoreboard.away.hits} />
            <LedCell value={scoreboard.away.errors} />
          </View>

          <View style={styles.gridRow}>
            <Text
              numberOfLines={1}
              style={[styles.teamLabel, isHome && styles.guardiansLabel]}
            >
              {homeLabel}
            </Text>
            {innings.map((inning) => (
              <LedCell key={`h-r-${inning.num}`} value={inning.home} />
            ))}
            <LedCell value={scoreboard.home.runs} />
            <LedCell value={scoreboard.home.hits} />
            <LedCell value={scoreboard.home.errors} />
          </View>
        </View>
      </ScrollView>

      <View style={styles.countBar}>
        <View style={styles.atBatBlock}>
          <Text style={styles.boardLabel}>AT BAT</Text>
          <LedCell compact value={scoreboard.batterNumber} />
        </View>
        <CountLamps
          cap={3}
          filled={scoreboard.balls}
          label="BALLS"
        />
        <CountLamps
          cap={2}
          filled={scoreboard.strikes}
          label="STRIKES"
        />
        <CountLamps cap={3} filled={scoreboard.outs} label="OUTS" />
        <View style={styles.atBatBlock}>
          <Text style={styles.boardLabel}>P</Text>
          <LedCell compact value={scoreboard.pitcherNumber} />
        </View>
      </View>
    </View>
  );
}

const LED_WIDTH = 26;
const TEAM_WIDTH = 78;

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
  inningHeader: {
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
  guardiansLabel: {
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
  ledCompact: {
    width: 34,
  },
  ledText: {
    color: '#FFCF4A',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  countBar: {
    alignItems: 'flex-end',
    borderTopColor: 'rgba(244, 247, 250, 0.35)',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
  },
  atBatBlock: {
    alignItems: 'center',
    gap: 4,
  },
  boardLabel: {
    color: '#F4F7FA',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  lampGroup: {
    alignItems: 'center',
  },
  lampRow: {
    flexDirection: 'row',
    gap: 5,
  },
  lamp: {
    backgroundColor: '#1A1A1A',
    borderColor: '#3A3A3A',
    borderRadius: 6,
    borderWidth: 1,
    height: 12,
    width: 12,
  },
  lampOn: {
    backgroundColor: '#FFCF4A',
    borderColor: '#FFCF4A',
  },
});
