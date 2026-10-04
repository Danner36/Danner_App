import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CastContext, useRemoteMediaClient } from 'react-native-google-cast';
import {
  getHlsProxyStatus,
  isLiveHlsAvailable,
  relayKindForContentType,
  relayStillServing,
  startLiveRelay,
  stopHlsProxy,
  type LiveRelay,
} from '../modules/danner-live-hls/src';
import {
  GuardiansCastButton,
  castStreamTypeForRelay,
} from './GuardiansCastButton';
import {
  HLS_CONTENT_TYPE,
  TV_PLAYBACK_FAILED_MESSAGE,
  showCastDialogOnTvPress,
  tvPressForcesReload,
  tvRelayFailureMessage,
  type DiscoveredMedia,
} from './webMediaDiscoveryInjection';

export type { DiscoveredMedia };

type ActiveRelay = {
  relay: LiveRelay;
  source: DiscoveredMedia;
};

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
  stale: () => boolean,
): Promise<DiscoveredMedia | undefined> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (stale()) {
      return undefined;
    }
    const current = read();
    if (current) {
      return current;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }
  return stale() ? undefined : read();
}

/** Stops the relay only while it is still the session this control started. */
async function stopRelayIfCurrent(token: string): Promise<void> {
  const status = await getHlsProxyStatus();
  if (status.token === token) {
    await stopHlsProxy();
  }
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
  onPhoneHeld,
  pageUrl,
  visible,
}: {
  media?: DiscoveredMedia;
  onFailed: (message?: string) => void;
  onPhoneHeld?: (held: boolean) => void;
  pageUrl: string;
  visible: boolean;
}) {
  const [active, setActive] = useState<ActiveRelay>();
  const [reloadCount, setReloadCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const activeRef = useRef<ActiveRelay | undefined>(undefined);
  const mediaRef = useRef<DiscoveredMedia | undefined>(media);
  mediaRef.current = media;
  const onPhoneHeldRef = useRef(onPhoneHeld);
  onPhoneHeldRef.current = onPhoneHeld;
  const receiverState = useRef('none');
  // Bumped on unmount and page change, so a press still waiting on the page or the
  // relay does nothing afterwards.
  const generation = useRef(0);
  // Set synchronously so a press and the foreground check never run a relay start at
  // the same time.
  const busyRef = useRef(false);
  const client = useRemoteMediaClient();
  const clientRef = useRef(client);
  clientRef.current = client;
  const onForegroundRef = useRef<() => Promise<void>>(async () => {});

  const setActiveRelay = (next: ActiveRelay | undefined) => {
    activeRef.current = next;
    setActive(next);
  };

  useEffect(() => {
    generation.current += 1;
    activeRef.current = undefined;
    setActive(undefined);
    busyRef.current = false;
    setBusy(false);
    return () => {
      generation.current += 1;
    };
  }, [pageUrl]);

  // iOS reclaims the relay's listening socket while the app is suspended or the screen
  // is locked. Android keeps it in a foreground service, so this check finds it serving.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void onForegroundRef.current();
      }
    });
    return () => {
      subscription.remove();
    };
  }, []);

  // A receiver that is no longer connected cannot use the relay, and on Android the relay
  // otherwise keeps its foreground service, wake lock, and Wi-Fi lock.
  useEffect(() => {
    const subscription = CastContext.getSessionManager().onSessionEnded(() => {
      const current = activeRef.current;
      if (!current) {
        return;
      }
      console.log(`[DannerCast] session ended, relay ${current.relay.mediaUrl} stopped`);
      activeRef.current = undefined;
      setActive(undefined);
      receiverState.current = 'none';
      onPhoneHeldRef.current?.(false);
      void stopRelayIfCurrent(current.relay.token);
    });
    return () => {
      subscription.remove();
    };
  }, []);

  const startRelay = async (
    source: DiscoveredMedia,
    stale: () => boolean,
    askNotification: boolean,
  ): Promise<LiveRelay | undefined> => {
    const kind = relayKindForContentType(source.contentType);
    if (!kind) {
      onFailed(tvRelayFailureMessage('unsupported'));
      return undefined;
    }
    // The page's media URL cannot be handed to the receiver directly: the provider
    // answers its media only for its own page, and its segments carry no CORS header.
    // The phone relays both and passes the media through untouched.
    if (askNotification) {
      await requestNotificationPermission();
      if (stale()) {
        return undefined;
      }
    }
    const result = await startLiveRelay(source.url, pageReferer(pageUrl), kind);
    if (stale()) {
      if (result.ok) {
        void stopRelayIfCurrent(result.relay.token);
      }
      return undefined;
    }
    if (!result.ok) {
      console.log(`[DannerCast] relay failed ${result.reason} for ${source.url}`);
      onFailed(tvRelayFailureMessage(result.reason));
      return undefined;
    }
    console.log(`[DannerCast] relay ${result.relay.mediaUrl} for ${source.url}`);
    setActiveRelay({ relay: result.relay, source });
    return result.relay;
  };

  /**
   * Starts a new relay for the page's current stream. The new URL changes the Cast load
   * key, so a connected receiver loads it without the dialog. A failed start drops the
   * old relay only when it has stopped serving too.
   */
  const restartRelay = async (current: ActiveRelay, stale: () => boolean) => {
    const restarted = await startRelay(
      mediaRef.current ?? current.source,
      stale,
      false,
    );
    if (restarted || stale()) {
      return;
    }
    const after = await getHlsProxyStatus();
    if (stale()) {
      return;
    }
    if (!relayStillServing(after, current.relay.token)) {
      setActiveRelay(undefined);
    }
  };

  /**
   * A later press checks the relay before reopening the dialog. A relay that stopped
   * (an iPhone suspended in the background, a service the system ended) or a page that
   * has since named a different stream gets a new relay, which the receiver then loads.
   * A running relay reloads the receiver unless it is already playing.
   */
  const refreshRelay = async (current: ActiveRelay, stale: () => boolean) => {
    const status = await getHlsProxyStatus();
    if (stale()) {
      return;
    }
    const latest = mediaRef.current;
    const pageChangedMedia = latest !== undefined && latest.url !== current.source.url;
    if (relayStillServing(status, current.relay.token) && !pageChangedMedia) {
      if (client != null && tvPressForcesReload(receiverState.current)) {
        console.log(`[DannerCast] reload ${current.relay.mediaUrl}`);
        setReloadCount((count) => count + 1);
      }
      return;
    }
    await restartRelay(current, stale);
  };

  /**
   * Returning to the foreground restarts a relay that stopped while the app was inactive
   * when a receiver is still connected, and otherwise drops it so the next press starts
   * fresh.
   */
  onForegroundRef.current = async () => {
    const current = activeRef.current;
    if (!current || busyRef.current) {
      return;
    }
    const started = generation.current;
    const stale = () => generation.current !== started;
    busyRef.current = true;
    try {
      const status = await getHlsProxyStatus();
      if (stale() || activeRef.current !== current) {
        return;
      }
      if (relayStillServing(status, current.relay.token)) {
        return;
      }
      if (clientRef.current == null) {
        console.log(`[DannerCast] relay ${current.relay.mediaUrl} stopped while inactive`);
        setActiveRelay(undefined);
        receiverState.current = 'none';
        onPhoneHeldRef.current?.(false);
        return;
      }
      console.log(`[DannerCast] relay ${current.relay.mediaUrl} stopped while inactive, restarting`);
      setBusy(true);
      await restartRelay(current, stale);
    } finally {
      if (!stale()) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };

  const onPress = async () => {
    if (busyRef.current) {
      return;
    }
    const started = generation.current;
    const stale = () => generation.current !== started;
    busyRef.current = true;
    setBusy(true);
    onFailed();
    try {
      const current = activeRef.current;
      if (current) {
        await refreshRelay(current, stale);
        if (stale()) {
          return;
        }
        if (showCastDialogOnTvPress(true, client != null)) {
          await CastContext.showCastDialog();
        }
        return;
      }

      const discovered =
        mediaRef.current ??
        (await waitForMedia(() => mediaRef.current, 6_000, stale));
      if (stale()) {
        return;
      }
      if (!discovered) {
        onFailed('This page did not offer a video to send.');
        return;
      }

      const relay = await startRelay(discovered, stale, true);
      if (!relay || stale()) {
        return;
      }
      if (showCastDialogOnTvPress(false, client != null)) {
        await CastContext.showCastDialog();
      }
    } finally {
      if (!stale()) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };

  if (!visible || !isLiveHlsAvailable()) {
    return <View style={styles.headerSpacer} />;
  }

  const relay = active?.relay;

  return (
    <View style={styles.slot}>
      <View style={styles.castHost} pointerEvents="none">
        <GuardiansCastButton
          contentType={relay?.contentType ?? HLS_CONTENT_TYPE}
          hlsSegmentFormat={relay?.kind === 'hls' ? relay.segmentFormat : undefined}
          onFailed={onFailed}
          onReceiverActive={onPhoneHeld}
          onReceiverState={(state) => {
            receiverState.current = state;
          }}
          playbackFailedMessage={TV_PLAYBACK_FAILED_MESSAGE}
          playbackUrl={relay?.mediaUrl ?? ''}
          reloadToken={reloadCount}
          streamType={castStreamTypeForRelay(relay?.live ?? true)}
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
