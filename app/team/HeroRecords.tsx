import { StyleSheet, Text, View } from 'react-native';
import { isSportKey, sportLabel } from '../leagues/sports.ts';
import type { AdapterKey, SportKey } from '../leagues/types.ts';
import { recordLabel } from './engine/records.ts';
import type { TeamRecord, TeamSnapshot } from './engine/types.ts';

function sportOf(adapter: AdapterKey): SportKey | undefined {
  const sport = adapter.startsWith('ncaa/')
    ? adapter.slice('ncaa/'.length)
    : undefined;
  return isSportKey(sport) ? sport : undefined;
}

function recordDescription(
  adapter: AdapterKey,
  record: TeamRecord,
  showSportLabels: boolean,
): string {
  const label = recordLabel(record.wins, record.losses, record.ties);
  const sport = sportOf(adapter);
  if (sport && showSportLabels) {
    return `${sportLabel(sport)} ${label}`;
  }
  return adapter === 'mlb'
    ? `Season record ${record.wins} wins, ${record.losses} losses`
    : `Season record ${label}`;
}

export function HeroRecords({
  adapters,
  showSportLabels,
  snapshot,
}: {
  adapters: readonly AdapterKey[];
  showSportLabels: boolean;
  snapshot: TeamSnapshot;
}) {
  return adapters
    .filter((adapter) => !snapshot.unavailable?.includes(adapter))
    .map((adapter) => {
      const record = snapshot.records[adapter];
      if (!record) {
        return null;
      }
      const status = snapshot.statuses[adapter];
      const sport = sportOf(adapter);
      const label = recordLabel(record.wins, record.losses, record.ties);
      return (
        <View key={adapter} style={styles.block}>
          <Text
            accessibilityLabel={recordDescription(
              adapter,
              record,
              showSportLabels,
            )}
            style={styles.record}
          >
            {sport && showSportLabels ? `${sportLabel(sport)} ${label}` : label}
          </Text>
          {status ? <Text style={styles.status}>{status.label}</Text> : null}
        </View>
      );
    });
}

const styles = StyleSheet.create({
  block: {
    alignItems: 'center',
    marginTop: 4,
  },
  record: {
    color: '#5A6870',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  status: {
    color: '#8A4B00',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
  },
});
