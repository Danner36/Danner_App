import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { CastButton, useRemoteMediaClient } from 'react-native-google-cast';

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

export function GuardiansCastButton({
  contentType,
  playbackUrl,
  streamType,
  visible,
}: {
  contentType: string;
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
    const isHls = contentType.toLowerCase().includes('mpegurl');
    void client.loadMedia({
      autoplay: true,
      mediaInfo: {
        contentType,
        contentUrl: playbackUrl,
        ...(isHls
          ? {
              hlsSegmentFormat: 'TS',
              hlsVideoSegmentFormat: 'MPEG2-TS',
            }
          : {}),
        ...(streamType ? { streamType } : {}),
      },
    });
  }, [client, contentType, playbackUrl, streamType, visible]);

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
