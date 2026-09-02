import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import {
  CastButton,
  MediaHlsSegmentFormat,
  MediaHlsVideoSegmentFormat,
  MediaStreamType,
  useRemoteMediaClient,
} from 'react-native-google-cast';
import {
  DASH_CONTENT_TYPE,
  HLS_CONTENT_TYPE,
  MP4_CONTENT_TYPE,
} from './webMediaDiscoveryInjection';

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

export function castStreamTypeForUrl(
  _playbackUrl: string,
): 'buffered' | 'live' {
  // The default receiver on this family's TVs starts buffered VOD and sits on its
  // splash screen for `live` on those same files.
  return 'buffered';
}

export function castStreamTypeForContentType(
  _contentType: string,
): 'buffered' | 'live' {
  return 'buffered';
}

export function GuardiansCastButton({
  contentType,
  fmp4Segments,
  mpegTsSegments,
  onFailed,
  playbackUrl,
  streamType,
  visible,
}: {
  contentType: string;
  /**
   * Declares CMAF fMP4 segments to the receiver. Provider `.m3u8` URLs stay
   * autodetect; a wrong hint stops decoding.
   */
  fmp4Segments?: boolean;
  /**
   * Declares MPEG-2 TS video segments to the receiver. Set this for the
   * phone-origin playlist.
   */
  mpegTsSegments?: boolean;
  onFailed?: (message: string) => void;
  playbackUrl: string;
  streamType?: 'buffered' | 'live';
  visible: boolean;
}) {
  const client = useRemoteMediaClient();
  const loadedKey = useRef<string | undefined>(undefined);
  // A later Cast session starts on an idle receiver, so the same media has to be loaded
  // again. Tracking the client alongside the key keeps a reconnect from being treated as
  // an already-loaded request, which leaves the receiver on its splash screen.
  const loadedClient = useRef<unknown>(undefined);

  useEffect(() => {
    if (!visible || !client || !playbackUrl) {
      return;
    }

    const key = `${playbackUrl}|${contentType}|${streamType ?? ''}|${
      fmp4Segments ? 'fmp4' : mpegTsSegments ? 'ts' : 'auto'
    }`;
    if (loadedClient.current === client && loadedKey.current === key) {
      return;
    }

    let cancelled = false;
    const statusSub = client.onMediaStatusUpdated((status) => {
      const state = status?.playerState ?? 'none';
      const idle = status?.idleReason ? ` idleReason=${status.idleReason}` : '';
      console.log(`[DannerCast] playerState ${state}${idle}`);
    });
    // The session reports a client before the receiver can accept media. Loading
    // immediately fails and a remount then skips retry if the key was already stored.
    const handle = setTimeout(() => {
      if (cancelled) {
        return;
      }
      console.log(`[DannerCast] loadMedia ${playbackUrl}`);
      void client
        .loadMedia({
          autoplay: true,
          mediaInfo: {
            contentType,
            contentUrl: playbackUrl,
            ...(fmp4Segments
              ? {
                  hlsVideoSegmentFormat: MediaHlsVideoSegmentFormat.FMP4,
                }
              : mpegTsSegments
                ? {
                    hlsSegmentFormat: MediaHlsSegmentFormat.TS,
                    hlsVideoSegmentFormat: MediaHlsVideoSegmentFormat.MPEG2_TS,
                  }
                : {}),
            ...(streamType
              ? {
                  streamType:
                    streamType === 'live'
                      ? MediaStreamType.LIVE
                      : MediaStreamType.BUFFERED,
                }
              : {}),
          },
        })
        .then(() => {
          if (cancelled) {
            return;
          }
          loadedClient.current = client;
          loadedKey.current = key;
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }
          loadedClient.current = undefined;
          loadedKey.current = undefined;
          console.log(`[DannerCast] loadMedia failed ${String(error)}`);
          onFailed?.('The TV could not start the video.');
        });
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(handle);
      statusSub.remove();
    };
  }, [
    client,
    contentType,
    fmp4Segments,
    mpegTsSegments,
    onFailed,
    playbackUrl,
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
