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
import { CyclonesBasketballScoreboard } from './CyclonesBasketballScoreboard';
import { CyclonesFootballScoreboard } from './CyclonesFootballScoreboard';
import {
  isGetVideoAvailable,
  liveStreamsUrl,
  pollForStream,
  requestGetVideo,
} from './cyclonesGetVideo';
import {
  authorizedStreamsForGame,
  cyclonesStreamsFromDocument,
  type PlayableCyclonesStream,
} from './cyclonesSources';
import {
  CYCLONES_SPORTS,
  cyclonesGameFromEspnEvent,
  cyclonesGameFromHarness,
  emptyRecords,
  gameInterruption,
  isCompletedGame,
  isVideoWindowOpen,
  localDateFromOfficialDate,
  playbackBlocked,
  recapResult,
  recordLabel,
  recordsFromGames,
  snapshotFromGames,
  sportLabel,
  type CyclonesGame,
  type CyclonesSnapshot,
  type CyclonesSport,
  type GameInterruption,
  type SportRecord,
} from './cyclonesSnapshot';
import { fetchEspnCyclonesEvents } from './espnCyclones';
import {
  fetchLiveCyclonesSummary,
  liveBasketballScoreboardFromEspn,
  liveBasketballScoreboardFromHarness,
  liveFootballScoreboardFromEspn,
  liveFootballScoreboardFromHarness,
  type LiveCyclonesSummary,
} from './espnCyclonesScoreboard';

const YOUTUBE_WRAPPER_URL = 'https://danner.app/';
const REFRESH_INTERVAL_MS = 60_000;
const SNAPSHOT_REFRESH_INTERVAL_MS = 10 * 60_000;
const LIVE_SCOREBOARD_INTERVAL_MS = 5_000;
const COUNTDOWN_INTERVAL_MS = 1_000;
const DELAYED_TICK_INTERVAL_MS = 30_000;
const LIVE_BOARD_FRESH_MS = 30_000;
const SOURCES_FETCH_TIMEOUT_MS = 8_000;
const SNAPSHOT_ERROR_MESSAGE =
  'Cyclones information is temporarily unavailable.';
const REMOTE_CYCLONES_SOURCES_URL =
  'https://raw.githubusercontent.com/Danner36/Danner_App/main/cyclones_streams.json';
const SOURCES_STORAGE_KEY = 'danner.cyclones.sources.v1';
const CYCLONES_TEST_URL = process.env.EXPO_PUBLIC_CYCLONES_TEST_URL;
const CYCLONES_TEST_SOURCES_URL = process.env.EXPO_PUBLIC_CYCLONES_SOURCES_URL;
const CYCLONES_SOURCES_URL =
  __DEV__ && CYCLONES_TEST_SOURCES_URL
    ? CYCLONES_TEST_SOURCES_URL
    : REMOTE_CYCLONES_SOURCES_URL;
const ACCENT = '#AE192D';

type PlayableStream = PlayableCyclonesStream;

type LiveBoardStamp = {
  appliedAt: number;
  gamePk: number;
};

function recordFromUnknown(value: unknown): SportRecord | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const record = value as { losses?: unknown; ties?: unknown; wins?: unknown };
  if (typeof record.wins !== 'number' || typeof record.losses !== 'number') {
    return undefined;
  }
  return {
    losses: record.losses,
    ties: typeof record.ties === 'number' ? record.ties : 0,
    wins: record.wins,
  };
}

function withHarnessScoreboard(
  game: CyclonesGame | undefined,
): CyclonesGame | undefined {
  if (!game) {
    return undefined;
  }
  if (game.scoreboard === undefined) {
    return game;
  }
  const scoreboard =
    game.sport === 'football'
      ? liveFootballScoreboardFromHarness(game.scoreboard)
      : liveBasketballScoreboardFromHarness(game.scoreboard);
  if (!scoreboard) {
    return undefined;
  }
  return { ...game, scoreboard };
}

