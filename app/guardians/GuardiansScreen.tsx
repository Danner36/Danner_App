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
import {
  authorizedStreamsForGame,
  guardiansStreamsFromDocument,
  type PlayableGuardiansStream,
} from './guardiansSources';
import {
  isGetVideoAvailable,
  liveStreamsUrl,
  pollForStream,
  requestGetVideo,
} from './guardiansGetVideo';
import { WEB_AIRPLAY_INJECTION } from './webAirPlayInjection';
import {
  newDiscoveryNonce,
  pagePlaybackHoldScript,
  parseDiscoveredMediaMessage,
  preferDiscoveredMedia,
  webMediaDiscoveryInjection,
} from './webMediaDiscoveryInjection';
import { webPlayerUserAgent } from './webPlayerUserAgent';
import { GuardiansAudioPlayer } from './GuardiansAudioPlayer';
import {
  GuardiansCastButton,
  castContentTypeForUrl,
  castStreamTypeForUrl,
} from './GuardiansCastButton';
import {
  GuardiansTvRouteButton,
  type DiscoveredMedia,
} from './GuardiansTvRouteButton';
import { stopHlsProxy } from '../modules/danner-live-hls/src';
import { GuardiansScoreboard } from './GuardiansScoreboard';
import {
  fetchLiveGameReport,
  liveScoreboardFromHarness,
  liveScoreboardFromMlb,
} from './mlbLinescore';
import {
  GUARDIANS_TEAM_ID,
  abstractStateFromMlb,
  blocksPlayback,
  gameInterruption,
  gameKey,
  gameWithLiveReport,
  guardiansGameFromHarness,
  guardiansGameFromMlb,
  localDateString,
  recapResult,
  snapshotFromGames,
  type GameInterruption,
  type GuardiansGame,
  type GuardiansSnapshot,
} from './guardiansSnapshot';

const REFRESH_INTERVAL_MS = 60_000;
// The schedule query spans the rest of the season with linescore/team hydrated, so
// it is by far the heaviest call here. Live scores come from fetchLiveGameReport instead, and
// the game list and season record barely move, so this does not need the 60s source cadence.
const SNAPSHOT_REFRESH_INTERVAL_MS = 10 * 60_000;
const LIVE_SCOREBOARD_INTERVAL_MS = 5_000;
const COUNTDOWN_INTERVAL_MS = 1_000;
// A delayed game shows no countdown, but the video window still opens on the clock.
const DELAYED_TICK_INTERVAL_MS = 30_000;
const VIDEO_LEAD_TIME_MS = 15 * 60_000;
const SOURCES_FETCH_TIMEOUT_MS = 8_000;
const SNAPSHOT_FETCH_TIMEOUT_MS = 10_000;
const SNAPSHOT_UNAVAILABLE_MESSAGE =
  'Guardians information is temporarily unavailable.';
// The YouTube wrapper HTML loads at this base URL. Only that exact document is allowed;
// the host is not a navigation or popup target.
const YOUTUBE_WRAPPER_URL = 'https://danner.app/';
const REMOTE_GUARDIANS_SOURCES_URL =
  'https://raw.githubusercontent.com/Danner36/Danner_App/main/guardians_streams.json';
const SOURCES_STORAGE_KEY = 'danner.guardians.sources.v2';
const GUARDIANS_TEST_URL = process.env.EXPO_PUBLIC_GUARDIANS_TEST_URL;
const GUARDIANS_TEST_SOURCES_URL =
  process.env.EXPO_PUBLIC_GUARDIANS_SOURCES_URL;
const GUARDIANS_SOURCES_URL =
  __DEV__ && GUARDIANS_TEST_SOURCES_URL
    ? GUARDIANS_TEST_SOURCES_URL
    : REMOTE_GUARDIANS_SOURCES_URL;

type PlayableStream = PlayableGuardiansStream;

