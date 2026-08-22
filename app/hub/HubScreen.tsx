import { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getProvisioningExpirationTimestamp } from '../modules/danner-provisioning-profile/src';
import { getProvisioningWarning } from './provisioningWarning';

export function HubScreen({
  onOpenGuardians,
  onOpenTvLocation,
}: {
  onOpenGuardians: () => void;
  onOpenTvLocation: () => void;
}) {
  const [provisioningExpiration, setProvisioningExpiration] = useState<
    number | undefined
  >();
  const [currentTime, setCurrentTime] = useState(Date.now());

  const readProvisioningExpiration = useCallback(() => {
    setProvisioningExpiration(getProvisioningExpirationTimestamp());
    setCurrentTime(Date.now());
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }

    readProvisioningExpiration();
    const clock = setInterval(() => setCurrentTime(Date.now()), 60_000);
    const appStateSubscription = AppState.addEventListener(
      'change',
      (nextState) => {
        if (nextState === 'active') {
          readProvisioningExpiration();
        }
      },
    );

    return () => {
      clearInterval(clock);
      appStateSubscription.remove();
    };
  }, [readProvisioningExpiration]);

  const provisioningWarning = getProvisioningWarning(
    provisioningExpiration,
    currentTime,
  );

  return (
    <View style={styles.menuScreen}>
      {provisioningWarning ? (
        <View accessibilityRole="alert" style={styles.menuExpiryWarning}>
          <Text style={styles.menuExpiryWarningTitle}>
            {provisioningWarning.title}
          </Text>
          <Text style={styles.menuExpiryWarningInstruction}>
            {provisioningWarning.instruction}
          </Text>
        </View>
      ) : null}

      <Image
        accessibilityLabel="Danner logo"
        resizeMode="contain"
        source={require('../assets/ic_launcher_danner.jpg')}
        style={styles.menuLogo}
      />

      <View style={styles.subAppRow}>
        <Pressable
          accessibilityLabel="Cleveland Guardians"
          accessibilityHint="Opens Guardians scores, record, schedule, and authorized live video"
          accessibilityRole="button"
          onPress={onOpenGuardians}
          style={({ pressed }) => [
            styles.subAppTile,
            pressed && styles.subAppTilePressed,
          ]}
        >
          <Image
            resizeMode="cover"
            source={require('../assets/cleveland-guardians-logo.jpg')}
            style={styles.subAppLogoContained}
          />
        </Pressable>

        <Pressable
          accessibilityLabel="TV Location"
          accessibilityHint="Opens the YouTube TV location setup"
          accessibilityRole="button"
          onPress={onOpenTvLocation}
          style={({ pressed }) => [
            styles.subAppTile,
            pressed && styles.subAppTilePressed,
          ]}
        >
          <Image
            resizeMode="cover"
            source={require('../assets/youtube-tv-logo-vecteezy.jpg')}
            style={styles.subAppLogoFill}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  menuScreen: {
    backgroundColor: '#F7F7F2',
    flex: 1,
    position: 'relative',
  },
  menuLogo: {
    borderRadius: 34,
    height: 210,
    left: '50%',
    marginLeft: -105,
    marginTop: -105,
    position: 'absolute',
    top: '33.333%',
    width: 210,
  },
  menuExpiryWarning: {
    alignItems: 'center',
    left: 24,
    position: 'absolute',
    right: 24,
    top: '33.333%',
    transform: [{ translateY: -158 }],
  },
  menuExpiryWarningInstruction: {
    color: '#5A4137',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
  menuExpiryWarningTitle: {
    color: '#A32626',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  subAppRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 28,
    justifyContent: 'center',
    left: 0,
    marginTop: -50.6,
    position: 'absolute',
    right: 0,
    top: '66.667%',
  },
  subAppTile: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#A9CEBB',
    borderRadius: 14,
    borderWidth: 2,
    elevation: 2,
    height: 101.2,
    overflow: 'hidden',
    shadowColor: '#15354A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 9,
    width: 101.2,
  },
  subAppTilePressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  subAppLogoFill: {
    height: '100%',
    width: '100%',
  },
  subAppLogoContained: {
    height: '100%',
    width: '100%',
  },
});
