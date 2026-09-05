import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import { CyclonesScreen } from './cyclones/CyclonesScreen';
import { GuardiansScreen } from './guardians/GuardiansScreen';
import { HubScreen } from './hub/HubScreen';
import { PatriotsScreen } from './patriots/PatriotsScreen';
import { TvLocationScreen } from './tvLocation/TvLocationScreen';

type AppScreen =
  | 'cyclones'
  | 'guardians'
  | 'menu'
  | 'patriots'
  | 'tv-location';

export default function App() {
  const [appScreen, setAppScreen] = useState<AppScreen>('menu');

  const openMenu = useCallback(() => {
    setAppScreen('menu');
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top', 'bottom']} style={styles.systemSafeArea}>
        {appScreen === 'menu' ? (
          <HubScreen
            onOpenCyclones={() => setAppScreen('cyclones')}
            onOpenGuardians={() => setAppScreen('guardians')}
            onOpenPatriots={() => setAppScreen('patriots')}
            onOpenTvLocation={() => setAppScreen('tv-location')}
          />
        ) : appScreen === 'guardians' ? (
          <GuardiansScreen onBack={openMenu} />
        ) : appScreen === 'patriots' ? (
          <PatriotsScreen onBack={openMenu} />
        ) : appScreen === 'cyclones' ? (
          <CyclonesScreen onBack={openMenu} />
        ) : (
          <TvLocationScreen onBackToMenu={openMenu} />
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