function withHarnessScoreboard(
  game: GuardiansGame | undefined,
): GuardiansGame | undefined {
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

/**
 * The schedule snapshot carries no jersey numbers, and it can be older than the live poll
 * already on screen. When a live poll for the same game was requested after this snapshot,
 * the poll's state, score, and board stay; otherwise the snapshot wins and keeps the board's
 * jersey numbers.
 */
function snapshotWithPreservedScoreboard(
  previous: GuardiansSnapshot | undefined,
  next: GuardiansSnapshot,
  liveIsNewer: boolean,
): GuardiansSnapshot {
  const previousGame = previous?.featuredGame;
  const nextGame = next.featuredGame;
  if (
    !previousGame ||
    !nextGame ||
    gameKey(previousGame) !== gameKey(nextGame)
  ) {
    return next;
  }

  if (liveIsNewer) {
    return {
      ...next,
      featuredGame: {
        ...nextGame,
        abstractState: previousGame.abstractState,
        guardiansScore: previousGame.guardiansScore,
        opponentScore: previousGame.opponentScore,
        scoreboard: previousGame.scoreboard ?? nextGame.scoreboard,
        status: previousGame.status,
      },
    };
  }

  if (!previousGame.scoreboard) {
    return next;
  }
  const incoming = nextGame.scoreboard;
  const kept = previousGame.scoreboard;
  return {
    ...next,
    featuredGame: {
      ...nextGame,
      scoreboard: incoming
        ? {
            ...incoming,
            batterNumber: incoming.batterNumber ?? kept.batterNumber,
            pitcherNumber: incoming.pitcherNumber ?? kept.pitcherNumber,
          }
        : kept,
    },
  };
}

async function fetchGuardiansHarnessSnapshot(
  url: string,
): Promise<GuardiansSnapshot> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error('The Guardians test harness is unavailable.');
  }

  const value = (await response.json()) as {
    liveGame?: unknown;
    losses?: unknown;
    upcomingGames?: unknown;
    wins?: unknown;
  };
  const liveGame = withHarnessScoreboard(guardiansGameFromHarness(value.liveGame));
  const upcomingGames = Array.isArray(value.upcomingGames)
    ? value.upcomingGames
        .map((entry) => withHarnessScoreboard(guardiansGameFromHarness(entry)))
        .filter((game): game is GuardiansGame => Boolean(game))
    : [];

  if (
    typeof value.wins !== 'number' ||
    typeof value.losses !== 'number' ||
    (value.liveGame !== undefined && !liveGame)
  ) {
    throw new Error('The Guardians test fixture is invalid.');
  }

  return snapshotFromGames(
    liveGame ? [liveGame, ...upcomingGames] : upcomingGames,
    value.wins,
    value.losses,
  );
}

async function fetchGuardiansSnapshot(): Promise<GuardiansSnapshot> {
  if (__DEV__ && GUARDIANS_TEST_URL) {
    return fetchGuardiansHarnessSnapshot(GUARDIANS_TEST_URL);
  }

  const now = new Date();
  const scheduleStart = new Date(now);
  scheduleStart.setDate(scheduleStart.getDate() - 1);
  const season = now.getFullYear();
  const scheduleEnd = new Date(season, 11, 31);
  const scheduleQuery = new URLSearchParams({
    endDate: localDateString(scheduleEnd),
    hydrate: 'linescore,team',
    sportId: '1',
    startDate: localDateString(scheduleStart),
    teamId: String(GUARDIANS_TEAM_ID),
  });
  const standingsQuery = new URLSearchParams({
    hydrate: 'team',
    leagueId: '103',
    season: String(season),
    standingsTypes: 'regularSeason',
  });

  // One budget for the pair: without it a hung statsapi leaves load() unsettled, so the
  // refresh spinner never clears and the 60s poll stacks more requests behind it.
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    SNAPSHOT_FETCH_TIMEOUT_MS,
  );
  let schedule: { dates?: Array<{ games?: unknown[] }> };
  let standings: {
    records?: Array<{
      teamRecords?: Array<{
        losses?: number;
        team?: { id?: number };
        wins?: number;
      }>;
    }>;
  };
  try {
    const [scheduleResponse, standingsResponse] = await Promise.all([
      fetch(`https://statsapi.mlb.com/api/v1/schedule?${scheduleQuery}`, {
        signal: controller.signal,
      }),
      fetch(`https://statsapi.mlb.com/api/v1/standings?${standingsQuery}`, {
        signal: controller.signal,
      }),
    ]);

    if (!scheduleResponse.ok || !standingsResponse.ok) {
      throw new Error('Guardians information is temporarily unavailable.');
    }

    schedule = await scheduleResponse.json();
    standings = await standingsResponse.json();
  } finally {
    clearTimeout(timeout);
  }
  const rawGames = schedule.dates?.flatMap((date) => date.games ?? []) ?? [];
  const games = rawGames
    .map((rawGame) => {
      const parsed = guardiansGameFromMlb(rawGame);
      if (!parsed) {
        return undefined;
      }
      const linescore =
        typeof rawGame === 'object' && rawGame !== null
          ? (rawGame as { linescore?: unknown }).linescore
          : undefined;
      const scoreboard = liveScoreboardFromMlb(linescore);
      return scoreboard ? { ...parsed, scoreboard } : parsed;
    })
    .filter((game): game is GuardiansGame => Boolean(game));
  const teamRecord = standings.records
    ?.flatMap((record) => record.teamRecords ?? [])
    .find((record) => record.team?.id === GUARDIANS_TEAM_ID);

  return snapshotFromGames(
    games,
    teamRecord?.wins ?? 0,
    teamRecord?.losses ?? 0,
    now,
  );
}

