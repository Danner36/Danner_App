import { StyleSheet, Text, View } from 'react-native';
import type { WinChance } from './espnWinChance';

export function WinChanceBar({
  chance,
  opponentName,
  teamName,
}: {
  chance: WinChance;
  opponentName: string;
  teamName: string;
}) {
  const teamPercent = Math.round(chance.team);
  const opponentPercent = Math.round(chance.opponent);
  const total = chance.team + chance.opponent;
  const teamShare = total > 0 ? chance.team / total : 0.5;

  return (
    <View
      accessibilityLabel={`Win chance: ${teamName} ${teamPercent} percent, ${opponentName} ${opponentPercent} percent`}
      accessible
      style={styles.box}
    >
      <Text style={styles.label}>WIN CHANCE</Text>
      <View style={styles.row}>
        <Text numberOfLines={1} style={styles.teamText}>
          {teamName} {teamPercent}%
        </Text>
        <Text numberOfLines={1} style={[styles.teamText, styles.opponentText]}>
          {opponentName} {opponentPercent}%
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${teamShare * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 17,
  },
  fill: {
    backgroundColor: '#0B2B4C',
    height: 8,
  },
  label: {
    color: '#697780',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  opponentText: {
    textAlign: 'right',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  teamText: {
    color: '#0B2B4C',
    flex: 1,
    fontSize: 17,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  track: {
    backgroundColor: '#D7DEE5',
    borderRadius: 4,
    height: 8,
    marginTop: 8,
    overflow: 'hidden',
  },
});
