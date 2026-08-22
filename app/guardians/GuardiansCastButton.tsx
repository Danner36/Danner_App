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
  visible,
}: {
  contentType: string;
  playbackUrl: string;
  visible: boolean;
}) {
  const client = useRemoteMediaClient({});
  const loadedKey = useRef<string | undefined>(undefined);
  const startedByThisPlayer = useRef(false);

  useEffect(() => {
    if (!visible || !client) {
      return;
    }

    const key = `${playbackUrl}|${contentType}`;
    if (loadedKey.current === key) {
      return;
    }

    loadedKey.current = key;
    startedByThisPlayer.current = true;
    void client.loadMedia({
      autoplay: true,
      mediaInfo: {
        contentType,
        contentUrl: playbackUrl,
      },
    });
  }, [client, contentType, playbackUrl, visible]);

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
      accessibilityLabel="Send to TV"
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
