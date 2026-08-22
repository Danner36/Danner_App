import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import type { PlayableGuardiansStream } from './guardiansSources';

function contentTypeForUrl(playbackUrl: string): 'hls' | 'dash' | 'auto' {
  const path = playbackUrl.split('?')[0]?.toLowerCase() ?? '';
  if (path.endsWith('.m3u8')) {
    return 'hls';
  }
  if (path.endsWith('.mpd')) {
    return 'dash';
  }
  return 'auto';
}

export function GuardiansAudioPlayer({
  onFailed,
  stream,
}: {
  onFailed: () => void;
  stream: PlayableGuardiansStream;
}) {
  const player = useVideoPlayer(
    {
      contentType: contentTypeForUrl(stream.playbackUrl),
      metadata: {
        artist: 'Cleveland Guardians',
        title: 'Guardians game',
      },
      uri: stream.playbackUrl,
      useCaching: false,
    },
    (videoPlayer) => {
      videoPlayer.audioMixingMode = 'doNotMix';
      videoPlayer.keepScreenOnWhilePlaying = false;
      videoPlayer.showNowPlayingNotification = true;
      videoPlayer.staysActiveInBackground = true;
      videoPlayer.play();
    },
  );

  useEffect(() => {
    const subscription = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') {
        onFailed();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [onFailed, player]);

  return (
    <VideoView
      nativeControls={false}
      player={player}
      pointerEvents="none"
      style={styles.hiddenVideo}
    />
  );
}

const styles = StyleSheet.create({
  hiddenVideo: {
    height: 1,
    left: 0,
    opacity: 0,
    position: 'absolute',
    top: 0,
    width: 1,
  },
});
