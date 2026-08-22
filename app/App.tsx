import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Platform, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import { GuardiansScreen } from './guardians/GuardiansScreen';
import { HubScreen } from './hub/HubScreen';
import { TvLocationScreen } from './tvLocation/TvLocationScreen';

type AppScreen = 'guardians' | 'menu' | 'tv-location';

export default function App() {
  const [appScreen, setAppScreen] = useState<AppScreen>('menu');

  const openMenu = useCallback(() => {
    setAppScreen('menu');
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' || appScreen !== 'guardians') {
      return;
    }

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        setAppScreen('menu');
        return true;
      },
    );

    return () => subscription.remove();
  }, [appScreen]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top', 'bottom']} style={styles.systemSafeArea}>
        {appScreen === 'menu' ? (
          <HubScreen
            onOpenGuardians={() => setAppScreen('guardians')}
            onOpenTvLocation={() => setAppScreen('tv-location')}
          />
        ) : appScreen === 'guardians' ? (
          <GuardiansScreen onBack={openMenu} />
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
