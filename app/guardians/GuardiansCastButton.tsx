import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import {
  CastButton,
  MediaHlsSegmentFormat,
  MediaHlsVideoSegmentFormat,
  MediaStreamType,
  useCastSession,
} from 'react-native-google-cast';
import {
  DASH_CONTENT_TYPE,
  HLS_CONTENT_TYPE,
  MP4_CONTENT_TYPE,
  phoneHoldForReceiverState,
  receiverHasMedia,
  receiverPlaybackFailed,
} from './webMediaDiscoveryInjection';

export {
  castStreamTypeForRelay,
  castStreamTypeForUrl,
} from './castStreamType';

export function castContentTypeForUrl(playbackUrl: string): string {
  const path = playbackUrl.split('?')[0]?.toLowerCase() ?? '';
  if (path.endsWith('.m3u8')) {
    return HLS_CONTENT_TYPE;
  }
  if (path.endsWith('.mp4')) {
    return MP4_CONTENT_TYPE;
  }
  if (path.endsWith('.mpd')) {
    return DASH_CONTENT_TYPE;
  }
  return 'video/*';
}

function hlsSegmentHints(segmentFormat: 'ts' | 'fmp4' | undefined) {
  if (segmentFormat === 'fmp4') {
    return {
      hlsSegmentFormat: MediaHlsSegmentFormat.FMP4,
      hlsVideoSegmentFormat: MediaHlsVideoSegmentFormat.FMP4,
    };
  }
  if (segmentFormat === 'ts') {
    return {
      hlsSegmentFormat: MediaHlsSegmentFormat.TS,
      hlsVideoSegmentFormat: MediaHlsVideoSegmentFormat.MPEG2_TS,
    };
  }
  return {};
}

