import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useKeepAwake } from 'expo-keep-awake';
import { NavigationBar } from 'expo-navigation-bar';
import { VideoView, useVideoPlayer } from 'expo-video';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { stopHlsProxy } from '../modules/danner-live-hls/src';
import type { PlayableStream } from '../streams/sources.ts';
import {
  CastButton,
  castContentTypeForUrl,
  castStreamTypeForUrl,
} from './CastButton';
import { TvRouteButton, type DiscoveredMedia } from './TvRouteButton';
import { WEB_AIRPLAY_INJECTION } from './webAirPlayInjection';
import {
  newDiscoveryNonce,
  pagePlaybackHoldScript,
  parseDiscoveredMediaMessage,
  preferDiscoveredMedia,
  webMediaDiscoveryInjection,
} from './webMediaDiscoveryInjection';
import { webPlayerUserAgent } from './webPlayerUserAgent';
import { WEB_TAP_GUARD_INJECTION } from './webTapGuardInjection';

// The YouTube wrapper HTML loads at this base URL. Only that exact document is allowed; the host is
// not a navigation or popup target.
const YOUTUBE_WRAPPER_URL = 'https://danner.app/';

function isAllowedPlayerNavigation(
  url: string,
  allowedHosts: string[],
  allowInsecureHttp: boolean,
): boolean {
  if (url === 'about:blank') {
    return true;
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      allowedHosts.includes(host) &&
      (parsed.protocol === 'https:' ||
        (allowInsecureHttp && parsed.protocol === 'http:'))
    );
  } catch {
    return false;
  }
}

function DirectStreamPlayer({ stream }: { stream: PlayableStream }) {
  const player = useVideoPlayer(
    {
      uri: stream.playbackUrl,
      useCaching: false,
    },
    (videoPlayer) => {
      videoPlayer.play();
    },
  );

  return (
    <VideoView
      contentFit="contain"
      fullscreenOptions={{ enable: true }}
      nativeControls
      player={player}
      style={styles.directVideo}
    />
  );
}

