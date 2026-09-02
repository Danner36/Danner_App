import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import {
  CastButton,
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
  playbackUrl: string,
): 'buffered' | 'live' {
  const path = playbackUrl.split('?')[0]?.toLowerCase() ?? '';
  return path.endsWith('.m3u8') || path.endsWith('.mpd') ? 'live' : 'buffered';
}

export function castStreamTypeForContentType(
  contentType: string,
): 'buffered' | 'live' {
  return contentType === HLS_CONTENT_TYPE || contentType === DASH_CONTENT_TYPE
    ? 'live'
    : 'buffered';
}

export function GuardiansCastButton({
  contentType,
  mpegTsSegments,
  onFailed,
  playbackUrl,
  streamType,
  visible,
}: {
  contentType: string;
  /**
   * Declares MPEG-2 TS video segments to the receiver. Only set this for a local
   * live-HLS playlist. A provider `.m3u8` may ship fMP4 segments, and the wrong hint
   * stops the receiver decoding.
   */
  mpegTsSegments?: boolean;
  onFailed?: (message: string) => void;
  playbackUrl: string;
  streamType?: 'buffered' | 'live';
  visible: boolean;
}) {
  const client = useRemoteMediaClient({});
  const loadedKey = useRef<string | undefined>(undefined);
  // A later Cast session starts on an idle receiver, so the same media has to be loaded
  // again. Tracking the client alongside the key keeps a reconnect from being treated as
  // an already-loaded request, which leaves the receiver on its splash screen.
  const loadedClient = useRef<unknown>(undefined);

  useEffect(() => {
    if (!visible || !client || !playbackUrl) {
      return;
    }

    const key = `${playbackUrl}|${contentType}|${streamType ?? ''}`;
    if (loadedClient.current === client && loadedKey.current === key) {
      return;
    }

    loadedClient.current = client;
    loadedKey.current = key;
    let cancelled = false;
    void client
      .loadMedia({
        autoplay: true,
        mediaInfo: {
          contentType,
          contentUrl: playbackUrl,
          ...(mpegTsSegments
            ? {
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
      .catch(() => {
        if (cancelled) {
          return;
        }
        // Let the next render retry rather than sticking on a key that never loaded.
        loadedClient.current = undefined;
        loadedKey.current = undefined;
        onFailed?.('The TV could not start the video.');
      });

    return () => {
      cancelled = true;
    };
  }, [
    client,
    contentType,
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
