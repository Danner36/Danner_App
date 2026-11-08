import { StyleSheet, Text, View } from 'react-native';
import { sportLabel } from '../leagues/sports.ts';
import type { TeamRef } from '../leagues/types.ts';
import { gameDateLabel } from './engine/dates.ts';
import type { TeamSnapshot } from './engine/types.ts';
import { NextGameWinChance } from './WinChanceBar';

export function ScheduleList({
  showSportLabels,
  snapshot,
  team,
}: {
  showSportLabels: boolean;
  snapshot: TeamSnapshot;
  team: TeamRef;
}) {
  return (
    <>
      <View style={styles.scheduleHeader}>
        <Text style={styles.sectionTitle}>Upcoming games</Text>
      </View>

      {snapshot.upcomingGames.length ? (
        <View style={styles.scheduleCard}>
          {snapshot.upcomingGames.map((game, index) => (
            // A postponed game and its makeup share a game id.
            <View key={`${game.key}:${game.gameDate}`}>
              {index > 0 ? <View style={styles.gameDivider} /> : null}
              <View style={styles.gameRow}>
                <View style={styles.gameDateColumn}>
                  {showSportLabels && game.sport ? (
                    <Text style={styles.gameSport}>{sportLabel(game.sport)}</Text>
                  ) : null}
                  <Text style={styles.gameDate}>{gameDateLabel(game)}</Text>
                  {game.status !== 'Scheduled' ? (
                    <Text style={styles.gameStatus}>{game.status}</Text>
                  ) : null}
                </View>
                <Text style={styles.gameOpponent}>
                  {game.isHome || game.neutralSite ? 'vs' : 'at'}{' '}
                  {game.opponentName}
                </Text>
              </View>
              {index === 0 && snapshot.featuredGames.length === 0 ? (
                <NextGameWinChance game={game} team={team} />
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No upcoming games are scheduled.</Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  scheduleHeader: {
    marginBottom: 11,
    marginTop: 8,
  },
  sectionTitle: {
    color: '#0B2B4C',
    fontSize: 25,
    fontWeight: '900',
  },
  scheduleCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D7DEE5',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 16,
  },
  gameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 76,
    paddingVertical: 12,
  },
  gameDateColumn: {
    flex: 1,
    paddingRight: 12,
  },
  gameSport: {
    color: '#0B2B4C',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  gameDate: {
    color: '#53616A',
    fontSize: 15,
    fontWeight: '800',
  },
  gameStatus: {
    color: '#B20D27',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
  },
  gameOpponent: {
    color: '#0B2B4C',
    flex: 1,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'right',
  },
  gameDivider: {
    backgroundColor: '#E3E8EC',
    height: 1,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D7DEE5',
    borderRadius: 18,
    borderWidth: 1,
    padding: 24,
  },
  emptyText: {
    color: '#59666E',
    fontSize: 16,
    fontWeight: '700',
  },
});