function sourcesUrlWithCacheBust(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}refresh=${Date.now()}`;
}

async function fetchLatestCommitSha(
  signal: AbortSignal,
): Promise<string | undefined> {
  const response = await fetch(
    'https://api.github.com/repos/Danner36/Danner_App/commits?path=guardians_streams.json&per_page=1',
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
  const timeout = setTimeout(
    () => controller.abort(),
    SOURCES_FETCH_TIMEOUT_MS,
  );
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * One Get video session shares a single commit lookup, so its polls cost the unauthenticated
 * GitHub API at most one request.
 */
type CommitShaLookup = { done: boolean; sha?: string };

type SourceOptions = {
  allowStaleCache?: boolean;
  commitSha?: CommitShaLookup;
  preferLive?: boolean;
};

async function commitShaForSession(
  lookup: CommitShaLookup | undefined,
): Promise<string | undefined> {
  if (lookup?.done) {
    return lookup.sha;
  }
  let sha: string | undefined;
  try {
    sha = await withSourcesTimeout(fetchLatestCommitSha);
  } catch {}
  if (lookup) {
    lookup.done = true;
    lookup.sha = sha;
  }
  return sha;
}

async function fetchGuardiansSources(
  options?: SourceOptions,
): Promise<PlayableGuardiansStream[]> {
  const persistRemote =
    GUARDIANS_SOURCES_URL === REMOTE_GUARDIANS_SOURCES_URL;
  const allowStaleCache = options?.allowStaleCache !== false && persistRemote;
  const preferLive = options?.preferLive === true || options?.allowStaleCache === false;

  const readStreams = async (url: string) => {
    const documentText = await withSourcesTimeout((signal) =>
      readStreamsResponse(url, signal),
    );
    const streams = guardiansStreamsFromDocument(JSON.parse(documentText));
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
      } catch (urlError) {
        lastError = urlError;
      }
    }
    // The commit lookup covers a Worker outage only, so it waits for the Worker to fail.
    if (preferLive && persistRemote) {
      const sha = await commitShaForSession(options?.commitSha);
      if (sha) {
        try {
          return await readStreams(
            `https://raw.githubusercontent.com/Danner36/Danner_App/${sha}/guardians_streams.json`,
          );
        } catch (urlError) {
          lastError = urlError;
        }
      }
    }
    try {
      return await readStreams(GUARDIANS_SOURCES_URL);
    } catch (urlError) {
      lastError = urlError;
    }
    throw lastError ?? new Error('The approved video list is unavailable.');
  } catch (fetchError) {
    if (allowStaleCache) {
      try {
        const cachedDocument = await AsyncStorage.getItem(SOURCES_STORAGE_KEY);
        if (cachedDocument) {
          const cached =
            guardiansStreamsFromDocument(JSON.parse(cachedDocument)) ?? [];
          return cached;
        }
      } catch {}
    }
    return [];
  }
}

function gameDateLabel(game: GuardiansGame): string {
  if (!game.timeValid) {
    // MLB's placeholder timestamp can fall on the previous day west of Eastern time, so an
    // unset start shows its official date.
    const datePart = new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
      weekday: 'short',
    }).format(new Date(`${game.officialDate}T12:00:00Z`));
    return `${datePart} · Time TBA`;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    weekday: 'short',
  }).format(new Date(game.gameDate));
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
          title="Guardians video"
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
    ? `${WEB_AIRPLAY_INJECTION}\n${webMediaDiscoveryInjection(discoveryNonce)}`
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
// mid-game while the page is playing. Mounted only while a stream is open.
function PlayerKeepAwake() {
  useKeepAwake();
  return null;
}