function snapshotWithPreservedScoreboard(
  previous: CyclonesSnapshot | undefined,
  next: CyclonesSnapshot,
  liveBoard: LiveBoardStamp | undefined,
): CyclonesSnapshot {
  const previousGame = previous?.featuredGame;
  const nextGame = next.featuredGame;
  if (!previousGame || !nextGame || previousGame.gamePk !== nextGame.gamePk) {
    return next;
  }

  // The five-second summary reports Live and Final before the schedule does; a schedule
  // that still lags never moves the card backwards.
  const scheduleLags =
    (isCompletedGame(previousGame) && nextGame.abstractState !== 'Final') ||
    (previousGame.abstractState === 'Live' &&
      nextGame.abstractState !== 'Live' &&
      nextGame.abstractState !== 'Final');
  // A fresh summary board carries down, distance, and possession that the schedule board
  // lacks, and is never older than the schedule.
  const keepLiveBoard =
    previousGame.abstractState === 'Live' &&
    nextGame.abstractState === 'Live' &&
    previousGame.scoreboard !== undefined &&
    liveBoard?.gamePk === nextGame.gamePk &&
    Date.now() - liveBoard.appliedAt < LIVE_BOARD_FRESH_MS;
  if (scheduleLags || keepLiveBoard) {
    return {
      ...next,
      featuredGame: {
        ...nextGame,
        abstractState: previousGame.abstractState,
        cyclonesScore: previousGame.cyclonesScore,
        opponentScore: previousGame.opponentScore,
        scoreboard: previousGame.scoreboard,
        status: previousGame.status,
      },
    };
  }
  if (!previousGame.scoreboard) {
    return next;
  }

  return {
    ...next,
    featuredGame: {
      ...nextGame,
      scoreboard: nextGame.scoreboard ?? previousGame.scoreboard,
    },
  };
}

async function fetchCyclonesHarnessSnapshot(
  url: string,
): Promise<CyclonesSnapshot> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error('The Cyclones test harness is unavailable.');
  }

  const value = (await response.json()) as {
    football?: unknown;
    liveGame?: unknown;
    losses?: unknown;
    mensBasketball?: unknown;
    ties?: unknown;
    upcomingGames?: unknown;
    wins?: unknown;
    womensBasketball?: unknown;
  };
  const liveGame = withHarnessScoreboard(cyclonesGameFromHarness(value.liveGame));
  const upcomingGames = Array.isArray(value.upcomingGames)
    ? value.upcomingGames
        .map((entry) => withHarnessScoreboard(cyclonesGameFromHarness(entry)))
        .filter((game): game is CyclonesGame => Boolean(game))
    : [];

  if (value.liveGame !== undefined && !liveGame) {
    throw new Error('The Cyclones test fixture is invalid.');
  }

  const games = liveGame ? [liveGame, ...upcomingGames] : upcomingGames;
  const records = emptyRecords();
  const football =
    recordFromUnknown(value.football) ??
    (typeof value.wins === 'number' && typeof value.losses === 'number'
      ? {
          losses: value.losses,
          ties: typeof value.ties === 'number' ? value.ties : 0,
          wins: value.wins,
        }
      : recordsFromGames(games).football);
  records.football = football;
  records['mens-basketball'] =
    recordFromUnknown(value.mensBasketball) ??
    recordsFromGames(games)['mens-basketball'];
  records['womens-basketball'] =
    recordFromUnknown(value.womensBasketball) ??
    recordsFromGames(games)['womens-basketball'];

  return snapshotFromGames(games, records);
}

