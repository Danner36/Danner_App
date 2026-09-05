import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { installReleaseApk } from '../modules/danner-app-update/src';
import { getProvisioningExpirationTimestamp } from '../modules/danner-provisioning-profile/src';
import {
  APP_UPDATE_DOWNLOADING,
  APP_UPDATE_PROMPT_ANDROID,
  APP_UPDATE_PROMPT_IOS,
  APP_UPDATE_PROMPT_TITLE,
  APP_UPDATE_SIDESTORE_MISSING,
  dismissAppUpdatePrompt,
  fetchVersionManifest,
  getEmbeddedAppVersion,
  shouldOfferAppUpdate,
  sideStoreInstallUrl,
  type VersionManifest,
} from './appUpdate';
import { getProvisioningWarning } from './provisioningWarning';

export function HubScreen({
  onOpenCyclones,
  onOpenGuardians,
  onOpenPatriots,
  onOpenTvLocation,
}: {
  onOpenCyclones: () => void;
  onOpenGuardians: () => void;
  onOpenPatriots: () => void;
  onOpenTvLocation: () => void;
}) {
  const [provisioningExpiration, setProvisioningExpiration] = useState<
    number | undefined
  >();
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [profileReady, setProfileReady] = useState(Platform.OS !== 'ios');
  const [downloadStatus, setDownloadStatus] = useState<string | undefined>();
  const updatePromptVisible = useRef(false);
  const updateCheckInFlight = useRef(false);
  const hubMounted = useRef(true);

  const readProvisioningExpiration = useCallback(() => {
    setProvisioningExpiration(getProvisioningExpirationTimestamp());
    setCurrentTime(Date.now());
    setProfileReady(true);
  }, []);

  const applyAppUpdate = useCallback(async (manifest: VersionManifest) => {
    if (Platform.OS === 'ios') {
      try {
        await Linking.openURL(sideStoreInstallUrl(manifest.ios.url));
      } catch {
        Alert.alert(APP_UPDATE_PROMPT_TITLE, APP_UPDATE_SIDESTORE_MISSING);
      }
      return;
    }

    if (hubMounted.current) {
      setDownloadStatus(APP_UPDATE_DOWNLOADING);
    }
    const result = await installReleaseApk(
      manifest.android.url,
      manifest.android.sha256,
    );
    if (!hubMounted.current) {
      return;
    }
    setDownloadStatus(undefined);
    if (result.status === 'failed' && result.message) {
      Alert.alert(APP_UPDATE_PROMPT_TITLE, result.message);
    }
  }, []);

  const offerAppUpdate = useCallback(
    async (signingWarningVisible: boolean) => {
      if (
        updatePromptVisible.current ||
        updateCheckInFlight.current ||
        downloadStatus
      ) {
        return;
      }

      const embeddedVersion = getEmbeddedAppVersion();
      if (!embeddedVersion) {
        return;
      }

      updateCheckInFlight.current = true;
      let manifest;
      try {
        manifest = await fetchVersionManifest();
      } finally {
        updateCheckInFlight.current = false;
      }
      if (
        !hubMounted.current ||
        !manifest ||
        !shouldOfferAppUpdate({
          embeddedVersion,
          hubVisible: hubMounted.current,
          remoteVersion: manifest.version,
          signingWarningVisible,
        })
      ) {
        return;
      }

      updatePromptVisible.current = true;
      Alert.alert(
        APP_UPDATE_PROMPT_TITLE,
        Platform.OS === 'ios' ? APP_UPDATE_PROMPT_IOS : APP_UPDATE_PROMPT_ANDROID,
        [
          {
            text: 'No',
            style: 'cancel',
            onPress: () => {
              updatePromptVisible.current = false;
              dismissAppUpdatePrompt();
            },
          },
          {
            text: 'Yes',
            onPress: () => {
              updatePromptVisible.current = false;
              void applyAppUpdate(manifest);
            },
          },
        ],
        { cancelable: false },
      );
    },
    [applyAppUpdate, downloadStatus],
  );

  useEffect(() => {
    hubMounted.current = true;
    return () => {
      hubMounted.current = false;
    };
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

  useEffect(() => {
    if (!profileReady || provisioningWarning) {
      return;
    }

    void offerAppUpdate(false);
    const appStateSubscription = AppState.addEventListener(
      'change',
      (nextState) => {
        if (nextState === 'active') {
          void offerAppUpdate(false);
        }
      },
    );

    return () => {
      appStateSubscription.remove();
    };
  }, [offerAppUpdate, profileReady, provisioningWarning]);

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
      ) : downloadStatus ? (
        <View accessibilityRole="alert" style={styles.menuExpiryWarning}>
          <Text style={styles.menuExpiryWarningInstruction}>{downloadStatus}</Text>
        </View>
      ) : null}

      <Image
        accessibilityLabel="Danner logo"
        resizeMode="contain"
        source={require('../assets/ic_launcher_danner.jpg')}
        style={styles.menuLogo}
      />

      <View style={styles.subAppGrid}>
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
            accessibilityLabel="New England Patriots"
            accessibilityHint="Opens Patriots scores, record, schedule, and authorized live video"
            accessibilityRole="button"
            onPress={onOpenPatriots}
            style={({ pressed }) => [
              styles.subAppTile,
              pressed && styles.subAppTilePressed,
            ]}
          >
            <Image
              resizeMode="cover"
              source={require('../assets/new-england-patriots-logo.jpg')}
              style={styles.subAppLogoContained}
            />
          </Pressable>
        </View>

        <View style={styles.subAppRow}>
          <Pressable
            accessibilityLabel="Iowa State Cyclones"
            accessibilityHint="Opens Cyclones scores, records, schedule, and authorized live video"
            accessibilityRole="button"
            onPress={onOpenCyclones}
            style={({ pressed }) => [
              styles.subAppTile,
              pressed && styles.subAppTilePressed,
            ]}
          >
            <Image
              resizeMode="cover"
              source={require('../assets/iowa-state-cyclones-logo.jpg')}
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
  subAppGrid: {
    alignItems: 'center',
    gap: 28,
    left: 0,
    marginTop: -115.2,
    position: 'absolute',
    right: 0,
    top: '66.667%',
  },
  subAppRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 28,
    justifyContent: 'center',
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
