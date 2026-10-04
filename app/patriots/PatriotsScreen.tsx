import AsyncStorage from '@react-native-async-storage/async-storage';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useKeepAwake } from 'expo-keep-awake';
import { VideoView, useVideoPlayer } from 'expo-video';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { GuardiansAudioPlayer } from '../guardians/GuardiansAudioPlayer';
import {
  GuardiansCastButton,
  castContentTypeForUrl,
  castStreamTypeForUrl,
} from '../guardians/GuardiansCastButton';
import {
  GuardiansTvRouteButton,
  type DiscoveredMedia,
} from '../guardians/GuardiansTvRouteButton';
import { WEB_AIRPLAY_INJECTION } from '../guardians/webAirPlayInjection';
import {
  newDiscoveryNonce,
  pagePlaybackHoldScript,
  parseDiscoveredMediaMessage,
  preferDiscoveredMedia,
  webMediaDiscoveryInjection,
} from '../guardians/webMediaDiscoveryInjection';
import { webPlayerUserAgent } from '../guardians/webPlayerUserAgent';
import { stopHlsProxy } from '../modules/danner-live-hls/src';
import { fetchEspnPatriotsEvents } from './espnNfl';
import {
  fetchLiveFootballSummary,
  liveScoreboardFromEspn,
  liveScoreboardFromHarness,
} from './espnScoreboard';
import { PatriotsScoreboard } from './PatriotsScoreboard';
import {
  isGetVideoAvailable,
  liveStreamsUrl,
  pollForStream,
  requestGetVideo,
} from './patriotsGetVideo';
import {
  authorizedStreamsForGame,
  patriotsStreamsFromDocument,
  type PlayablePatriotsStream,
} from './patriotsSources';
import {
  abstractStateFromEspn,
  abstractStateRank,
  gameDayLabel,
  gameInterruption,
  gameWithLiveSummary,
  patriotsGameFromEspnEvent,
  patriotsGameFromHarness,
  recapResult,
  recordLabel,
  regularSeasonRecord,
  snapshotFromGames,
  type GameInterruption,
  type PatriotsGame,
  type PatriotsSnapshot,
} from './patriotsSnapshot';

const YOUTUBE_WRAPPER_URL = 'https://danner.app/';
const REFRESH_INTERVAL_MS = 60_000;
// The schedule query spans the rest of the season, so it is by far the heaviest call here.
// Live scores come from the summary endpoint instead, and the game list and season record
// barely move, so this does not need the 60s source cadence.
const SNAPSHOT_REFRESH_INTERVAL_MS = 10 * 60_000;
const LIVE_SCOREBOARD_INTERVAL_MS = 5_000;
// A schedule refresh keeps the polled board only while the poll is this recent.
const LIVE_BOARD_FRESH_MS = 30_000;
const COUNTDOWN_INTERVAL_MS = 1_000;
// A delayed game that has not started ticks this slowly so the video window still opens.
const DELAYED_TICK_INTERVAL_MS = 30_000;
const VIDEO_LEAD_TIME_MS = 15 * 60_000;
const SOURCES_FETCH_TIMEOUT_MS = 8_000;
const REMOTE_PATRIOTS_SOURCES_URL =
  'https://raw.githubusercontent.com/Danner36/Danner_App/main/patriots_streams.json';
const SOURCES_STORAGE_KEY = 'danner.patriots.sources.v1';
const PATRIOTS_TEST_URL = process.env.EXPO_PUBLIC_PATRIOTS_TEST_URL;
const PATRIOTS_TEST_SOURCES_URL = process.env.EXPO_PUBLIC_PATRIOTS_SOURCES_URL;
const PATRIOTS_SOURCES_URL =
  __DEV__ && PATRIOTS_TEST_SOURCES_URL
    ? PATRIOTS_TEST_SOURCES_URL
    : REMOTE_PATRIOTS_SOURCES_URL;

type PlayableStream = PlayablePatriotsStream;

type SourcesSession = {
  latestCommitSha?: Promise<string | undefined>;
};

type SourcesOptions = {
  allowStaleCache?: boolean;
  preferLive?: boolean;
  session?: SourcesSession;
};

function withHarnessScoreboard(
  game: PatriotsGame | undefined,
): PatriotsGame | undefined {
  if (!game) {
    return undefined;
  }
  if (game.scoreboard === undefined) {
    return game;
  }
  const scoreboard = liveScoreboardFromHarness(game.scoreboard);
  if (!scoreboard) {
    return undefined;
  }
  return { ...game, scoreboard };
}

// The five-second summary poll is fresher than the schedule document, and its board carries
// down, distance, and possession. A schedule refresh never moves the same game backwards and
// does not swap a recently polled board for the schedule's thinner one.
function snapshotWithPreservedScoreboard(
  previous: PatriotsSnapshot | undefined,
  next: PatriotsSnapshot,
  keepPolledBoard: boolean,
): PatriotsSnapshot {
  const previousGame = previous?.featuredGame;
  const nextGame = next.featuredGame;
  if (!previousGame || !nextGame || previousGame.gamePk !== nextGame.gamePk) {
    return next;
  }

  const previousRank = abstractStateRank(previousGame.abstractState);
  const nextRank = abstractStateRank(nextGame.abstractState);
  if (
    previousRank > nextRank ||
    (keepPolledBoard &&
      previousRank === nextRank &&
      nextGame.abstractState === 'Live' &&
      previousGame.scoreboard)
  ) {
    return {
      ...next,
      featuredGame: {
        ...nextGame,
        abstractState: previousGame.abstractState,
        opponentScore: previousGame.opponentScore,
        patriotsScore: previousGame.patriotsScore,
        scoreboard: previousGame.scoreboard,
        scoresKnown: previousGame.scoresKnown,
        status: previousGame.status,
      },
    };
  }

  return {
    ...next,
    featuredGame: {
      ...nextGame,
      scoreboard: nextGame.scoreboard ?? previousGame.scoreboard,
    },
  };
}

