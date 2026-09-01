import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import {
  CastButton,
  MediaHlsVideoSegmentFormat,
  MediaStreamType,
  useRemoteMediaClient,
} from 'react-native-google-cast';

export function castContentTypeForUrl(playbackUrl: string): string {
  const path = playbackUrl.split('?')[0]?.toLowerCase() ?? '';
  if (path.endsWith('.m3u8')) {
    return 'application/x-mpegURL';
  }
  if (path.endsWith('.mp4')) {
    return 'video/mp4';
  }
  if (path.endsWith('.mpd')) {
    return 'application/dash+xml';
  }
  return 'video/*';
}

export function castStreamTypeForUrl(
  playbackUrl: string,
): 'buffered' | 'live' {
  const path = playbackUrl.split('?')[0]?.toLowerCase() ?? '';
  return path.endsWith('.m3u8') || path.endsWith('.mpd') ? 'live' : 'buffered';
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
  const startedByThisPlayer = useRef(false);

  useEffect(() => {
    if (!visible || !client || !playbackUrl) {
      return;
    }

    const key = `${playbackUrl}|${contentType}|${streamType ?? ''}`;
    if (loadedKey.current === key) {
      return;
    }

    loadedKey.current = key;
    startedByThisPlayer.current = true;
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

  useEffect(() => {
    return () => {
      if (!startedByThisPlayer.current) {
        return;
      }
      startedByThisPlayer.current = false;
      loadedKey.current = undefined;
      void client?.stop();
    };
  }, [client]);

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
