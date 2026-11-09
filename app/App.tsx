import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import { HubScreen } from './hub/HubScreen';
import type { TeamKey } from './leagues/types.ts';
import { deleteLogo } from './logos/logoStore';
import { TeamPickerScreen, type PickerStart } from './picker/TeamPickerScreen';
import { findTile, hasModule, YOUTUBE_TV_MODULE } from './selection/ops.ts';
import { removeSourcesCache, useSelectionStore } from './selection/store';
import { TeamScreen } from './team/TeamScreen';
import { TvLocationScreen } from './tvLocation/TvLocationScreen';

// Held until the selection has loaded, so a family phone never flashes the fresh-install hub.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

type Route =
  | { name: 'hub' }
  | { name: 'team'; tileKey: TeamKey }
  | { name: 'picker'; start?: PickerStart }
  | { name: 'tv-location' };

export default function App() {
  const store = useSelectionStore();
  const [route, setRoute] = useState<Route>({ name: 'hub' });

  useEffect(() => {
    if (store.loaded) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [store.loaded]);

  const openHub = useCallback(() => {
    setRoute({ name: 'hub' });
  }, []);

  const clearTileData = useCallback((key: TeamKey) => {
    void removeSourcesCache(key);
    void deleteLogo(key);
  }, []);

  const tile =
    route.name === 'team' ? findTile(store.selection, route.tileKey) : undefined;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top', 'bottom']} style={styles.systemSafeArea}>
        {!store.loaded ? null : tile ? (
          <TeamScreen key={tile.key} onBack={openHub} tile={tile} />
        ) : route.name === 'tv-location' ? (
          <TvLocationScreen onBackToMenu={openHub} />
        ) : route.name === 'picker' ? (
          <TeamPickerScreen
            applyChange={store.apply}
            onClose={openHub}
            onTileRemoved={clearTileData}
            selection={store.selection}
            start={route.start}
          />
        ) : (
          <HubScreen
            applyChange={store.apply}
            onChangeSports={(schoolKey) =>
              setRoute({ name: 'picker', start: { schoolKey } })
            }
            onOpenPicker={() => setRoute({ name: 'picker' })}
            onOpenTeam={(tileKey) => setRoute({ name: 'team', tileKey })}
            onOpenTvLocation={() => setRoute({ name: 'tv-location' })}
            onTileRemoved={clearTileData}
            readOnly={store.readOnly}
            retryLoad={store.reload}
            showTvTile={hasModule(store.selection, YOUTUBE_TV_MODULE)}
            tiles={store.selection.tiles}
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
