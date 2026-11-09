import { StyleSheet, Text, View } from 'react-native';
import { displayPercent, type WinChance } from '../leagues/espn/winChance.ts';
import type { TeamRef } from '../leagues/types.ts';
import type { TeamGame } from './engine/types.ts';
import { useWinChance } from './useWinChance';

function lastWord(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

export function WinChanceBar({
  chance,
  onBoard = false,
  opponentName,
  teamName,
}: {
  chance: WinChance;
  // Drawn on a game card's dark score header, with the teams named.
  onBoard?: boolean;
  opponentName: string;
  teamName: string;
}) {
  const teamPercent = displayPercent(chance.team);
  const opponentPercent = displayPercent(chance.opponent);
  const total = chance.team + chance.opponent;
  const teamShare = total > 0 ? chance.team / total : 0.5;
  const barWidth = `${displayPercent(teamShare * 100)}%` as const;

  if (onBoard) {
    return (
      <View
        accessibilityLabel={`Win chance: ${teamName} ${teamPercent} percent, ${opponentName} ${opponentPercent} percent`}
        accessible
        style={styles.boardBox}
      >
        <View style={styles.boardTrack}>
          <View style={[styles.boardFill, { width: barWidth }]} />
        </View>
        <View style={styles.boardRow}>
          <Text numberOfLines={1} style={styles.boardText}>
            {teamName} {teamPercent}%
          </Text>
          <Text style={styles.boardLabel}>WIN CHANCE</Text>
          <Text numberOfLines={1} style={[styles.boardText, styles.opponentText]}>
            {lastWord(opponentName)} {opponentPercent}%
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      accessibilityLabel={`Win chance: ${teamName} ${teamPercent} percent, ${opponentName} ${opponentPercent} percent`}
      accessible
      style={styles.box}
    >
      <Text style={styles.label}>WIN CHANCE</Text>
      <View style={styles.row}>
        <Text numberOfLines={1} style={styles.teamText}>
          Us {teamPercent}%
        </Text>
        <Text numberOfLines={1} style={[styles.teamText, styles.opponentText]}>
          Them {opponentPercent}%
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: barWidth }]} />
      </View>
    </View>
  );
}

// The win chance under the first schedule row when no game is featured.
export function NextGameWinChance({
  game,
  team,
}: {
  game: TeamGame;
  team: TeamRef;
}) {
  const chance = useWinChance(game, team);
  if (!chance) {
    return null;
  }
  return (
    <View style={styles.nextGame}>
      <WinChanceBar
        chance={chance}
        opponentName={game.opponentName}
        teamName={team.nickname}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  nextGame: {
    paddingBottom: 14,
  },
  box: {
    marginTop: 17,
  },
  boardBox: {
    marginTop: 10,
  },
  boardTrack: {
    backgroundColor: 'rgba(244, 247, 250, 0.25)',
    borderRadius: 3,
    height: 6,
    overflow: 'hidden',
  },
  boardFill: {
    backgroundColor: '#FFCF4A',
    height: 6,
  },
  boardRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 7,
  },
  boardText: {
    color: '#F4F7FA',
    flex: 1,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  boardLabel: {
    color: '#B9C6D3',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
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