// A sport whose ESPN requests failed keeps its previous games, record, and status; `complete`
// is false so the next minute tick retries the schedule.
async function fetchCyclonesSnapshot(
  previous: CyclonesSnapshot | undefined,
): Promise<{ complete: boolean; snapshot: CyclonesSnapshot }> {
  if (__DEV__ && CYCLONES_TEST_URL) {
    return {
      complete: true,
      snapshot: await fetchCyclonesHarnessSnapshot(CYCLONES_TEST_URL),
    };
  }

  const now = new Date();
  const { events, failedSports } = await fetchEspnCyclonesEvents(now);
  const games = events
    .map(({ event, sport }) => {
      const game = cyclonesGameFromEspnEvent(event, sport);
      if (!game) {
        return undefined;
      }
      const scoreboard =
        sport === 'football'
          ? liveFootballScoreboardFromEspn(event)
          : liveBasketballScoreboardFromEspn(event);
      return scoreboard ? { ...game, scoreboard } : game;
    })
    .filter((game): game is CyclonesGame => Boolean(game));
  const records = recordsFromGames(games);
  const carriedGames: CyclonesGame[] = [];
  const unavailableSports: CyclonesSport[] = [];
  for (const sport of failedSports) {
    if (!previous || previous.unavailableSports?.includes(sport)) {
      unavailableSports.push(sport);
      continue;
    }
    records[sport] = previous.records[sport];
    for (const game of [previous.featuredGame, ...previous.upcomingGames]) {
      if (game?.sport === sport) {
        carriedGames.push(game);
      }
    }
  }
  const snapshot = snapshotFromGames([...games, ...carriedGames], records, now);
  for (const sport of failedSports) {
    const status = previous?.statuses[sport];
    if (status) {
      snapshot.statuses[sport] = status;
    } else {
      delete snapshot.statuses[sport];
    }
  }
  if (unavailableSports.length > 0) {
    snapshot.unavailableSports = unavailableSports;
  }
  return { complete: failedSports.length === 0, snapshot };
}

function sourcesUrlWithCacheBust(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}refresh=${Date.now()}`;
}

async function fetchLatestCommitSha(
  signal: AbortSignal,
): Promise<string | undefined> {
  const response = await fetch(
    'https://api.github.com/repos/Danner36/Danner_App/commits?path=cyclones_streams.json&per_page=1',
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

async function withSourcesTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  outerSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, SOURCES_FETCH_TIMEOUT_MS);
  outerSignal?.addEventListener('abort', abort);
  if (outerSignal?.aborted) {
    controller.abort();
  }
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timeout);
    outerSignal?.removeEventListener('abort', abort);
  }
}

type SourcesSession = {
  commitSha?: Promise<string | undefined>;
};

type SourcesOptions = {
  allowStaleCache?: boolean;
  preferLive?: boolean;
  session?: SourcesSession;
  signal?: AbortSignal;
};

async function fetchCyclonesSources(
  options?: SourcesOptions,
): Promise<PlayableCyclonesStream[]> {
  const persistRemote = CYCLONES_SOURCES_URL === REMOTE_CYCLONES_SOURCES_URL;
  const allowStaleCache = options?.allowStaleCache !== false && persistRemote;
  const preferLive =
    options?.preferLive === true || options?.allowStaleCache === false;
  const signal = options?.signal;

  const readStreams = async (url: string) => {
    const documentText = await withSourcesTimeout(
      (requestSignal) => readStreamsResponse(url, requestSignal),
      signal,
    );
    const streams = cyclonesStreamsFromDocument(JSON.parse(documentText));
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
    let lastError: unknown;
    const workerStreams = liveStreamsUrl();
    if (workerStreams && (preferLive || persistRemote)) {
      try {
        return await readStreams(workerStreams);
      } catch (workerError) {
        lastError = workerError;
      }
    }
    // The commit lookup costs one unauthenticated GitHub API call, so it runs only after the
    // Worker fails and is shared by every fetch in the same Get video session.
    if (preferLive && persistRemote) {
      const session = options?.session ?? {};
      session.commitSha ??= withSourcesTimeout(
        fetchLatestCommitSha,
        signal,
      ).catch(() => undefined);
      const sha = await session.commitSha;
      if (sha) {
        try {
          return await readStreams(
            `https://raw.githubusercontent.com/Danner36/Danner_App/${sha}/cyclones_streams.json`,
          );
        } catch (shaError) {
          lastError = shaError;
        }
      }
    }
    try {
      return await readStreams(CYCLONES_SOURCES_URL);
    } catch (mainError) {
      lastError = mainError;
    }
    throw lastError ?? new Error('The approved video list is unavailable.');
  } catch {
    if (allowStaleCache) {
      try {
        const cachedDocument = await AsyncStorage.getItem(SOURCES_STORAGE_KEY);
        if (cachedDocument) {
          return cyclonesStreamsFromDocument(JSON.parse(cachedDocument)) ?? [];
        }
      } catch {}
    }
    return [];
  }
}

