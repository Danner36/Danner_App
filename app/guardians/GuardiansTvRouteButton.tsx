import { useEffect, useRef, useState } from 'react';
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
  getLiveHlsStatus,
  isLiveHlsAvailable,
  liveHlsPlaylistUrl,
  startLiveHls,
} from '../modules/danner-live-hls/src';
import {
  GuardiansCastButton,
  castStreamTypeForContentType,
} from './GuardiansCastButton';
import { HLS_CONTENT_TYPE } from './webMediaDiscoveryInjection';

export type DiscoveredMedia = {
  contentType: string;
  url: string;
};

function isGranted(value: string | undefined): boolean {
  return value === PermissionsAndroid.RESULTS.GRANTED;
}

async function requestAndroidCapturePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  const permissions = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  const postNotifications = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  if (typeof Platform.Version === 'number' && Platform.Version >= 33 && postNotifications) {
    permissions.push(postNotifications);
  }
  const nearbyWifi = PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES;
  if (typeof Platform.Version === 'number' && Platform.Version >= 33 && nearbyWifi) {
    permissions.push(nearbyWifi);
  }

  const result = await PermissionsAndroid.requestMultiple(permissions);
  const granted = permissions.every((permission) => isGranted(result[permission]));
  return granted;
}

async function waitForMedia(
  read: () => DiscoveredMedia | undefined,
  timeoutMs: number,
): Promise<DiscoveredMedia | undefined> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const current = read();
    if (current) {
      return current;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }
  return read();
}

export function GuardiansTvRouteButton({
  media,
  onFailed,
  visible,
}: {
  media?: DiscoveredMedia;
  onFailed: (message?: string) => void;
  visible: boolean;
}) {
  const [liveUrl, setLiveUrl] = useState('');
  const [sending, setSending] = useState<DiscoveredMedia>();
  const [busy, setBusy] = useState(false);
  const mediaRef = useRef<DiscoveredMedia | undefined>(media);
  mediaRef.current = media;

  useEffect(() => {
    void getLiveHlsStatus().then((status) => {
      if (status.running && typeof status.origin === 'string' && status.origin) {
        setLiveUrl(liveHlsPlaylistUrl(status.origin));
      }
    });
  }, []);

  if (!visible || !isLiveHlsAvailable()) {
    return <View style={styles.headerSpacer} />;
  }

  // The page's own media URL reaches the receiver directly. Screen capture stays the
  // fallback for a page that never reports one.
  const sent = sending ?? media;
  const playbackUrl = sent?.url ?? liveUrl;
  const contentType = sent?.contentType ?? HLS_CONTENT_TYPE;
  const streamType = sent
    ? castStreamTypeForContentType(sent.contentType)
    : 'live';

  const onPress = async () => {
    if (busy) {
      return;
    }
    if (playbackUrl) {
      await CastContext.showCastDialog();
      return;
    }

    setBusy(true);
    onFailed();
    try {
      const discovered =
        media ?? (await waitForMedia(() => mediaRef.current, 6_000));
      if (discovered) {
        setSending(discovered);
        await CastContext.showCastDialog();
        return;
      }
      const permitted = await requestAndroidCapturePermissions();
      if (!permitted) {
        onFailed('TV send needs permission.');
        return;
      }
      const started = await startLiveHls();
      if (!started) {
        onFailed('Could not send to the TV.');
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
          contentType={contentType}
          mpegTsSegments={!sent}
          onFailed={onFailed}
          playbackUrl={playbackUrl}
          streamType={streamType}
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