export function GuardiansCastButton({
  contentType,
  hlsSegmentFormat,
  onFailed,
  onReceiverActive,
  onReceiverState,
  playbackFailedMessage = 'The TV could not play the video.',
  playbackUrl,
  reloadToken = 0,
  streamType,
  visible,
}: {
  contentType: string;
  /**
   * Declares the HLS segment container to the receiver. Set only when the relay
   * probed it; provider `.m3u8` URLs stay autodetect, since a wrong hint stops
   * decoding.
   */
  hlsSegmentFormat?: 'ts' | 'fmp4';
  onFailed?: (message: string) => void;
  /** True while the receiver has the stream, false once that session goes idle. */
  onReceiverActive?: (active: boolean) => void;
  /** Every receiver player state, lowercased, as the receiver reports it. */
  onReceiverState?: (state: string) => void;
  /** Shown when the receiver drops the loaded media with an error. */
  playbackFailedMessage?: string;
  playbackUrl: string;
  /** A new value loads the media again even when the receiver already has it. */
  reloadToken?: number;
  streamType?: 'buffered' | 'live';
  visible: boolean;
}) {
  const session = useCastSession();
  const client = session?.client ?? null;
  // The load is keyed on the session ID, not the client: `useCastSession` hands back a
  // new session object, and so a new client, each time a session resumes.
  const sessionId = session?.id ?? '';
  const onFailedRef = useRef(onFailed);
  onFailedRef.current = onFailed;
  const onReceiverActiveRef = useRef(onReceiverActive);
  onReceiverActiveRef.current = onReceiverActive;
  const onReceiverStateRef = useRef(onReceiverState);
  onReceiverStateRef.current = onReceiverState;
  const playbackFailedMessageRef = useRef(playbackFailedMessage);
  playbackFailedMessageRef.current = playbackFailedMessage;
  const playbackUrlRef = useRef(playbackUrl);
  playbackUrlRef.current = playbackUrl;
  const loadedKey = useRef<string | undefined>(undefined);
  // A resumed session, or a sender rejoining a receiver app that kept its session ID,
  // arrives as a new client. The receiver is asked what it has before the key is trusted.
  const loadedClient = useRef<unknown>(undefined);
  const pendingLoads = useRef(0);
  const handledReload = useRef(reloadToken);

  useEffect(() => {
    if (!visible || !client) {
      return;
    }
    const statusSub = client.onMediaStatusUpdated((status) => {
      const state = status?.playerState ?? 'none';
      const idle = status?.idleReason ? ` idleReason=${status.idleReason}` : '';
      console.log(`[DannerCast] playerState ${state}${idle}`);
      onReceiverStateRef.current?.(String(state).toLowerCase());
      const hold = phoneHoldForReceiverState(state);
      if (hold !== undefined) {
        onReceiverActiveRef.current?.(hold);
      }
      // A load that is still pending reports its own failure.
      if (
        pendingLoads.current === 0 &&
        loadedKey.current !== undefined &&
        receiverPlaybackFailed(status?.playerState, status?.idleReason)
      ) {
        const info = status?.mediaInfo;
        const url = playbackUrlRef.current;
        if (info && info.contentUrl !== url && info.contentId !== url) {
          return;
        }
        loadedKey.current = undefined;
        loadedClient.current = undefined;
        onFailedRef.current?.(playbackFailedMessageRef.current);
      }
    });
    return () => {
      statusSub.remove();
    };
  }, [client, visible]);

  useEffect(() => {
    if (!visible || !client || !playbackUrl) {
      return;
    }

    const key = `${sessionId}|${playbackUrl}|${contentType}|${streamType ?? ''}|${
      hlsSegmentFormat ?? 'auto'
    }|${reloadToken}`;
    if (loadedKey.current === key && loadedClient.current === client) {
      return;
    }
    const forced = reloadToken !== handledReload.current;

    let cancelled = false;
    // The session reports a client before the receiver can accept media. Loading
    // immediately fails and a remount then skips retry if the key was already stored.
    const handle = setTimeout(() => {
      void (async () => {
        if (cancelled) {
          return;
        }
        if (!forced) {
          // A reopened player or a new session on a receiver that is still playing
          // this URL keeps the receiver's position.
          const current = await client.getMediaStatus().catch(() => null);
          if (cancelled) {
            return;
          }
          if (receiverHasMedia(current, playbackUrl)) {
            console.log(`[DannerCast] receiver already has ${playbackUrl}`);
            loadedClient.current = client;
            loadedKey.current = key;
            onReceiverActiveRef.current?.(true);
            return;
          }
        }
        handledReload.current = reloadToken;
        console.log(`[DannerCast] loadMedia ${playbackUrl}`);
        pendingLoads.current += 1;
        try {
          await client.loadMedia({
            autoplay: true,
            mediaInfo: {
              contentType,
              contentUrl: playbackUrl,
              ...hlsSegmentHints(hlsSegmentFormat),
              ...(streamType
                ? {
                    streamType:
                      streamType === 'live'
                        ? MediaStreamType.LIVE
                        : MediaStreamType.BUFFERED,
                  }
                : {}),
            },
          });
          if (cancelled) {
            return;
          }
          loadedClient.current = client;
          loadedKey.current = key;
          onReceiverActiveRef.current?.(true);
        } catch (error: unknown) {
          if (cancelled) {
            return;
          }
          loadedClient.current = undefined;
          loadedKey.current = undefined;
          console.log(`[DannerCast] loadMedia failed ${String(error)}`);
          onReceiverStateRef.current?.('idle');
          onReceiverActiveRef.current?.(false);
          onFailedRef.current?.('The TV could not start the video.');
        } finally {
          pendingLoads.current -= 1;
        }
      })();
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [
    client,
    contentType,
    hlsSegmentFormat,
    playbackUrl,
    reloadToken,
    sessionId,
    streamType,
    visible,
  ]);

  if (!visible) {
    return null;
  }

  return (
    <CastButton
      accessibilityLabel="Cast"
      accessibilityRole="button"
      hitSlop={12}
      style={styles.castButton}
      tintColor="#0B2B4C"
    />
  );
}

const styles = StyleSheet.create({
  castButton: {
    height: 44,
    tintColor: '#0B2B4C',
    width: 44,
  },
});