function youtubePlayerHtml(embedUrl: string, nickname: string): string {
  const source = JSON.stringify(embedUrl);
  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src https://www.youtube-nocookie.com; style-src 'unsafe-inline'" />
        <style>
          html, body, iframe { background: #000; border: 0; height: 100%; margin: 0; padding: 0; width: 100%; }
        </style>
      </head>
      <body>
        <iframe
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowfullscreen
          referrerpolicy="strict-origin-when-cross-origin"
          src=${source}
          title="${nickname} video"
        ></iframe>
      </body>
    </html>`;
}

function IsolatedWebStreamPlayer({
  accent,
  holdPlayback,
  nickname,
  onMedia,
  stream,
}: {
  accent: string;
  holdPlayback?: boolean;
  nickname: string;
  onMedia?: (media: DiscoveredMedia) => void;
  stream: PlayableStream;
}) {
  const webViewRef = useRef<WebView>(null);
  const holdPlaybackRef = useRef(holdPlayback === true);
  holdPlaybackRef.current = holdPlayback === true;
  const [promotedPopupUrl, setPromotedPopupUrl] = useState<string>();
  const [playerKey, setPlayerKey] = useState(0);
  const isYoutube = stream.kind === 'youtube';
  const isWeb = stream.kind === 'web';
  const allowInsecureHttp = stream.allowInsecureHttp === true;
  const allowPopup = (url: string) =>
    url !== 'about:blank' &&
    isAllowedPlayerNavigation(
      url,
      stream.allowedNavigationHosts,
      allowInsecureHttp,
    );
  const allowNavigation = (url: string) =>
    (isYoutube && !promotedPopupUrl && url === YOUTUBE_WRAPPER_URL) ||
    isAllowedPlayerNavigation(
      url,
      stream.allowedNavigationHosts,
      allowInsecureHttp,
    );
  // Android answers onShouldStartLoadWithRequest on its own after 250 ms and never asks for
  // POST navigations, so a page that loads anyway is stopped and the approved source is
  // mounted again.
  const returnToApprovedSource = (url: string) => {
    if (!/^https?:/i.test(url) || allowNavigation(url)) {
      return;
    }
    webViewRef.current?.stopLoading();
    setPromotedPopupUrl(undefined);
    setPlayerKey((current) => current + 1);
  };
  // Each document gets its own nonce, so only the injection this player installed can
  // report media.
  const discoveryNonce = useMemo(
    () => newDiscoveryNonce(),
    [stream.playbackUrl, promotedPopupUrl],
  );
  const webInjection = isWeb
    ? `${WEB_AIRPLAY_INJECTION}\n${WEB_TAP_GUARD_INJECTION}\n${webMediaDiscoveryInjection(discoveryNonce)}`
    : undefined;

  useEffect(() => {
    setPromotedPopupUrl(undefined);
  }, [stream.playbackUrl]);

  useEffect(() => {
    if (!isWeb) {
      return;
    }
    webViewRef.current?.injectJavaScript(
      pagePlaybackHoldScript(holdPlayback === true),
    );
  }, [holdPlayback, isWeb, playerKey, promotedPopupUrl, stream.playbackUrl]);

  return (
    <WebView
      key={playerKey}
      ref={webViewRef}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowsAirPlayForMediaPlayback={isWeb}
      allowsFullscreenVideo
      allowsInlineMediaPlayback
      allowUniversalAccessFromFileURLs={false}
      cacheEnabled={false}
      geolocationEnabled={false}
      // Android implements incognito by clearing every WebView cookie in the app, which
      // signs TV Location out of Google.
      incognito={Platform.OS === 'ios'}
      injectedJavaScript={webInjection}
      injectedJavaScriptBeforeContentLoaded={webInjection}
      onMessage={(event) => {
        const media = parseDiscoveredMediaMessage(
          event.nativeEvent.data,
          discoveryNonce,
          allowInsecureHttp,
        );
        if (media) {
          onMedia?.(media);
        }
      }}
      javaScriptEnabled
      javaScriptCanOpenWindowsAutomatically={false}
      mediaPlaybackRequiresUserAction={false}
      mixedContentMode={allowInsecureHttp ? 'always' : 'never'}
      onFileDownload={() => {}}
      onLoadStart={(event) => returnToApprovedSource(event.nativeEvent.url)}
      onNavigationStateChange={(state) => returnToApprovedSource(state.url)}
      onOpenWindow={(event) => {
        const targetUrl = event.nativeEvent.targetUrl;
        if (allowPopup(targetUrl)) {
          setPromotedPopupUrl(targetUrl);
        }
      }}
      onShouldStartLoadWithRequest={(request) =>
        allowNavigation(request.url)
      }
      onLoadEnd={() => {
        if (!isWeb) {
          return;
        }
        webViewRef.current?.injectJavaScript(
          pagePlaybackHoldScript(holdPlaybackRef.current),
        );
      }}
      originWhitelist={['*']}
      renderLoading={() => (
        <View style={styles.playerLoading}>
          <ActivityIndicator color={accent} size="large" />
          <Text style={styles.loadingText}>Opening the game…</Text>
        </View>
      )}
      setSupportMultipleWindows
      sharedCookiesEnabled={false}
      source={
        promotedPopupUrl
          ? { uri: promotedPopupUrl }
          : isYoutube
          ? {
              baseUrl: YOUTUBE_WRAPPER_URL,
              html: youtubePlayerHtml(stream.playbackUrl, nickname),
            }
          : { uri: stream.playbackUrl }
      }
      startInLoadingState
      style={styles.playerWebView}
      thirdPartyCookiesEnabled={false}
      userAgent={isWeb ? webPlayerUserAgent() : undefined}
    />
  );
}

// An embedded WebView leaves display power to the host app, so the phone would sleep
// mid-game while the page is playing. Mounted only while a stream is open.
function PlayerKeepAwake() {
  useKeepAwake();
  return null;
}

// Memoized so the pre-game countdown does not re-render an open player every second.
export const StreamPlayer = memo(function StreamPlayer({
  accent,
  nickname,
  onClose,
  stream,
}: {
  accent: string;
  nickname: string;
  onClose: () => void;
  stream?: PlayableStream;
}) {
  const [tvError, setTvError] = useState<string>();
  const insets = useSafeAreaInsets();
  const [media, setMedia] = useState<DiscoveredMedia>();
  const [phoneHeld, setPhoneHeld] = useState(false);
  const closePlayer = () => {
    setTvError(undefined);
    void stopHlsProxy();
    onClose();
  };

  // A page's fullscreen video draws in the activity window behind this modal, and current Android
  // ignores the WebView's own request to hide the bars there. Hiding the activity's navigation bar
  // while a player is open hides it in fullscreen only; the modal keeps its own bar.
  const playerOpen = Boolean(stream);
  useEffect(() => {
    if (Platform.OS !== 'android' || !playerOpen) {
      return;
    }
    NavigationBar.setHidden(true);
    return () => NavigationBar.setHidden(false);
  }, [playerOpen]);

  useEffect(() => {
    setMedia(undefined);
    setPhoneHeld(false);
    setTvError(undefined);
  }, [stream?.playbackUrl]);

  return (
    <Modal
      animationType="slide"
      onRequestClose={closePlayer}
      presentationStyle="fullScreen"
      visible={Boolean(stream)}
    >
      <View
        style={[
          styles.playerScreen,
          { paddingBottom: insets.bottom, paddingTop: insets.top },
        ]}
      >
        <View style={styles.playerHeader}>
          <Pressable
            accessibilityLabel="Close video"
            accessibilityRole="button"
            hitSlop={12}
            onPress={closePlayer}
            style={({ pressed }) => [
              styles.headerButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.headerButtonText}>Close</Text>
          </Pressable>
          <Text numberOfLines={1} style={styles.playerTitle}>
            {nickname} game
          </Text>
          {stream?.kind === 'direct' ? (
            <CastButton
              contentType={castContentTypeForUrl(stream.playbackUrl)}
              onFailed={setTvError}
              playbackUrl={stream.playbackUrl}
              streamType={castStreamTypeForUrl(stream.playbackUrl)}
              visible
            />
          ) : stream?.kind === 'web' ? (
            <TvRouteButton
              key={stream.playbackUrl}
              media={media}
              onFailed={setTvError}
              onPhoneHeld={setPhoneHeld}
              pageUrl={stream.playbackUrl}
              visible
            />
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>
        {tvError ? (
          <Text accessibilityRole="alert" style={styles.tvErrorText}>
            {tvError}
          </Text>
        ) : null}

        {stream ? <PlayerKeepAwake /> : null}
        {stream ? (
          stream.kind === 'direct' ? (
            <DirectStreamPlayer stream={stream} />
          ) : (
            <IsolatedWebStreamPlayer
              accent={accent}
              holdPlayback={phoneHeld}
              nickname={nickname}
              onMedia={(next) => {
                setMedia((current) => preferDiscoveredMedia(current, next));
              }}
              stream={stream}
            />
          )
        ) : null}
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  directVideo: {
    backgroundColor: '#000000',
    flex: 1,
  },
  headerButton: {
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
  loadingText: {
    color: '#45545E',
    fontSize: 17,
    fontWeight: '700',
  },
  playerHeader: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#D7DEE5',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 58,
    paddingHorizontal: 14,
  },
  playerLoading: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    bottom: 0,
    gap: 12,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  playerScreen: {
    backgroundColor: '#000000',
    flex: 1,
  },
  playerTitle: {
    color: '#0B2B4C',
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  playerWebView: {
    backgroundColor: '#000000',
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.99 }],
  },
  tvErrorText: {
    backgroundColor: '#FFFFFF',
    color: '#A32626',
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
});
