import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { GuardiansAudioPlayer } from './GuardiansAudioPlayer';
import {
  GuardiansCastButton,
  castContentTypeForUrl,
} from './GuardiansCastButton';
import { GuardiansTvRouteButton } from './GuardiansTvRouteButton';
import { GuardiansScoreboard } from './GuardiansScoreboard';
import {
  fetchLiveScoreboard,
  liveScoreboardFromHarness,
  liveScoreboardFromMlb,
} from './mlbLinescore';
import {
  GUARDIANS_TEAM_ID,
  gameInterruption,
  guardiansGameFromHarness,
  guardiansGameFromMlb,
  localDateString,
  recapDecisionLine,
  recapResult,
  snapshotFromGames,
  type GameInterruption,
  type GuardiansGame,
  type GuardiansSnapshot,
} from './guardiansSnapshot';

const REFRESH_INTERVAL_MS = 60_000;
const LIVE_SCOREBOARD_INTERVAL_MS = 5_000;
const COUNTDOWN_INTERVAL_MS = 1_000;
const VIDEO_LEAD_TIME_MS = 15 * 60_000;
const SOURCES_FETCH_TIMEOUT_MS = 8_000;
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

function snapshotWithPreservedScoreboard(
  previous: GuardiansSnapshot | undefined,
  next: GuardiansSnapshot,
): GuardiansSnapshot {
  const previousGame = previous?.featuredGame;
  const nextGame = next.featuredGame;
  if (
    !previousGame?.scoreboard ||
    !nextGame ||
    previousGame.gamePk !== nextGame.gamePk
  ) {
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
    hydrate: 'linescore,team,decisions',
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

  const [scheduleResponse, standingsResponse] = await Promise.all([
    fetch(`https://statsapi.mlb.com/api/v1/schedule?${scheduleQuery}`),
    fetch(`https://statsapi.mlb.com/api/v1/standings?${standingsQuery}`),
  ]);

  if (!scheduleResponse.ok || !standingsResponse.ok) {
    throw new Error('Guardians information is temporarily unavailable.');
  }

  const schedule = (await scheduleResponse.json()) as {
    dates?: Array<{ games?: unknown[] }>;
  };
  const standings = (await standingsResponse.json()) as {
    records?: Array<{
      teamRecords?: Array<{
        losses?: number;
        team?: { id?: number };
        wins?: number;
      }>;
    }>;
  };
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

async function fetchGuardiansSources(options?: {
  allowStaleCache?: boolean;
  preferLive?: boolean;
}): Promise<PlayableGuardiansStream[]> {
  const persistRemote =
    GUARDIANS_SOURCES_URL === REMOTE_GUARDIANS_SOURCES_URL;
  const allowStaleCache = options?.allowStaleCache !== false && persistRemote;
  const preferLive = options?.preferLive === true || options?.allowStaleCache === false;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    SOURCES_FETCH_TIMEOUT_MS,
  );

  try {
    const urls: string[] = [];
    const workerStreams = liveStreamsUrl();
    if (workerStreams && (preferLive || persistRemote)) {
      urls.push(workerStreams);
    }
    if (preferLive && persistRemote) {
      try {
        const sha = await fetchLatestCommitSha(controller.signal);
        if (sha) {
          urls.push(
            `https://raw.githubusercontent.com/Danner36/Danner_App/${sha}/guardians_streams.json`,
          );
        }
      } catch {}
    }
    urls.push(GUARDIANS_SOURCES_URL);

    let lastError: unknown;
    for (const url of urls) {
      try {
        const documentText = await readStreamsResponse(url, controller.signal);
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
      } catch (urlError) {
        lastError = urlError;
      }
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
  } finally {
    clearTimeout(timeout);
  }
}

function gameDateLabel(gameDate: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    weekday: 'short',
  }).format(new Date(gameDate));
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

function IsolatedWebStreamPlayer({ stream }: { stream: PlayableStream }) {
  const [promotedPopupUrl, setPromotedPopupUrl] = useState<string>();
  const isYoutube = stream.kind === 'youtube';
  const isWeb = stream.kind === 'web';
  const allowedNavigationHosts = isYoutube
    ? [...stream.allowedNavigationHosts, 'danner.app']
    : stream.allowedNavigationHosts;
  const allowNavigation = (url: string) =>
    isAllowedPlayerNavigation(
      url,
      allowedNavigationHosts,
      stream.allowInsecureHttp === true,
    );
  const webAirPlayInjection = isWeb ? WEB_AIRPLAY_INJECTION : undefined;

  useEffect(() => {
    setPromotedPopupUrl(undefined);
  }, [stream.playbackUrl]);

  return (
    <WebView
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowsAirPlayForMediaPlayback={isWeb}
      allowsFullscreenVideo
      allowsInlineMediaPlayback
      allowUniversalAccessFromFileURLs={false}
      cacheEnabled={false}
      geolocationEnabled={false}
      incognito
      injectedJavaScript={webAirPlayInjection}
      injectedJavaScriptBeforeContentLoaded={webAirPlayInjection}
      javaScriptEnabled
      javaScriptCanOpenWindowsAutomatically={false}
      mediaPlaybackRequiresUserAction={false}
      mixedContentMode={
        stream.allowInsecureHttp === true ? 'always' : 'never'
      }
      onFileDownload={() => {}}
      onOpenWindow={(event) => {
        const targetUrl = event.nativeEvent.targetUrl;
        if (targetUrl !== 'about:blank' && allowNavigation(targetUrl)) {
          setPromotedPopupUrl(targetUrl);
        }
      }}
      onShouldStartLoadWithRequest={(request) =>
        allowNavigation(request.url)
      }
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
              baseUrl: 'https://danner.app/',
              html: youtubePlayerHtml(stream.playbackUrl),
            }
          : { uri: stream.playbackUrl }
      }
      startInLoadingState
      style={styles.playerWebView}
      thirdPartyCookiesEnabled={false}
    />
  );
}

