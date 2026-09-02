import { useEffect, useRef, useState } from 'react';
import {
  PermissionsAndroid,
  PixelRatio,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CastContext, useRemoteMediaClient } from 'react-native-google-cast';
import {
  getLiveHlsStatus,
  isLiveHlsAvailable,
  liveHlsPlaylistUrl,
  startLiveHls,
  stopLiveHls,
  type LiveHlsCrop,
} from '../modules/danner-live-hls/src';
import {
  GuardiansCastButton,
  castContentTypeForUrl,
  castStreamTypeForContentType,
} from './GuardiansCastButton';
import {
  type DiscoveredMedia,
} from './webMediaDiscoveryInjection';

export type { DiscoveredMedia };
export type { LiveHlsCrop };

export function measureViewCrop(
  view: View | null,
): Promise<LiveHlsCrop | undefined> {
  return new Promise((resolve) => {
    if (!view || typeof view.measureInWindow !== 'function') {
      resolve(undefined);
      return;
    }
    view.measureInWindow((x, y, width, height) => {
      if (width < 16 || height < 16) {
        resolve(undefined);
        return;
      }
      const ratio = PixelRatio.get();
      resolve({
        x: Math.round(x * ratio),
        y: Math.round(y * ratio),
        width: Math.round(width * ratio),
        height: Math.round(height * ratio),
      });
    });
  });
}

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
  measurePlayer,
  media,
  onFailed,
  visible,
}: {
  measurePlayer?: () => Promise<LiveHlsCrop | undefined>;
  media?: DiscoveredMedia;
  onFailed: (message?: string) => void;
  visible: boolean;
}) {
  const [liveUrl, setLiveUrl] = useState('');
  const [sending, setSending] = useState<DiscoveredMedia>();
  const [busy, setBusy] = useState(false);
  const mediaRef = useRef<DiscoveredMedia | undefined>(media);
  mediaRef.current = media;
  const client = useRemoteMediaClient();

  useEffect(() => {
    if (!media) {
      setSending(undefined);
      return;
    }
    void stopLiveHls();
  }, [media]);

  if (!visible || !isLiveHlsAvailable()) {
    return <View style={styles.headerSpacer} />;
  }

  // The page's own media URL reaches the receiver directly. Screen capture stays the
  // fallback for a page that never reports one. A leftover converter origin is not
  // treated as that page URL.
  const sent = sending ?? media;
  const playbackUrl = sent?.url ?? liveUrl;
  const contentType = sent?.contentType ?? castContentTypeForUrl(playbackUrl);
  const streamType = sent
    ? castStreamTypeForContentType(sent.contentType)
    : 'live';

  const onPress = async () => {
    if (busy) {
      return;
    }

    setBusy(true);
    onFailed();
    try {
      const discovered =
        media ?? (await waitForMedia(() => mediaRef.current, 6_000));
      if (discovered) {
        console.log(`[DannerCast] discovered ${discovered.url}`);
        setSending(discovered);
        setLiveUrl('');
        await stopLiveHls();
        if (!client) {
          await CastContext.showCastDialog();
        }
        return;
      }

      if (liveUrl) {
        console.log(`[DannerCast] converter ${liveUrl}`);
        if (!client) {
          await CastContext.showCastDialog();
        }
        return;
      }

      const existing = await getLiveHlsStatus();
      if (
        existing.running &&
        typeof existing.origin === 'string' &&
        existing.origin
      ) {
        const existingUrl = liveHlsPlaylistUrl(existing.origin);
        console.log(`[DannerCast] converter ${existingUrl}`);
        setLiveUrl(existingUrl);
        if (!client) {
          await CastContext.showCastDialog();
        }
        return;
      }

      const permitted = await requestAndroidCapturePermissions();
      if (!permitted) {
        onFailed('TV send needs permission.');
        return;
      }
      const crop = (await measurePlayer?.()) ?? undefined;
      const started = await startLiveHls(crop);
      if (!started) {
        onFailed('Could not send to the TV.');
        return;
      }
      const startedUrl = liveHlsPlaylistUrl(started.origin);
      console.log(`[DannerCast] converter ${startedUrl}`);
      setLiveUrl(startedUrl);
      if (!client) {
        await CastContext.showCastDialog();
      }
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