function gameDateLabel(game: CyclonesGame): string {
  const dateFormat = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  });
  if (!game.timeValid) {
    const officialDay = localDateFromOfficialDate(game.officialDate);
    return `${dateFormat.format(officialDay)} · Time TBA`;
  }
  const datePart = dateFormat.format(new Date(game.gameDate));
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
          title="Cyclones video"
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
  const discoveryNonce = useMemo(
    () => newDiscoveryNonce(),
    [stream.playbackUrl, promotedPopupUrl],
  );
  const webInjection = isWeb
    ? `${WEB_AIRPLAY_INJECTION}\n${webMediaDiscoveryInjection(discoveryNonce)}`
    : undefined;
  // Android lets a navigation through when the JS check does not answer within 250 ms and
  // never asks about POST navigations, so a loaded page is checked again after the fact.
  const returnToApprovedSource = (url: string) => {
    if (!/^https?:/i.test(url) || allowNavigation(url)) {
      return;
    }
    webViewRef.current?.stopLoading();
    setPromotedPopupUrl(undefined);
    setWebViewKey((key) => key + 1);
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
      incognito={Platform.OS === 'ios'}
      injectedJavaScript={webInjection}
      injectedJavaScriptBeforeContentLoaded={webInjection}
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
      onLoadStart={(event) => returnToApprovedSource(event.nativeEvent.url)}
      onNavigationStateChange={(navigation) =>
        returnToApprovedSource(navigation.url)
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
          <ActivityIndicator color={ACCENT} size="large" />
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
    setTvError(undefined);
    void stopHlsProxy();
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
      {stream ? <PlayerKeepAwake /> : null}
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
            Cyclones game
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

function LiveScoreboard({ game }: { game: CyclonesGame }) {
  if (!game.scoreboard) {
    return null;
  }
  if (game.sport === 'football' && game.scoreboard.kind === 'football') {
    return (
      <CyclonesFootballScoreboard
        isHome={game.isHome}
        opponentName={game.opponentName}
        scoreboard={game.scoreboard}
      />
    );
  }
  if (game.scoreboard.kind === 'basketball') {
    return (
      <CyclonesBasketballScoreboard
        isHome={game.isHome}
        opponentName={game.opponentName}
        regulationPeriods={game.sport === 'mens-basketball' ? 2 : 4}
        scoreboard={game.scoreboard}
      />
    );
  }
  return null;
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
  sportStatusLabel,
  streams,
}: {
  audioError?: string;
  game: CyclonesGame;
  getVideoBusy: boolean;
  getVideoStatus?: 'finding' | 'failed';
  listeningStream?: PlayableStream;
  nowMs: number;
  onGetVideo: () => void;
  onListen: (stream: PlayableStream) => void;
  onSelectStream: (stream: PlayableStream) => void;
  onStopListen: () => void;
  showGetVideo: boolean;
  sportStatusLabel?: string;
  streams: PlayableStream[];
}) {
  const interruption = gameInterruption(game.status);
  const isLive = game.abstractState === 'Live';
  const isFinal = game.abstractState === 'Final' && !interruption;
  const recap = isFinal ? recapResult(game) : undefined;
  const blocksVideo = playbackBlocked(game);
  const videoWindowOpen = isVideoWindowOpen(game, nowMs);
  const visibleStreams = videoWindowOpen ? streams : [];
  const isListeningTo = (stream: PlayableStream) =>
    listeningStream?.playbackUrl === stream.playbackUrl &&
    listeningStream.kind === stream.kind;
  const showStandaloneStop =
    listeningStream !== undefined &&
    !visibleStreams.some(
      (stream) => stream.kind === 'direct' && isListeningTo(stream),
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
      ? game.neutralSite
        ? `vs ${game.opponentName}`
        : game.isHome
          ? `Home vs ${game.opponentName}`
          : `Away v ${game.opponentName}`
      : `Cyclones ${game.isHome || game.neutralSite ? 'vs' : 'at'} ${game.opponentName}`;

  return (
    <View
      style={[
        styles.liveCard,
        usesTodayCard && styles.todayCard,
        interruption && styles.interruptedCard,
      ]}
    >
      <Text style={styles.sportName}>{sportLabel(game.sport)}</Text>
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
      {sportStatusLabel ? (
        <Text style={styles.sportStatusText}>{sportStatusLabel}</Text>
      ) : null}

      {interruption ? (
        <View accessibilityRole="alert" style={styles.interruptionBox}>
          <Text style={styles.interruptionText}>
            {interruptionMessage(interruption)}
          </Text>
        </View>
      ) : null}

      {isLive && game.scoreboard ? (
        <LiveScoreboard game={game} />
      ) : isLive || isFinal ? (
        <View style={styles.scoreBox}>
          <View style={styles.scoreRow}>
            <Text style={styles.scoreTeam}>Cyclones</Text>
            <Text style={styles.scoreNumber}>{game.cyclonesScore}</Text>
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
            const streamKey = `${stream.sport}-${stream.gameDates.join(',')}-${stream.gameNumbers.join(',')}-${stream.url}`;
            const isListening = isListeningTo(stream);
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

      {showStandaloneStop ? (
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
              accessibilityHint="Finds the approved Cyclones video for this game"
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

export function CyclonesScreen({ onBack }: { onBack: () => void }) {
  const [authorizedStreams, setAuthorizedStreams] = useState<
    PlayableCyclonesStream[]
  >([]);
  const [snapshot, setSnapshot] = useState<CyclonesSnapshot>();
  const [error, setError] = useState<string>();
  const [nowMs, setNowMs] = useState(Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStream, setSelectedStream] = useState<PlayableStream>();
  const [listeningStream, setListeningStream] = useState<PlayableStream>();
  const [audioError, setAudioError] = useState<string>();
  const [getVideoStatus, setGetVideoStatus] = useState<
    'idle' | 'finding' | 'failed'
  >('idle');

  const snapshotRef = useRef<CyclonesSnapshot | undefined>(undefined);
  const lastSnapshotAtRef = useRef(0);
  const liveBoardRef = useRef<LiveBoardStamp | undefined>(undefined);
  const pendingStartGamePkRef = useRef<number | undefined>(undefined);
  const getVideoAbortRef = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const load = useCallback(
    async (
      showRefresh = false,
      sourceOptions?: SourcesOptions,
      forceSnapshot = false,
    ) => {
      if (showRefresh) {
        setRefreshing(true);
      }

      try {
        const startedAt = Date.now();
        const refreshSnapshot =
          showRefresh ||
          forceSnapshot ||
          snapshotRef.current === undefined ||
          startedAt - lastSnapshotAtRef.current >= SNAPSHOT_REFRESH_INTERVAL_MS;
        const [snapshotResult, streamsResult] = await Promise.allSettled([
          refreshSnapshot
            ? fetchCyclonesSnapshot(snapshotRef.current)
            : Promise.resolve(undefined),
          fetchCyclonesSources(sourceOptions),
        ]);
        const fetched =
          snapshotResult.status === 'fulfilled'
            ? snapshotResult.value
            : undefined;
        if (fetched) {
          if (fetched.complete) {
            lastSnapshotAtRef.current = startedAt;
          }
          setSnapshot((current) =>
            snapshotWithPreservedScoreboard(
              current,
              fetched.snapshot,
              liveBoardRef.current,
            ),
          );
        }
        if (streamsResult.status === 'fulfilled') {
          const nextStreams = streamsResult.value;
          setAuthorizedStreams((current) => {
            const featured =
              fetched?.snapshot.featuredGame ??
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
            ? SNAPSHOT_ERROR_MESSAGE
            : undefined,
        );
      } finally {
        setRefreshing(false);
      }
    },
    [],
  );

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

  const featuredGame = snapshot?.featuredGame;
  const featuredState = featuredGame?.abstractState;
  const featuredStatus = featuredGame?.status;
  const featuredGamePk = featuredGame?.gamePk;
  const featuredSport = featuredGame?.sport;
  // nowMs drives the countdown and the video window. A delayed game that has not started
  // keeps a slow tick so the video window still opens on time.
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

  const awaitingStart =
    featuredGame !== undefined &&
    featuredState !== 'Live' &&
    featuredState !== 'Final';
  const startReached =
    featuredGame !== undefined &&
    featuredGame.timeValid &&
    nowMs >= new Date(featuredGame.gameDate).getTime();
  // The summary poll also runs once the start time passes, so Live does not wait for the
  // ten-minute schedule refresh.
  const pollsLiveSummary =
    featuredGame !== undefined &&
    (featuredState === 'Live' ||
      (awaitingStart && startReached && !playbackBlocked(featuredGame)));

  useEffect(() => {
    if (!awaitingStart || featuredGamePk === undefined) {
      pendingStartGamePkRef.current = undefined;
      return;
    }
    if (!startReached) {
      pendingStartGamePkRef.current = featuredGamePk;
      return;
    }
    if (pendingStartGamePkRef.current === featuredGamePk) {
      pendingStartGamePkRef.current = undefined;
      void load(false, undefined, true);
    }
  }, [awaitingStart, featuredGamePk, load, startReached]);

  useEffect(() => {
    if (
      !pollsLiveSummary ||
      featuredGamePk === undefined ||
      featuredSport === undefined
    ) {
      return;
    }
    if (__DEV__ && CYCLONES_TEST_URL) {
      return;
    }

    let cancelled = false;
    let inFlight = false;
    let latestRequest = 0;
    let latestApplied = 0;
    const gamePk = featuredGamePk;
    const sport = featuredSport;

    const refreshScoreboard = async () => {
      if (AppState.currentState !== 'active' || inFlight) {
        return;
      }

      inFlight = true;
      const request = ++latestRequest;
      let summary: LiveCyclonesSummary | undefined;
      try {
        summary = await fetchLiveCyclonesSummary(gamePk, sport);
      } finally {
        inFlight = false;
      }
      if (cancelled || !summary || request <= latestApplied) {
        return;
      }
      latestApplied = request;

      const { completed, scoreboard, state } = summary;
      const isFinal = completed || state === 'post';
      if (state === 'in' && scoreboard) {
        liveBoardRef.current = { appliedAt: Date.now(), gamePk };
      }

      setSnapshot((current) => {
        const currentFeatured = current?.featuredGame;
        if (!current || !currentFeatured || currentFeatured.gamePk !== gamePk) {
          return current;
        }
        const abstractState = isFinal
          ? 'Final'
          : state === 'in' ||
              (state === undefined && currentFeatured.abstractState === 'Live')
            ? 'Live'
            : undefined;
        if (!abstractState) {
          return current;
        }

        const isHome = currentFeatured.isHome;
        return {
          ...current,
          featuredGame: {
            ...currentFeatured,
            abstractState,
            cyclonesScore: scoreboard
              ? isHome
                ? scoreboard.home.points
                : scoreboard.away.points
              : currentFeatured.cyclonesScore,
            opponentScore: scoreboard
              ? isHome
                ? scoreboard.away.points
                : scoreboard.home.points
              : currentFeatured.opponentScore,
            scoreboard: scoreboard ?? currentFeatured.scoreboard,
            status:
              scoreboard?.status ||
              (completed ? 'Final' : currentFeatured.status),
          },
        };
      });
      if (isFinal) {
        void load(false, undefined, true);
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
  }, [featuredGamePk, featuredSport, load, pollsLiveSummary]);

  const featuredIdentity =
    featuredGame !== undefined
      ? `${featuredGame.sport}:${featuredGame.gamePk}`
      : undefined;
  const featuredPlaybackBlocked =
    featuredGame !== undefined && playbackBlocked(featuredGame);

  // Get video and Listen belong to one featured game.
  useEffect(() => {
    setGetVideoStatus('idle');
    setListeningStream(undefined);
    return () => {
      getVideoAbortRef.current?.abort();
      getVideoAbortRef.current = undefined;
    };
  }, [featuredIdentity]);

  useEffect(() => {
    if (featuredPlaybackBlocked) {
      setListeningStream(undefined);
    }
  }, [featuredPlaybackBlocked]);

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
    const sourceOptions: SourcesOptions = {
      allowStaleCache: false,
      preferLive: true,
      session: {},
      signal,
    };
    setGetVideoStatus('finding');
    try {
      await requestGetVideo(game.sport, signal);
      const found = await pollForStream(
        game,
        () => fetchCyclonesSources(sourceOptions),
        { signal },
      );
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

  const closeStream = useCallback(() => setSelectedStream(undefined), []);

  return (
    <View style={styles.screen}>
      <ScrollView
        bounces={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
        overScrollMode="never"
        refreshControl={
          <RefreshControl
            colors={[ACCENT]}
            onRefresh={() => void load(true)}
            refreshing={refreshing}
            tintColor={ACCENT}
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
              accessibilityLabel="Iowa State Cyclones"
              resizeMode="cover"
              source={require('../assets/iowa-state-cyclones-logo.jpg')}
              style={styles.heroLogo}
            />
            <Text accessibilityRole="header" style={styles.heroTitle}>
              Cyclones
            </Text>
            {snapshot
              ? CYCLONES_SPORTS.filter(
                  (sport) => !snapshot.unavailableSports?.includes(sport),
                ).map((sport: CyclonesSport) => {
                  const record = snapshot.records[sport];
                  const status = snapshot.statuses[sport];
                  return (
                    <View key={sport} style={styles.heroRecordBlock}>
                      <Text
                        accessibilityLabel={`${sportLabel(sport)} ${recordLabel(record.wins, record.losses, record.ties)}`}
                        style={styles.heroRecord}
                      >
                        {sportLabel(sport)}{' '}
                        {recordLabel(record.wins, record.losses, record.ties)}
                      </Text>
                      {status ? (
                        <Text style={styles.heroSportStatus}>{status.label}</Text>
                      ) : null}
                    </View>
                  );
                })
              : null}
          </View>

          {!snapshot && !error ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={ACCENT} size="large" />
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
              sportStatusLabel={
                snapshot.statuses[snapshot.featuredGame.sport]?.label
              }
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
                    <View key={`${game.sport}-${game.gamePk}`}>
                      {index > 0 ? <View style={styles.gameDivider} /> : null}
                      <View style={styles.gameRow}>
                        <View style={styles.gameDateColumn}>
                          <Text style={styles.gameSport}>
                            {sportLabel(game.sport)}
                          </Text>
                          <Text style={styles.gameDate}>
                            {gameDateLabel(game)}
                          </Text>
                          {game.status !== 'Scheduled' ? (
                            <Text style={styles.gameStatus}>{game.status}</Text>
                          ) : null}
                        </View>
                        <Text style={styles.gameOpponent}>
                          {game.isHome || game.neutralSite ? 'vs' : 'at'}{' '}
                          {game.opponentName}
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

      <StreamPlayer onClose={closeStream} stream={selectedStream} />
      {listeningStream ? (
        <GuardiansAudioPlayer
          artist="Iowa State Cyclones"
          onFailed={() => {
            setListeningStream(undefined);
            setAudioError('Audio could not start.');
          }}
          stream={listeningStream}
          title="Cyclones game"
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
  heroRecordBlock: {
    alignItems: 'center',
    marginTop: 4,
  },
  heroRecord: {
    color: '#5A6870',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  heroSportStatus: {
    color: '#8A4B00',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
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
    backgroundColor: ACCENT,
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
    borderColor: ACCENT,
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
  sportName: {
    color: '#5A6870',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 8,
    textTransform: 'uppercase',
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
    backgroundColor: ACCENT,
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
  sportStatusText: {
    color: '#8A4B00',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 8,
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
    backgroundColor: ACCENT,
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
  gameSport: {
    color: '#0B2B4C',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
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
