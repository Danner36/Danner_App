import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import { HubScreen } from './hub/HubScreen';
import {
  CYCLONES_TILE,
  GUARDIANS_TILE,
  PATRIOTS_TILE,
  PRESET_TILES,
} from './selection/presets.ts';
import { TeamScreen } from './team/TeamScreen';
import { TvLocationScreen } from './tvLocation/TvLocationScreen';

type Route =
  | { name: 'hub' }
  | { name: 'team'; tileKey: string }
  | { name: 'tv-location' };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'hub' });

  const openHub = useCallback(() => {
    setRoute({ name: 'hub' });
  }, []);

  const tile =
    route.name === 'team'
      ? PRESET_TILES.find((candidate) => candidate.key === route.tileKey)
      : undefined;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top', 'bottom']} style={styles.systemSafeArea}>
        {tile ? (
          <TeamScreen key={tile.key} onBack={openHub} tile={tile} />
        ) : route.name === 'tv-location' ? (
          <TvLocationScreen onBackToMenu={openHub} />
        ) : (
          <HubScreen
            onOpenCyclones={() =>
              setRoute({ name: 'team', tileKey: CYCLONES_TILE.key })
            }
            onOpenGuardians={() =>
              setRoute({ name: 'team', tileKey: GUARDIANS_TILE.key })
            }
            onOpenPatriots={() =>
              setRoute({ name: 'team', tileKey: PATRIOTS_TILE.key })
            }
            onOpenTvLocation={() => setRoute({ name: 'tv-location' })}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  systemSafeArea: {
    backgroundColor: '#F7F7F2',
    flex: 1,
  },
});
