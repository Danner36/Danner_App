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
  startHlsProxy,
  startLiveHls,
  stopHlsProxy,
  stopLiveHls,
  type LiveHlsCrop,
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
export type { LiveHlsCrop };

/** What the receiver is asked to load, once a phone-side route exists for it. */
type CastRoute = {
  contentType: string;
  mpegTsSegments: boolean;
  url: string;
};

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
  measurePlayer,
  media,
  onFailed,
  pageUrl,
  visible,
}: {
  measurePlayer?: () => Promise<LiveHlsCrop | undefined>;
  media?: DiscoveredMedia;
  onFailed: (message?: string) => void;
  pageUrl: string;
  visible: boolean;
}) {
  const [route, setRoute] = useState<CastRoute>();
  const [busy, setBusy] = useState(false);
  const mediaRef = useRef<DiscoveredMedia | undefined>(media);
  mediaRef.current = media;
  const client = useRemoteMediaClient();

  useEffect(() => {
    setRoute(undefined);
  }, [pageUrl]);

  if (!visible || !isLiveHlsAvailable()) {
    return <View style={styles.headerSpacer} />;
  }

  const playbackUrl = route?.url ?? '';
  const contentType = route?.contentType ?? HLS_CONTENT_TYPE;

  const openPicker = async () => {
    if (!client) {
      await CastContext.showCastDialog();
    }
  };

  const onPress = async () => {
    if (busy) {
      return;
    }
    if (route) {
      await openPicker();
      return;
    }

    setBusy(true);
    onFailed();
    try {
      const discovered =
        media ?? (await waitForMedia(() => mediaRef.current, 6_000));

      // The page's media URL cannot be handed to the receiver directly: the provider
      // answers playlists only for its own page, and its segments carry no CORS header.
      // The phone relays both and passes the media through untouched.
      if (discovered) {
        await stopLiveHls();
        const proxy = await startHlsProxy(discovered.url, pageReferer(pageUrl));
        if (proxy) {
          const proxyUrl = liveHlsPlaylistUrl(proxy.origin);
          console.log(`[DannerCast] proxy ${proxyUrl} for ${discovered.url}`);
          setRoute({
            contentType: HLS_CONTENT_TYPE,
            mpegTsSegments: true,
            url: proxyUrl,
          });
          await openPicker();
          return;
        }
        console.log('[DannerCast] proxy unavailable, capturing instead');
      }

      const existing = await getLiveHlsStatus();
      if (
        existing.running &&
        typeof existing.origin === 'string' &&
        existing.origin
      ) {
        const existingUrl = liveHlsPlaylistUrl(existing.origin);
        console.log(`[DannerCast] converter ${existingUrl}`);
        setRoute({
          contentType: HLS_CONTENT_TYPE,
          mpegTsSegments: true,
          url: existingUrl,
        });
        await openPicker();
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
      setRoute({
        contentType: HLS_CONTENT_TYPE,
        mpegTsSegments: true,
        url: startedUrl,
      });
      await openPicker();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.slot}>
      <View style={styles.castHost} pointerEvents="none">
        <GuardiansCastButton
          contentType={contentType}
          mpegTsSegments={route?.mpegTsSegments ?? false}
          onFailed={onFailed}
          playbackUrl={playbackUrl}
          streamType={castStreamTypeForContentType(contentType)}
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