async function fetchPatriotsHarnessSnapshot(
  url: string,
): Promise<PatriotsSnapshot> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error('The Patriots test harness is unavailable.');
  }

  const value = (await response.json()) as {
    liveGame?: unknown;
    losses?: unknown;
    ties?: unknown;
    upcomingGames?: unknown;
    wins?: unknown;
  };
  const liveGame = withHarnessScoreboard(patriotsGameFromHarness(value.liveGame));
  const upcomingGames = Array.isArray(value.upcomingGames)
    ? value.upcomingGames
        .map((entry) => withHarnessScoreboard(patriotsGameFromHarness(entry)))
        .filter((game): game is PatriotsGame => Boolean(game))
    : [];

  if (
    typeof value.wins !== 'number' ||
    typeof value.losses !== 'number' ||
    (value.liveGame !== undefined && !liveGame)
  ) {
    throw new Error('The Patriots test fixture is invalid.');
  }

  return snapshotFromGames(
    liveGame ? [liveGame, ...upcomingGames] : upcomingGames,
    value.wins,
    value.losses,
    typeof value.ties === 'number' ? value.ties : 0,
  );
}

async function fetchPatriotsSnapshot(): Promise<PatriotsSnapshot> {
  if (__DEV__ && PATRIOTS_TEST_URL) {
    return fetchPatriotsHarnessSnapshot(PATRIOTS_TEST_URL);
  }

  const now = new Date();
  const events = await fetchEspnPatriotsEvents(now);
  const games = events
    .map(({ event, seasonType }) => {
      const game = patriotsGameFromEspnEvent(event, seasonType);
      if (!game) {
        return undefined;
      }
      const scoreboard = liveScoreboardFromEspn(event);
      return scoreboard ? { ...game, scoreboard } : game;
    })
    .filter((game): game is PatriotsGame => Boolean(game));
  const record = regularSeasonRecord(games);
  return snapshotFromGames(games, record.wins, record.losses, record.ties, now);
}

function sourcesUrlWithCacheBust(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}refresh=${Date.now()}`;
}

async function fetchLatestCommitSha(
  signal: AbortSignal,
): Promise<string | undefined> {
  const response = await fetch(
    'https://api.github.com/repos/Danner36/Danner_App/commits?path=patriots_streams.json&per_page=1',
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'danner-apps',
      },
      signal,
    },
  );
  if (!response.ok) {
    return undefined;
  }
  const commits = (await response.json()) as Array<{ sha?: string }>;
  return typeof commits[0]?.sha === 'string' ? commits[0].sha : undefined;
}

async function readStreamsResponse(
  url: string,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(sourcesUrlWithCacheBust(url), {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
    signal,
  });
  if (!response.ok) {
    throw new Error('The approved video list is unavailable.');
  }
  return response.text();
}

// Each attempt gets its own budget. Sharing one controller across the fallback chain lets a
// slow first source abort the very fallbacks that exist to cover it.
async function withSourcesTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOURCES_FETCH_TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

// The unauthenticated commits API allows 60 calls an hour per address, so a Get video poll
// looks the SHA up once, and only after the Worker list fails.
function latestCommitSha(
  session: SourcesSession | undefined,
): Promise<string | undefined> {
  const lookup =
    session?.latestCommitSha ??
    withSourcesTimeout(fetchLatestCommitSha).catch(() => undefined);
  if (session) {
    session.latestCommitSha = lookup;
  }
  return lookup;
}

async function fetchPatriotsSources(
  options?: SourcesOptions,
): Promise<PlayablePatriotsStream[]> {
  const persistRemote = PATRIOTS_SOURCES_URL === REMOTE_PATRIOTS_SOURCES_URL;
  const allowStaleCache = options?.allowStaleCache !== false && persistRemote;
  const preferLive =
    options?.preferLive === true || options?.allowStaleCache === false;

  const readSources = async (url: string) => {
    const documentText = await withSourcesTimeout((signal) =>
      readStreamsResponse(url, signal),
    );
    const streams = patriotsStreamsFromDocument(JSON.parse(documentText));
    if (!streams) {
      throw new Error('The approved video list is invalid.');
    }
    if (persistRemote) {
      try {
        await AsyncStorage.setItem(SOURCES_STORAGE_KEY, documentText);
      } catch {}
    }
    return streams;
  };

  try {
    const workerStreams = liveStreamsUrl();
    if (workerStreams && (preferLive || persistRemote)) {
      try {
        return await readSources(workerStreams);
      } catch {}
    }
    if (preferLive && persistRemote) {
      const sha = await latestCommitSha(options?.session);
      if (sha) {
        try {
          return await readSources(
            `https://raw.githubusercontent.com/Danner36/Danner_App/${sha}/patriots_streams.json`,
          );
        } catch {}
      }
    }
    return await readSources(PATRIOTS_SOURCES_URL);
  } catch {
    if (allowStaleCache) {
      try {
        const cachedDocument = await AsyncStorage.getItem(SOURCES_STORAGE_KEY);
        if (cachedDocument) {
          return patriotsStreamsFromDocument(JSON.parse(cachedDocument)) ?? [];
        }
      } catch {}
    }
    return [];
  }
}

function gameDateLabel(game: PatriotsGame): string {
  const datePart = gameDayLabel(game);
  if (!game.timeValid) {
    return `${datePart} · Time TBA`;
  }
  const timePart = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(game.gameDate));
  return `${datePart} ${timePart}`;
}

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