// Memoized so the pre-game countdown does not re-render an open player every second.
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
            Guardians game
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
  game: GuardiansGame;
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
  const blocksVideo = blocksPlayback(game);
  // MLB keeps startTimeTBD on doubleheader game 2 after it starts, so Live opens video
  // whether or not the start time is known.
  const videoWindowOpen =
    !blocksVideo &&
    (isLive ||
      (game.timeValid &&
        nowMs >= new Date(game.gameDate).getTime() - VIDEO_LEAD_TIME_MS));
  const visibleStreams = videoWindowOpen ? streams : [];
  // Listen toggles exist only for direct streams on screen; any other playing audio gets a
  // standalone Stop control.
  const listeningShown =
    listeningStream !== undefined &&
    visibleStreams.some(
      (stream) =>
        stream.kind === 'direct' &&
        stream.kind === listeningStream.kind &&
        stream.playbackUrl === listeningStream.playbackUrl,
    );
  // The inning belongs to the scoreboard; a delay or suspension in the game status wins.
  const statusText =
    isLive && !interruption && game.scoreboard?.status
      ? game.scoreboard.status
      : game.status;
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
      : `Guardians ${game.isHome ? 'vs' : 'at'} ${game.opponentName}`;

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
        <Text style={styles.liveStatus}>{statusText}</Text>
      ) : null}

      {interruption ? (
        <View accessibilityRole="alert" style={styles.interruptionBox}>
          <Text style={styles.interruptionText}>
            {interruptionMessage(interruption)}
          </Text>
        </View>
      ) : null}

      {isLive && game.scoreboard ? (
        <GuardiansScoreboard
          isHome={game.isHome}
          opponentName={game.opponentName}
          scoreboard={game.scoreboard}
        />
      ) : isLive || isFinal ? (
        <View style={styles.scoreBox}>
          <View style={styles.scoreRow}>
            <Text style={styles.scoreTeam}>Guardians</Text>
            <Text style={styles.scoreNumber}>{game.guardiansScore}</Text>
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

      {listeningStream && !listeningShown ? (
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
              accessibilityHint="Finds the approved Guardians video for this game"
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

export function GuardiansScreen({ onBack }: { onBack: () => void }) {
  const [authorizedStreams, setAuthorizedStreams] = useState<
    PlayableGuardiansStream[]
  >([]);
  const [snapshot, setSnapshot] = useState<GuardiansSnapshot>();
  const [error, setError] = useState<string>();
  const [nowMs, setNowMs] = useState(Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStream, setSelectedStream] = useState<PlayableStream>();
  const [listeningStream, setListeningStream] = useState<PlayableStream>();
  const [audioError, setAudioError] = useState<string>();
  const [getVideoStatus, setGetVideoStatus] = useState<
    'idle' | 'finding' | 'failed'
  >('idle');

  const snapshotRef = useRef<GuardiansSnapshot | undefined>(undefined);
  // Request start times of the newest applied snapshot and live poll, so a slower, older
  // response never replaces a newer one.
  const lastSnapshotAtRef = useRef(0);
  const liveReportAtRef = useRef(0);
  const getVideoAbortRef = useRef<AbortController | undefined>(undefined);
  const countdownGameRef = useRef<string | undefined>(undefined);
  const finalRefreshGameRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const load = useCallback(
    async (
      showRefresh = false,
      sourceOptions?: SourceOptions,
      forceSnapshot = false,
    ) => {
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
          forceSnapshot ||
          snapshotRef.current === undefined ||
          startedAt - lastSnapshotAtRef.current >= SNAPSHOT_REFRESH_INTERVAL_MS;
        // Settled separately, so a failed MLB call still applies a newly published stream and
        // a failed stream list still refreshes the games.
        const [snapshotResult, sourcesResult] = await Promise.allSettled([
          refreshSnapshot
            ? fetchGuardiansSnapshot()
            : Promise.resolve(undefined),
          fetchGuardiansSources(sourceOptions),
        ]);
        const fetchedSnapshot =
          snapshotResult.status === 'fulfilled'
            ? snapshotResult.value
            : undefined;
        if (fetchedSnapshot && startedAt >= lastSnapshotAtRef.current) {
          lastSnapshotAtRef.current = startedAt;
          const liveIsNewer = liveReportAtRef.current > startedAt;
          setSnapshot((current) =>
            snapshotWithPreservedScoreboard(
              current,
              fetchedSnapshot,
              liveIsNewer,
            ),
          );
        }
        if (sourcesResult.status === 'fulfilled') {
          const nextStreams = sourcesResult.value;
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
            ? SNAPSHOT_UNAVAILABLE_MESSAGE
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
    // Listen and AirPlay keep iOS timers running in the background; the refresh waits until
    // the app is active again and then runs at once.
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

  const featured = snapshot?.featuredGame;
  const featuredKey = featured ? gameKey(featured) : undefined;
  const featuredState = featured?.abstractState;
  const featuredStatus = featured?.status;
  const featuredTimeValid = featured?.timeValid === true;
  const featuredStartMs = featured
    ? new Date(featured.gameDate).getTime()
    : Number.NaN;
  const featuredBlocksPlayback = featured ? blocksPlayback(featured) : false;

  // nowMs only drives the pre-game countdown and the video window opening. Once the game is
  // live, final, or blocked nothing on screen reads it, so ticking every second would
  // re-render the whole screen for nothing across the longest stretch it is open. A delayed
  // start has no countdown but keeps a slow tick so its video window still opens.
  const tickIntervalMs = useMemo(() => {
    if (
      !featuredState ||
      featuredState === 'Live' ||
      featuredState === 'Final' ||
      !featuredTimeValid
    ) {
      return undefined;
    }
    const interruption = gameInterruption(featuredStatus ?? '');
    if (!interruption) {
      return COUNTDOWN_INTERVAL_MS;
    }
    return interruption === 'delayed' ? DELAYED_TICK_INTERVAL_MS : undefined;
  }, [featuredState, featuredStatus, featuredTimeValid]);

  useEffect(() => {
    setNowMs(Date.now());
    if (!tickIntervalMs) {
      return;
    }
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        setNowMs(Date.now());
      }
    }, tickIntervalMs);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNowMs(Date.now());
      }
    });
    return () => {
      clearInterval(interval);
      appState.remove();
    };
  }, [tickIntervalMs]);

  // Past the scheduled start while MLB still reports pre-game, including Warmup.
  const awaitingFirstPitch =
    featuredState === 'Preview' &&
    featuredTimeValid &&
    !featuredBlocksPlayback &&
    nowMs >= featuredStartMs;

  // The countdown reaching zero refreshes the games once instead of waiting for the
  // ten-minute refresh. Opening the screen after the start time does not count.
  useEffect(() => {
    if (!featuredKey || featuredState !== 'Preview' || !featuredTimeValid) {
      return;
    }
    if (!awaitingFirstPitch) {
      countdownGameRef.current = featuredKey;
      return;
    }
    if (countdownGameRef.current === featuredKey) {
      countdownGameRef.current = undefined;
      void load(false, undefined, true);
    }
  }, [awaitingFirstPitch, featuredKey, featuredState, featuredTimeValid, load]);

  const liveIdentity = useMemo(
    () =>
      featured
        ? {
            gameDate: featured.gameDate,
            gamePk: featured.gamePk,
            officialDate: featured.officialDate,
          }
        : undefined,
    [featured?.gameDate, featured?.gamePk, featured?.officialDate],
  );
  const pollLiveState = featuredState === 'Live' || awaitingFirstPitch;

  // Game state, score, and board every five seconds while the game is live or its first
  // pitch is due. Final from this poll refreshes the games at once.
  useEffect(() => {
    if (!pollLiveState || !liveIdentity) {
      return;
    }
    if (__DEV__ && GUARDIANS_TEST_URL) {
      return;
    }

    let cancelled = false;
    let inFlight = false;
    const key = gameKey(liveIdentity);

    const refreshLiveState = async () => {
      // The board plus jersey lookups can outlast one interval; a request still running
      // skips the tick.
      if (inFlight || AppState.currentState !== 'active') {
        return;
      }
      inFlight = true;
      const requestedAt = Date.now();
      try {
        const report = await fetchLiveGameReport(liveIdentity);
        if (
          cancelled ||
          !report ||
          requestedAt < liveReportAtRef.current
        ) {
          return;
        }
        liveReportAtRef.current = requestedAt;
        setSnapshot((current) => {
          const currentFeatured = current?.featuredGame;
          if (!current || !currentFeatured || gameKey(currentFeatured) !== key) {
            return current;
          }
          return {
            ...current,
            featuredGame: gameWithLiveReport(currentFeatured, report),
          };
        });
        if (
          abstractStateFromMlb(report.status) === 'Final' &&
          finalRefreshGameRef.current !== key
        ) {
          finalRefreshGameRef.current = key;
          void load(false, undefined, true);
        }
      } finally {
        inFlight = false;
      }
    };

    void refreshLiveState();
    const interval = setInterval(
      () => void refreshLiveState(),
      LIVE_SCOREBOARD_INTERVAL_MS,
    );
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshLiveState();
      }
    });
    return () => {
      cancelled = true;
      clearInterval(interval);
      appState.remove();
    };
  }, [liveIdentity, load, pollLiveState]);

  const featuredStreams = useMemo(
    () =>
      snapshot?.featuredGame
        ? authorizedStreamsForGame(
            authorizedStreams,
            snapshot.featuredGame,
          )
        : [],
    [authorizedStreams, snapshot?.featuredGame],
  );

  useEffect(() => {
    if (featuredStreams.length > 0 && getVideoStatus !== 'idle') {
      setGetVideoStatus('idle');
    }
  }, [featuredStreams.length, getVideoStatus]);

  // A different featured game starts without the last game's Get video session or audio.
  useEffect(() => {
    getVideoAbortRef.current?.abort();
    getVideoAbortRef.current = undefined;
    setGetVideoStatus('idle');
    setListeningStream(undefined);
    setAudioError(undefined);
  }, [featuredKey]);

  // Final, canceled, postponed, and suspended games have no Listen control, so audio stops.
  useEffect(() => {
    if (featuredBlocksPlayback) {
      setListeningStream(undefined);
    }
  }, [featuredBlocksPlayback]);

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
    // One commit lookup, made only if the Worker fails, serves the whole session.
    const sourceOptions: SourceOptions = {
      allowStaleCache: false,
      commitSha: { done: false },
      preferLive: true,
    };
    setGetVideoStatus('finding');
    try {
      await requestGetVideo();
      const found = await pollForStream(
        game,
        () => fetchGuardiansSources(sourceOptions),
        { signal: controller.signal },
      );
      if (controller.signal.aborted) {
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
      if (controller.signal.aborted) {
        return;
      }
      setGetVideoStatus(found ? 'idle' : 'failed');
    } catch {
      if (!controller.signal.aborted) {
        setGetVideoStatus('failed');
      }
    } finally {
      if (getVideoAbortRef.current === controller) {
        getVideoAbortRef.current = undefined;
      }
    }
  }, [getVideoStatus, load, snapshot?.featuredGame]);

  const closePlayer = useCallback(() => setSelectedStream(undefined), []);
  const handleAudioFailed = useCallback(() => {
    setListeningStream(undefined);
    setAudioError('Audio could not start.');
  }, []);

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
              accessibilityLabel="Cleveland Guardians"
              resizeMode="cover"
              source={require('../assets/cleveland-guardians-logo.jpg')}
              style={styles.heroLogo}
            />
            <Text accessibilityRole="header" style={styles.heroTitle}>
              Guardians
            </Text>
            {snapshot ? (
              <Text
                accessibilityLabel={`Season record ${snapshot.wins} wins, ${snapshot.losses} losses`}
                style={styles.heroRecord}
              >
                {snapshot.wins}–{snapshot.losses}
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
                    // A postponed game and its makeup share a gamePk.
                    <View key={`${gameKey(game)}:${game.gameDate}`}>
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

      <StreamPlayer onClose={closePlayer} stream={selectedStream} />
      {listeningStream ? (
        <GuardiansAudioPlayer
          artist="Cleveland Guardians"
          onFailed={handleAudioFailed}
          stream={listeningStream}
          title="Guardians game"
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