function StreamPlayer({
  stream,
  onClose,
}: {
  stream?: PlayableStream;
  onClose: () => void;
}) {
  const [tvError, setTvError] = useState<string>();

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible={Boolean(stream)}
    >
      <SafeAreaView edges={['top', 'bottom']} style={styles.playerScreen}>
        <View style={styles.playerHeader}>
          <Pressable
            accessibilityLabel="Close video"
            accessibilityRole="button"
            hitSlop={12}
            onPress={onClose}
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
              playbackUrl={stream.playbackUrl}
              visible
            />
          ) : stream?.kind === 'web' ? (
            <GuardiansTvRouteButton onFailed={setTvError} visible />
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
            <IsolatedWebStreamPlayer stream={stream} />
          )
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

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
  const decisionLine = isFinal ? recapDecisionLine(game) : undefined;
  const blocksVideo =
    interruption === 'canceled' ||
    interruption === 'postponed' ||
    interruption === 'suspended' ||
    isFinal;
  const videoWindowOpen =
    !blocksVideo &&
    (isLive ||
      nowMs >= new Date(game.gameDate).getTime() - VIDEO_LEAD_TIME_MS);
  const visibleStreams = videoWindowOpen ? streams : [];
  const isTodayScheduled = !isLive && !interruption && !isFinal;
  const usesTodayCard = isTodayScheduled || isFinal;
  const badgeText = interruption
    ? interruption.toUpperCase()
    : isLive
      ? 'LIVE'
      : recap
        ? recap
        : `TODAY ${gameTimeLabel(game.gameDate)}`;
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

      {decisionLine ? (
        <Text style={styles.recapDecision}>{decisionLine}</Text>
      ) : null}

      {isTodayScheduled ? (
        <View style={styles.countdownBox}>
          <Text style={styles.countdownLabel}>STARTS IN</Text>
          <Text accessibilityLiveRegion="polite" style={styles.countdownText}>
            {countdownLabel(game.gameDate, nowMs)}
          </Text>
        </View>
      ) : null}

      {!videoWindowOpen && !blocksVideo ? (
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

  const load = useCallback(
    async (
      showRefresh = false,
      sourceOptions?: { allowStaleCache?: boolean; preferLive?: boolean },
    ) => {
      if (showRefresh) {
        setRefreshing(true);
      }

      try {
        const [nextSnapshot, nextStreams] = await Promise.all([
          fetchGuardiansSnapshot(),
          fetchGuardiansSources(sourceOptions),
        ]);
        setSnapshot((current) =>
          snapshotWithPreservedScoreboard(current, nextSnapshot),
        );
        setAuthorizedStreams((current) => {
          const featured = nextSnapshot.featuredGame;
          if (!featured) {
            return nextStreams;
          }
          const incoming = authorizedStreamsForGame(nextStreams, featured);
          const existing = authorizedStreamsForGame(current, featured);
          return incoming.length === 0 && existing.length > 0
            ? current
            : nextStreams;
        });
        setError(undefined);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Guardians information is temporarily unavailable.',
        );
      } finally {
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    const interval = setInterval(
      () => setNowMs(Date.now()),
      COUNTDOWN_INTERVAL_MS,
    );
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const featured = snapshot?.featuredGame;
    if (featured?.abstractState !== 'Live') {
      return;
    }
    if (__DEV__ && GUARDIANS_TEST_URL) {
      return;
    }

    let cancelled = false;
    const gamePk = featured.gamePk;

    const refreshScoreboard = async () => {
      if (AppState.currentState !== 'active') {
        return;
      }

      const scoreboard = await fetchLiveScoreboard(gamePk);
      if (cancelled || !scoreboard) {
        return;
      }

      setSnapshot((current) => {
        const currentFeatured = current?.featuredGame;
        if (!currentFeatured || currentFeatured.gamePk !== gamePk) {
          return current;
        }

        const isHome = currentFeatured.isHome;
        return {
          ...current,
          featuredGame: {
            ...currentFeatured,
            guardiansScore: isHome
              ? scoreboard.home.runs
              : scoreboard.away.runs,
            opponentScore: isHome
              ? scoreboard.away.runs
              : scoreboard.home.runs,
            scoreboard,
            status: scoreboard.status || currentFeatured.status,
          },
        };
      });
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
  }, [snapshot?.featuredGame?.abstractState, snapshot?.featuredGame?.gamePk]);

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

    setGetVideoStatus('finding');
    try {
      const fetchLiveSources = () =>
        fetchGuardiansSources({ allowStaleCache: false, preferLive: true });
      await requestGetVideo();
      const found = await pollForStream(game, fetchLiveSources);
      if (found) {
        setAuthorizedStreams((current) =>
          authorizedStreamsForGame(current, game).length > 0
            ? current
            : [...current, found],
        );
        setGetVideoStatus('idle');
      }
      await load(true, { allowStaleCache: false, preferLive: true });
      if (found) {
        setGetVideoStatus('idle');
      } else {
        setGetVideoStatus('failed');
      }
    } catch {
      setGetVideoStatus('failed');
    }
  }, [getVideoStatus, load, snapshot?.featuredGame]);

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
                    <View key={game.gamePk}>
                      {index > 0 ? <View style={styles.gameDivider} /> : null}
                      <View style={styles.gameRow}>
                        <View style={styles.gameDateColumn}>
                          <Text style={styles.gameDate}>
                            {gameDateLabel(game.gameDate)}
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

      <StreamPlayer
        onClose={() => setSelectedStream(undefined)}
        stream={selectedStream}
      />
      {listeningStream ? (
        <GuardiansAudioPlayer
          onFailed={() => {
            setListeningStream(undefined);
            setAudioError('Audio could not start.');
          }}
          stream={listeningStream}
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
  recapDecision: {
    color: '#0B2B4C',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 12,
    textAlign: 'center',
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