function youtubePlayerHtml(embedUrl: string): string {
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
          title="Patriots video"
        ></iframe>
      </body>
    </html>`;
}

function IsolatedWebStreamPlayer({
  holdPlayback,
  onMedia,
  stream,
}: {
  holdPlayback?: boolean;
  onMedia?: (media: DiscoveredMedia) => void;
  stream: PlayableStream;
}) {
  const webViewRef = useRef<WebView>(null);
  const holdPlaybackRef = useRef(holdPlayback === true);
  holdPlaybackRef.current = holdPlayback === true;
  const [promotedPopupUrl, setPromotedPopupUrl] = useState<string>();
  const [webViewKey, setWebViewKey] = useState(0);
  const isYoutube = stream.kind === 'youtube';
  const isWeb = stream.kind === 'web';
  const allowPopup = (url: string) =>
    url !== 'about:blank' &&
    isAllowedPlayerNavigation(
      url,
      stream.allowedNavigationHosts,
      stream.allowInsecureHttp === true,
    );
  const allowNavigation = (url: string) =>
    (isYoutube && !promotedPopupUrl && url === YOUTUBE_WRAPPER_URL) ||
    isAllowedPlayerNavigation(
      url,
      stream.allowedNavigationHosts,
      stream.allowInsecureHttp === true,
    );
  // Each page load gets a fresh nonce, so only this page's injection can report media.
  const discoveryNonce = useMemo(
    () => newDiscoveryNonce(),
    [stream.playbackUrl, promotedPopupUrl],
  );
  const webInjection = isWeb
    ? `${WEB_AIRPLAY_INJECTION}\n${webMediaDiscoveryInjection(discoveryNonce)}`
    : undefined;
  // Android lets a navigation through when JS misses the 250 ms answer window and never asks
  // about POST navigations, so the loaded URL is checked again after the fact and an
  // unapproved page is replaced by a fresh WebView on the approved source.
  const returnToApprovedSource = (url: string) => {
    if (!/^https?:/i.test(url) || allowNavigation(url)) {
      return;
    }
    webViewRef.current?.stopLoading();
    setPromotedPopupUrl(undefined);
    setWebViewKey((current) => current + 1);
  };

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
  }, [holdPlayback, isWeb, promotedPopupUrl, stream.playbackUrl, webViewKey]);

  return (
    <WebView
      key={webViewKey}
      ref={webViewRef}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowsAirPlayForMediaPlayback={isWeb}
      allowsFullscreenVideo
      allowsInlineMediaPlayback
      allowUniversalAccessFromFileURLs={false}
      cacheEnabled={false}
      geolocationEnabled={false}
      // Android incognito clears every WebView's cookies app-wide, which signs TV Location
      // out of Google. The Android player relies on the cache and cookie props instead.
      incognito={Platform.OS === 'ios'}
      injectedJavaScript={webInjection}
      injectedJavaScriptBeforeContentLoaded={webInjection}
      onLoadStart={(event) => returnToApprovedSource(event.nativeEvent.url)}
      onMessage={(event) => {
        const media = parseDiscoveredMediaMessage(
          event.nativeEvent.data,
          discoveryNonce,
          stream.allowInsecureHttp === true,
        );
        if (media) {
          onMedia?.(media);
        }
      }}
      onNavigationStateChange={(navigation) =>
        returnToApprovedSource(navigation.url)
      }
      javaScriptEnabled
      javaScriptCanOpenWindowsAutomatically={false}
      mediaPlaybackRequiresUserAction={false}
      mixedContentMode={
        stream.allowInsecureHttp === true ? 'always' : 'never'
      }
      onFileDownload={() => {}}
      onOpenWindow={(event) => {
        const targetUrl = event.nativeEvent.targetUrl;
        if (allowPopup(targetUrl)) {
          setPromotedPopupUrl(targetUrl);
        }
      }}
      onShouldStartLoadWithRequest={(request) => allowNavigation(request.url)}
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
          <ActivityIndicator color="#E31937" size="large" />
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
                html: youtubePlayerHtml(stream.playbackUrl),
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
// mid-game while the page is playing. Mounted only while a player is open.
function PlayerKeepAwake() {
  useKeepAwake();
  return null;
}

const StreamPlayer = memo(function StreamPlayer({
  stream,
  onClose,
}: {
  stream?: PlayableStream;
  onClose: () => void;
}) {
  const [tvError, setTvError] = useState<string>();
  const insets = useSafeAreaInsets();
  const [media, setMedia] = useState<DiscoveredMedia>();
  const [phoneHeld, setPhoneHeld] = useState(false);
  const closePlayer = () => {
    void stopHlsProxy();
    setTvError(undefined);
    onClose();
  };

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
            Patriots game
          </Text>
          {stream?.kind === 'direct' ? (
            <GuardiansCastButton
              contentType={castContentTypeForUrl(stream.playbackUrl)}
              onFailed={setTvError}
              playbackUrl={stream.playbackUrl}
              streamType={castStreamTypeForUrl(stream.playbackUrl)}
              visible
            />
          ) : stream?.kind === 'web' ? (
            <GuardiansTvRouteButton
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
              holdPlayback={phoneHeld}
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

function gameTimeLabel(gameDate: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(gameDate));
}

function countdownLabel(gameDate: string, nowMs: number): string {
  const remainingSeconds = Math.max(
    0,
    Math.ceil((new Date(gameDate).getTime() - nowMs) / 1_000),
  );
  if (remainingSeconds === 0) {
    return 'Starting soon';
  }

  const hours = Math.floor(remainingSeconds / 3_600);
  const minutes = Math.floor((remainingSeconds % 3_600) / 60);
  const seconds = remainingSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

function gameBlocksVideo(game: PatriotsGame): boolean {
  const interruption = gameInterruption(game.status);
  return (
    interruption === 'canceled' ||
    interruption === 'postponed' ||
    interruption === 'suspended' ||
    (game.abstractState === 'Final' && !interruption)
  );
}

function interruptionMessage(interruption: GameInterruption): string {
  if (interruption === 'canceled') {
    return 'The game has been canceled.';
  }
  if (interruption === 'delayed') {
    return 'The game is delayed.';
  }
  if (interruption === 'postponed') {
    return 'The game has been postponed.';
  }
  return 'The game has been suspended.';
}

function FeaturedGameCard({
  audioError,
  game,
  getVideoBusy,
  getVideoStatus,
  listeningStream,
  nowMs,
  onGetVideo,
  onListen,
  onSelectStream,
  onStopListen,
  showGetVideo,
  streams,
}: {
  audioError?: string;
  game: PatriotsGame;
  getVideoBusy: boolean;
  getVideoStatus?: 'finding' | 'failed';
  listeningStream?: PlayableStream;
  nowMs: number;
  onGetVideo: () => void;
  onListen: (stream: PlayableStream) => void;
  onSelectStream: (stream: PlayableStream) => void;
  onStopListen: () => void;
  showGetVideo: boolean;
  streams: PlayableStream[];
}) {
  const interruption = gameInterruption(game.status);
  const isLive = game.abstractState === 'Live';
  const isFinal = game.abstractState === 'Final' && !interruption;
  const recap = isFinal ? recapResult(game) : undefined;
  const blocksVideo = gameBlocksVideo(game);
  const videoWindowOpen =
    !blocksVideo &&
    game.timeValid &&
    (isLive ||
      nowMs >= new Date(game.gameDate).getTime() - VIDEO_LEAD_TIME_MS);
  const visibleStreams = videoWindowOpen ? streams : [];
  const listeningControlShown = visibleStreams.some(
    (stream) =>
      stream.kind === 'direct' &&
      listeningStream?.kind === stream.kind &&
      listeningStream.playbackUrl === stream.playbackUrl,
  );
  const isTodayScheduled = !isLive && !interruption && !isFinal;
  const usesTodayCard = isTodayScheduled || isFinal;
  const badgeText = interruption
    ? interruption.toUpperCase()
    : isLive
      ? 'LIVE'
      : recap
        ? recap
        : game.timeValid
          ? `TODAY ${gameTimeLabel(game.gameDate)}`
          : 'TODAY TIME TBA';
  const matchupText =
    isTodayScheduled || isFinal
      ? game.isHome
        ? `Home vs ${game.opponentName}`
        : `Away v ${game.opponentName}`
      : `Patriots ${game.isHome ? 'vs' : 'at'} ${game.opponentName}`;

  return (
    <View
      style={[
        styles.liveCard,
        usesTodayCard && styles.todayCard,
        interruption && styles.interruptedCard,
      ]}
    >
      <View
        style={[
          styles.liveBadge,
          usesTodayCard && styles.todayBadge,
          interruption && styles.interruptedBadge,
        ]}
      >
        {isLive && !interruption ? <View style={styles.liveDot} /> : null}
        <Text
          numberOfLines={1}
          style={[
            styles.liveBadgeText,
            usesTodayCard && styles.todayBadgeText,
            interruption && styles.interruptedBadgeText,
          ]}
        >
          {badgeText}
        </Text>
      </View>

      <Text style={styles.liveMatchup}>{matchupText}</Text>
      {isLive || interruption || isFinal ? (
        <Text style={styles.liveStatus}>{game.status}</Text>
      ) : null}

      {interruption ? (
        <View accessibilityRole="alert" style={styles.interruptionBox}>
          <Text style={styles.interruptionText}>
            {interruptionMessage(interruption)}
          </Text>
        </View>
      ) : null}

      {isLive && game.scoreboard ? (
        <PatriotsScoreboard
          isHome={game.isHome}
          opponentName={game.opponentName}
          scoreboard={game.scoreboard}
        />
      ) : isLive || isFinal ? (
        <View style={styles.scoreBox}>
          <View style={styles.scoreRow}>
            <Text style={styles.scoreTeam}>Patriots</Text>
            <Text style={styles.scoreNumber}>{game.patriotsScore}</Text>
          </View>
          <View style={styles.scoreDivider} />
          <View style={styles.scoreRow}>
            <Text style={styles.scoreTeam}>{game.opponentName}</Text>
            <Text style={styles.scoreNumber}>{game.opponentScore}</Text>
          </View>
        </View>
      ) : null}

      {isTodayScheduled && game.timeValid ? (
        <View style={styles.countdownBox}>
          <Text style={styles.countdownLabel}>STARTS IN</Text>
          <Text accessibilityLiveRegion="polite" style={styles.countdownText}>
            {countdownLabel(game.gameDate, nowMs)}
          </Text>
        </View>
      ) : null}

      {isTodayScheduled && !game.timeValid ? (
        <Text style={styles.videoTimingText}>Time TBA</Text>
      ) : null}

      {!videoWindowOpen && !blocksVideo && game.timeValid ? (
        <Text style={styles.videoTimingText}>
          Video starts 15 minutes before game time.
        </Text>
      ) : null}

      {visibleStreams.length > 0 ? (
        <View style={styles.watchButtons}>
          {visibleStreams.map((stream, index) => {
            const streamKey = `${stream.gameDates.join(',')}-${stream.gameNumbers.join(',')}-${stream.url}`;
            const isListening =
              listeningStream?.playbackUrl === stream.playbackUrl &&
              listeningStream.kind === stream.kind;
            return (
              <View key={streamKey} style={styles.watchPair}>
                <Pressable
                  accessibilityHint="Plays the approved video inside the app"
                  accessibilityLabel={
                    visibleStreams.length > 1
                      ? `Play video ${index + 1}`
                      : 'Play video'
                  }
                  accessibilityRole="button"
                  onPress={() => onSelectStream(stream)}
                  style={({ pressed }) => [
                    styles.watchButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.watchIcon}>▶</Text>
                </Pressable>
                {stream.kind === 'direct' ? (
                  <Pressable
                    accessibilityHint={
                      isListening
                        ? 'Stops the game audio'
                        : 'Plays game audio without showing video'
                    }
                    accessibilityLabel={
                      isListening
                        ? 'Stop audio'
                        : visibleStreams.filter(
                            (entry) => entry.kind === 'direct',
                          ).length > 1
                          ? `Listen to audio ${index + 1}`
                          : 'Listen to audio'
                    }
                    accessibilityRole="button"
                    onPress={() =>
                      isListening ? onStopListen() : onListen(stream)
                    }
                    style={({ pressed }) => [
                      styles.watchButton,
                      isListening && styles.listeningButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.watchIcon}>
                      {isListening ? '■' : '♪'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {listeningStream && !listeningControlShown ? (
        <View style={styles.watchButtons}>
          <Pressable
            accessibilityHint="Stops the game audio"
            accessibilityLabel="Stop audio"
            accessibilityRole="button"
            onPress={onStopListen}
            style={({ pressed }) => [
              styles.watchButton,
              styles.listeningButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.watchIcon}>■</Text>
          </Pressable>
        </View>
      ) : null}

      {audioError ? (
        <Text accessibilityRole="alert" style={styles.noStreamText}>
          {audioError}
        </Text>
      ) : null}

      {videoWindowOpen && visibleStreams.length === 0 ? (
        <View style={styles.getVideoBlock}>
          {showGetVideo ? (
            <Pressable
              accessibilityHint="Finds the approved Patriots video for this game"
              accessibilityLabel={
                getVideoBusy ? 'Getting video' : 'Get video'
              }
              accessibilityRole="button"
              accessibilityState={{ busy: getVideoBusy, disabled: getVideoBusy }}
              disabled={getVideoBusy}
              onPress={onGetVideo}
              style={({ pressed }) => [
                styles.getVideoButton,
                getVideoBusy && styles.getVideoButtonBusy,
                pressed && !getVideoBusy && styles.pressed,
              ]}
            >
              {getVideoBusy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.getVideoButtonText}>Get video</Text>
              )}
            </Pressable>
          ) : null}
          <Text
            accessibilityLiveRegion="polite"
            accessibilityRole={
              getVideoStatus === 'failed' ? 'alert' : 'text'
            }
            style={styles.noStreamText}
          >
            {getVideoStatus === 'finding'
              ? 'Getting video. This could take a minute.'
              : getVideoStatus === 'failed'
                ? 'Could not find video.'
                : 'Video is not ready yet. The app checks again automatically.'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function PatriotsScreen({ onBack }: { onBack: () => void }) {
  const [authorizedStreams, setAuthorizedStreams] = useState<
    PlayablePatriotsStream[]
  >([]);
  const [snapshot, setSnapshot] = useState<PatriotsSnapshot>();
  const [error, setError] = useState<string>();
  const [nowMs, setNowMs] = useState(Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStream, setSelectedStream] = useState<PlayableStream>();
  const [listeningStream, setListeningStream] = useState<PlayableStream>();
  const [audioError, setAudioError] = useState<string>();
  const [getVideoStatus, setGetVideoStatus] = useState<
    'idle' | 'finding' | 'failed'
  >('idle');

  const snapshotRef = useRef<PatriotsSnapshot | undefined>(undefined);
  const lastSnapshotAtRef = useRef(0);
  const livePollAppliedAtRef = useRef(0);
  const kickoffRefreshGamePkRef = useRef<number | undefined>(undefined);
  const finalRefreshGamePkRef = useRef<number | undefined>(undefined);
  const getVideoAbortRef = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const load = useCallback(
    async (showRefresh = false, sourceOptions?: SourcesOptions) => {
      if (showRefresh) {
        setRefreshing(true);
      }

      try {
        // A manual pull always refetches; the background poll only does so once the snapshot
        // has aged out, so the 60s cadence costs one small sources request instead of the
        // whole remaining schedule.
        const startedAt = Date.now();
        const refreshSnapshot =
          showRefresh ||
          snapshotRef.current === undefined ||
          startedAt - lastSnapshotAtRef.current >= SNAPSHOT_REFRESH_INTERVAL_MS;
        // Each result applies on its own, so an ESPN failure does not discard a newly
        // published stream and a sources failure does not discard the schedule.
        const [snapshotResult, streamsResult] = await Promise.allSettled([
          refreshSnapshot
            ? fetchPatriotsSnapshot()
            : Promise.resolve(undefined),
          fetchPatriotsSources(sourceOptions),
        ]);
        const fetchedSnapshot =
          snapshotResult.status === 'fulfilled'
            ? snapshotResult.value
            : undefined;
        if (fetchedSnapshot) {
          lastSnapshotAtRef.current = startedAt;
          const keepPolledBoard =
            Date.now() - livePollAppliedAtRef.current < LIVE_BOARD_FRESH_MS;
          setSnapshot((current) =>
            snapshotWithPreservedScoreboard(
              current,
              fetchedSnapshot,
              keepPolledBoard,
            ),
          );
        }
        if (streamsResult.status === 'fulfilled') {
          const nextStreams = streamsResult.value;
          setAuthorizedStreams((current) => {
            const featured =
              fetchedSnapshot?.featuredGame ??
              snapshotRef.current?.featuredGame;
            if (!featured) {
              return nextStreams;
            }
            const incoming = authorizedStreamsForGame(nextStreams, featured);
            const existing = authorizedStreamsForGame(current, featured);
            return incoming.length === 0 && existing.length > 0
              ? current
              : nextStreams;
          });
        }
        setError(
          snapshotResult.status === 'rejected'
            ? 'Patriots information is temporarily unavailable.'
            : undefined,
        );
      } finally {
        // Background loads leave a pull-to-refresh spinner to the load that started it.
        if (showRefresh) {
          setRefreshing(false);
        }
      }
    },
    [],
  );

  // Refetches the schedule now instead of waiting for the ten-minute refresh.
  const refreshSnapshotNow = useCallback(() => {
    lastSnapshotAtRef.current = 0;
    void load();
  }, [load]);

  // Timers keep firing on iPhone while Listen or AirPlay holds the app in the background, so
  // ticks wait for the foreground and catch up once when the app returns.
  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        void load();
      }
    }, REFRESH_INTERVAL_MS);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void load();
      }
    });
    return () => {
      clearInterval(interval);
      appState.remove();
    };
  }, [load]);

  // nowMs only drives the pre-game countdown and the video window opening. Once the game is
  // live, final, or stopped nothing on screen reads it, so ticking every second would
  // re-render the whole screen for nothing across the longest stretch it is open.
  const featuredGame = snapshot?.featuredGame;
  const featuredState = featuredGame?.abstractState;
  const featuredStatus = featuredGame?.status;
  const featuredGamePk = featuredGame?.gamePk;
  const countdownTickMs = useMemo(() => {
    if (!featuredState || featuredState === 'Live' || featuredState === 'Final') {
      return undefined;
    }
    const interruption = gameInterruption(featuredStatus ?? '');
    if (!interruption) {
      return COUNTDOWN_INTERVAL_MS;
    }
    return interruption === 'delayed' ? DELAYED_TICK_INTERVAL_MS : undefined;
  }, [featuredState, featuredStatus]);

  useEffect(() => {
    setNowMs(Date.now());
    if (countdownTickMs === undefined) {
      return;
    }
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        setNowMs(Date.now());
      }
    }, countdownTickMs);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNowMs(Date.now());
      }
    });
    return () => {
      clearInterval(interval);
      appState.remove();
    };
  }, [countdownTickMs]);

  const featuredStartMs = featuredGame?.timeValid
    ? new Date(featuredGame.gameDate).getTime()
    : undefined;
  const featuredReachedStart =
    featuredStartMs !== undefined && nowMs >= featuredStartMs;
  const featuredBlocksVideo = featuredGame
    ? gameBlocksVideo(featuredGame)
    : false;
  // The summary poll runs through the live game and from the scheduled kickoff until ESPN
  // reports it started, so Live and Final do not wait for the ten-minute schedule refresh.
  const pollsLiveSummary =
    featuredState === 'Live' ||
    (featuredState !== undefined &&
      abstractStateRank(featuredState) === 0 &&
      featuredReachedStart &&
      !featuredBlocksVideo);

  useEffect(() => {
    if (
      featuredGamePk === undefined ||
      featuredStartMs === undefined ||
      !featuredReachedStart ||
      featuredState === undefined ||
      abstractStateRank(featuredState) > 0 ||
      kickoffRefreshGamePkRef.current === featuredGamePk
    ) {
      return;
    }
    kickoffRefreshGamePkRef.current = featuredGamePk;
    if (lastSnapshotAtRef.current < featuredStartMs) {
      refreshSnapshotNow();
    }
  }, [
    featuredGamePk,
    featuredReachedStart,
    featuredStartMs,
    featuredState,
    refreshSnapshotNow,
  ]);

  useEffect(() => {
    if (!pollsLiveSummary || featuredGamePk === undefined) {
      return;
    }
    if (__DEV__ && PATRIOTS_TEST_URL) {
      return;
    }

    let cancelled = false;
    let inFlight = false;
    let latestRequest = 0;
    let appliedRequest = 0;
    const gamePk = featuredGamePk;

    const refreshScoreboard = async () => {
      if (AppState.currentState !== 'active' || inFlight) {
        return;
      }

      inFlight = true;
      latestRequest += 1;
      const request = latestRequest;
      try {
        const summary = await fetchLiveFootballSummary(gamePk);
        if (cancelled || !summary || request < appliedRequest) {
          return;
        }
        appliedRequest = request;
        livePollAppliedAtRef.current = Date.now();

        setSnapshot((current) => {
          const currentFeatured = current?.featuredGame;
          if (
            !current ||
            !currentFeatured ||
            currentFeatured.gamePk !== gamePk
          ) {
            return current;
          }
          const nextFeatured = gameWithLiveSummary(currentFeatured, summary);
          return nextFeatured === currentFeatured
            ? current
            : { ...current, featuredGame: nextFeatured };
        });

        if (
          abstractStateFromEspn(summary.state, summary.completed) === 'Final' &&
          finalRefreshGamePkRef.current !== gamePk
        ) {
          finalRefreshGamePkRef.current = gamePk;
          refreshSnapshotNow();
        }
      } finally {
        inFlight = false;
      }
    };

    void refreshScoreboard();
    const interval = setInterval(
      () => void refreshScoreboard(),
      LIVE_SCOREBOARD_INTERVAL_MS,
    );
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshScoreboard();
      }
    });
    return () => {
      cancelled = true;
      clearInterval(interval);
      appState.remove();
    };
  }, [featuredGamePk, pollsLiveSummary, refreshSnapshotNow]);

  const featuredStreams = useMemo(
    () =>
      snapshot?.featuredGame
        ? authorizedStreamsForGame(authorizedStreams, snapshot.featuredGame)
        : [],
    [authorizedStreams, snapshot?.featuredGame],
  );

  useEffect(() => {
    if (featuredStreams.length > 0 && getVideoStatus !== 'idle') {
      setGetVideoStatus('idle');
    }
  }, [featuredStreams.length, getVideoStatus]);

  // A different featured game ends the previous game's Get video poll and background audio.
  const featuredGameKey = featuredGame
    ? `${featuredGame.gamePk}:${featuredGame.officialDate}:${featuredGame.gameNumber}`
    : undefined;
  useEffect(() => {
    getVideoAbortRef.current?.abort();
    getVideoAbortRef.current = undefined;
    setGetVideoStatus('idle');
    setListeningStream(undefined);
  }, [featuredGameKey]);

  useEffect(() => {
    if (featuredBlocksVideo) {
      setListeningStream(undefined);
    }
  }, [featuredBlocksVideo]);

  useEffect(() => () => getVideoAbortRef.current?.abort(), []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (selectedStream) {
          setSelectedStream(undefined);
          return true;
        }
        onBack();
        return true;
      },
    );

    return () => subscription.remove();
  }, [onBack, selectedStream]);

  const handleGetVideo = useCallback(async () => {
    const game = snapshot?.featuredGame;
    if (!game || getVideoStatus === 'finding') {
      return;
    }

    getVideoAbortRef.current?.abort();
    const controller = new AbortController();
    getVideoAbortRef.current = controller;
    const { signal } = controller;
    setGetVideoStatus('finding');
    try {
      const sourceOptions: SourcesOptions = {
        allowStaleCache: false,
        preferLive: true,
        session: {},
      };
      const fetchLiveSources = () => fetchPatriotsSources(sourceOptions);
      await requestGetVideo(signal);
      const found = await pollForStream(game, fetchLiveSources, { signal });
      if (signal.aborted) {
        return;
      }
      if (found) {
        setAuthorizedStreams((current) =>
          authorizedStreamsForGame(current, game).length > 0
            ? current
            : [...current, found],
        );
        setGetVideoStatus('idle');
      }
      await load(true, sourceOptions);
      if (signal.aborted) {
        return;
      }
      if (found) {
        setGetVideoStatus('idle');
      } else {
        setGetVideoStatus('failed');
      }
    } catch {
      if (!signal.aborted) {
        setGetVideoStatus('failed');
      }
    } finally {
      if (getVideoAbortRef.current === controller) {
        getVideoAbortRef.current = undefined;
      }
    }
  }, [getVideoStatus, load, snapshot?.featuredGame]);

  const closeStreamPlayer = useCallback(() => setSelectedStream(undefined), []);

  return (
    <View style={styles.screen}>
      <ScrollView
        bounces={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
        overScrollMode="never"
        refreshControl={
          <RefreshControl
            colors={['#E31937']}
            onRefresh={() => void load(true)}
            refreshing={refreshing}
            tintColor="#E31937"
          />
        }
      >
        <View style={styles.contentColumn}>
          <View style={styles.header}>
            <Pressable
              accessibilityLabel="Return to Danner Apps"
              accessibilityRole="button"
              hitSlop={12}
              onPress={onBack}
              style={({ pressed }) => [
                styles.headerButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.headerButtonText}>‹ Apps</Text>
            </Pressable>
          </View>

          <View style={styles.hero}>
            <Image
              accessibilityLabel="New England Patriots"
              resizeMode="cover"
              source={require('../assets/new-england-patriots-logo.jpg')}
              style={styles.heroLogo}
            />
            <Text accessibilityRole="header" style={styles.heroTitle}>
              Patriots
            </Text>
            {snapshot ? (
              <Text
                accessibilityLabel={`Season record ${recordLabel(snapshot.wins, snapshot.losses, snapshot.ties)}`}
                style={styles.heroRecord}
              >
                {recordLabel(snapshot.wins, snapshot.losses, snapshot.ties)}
              </Text>
            ) : null}
          </View>

          {!snapshot && !error ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color="#E31937" size="large" />
              <Text style={styles.loadingText}>Loading the latest games…</Text>
            </View>
          ) : null}

          {error ? (
            <View accessibilityRole="alert" style={styles.errorCard}>
              <Text style={styles.errorTitle}>Couldn’t update the games</Text>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void load(true)}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>Try again</Text>
              </Pressable>
            </View>
          ) : null}

          {snapshot?.featuredGame ? (
            <FeaturedGameCard
              audioError={audioError}
              game={snapshot.featuredGame}
              getVideoBusy={getVideoStatus === 'finding'}
              getVideoStatus={
                getVideoStatus === 'idle' ? undefined : getVideoStatus
              }
              listeningStream={listeningStream}
              nowMs={nowMs}
              onGetVideo={() => void handleGetVideo()}
              onListen={(stream) => {
                setSelectedStream(undefined);
                setAudioError(undefined);
                setListeningStream(stream);
              }}
              onSelectStream={(stream) => {
                setListeningStream(undefined);
                setAudioError(undefined);
                setSelectedStream(stream);
              }}
              onStopListen={() => {
                setListeningStream(undefined);
                setAudioError(undefined);
              }}
              showGetVideo={isGetVideoAvailable()}
              streams={featuredStreams}
            />
          ) : null}

          {snapshot ? (
            <>
              <View style={styles.scheduleHeader}>
                <Text style={styles.sectionTitle}>Upcoming games</Text>
              </View>

              {snapshot.upcomingGames.length ? (
                <View style={styles.scheduleCard}>
                  {snapshot.upcomingGames.map((game, index) => (
                    <View key={game.gamePk}>
                      {index > 0 ? <View style={styles.gameDivider} /> : null}
                      <View style={styles.gameRow}>
                        <View style={styles.gameDateColumn}>
                          <Text style={styles.gameDate}>
                            {gameDateLabel(game)}
                          </Text>
                          {game.status !== 'Scheduled' ? (
                            <Text style={styles.gameStatus}>{game.status}</Text>
                          ) : null}
                        </View>
                        <Text style={styles.gameOpponent}>
                          {game.isHome ? 'vs' : 'at'} {game.opponentName}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>
                    No upcoming games are scheduled.
                  </Text>
                </View>
              )}
            </>
          ) : null}
        </View>
      </ScrollView>

      <StreamPlayer onClose={closeStreamPlayer} stream={selectedStream} />
      {listeningStream ? (
        <GuardiansAudioPlayer
          artist="New England Patriots"
          onFailed={() => {
            setListeningStream(undefined);
            setAudioError('Audio could not start.');
          }}
          stream={listeningStream}
          title="Patriots game"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F7F7F2',
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 48,
  },
  contentColumn: {
    maxWidth: 720,
    paddingHorizontal: 18,
    width: '100%',
  },
  header: {
    minHeight: 54,
    paddingTop: 8,
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
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.99 }],
  },
  hero: {
    alignItems: 'center',
    paddingBottom: 24,
  },
  heroLogo: {
    borderRadius: 22,
    height: 118,
    width: 118,
  },
  heroTitle: {
    color: '#0B2B4C',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.6,
    marginTop: 12,
  },
  heroRecord: {
    color: '#5A6870',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginTop: 4,
  },
  loadingCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D7DEE5',
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 28,
  },
  loadingText: {
    color: '#45545E',
    fontSize: 17,
    fontWeight: '700',
  },
  errorCard: {
    backgroundColor: '#FFF0F1',
    borderColor: '#EAA5AE',
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
  },
  errorTitle: {
    color: '#8B1426',
    fontSize: 21,
    fontWeight: '900',
  },
  errorText: {
    color: '#5A3037',
    fontSize: 16,
    lineHeight: 23,
    marginTop: 7,
  },
  primaryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#E31937',
    borderRadius: 13,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 52,
    paddingHorizontal: 22,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },
  liveCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E31937',
    borderRadius: 20,
    borderWidth: 3,
    marginBottom: 18,
    padding: 20,
  },
  todayCard: {
    borderColor: '#0B2B4C',
    borderWidth: 2,
  },
  interruptedCard: {
    borderColor: '#C97900',
    borderWidth: 3,
  },
  liveBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFE7EA',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  todayBadge: {
    backgroundColor: '#E8EEF3',
  },
  interruptedBadge: {
    backgroundColor: '#FFF0D8',
  },
  liveDot: {
    backgroundColor: '#E31937',
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  liveBadgeText: {
    color: '#B20D27',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },
  todayBadgeText: {
    color: '#0B2B4C',
    letterSpacing: 0.4,
  },
  interruptedBadgeText: {
    color: '#8A4B00',
  },
  liveMatchup: {
    color: '#0B2B4C',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 31,
    marginTop: 13,
  },
  liveStatus: {
    color: '#5A6870',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 3,
  },
  interruptionBox: {
    backgroundColor: '#FFF0D8',
    borderRadius: 14,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  interruptionText: {
    color: '#713E00',
    fontSize: 19,
    fontWeight: '900',
    lineHeight: 25,
    textAlign: 'center',
  },
  scoreBox: {
    backgroundColor: '#F3F6F8',
    borderRadius: 15,
    marginTop: 17,
    paddingHorizontal: 16,
  },
  scoreRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 58,
  },
  scoreTeam: {
    color: '#0B2B4C',
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
  },
  scoreNumber: {
    color: '#0B2B4C',
    fontSize: 27,
    fontWeight: '900',
  },
  scoreDivider: {
    backgroundColor: '#D7DEE5',
    height: 1,
  },
  countdownBox: {
    alignItems: 'center',
    backgroundColor: '#F3F6F8',
    borderRadius: 15,
    marginTop: 17,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  countdownLabel: {
    color: '#697780',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  countdownText: {
    color: '#0B2B4C',
    fontSize: 30,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    marginTop: 5,
    textAlign: 'center',
  },
  videoTimingText: {
    color: '#53616A',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 14,
    textAlign: 'center',
  },
  watchButtons: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    marginTop: 16,
  },
  watchPair: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  watchButton: {
    alignItems: 'center',
    backgroundColor: '#E31937',
    borderRadius: 34,
    height: 68,
    justifyContent: 'center',
    width: 68,
  },
  listeningButton: {
    backgroundColor: '#0B2B4C',
  },
  watchIcon: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '900',
    marginLeft: 3,
  },
  noStreamText: {
    color: '#59666E',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    marginTop: 14,
    textAlign: 'center',
  },
  getVideoBlock: {
    alignItems: 'center',
    marginTop: 16,
  },
  getVideoButton: {
    alignItems: 'center',
    backgroundColor: '#0B2B4C',
    borderRadius: 13,
    justifyContent: 'center',
    minHeight: 52,
    minWidth: 180,
    paddingHorizontal: 22,
  },
  getVideoButtonBusy: {
    backgroundColor: '#41556B',
  },
  getVideoButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },
  scheduleHeader: {
    marginBottom: 11,
    marginTop: 8,
  },
  sectionTitle: {
    color: '#0B2B4C',
    fontSize: 25,
    fontWeight: '900',
  },
  scheduleCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D7DEE5',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 16,
  },
  gameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 76,
    paddingVertical: 12,
  },
  gameDateColumn: {
    flex: 1,
    paddingRight: 12,
  },
  gameDate: {
    color: '#53616A',
    fontSize: 15,
    fontWeight: '800',
  },
  gameStatus: {
    color: '#B20D27',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
  },
  gameOpponent: {
    color: '#0B2B4C',
    flex: 1,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'right',
  },
  gameDivider: {
    backgroundColor: '#E3E8EC',
    height: 1,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D7DEE5',
    borderRadius: 18,
    borderWidth: 1,
    padding: 24,
  },
  emptyText: {
    color: '#59666E',
    fontSize: 16,
    fontWeight: '700',
  },
  playerScreen: {
    backgroundColor: '#000000',
    flex: 1,
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
  playerTitle: {
    color: '#0B2B4C',
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  tvErrorText: {
    backgroundColor: '#FFFFFF',
    color: '#A32626',
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  playerWebView: {
    backgroundColor: '#000000',
    flex: 1,
  },
  directVideo: {
    backgroundColor: '#000000',
    flex: 1,
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
});
