import { useEffect, useRef, useState } from 'react';
import {
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CastContext, useRemoteMediaClient } from 'react-native-google-cast';
import {
  isLiveHlsAvailable,
  liveHlsPlaylistUrl,
  startHlsProxy,
} from '../modules/danner-live-hls/src';
import {
  GuardiansCastButton,
  castStreamTypeForContentType,
} from './GuardiansCastButton';
import {
  HLS_CONTENT_TYPE,
  type DiscoveredMedia,
} from './webMediaDiscoveryInjection';

export type { DiscoveredMedia };

/**
 * Android shows the TV send's ongoing notification from a foreground service, and that
 * service is what keeps the relay reachable once the screen is off. A denied notification
 * does not block the send.
 */
async function requestNotificationPermission(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  if (typeof Platform.Version !== 'number' || Platform.Version < 33 || !permission) {
    return;
  }
  try {
    await PermissionsAndroid.request(permission);
  } catch {
    return;
  }
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

/** The provider gates its playlists on the player page, so that page is the `Referer`. */
function pageReferer(pageUrl: string): string {
  try {
    const parsed = new URL(pageUrl);
    return `${parsed.protocol}//${parsed.host}/`;
  } catch {
    return pageUrl;
  }
}

export function GuardiansTvRouteButton({
  media,
  onFailed,
  pageUrl,
  visible,
}: {
  media?: DiscoveredMedia;
  onFailed: (message?: string) => void;
  pageUrl: string;
  visible: boolean;
}) {
  const [relayUrl, setRelayUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const mediaRef = useRef<DiscoveredMedia | undefined>(media);
  mediaRef.current = media;
  const client = useRemoteMediaClient();

  useEffect(() => {
    setRelayUrl('');
  }, [pageUrl]);

  if (!visible || !isLiveHlsAvailable()) {
    return <View style={styles.headerSpacer} />;
  }

  const openPicker = async () => {
    if (!client) {
      await CastContext.showCastDialog();
    }
  };

  const onPress = async () => {
    if (busy) {
      return;
    }
    if (relayUrl) {
      await openPicker();
      return;
    }

    setBusy(true);
    onFailed();
    try {
      const discovered =
        media ?? (await waitForMedia(() => mediaRef.current, 6_000));
      if (!discovered) {
        onFailed('This page did not offer a video to send.');
        return;
      }

      // The page's media URL cannot be handed to the receiver directly: the provider
      // answers playlists only for its own page, and its segments carry no CORS header.
      // The phone relays both and passes the media through untouched.
      await requestNotificationPermission();
      const relay = await startHlsProxy(discovered.url, pageReferer(pageUrl));
      if (!relay) {
        onFailed('Could not send to the TV.');
        return;
      }
      const nextUrl = liveHlsPlaylistUrl(relay.origin);
      console.log(`[DannerCast] relay ${nextUrl} for ${discovered.url}`);
      setRelayUrl(nextUrl);
      await openPicker();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.slot}>
      <View style={styles.castHost} pointerEvents="none">
        <GuardiansCastButton
          contentType={HLS_CONTENT_TYPE}
          mpegTsSegments
          onFailed={onFailed}
          playbackUrl={relayUrl}
          streamType={castStreamTypeForContentType(HLS_CONTENT_TYPE)}
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
