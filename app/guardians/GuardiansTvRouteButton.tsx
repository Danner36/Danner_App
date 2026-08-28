import { useEffect, useState } from 'react';
import {
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CastContext } from 'react-native-google-cast';
import {
  isLiveHlsAvailable,
  liveHlsPlaylistUrl,
  startLiveHls,
  stopLiveHls,
} from '../modules/danner-live-hls/src';
import { GuardiansCastButton } from './GuardiansCastButton';

async function requestAndroidCapturePermissions(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  const permissions = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  const postNotifications = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  if (typeof Platform.Version === 'number' && Platform.Version >= 33 && postNotifications) {
    permissions.push(postNotifications);
  }
  const nearbyWifi = PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES;
  if (typeof Platform.Version === 'number' && Platform.Version >= 33 && nearbyWifi) {
    permissions.push(nearbyWifi);
  } else {
    const fineLocation = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
    if (fineLocation) {
      permissions.push(fineLocation);
    }
  }
  await PermissionsAndroid.requestMultiple(permissions);
}

export function GuardiansTvRouteButton({ visible }: { visible: boolean }) {
  const [liveUrl, setLiveUrl] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => {
      void stopLiveHls();
    };
  }, []);

  if (!visible || !isLiveHlsAvailable()) {
    return <View style={styles.headerSpacer} />;
  }

  const onPress = async () => {
    if (busy) {
      return;
    }
    if (liveUrl) {
      await CastContext.showCastDialog();
      return;
    }

    setBusy(true);
    try {
      await requestAndroidCapturePermissions();
      const started = await startLiveHls();
      if (!started) {
        return;
      }
      setLiveUrl(liveHlsPlaylistUrl(started.origin));
      await CastContext.showCastDialog();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.slot}>
      <View style={styles.castHost} pointerEvents="none">
        <GuardiansCastButton
          contentType="application/x-mpegURL"
          playbackUrl={liveUrl}
          streamType="live"
          visible
        />
      </View>
      <Pressable
        accessibilityLabel="Send to TV"
        accessibilityRole="button"
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        hitSlop={12}
        onPress={() => {
          void onPress();
        }}
        style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
      >
        <Text style={styles.headerButtonText}>TV</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 72,
  },
  headerButtonText: {
    color: '#0B2B4C',
    fontSize: 18,
    fontWeight: '800',
  },
  headerSpacer: {
    width: 72,
  },
  castHost: {
    height: 44,
    left: 0,
    opacity: 0.02,
    position: 'absolute',
    top: 0,
    width: 44,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.99 }],
  },
  slot: {
    minWidth: 72,
  },
});
