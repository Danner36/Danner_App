import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import {
  getActiveReleaseApkInstall,
  installReleaseApk,
  type ReleaseApkInstallResult,
} from '../modules/danner-app-update/src';
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
  const [updateDownloading, setUpdateDownloading] = useState(
    () => getActiveReleaseApkInstall() !== undefined,
  );

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

  // Update checks run when the hub mounts and whenever the app becomes active again. Prompt,
  // message, and install state live in this effect and in module scope rather than in render
  // state, so an install finishing never starts another check by itself.
  useEffect(() => {
    let hubMounted = true;
    let promptVisible = false;
    let messageVisible = false;
    let checkInFlight = false;

    function updateBlocked(): boolean {
      return (
        !hubMounted ||
        promptVisible ||
        messageVisible ||
        checkInFlight ||
        getActiveReleaseApkInstall() !== undefined
      );
    }

    function signingWarningVisible(): boolean {
      return (
        getProvisioningWarning(getProvisioningExpirationTimestamp(), Date.now()) !==
        undefined
      );
    }

    function showUpdateMessage(message: string, checkAgain: boolean) {
      messageVisible = true;
      Alert.alert(
        APP_UPDATE_PROMPT_TITLE,
        message,
        [
          {
            text: 'OK',
            onPress: () => {
              messageVisible = false;
              if (checkAgain) {
                void offerAppUpdate();
              }
            },
          },
        ],
        { cancelable: false },
      );
    }

    async function followInstall(install: Promise<ReleaseApkInstallResult>) {
      if (hubMounted) {
        setUpdateDownloading(true);
      }
      const result = await install;
      if (result.status === 'failed' || result.status === 'needs-permission') {
        if (hubMounted) {
          setUpdateDownloading(false);
          // Once installs from this app are allowed, OK offers the update again.
          showUpdateMessage(result.message, result.status === 'needs-permission');
        }
        return;
      }

      // The system installer opened, finished, or was cancelled; the prompt stays dismissed
      // until the app process exits.
      dismissAppUpdatePrompt();
      if (hubMounted) {
        setUpdateDownloading(false);
      }
    }

    async function applyAppUpdate(manifest: VersionManifest) {
      if (Platform.OS === 'ios') {
        try {
          await Linking.openURL(sideStoreInstallUrl(manifest.ios.url));
        } catch {
          if (hubMounted) {
            showUpdateMessage(APP_UPDATE_SIDESTORE_MISSING, false);
          }
        }
        return;
      }

      await followInstall(
        installReleaseApk(manifest.android.url, manifest.android.sha256),
      );
    }

    async function offerAppUpdate() {
      const embeddedVersion = getEmbeddedAppVersion();
      if (updateBlocked() || !embeddedVersion || signingWarningVisible()) {
        return;
      }

      checkInFlight = true;
      let manifest: VersionManifest | undefined;
      try {
        manifest = await fetchVersionManifest();
      } finally {
        checkInFlight = false;
      }
      // The hub, the signing warning, and the install state can all change while the
      // manifest loads.
      if (
        !manifest ||
        updateBlocked() ||
        !shouldOfferAppUpdate({
          embeddedVersion,
          hubVisible: hubMounted,
          remoteVersion: manifest.version,
          signingWarningVisible: signingWarningVisible(),
        })
      ) {
        return;
      }

      const offered = manifest;
      promptVisible = true;
      Alert.alert(
        APP_UPDATE_PROMPT_TITLE,
        Platform.OS === 'ios' ? APP_UPDATE_PROMPT_IOS : APP_UPDATE_PROMPT_ANDROID,
        [
          {
            text: 'No',
            style: 'cancel',
            onPress: () => {
              promptVisible = false;
              dismissAppUpdatePrompt();
            },
          },
          {
            text: 'Yes',
            onPress: () => {
              promptVisible = false;
              void applyAppUpdate(offered);
            },
          },
        ],
        { cancelable: false },
      );
    }

    const activeInstall = getActiveReleaseApkInstall();
    if (activeInstall) {
      void followInstall(activeInstall);
    } else {
      void offerAppUpdate();
    }
    const appStateSubscription = AppState.addEventListener(
      'change',
      (nextState) => {
        if (nextState === 'active') {
          void offerAppUpdate();
        }
      },
    );

    return () => {
      hubMounted = false;
      appStateSubscription.remove();
    };
  }, []);

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
      ) : updateDownloading ? (
        <View style={styles.menuExpiryWarning}>
          <ActivityIndicator
            accessibilityLabel={APP_UPDATE_DOWNLOADING}
            color="#1F6F55"
            size="small"
          />
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
