import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { adapterFor } from '../leagues/registry.ts';
import type { LeagueAdapter, LivePoll } from '../leagues/types.ts';
import { AudioPlayer } from '../playback/AudioPlayer';
import { StreamPlayer } from '../playback/StreamPlayer';
import { adapterKeysForTile } from '../selection/presets.ts';
import type { Tile } from '../selection/types.ts';
import { fetchSources, type SourcesOptions } from '../streams/fetchSources.ts';
import type { PlayableStream } from '../streams/sources.ts';
import { teamSnapshotFromHarness } from './engine/harness.ts';
import {
  snapshotWithPreservedBoards,
  type LiveBoardStamp,
} from './engine/liveMerge.ts';
import { fetchTeamSnapshot } from './engine/snapshot.ts';
import { authorizedStreamsForGame } from './engine/streamMatch.ts';
import type { TeamGame, TeamSnapshot } from './engine/types.ts';
import { streamsPollWindowOpen } from './engine/videoWindow.ts';
import { FeaturedGameSlot, type LoadFn } from './FeaturedGameCard';
import { HeroRecords } from './HeroRecords';
import { heroLogoFor } from './heroLogo';
import { ScheduleList } from './ScheduleList';
import { teamAccent } from './theme';

const REFRESH_INTERVAL_MS = 60_000;
// The schedule query spans the rest of the season, so it is by far the heaviest call here. Live
// scores come from the five-second poll, and the game list and record barely move.
const SNAPSHOT_REFRESH_INTERVAL_MS = 10 * 60_000;
const TEAM_TEST_URL = __DEV__ ? process.env.EXPO_PUBLIC_TEAM_TEST_URL : undefined;

type SnapshotLoad = { complete: boolean; snapshot: TeamSnapshot };

async function fetchHarnessSnapshot(
  url: string,
  tile: Tile,
): Promise<SnapshotLoad> {
  const separator = url.includes('?') ? '&' : '?';
  const response = await fetch(
    `${url}${separator}team=${encodeURIComponent(tile.key)}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!response.ok) {
    throw new Error('The test harness is unavailable.');
  }
  return {
    complete: true,
    snapshot: teamSnapshotFromHarness(await response.json(), {
      adapterFor,
      tile,
    }),
  };
}

export function TeamScreen({
  onBack,
  tile,
}: {
  onBack: () => void;
  tile: Tile;
}) {
  const { team } = tile;
  const school = tile.kind === 'school';
  const accent = teamAccent(tile.key, team);
  const adapterKeys = useMemo(() => adapterKeysForTile(tile), [tile]);
  const adapters = useMemo(
    () =>
      adapterKeys
        .map(adapterFor)
        .filter((adapter): adapter is LeagueAdapter => Boolean(adapter)),
    [adapterKeys],
  );
  const supported = adapters.length === adapterKeys.length;
  const showSportLabels = adapterKeys.length > 1;
  const errorMessage = `${team.nickname} information is temporarily unavailable.`;

  const [authorizedStreams, setAuthorizedStreams] = useState<PlayableStream[]>(
    [],
  );
  const [snapshot, setSnapshot] = useState<TeamSnapshot>();
  const [error, setError] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStream, setSelectedStream] = useState<PlayableStream>();
  // Listen plays one stream at a time; the key names the card that started it.
  const [listening, setListening] = useState<{
    key: string;
    stream: PlayableStream;
  }>();
  const [audioError, setAudioError] = useState<{
    key: string;
    message: string;
  }>();

  const snapshotRef = useRef<TeamSnapshot | undefined>(undefined);
  // Request start of the newest applied snapshot, so a slower, older response never replaces a
  // newer one, and of the newest complete one, which sets the staleness clock.
  const appliedSnapshotAtRef = useRef(0);
  const completeSnapshotAtRef = useRef(0);
  const liveBoardsRef = useRef(new Map<string, LiveBoardStamp>());

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const loadWith = useCallback(
    async (
      showRefresh: boolean,
      sourceOptions: SourcesOptions | undefined,
      forceSnapshot: boolean,
      tick: boolean,
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
          startedAt - completeSnapshotAtRef.current >=
            SNAPSHOT_REFRESH_INTERVAL_MS;
        const shownGames = snapshotRef.current
          ? [
              ...snapshotRef.current.featuredGames,
              ...snapshotRef.current.upcomingGames,
            ]
          : [];
        // The minute tick reads the streams list only around a game; open, pull-to-refresh and
        // foreground always do.
        const refreshStreams =
          !tick ||
          snapshotRef.current === undefined ||
          streamsPollWindowOpen(shownGames, startedAt);
        const [snapshotResult, streamsResult] = await Promise.allSettled([
          refreshSnapshot
            ? TEAM_TEST_URL
              ? fetchHarnessSnapshot(TEAM_TEST_URL, tile)
              : fetchTeamSnapshot({
                  adapters,
                  now: new Date(startedAt),
                  perGameCards: school,
                  previous: snapshotRef.current,
                  team,
                  unavailableMessage: errorMessage,
                })
            : Promise.resolve(undefined),
          refreshStreams
            ? fetchSources(tile.key, school, sourceOptions)
            : Promise.resolve(undefined),
        ]);
        const fetched =
          snapshotResult.status === 'fulfilled'
            ? snapshotResult.value
            : undefined;
        if (fetched && startedAt >= appliedSnapshotAtRef.current) {
          appliedSnapshotAtRef.current = startedAt;
          if (fetched.complete) {
            completeSnapshotAtRef.current = startedAt;
          }
          setSnapshot((current) =>
            snapshotWithPreservedBoards(
              current,
              fetched.snapshot,
              [...liveBoardsRef.current.values()],
              Date.now(),
              startedAt,
            ),
          );
        }
        if (streamsResult.status === 'fulfilled' && streamsResult.value) {
          const nextStreams = streamsResult.value.streams;
          setAuthorizedStreams((current) => {
            const featured =
              fetched?.snapshot.featuredGames ??
              snapshotRef.current?.featuredGames ??
              [];
            // A list that has no match for a featured game does not drop the one the phone already
            // has for that game.
            const kept = featured
              .filter(
                (game) =>
                  authorizedStreamsForGame(nextStreams, game).length === 0,
              )
              .flatMap((game) => authorizedStreamsForGame(current, game));
            return kept.length > 0 ? [...nextStreams, ...kept] : nextStreams;
          });
        }
        setError(snapshotResult.status === 'rejected' ? errorMessage : undefined);
      } finally {
        setRefreshing(false);
      }
    },
    [adapters, errorMessage, school, team, tile],
  );

  const load = useCallback<LoadFn>(
    (showRefresh = false, sourceOptions, forceSnapshot = false) =>
      loadWith(showRefresh, sourceOptions, forceSnapshot, false),
    [loadWith],
  );

  useEffect(() => {
    if (!supported) {
      return;
    }
    void load();
    // Listen and AirPlay keep iOS timers running in the background; the refresh waits until the
    // app is active again and then runs at once.
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        void loadWith(false, undefined, false, true);
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
  }, [load, loadWith, supported]);

  const applyLive = useCallback(
    (key: string, poll: LivePoll, requestedAt: number) => {
      if (poll.board) {
        liveBoardsRef.current.set(key, {
          appliedAt: Date.now(),
          key,
          requestedAt,
        });
      }
      setSnapshot((current) => {
        const index =
          current?.featuredGames.findIndex((game) => game.key === key) ?? -1;
        if (!current || index < 0) {
          return current;
        }
        const shown = current.featuredGames[index];
        const applied = poll.apply(shown);
        if (applied === shown) {
          return current;
        }
        const featuredGames = [...current.featuredGames];
        featuredGames[index] = applied;
        return { ...current, featuredGames };
      });
    },
    [],
  );

  const onStreamFound = useCallback((game: TeamGame, found: PlayableStream) => {
    setAuthorizedStreams((current) =>
      authorizedStreamsForGame(current, game).length > 0
        ? current
        : [...current, found],
    );
  }, []);

  const onListen = useCallback((key: string, stream: PlayableStream) => {
    setSelectedStream(undefined);
    setAudioError(undefined);
    setListening({ key, stream });
  }, []);

  const onStopListen = useCallback((key: string) => {
    setListening((current) => (current?.key === key ? undefined : current));
    setAudioError((current) => (current?.key === key ? undefined : current));
  }, []);

  const onSelectStream = useCallback((stream: PlayableStream) => {
    setListening(undefined);
    setAudioError(undefined);
    setSelectedStream(stream);
  }, []);

  // Listen stops when its game no longer has a card.
  const featuredKeys = (snapshot?.featuredGames ?? [])
    .map((game) => game.key)
    .join('|');
  useEffect(() => {
    const keys = new Set(featuredKeys.split('|'));
    setListening((current) =>
      current && !keys.has(current.key) ? undefined : current,
    );
  }, [featuredKeys]);

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

  const closeStream = useCallback(() => setSelectedStream(undefined), []);
  const heroLogo = heroLogoFor(tile.key);

  return (
    <View style={styles.screen}>
      <ScrollView
        bounces={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
        overScrollMode="never"
        refreshControl={
          <RefreshControl
            colors={[accent]}
            onRefresh={() => void load(true)}
            refreshing={refreshing}
            tintColor={accent}
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
            {heroLogo !== undefined ? (
              <Image
                accessibilityLabel={team.name}
                resizeMode="cover"
                source={heroLogo}
                style={styles.heroLogo}
              />
            ) : null}
            <Text accessibilityRole="header" style={styles.heroTitle}>
              {team.nickname}
            </Text>
            {snapshot ? (
              <HeroRecords
                adapters={adapterKeys}
                showSportLabels={showSportLabels}
                snapshot={snapshot}
              />
            ) : null}
          </View>

          {!supported ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>
                This team needs a newer app version.
              </Text>
            </View>
          ) : null}

          {supported && !snapshot && !error ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={accent} size="large" />
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
                  { backgroundColor: accent },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>Try again</Text>
              </Pressable>
            </View>
          ) : null}

          {snapshot?.featuredGames.map((game) => (
            <FeaturedGameSlot
              accent={accent}
              audioError={
                audioError?.key === game.key ? audioError.message : undefined
              }
              authorizedStreams={authorizedStreams}
              game={game}
              key={game.key}
              listeningStream={
                listening?.key === game.key ? listening.stream : undefined
              }
              load={load}
              onApplyLive={applyLive}
              onListen={onListen}
              onSelectStream={onSelectStream}
              onStopListen={onStopListen}
              onStreamFound={onStreamFound}
              school={school}
              showSportLabel={showSportLabels}
              sportStatusLabel={snapshot.statuses[game.adapter]?.label}
              team={team}
              teamKey={tile.key}
            />
          ))}

          {snapshot ? (
            <ScheduleList
              showSportLabels={showSportLabels}
              snapshot={snapshot}
              team={team}
            />
          ) : null}
        </View>
      </ScrollView>

      <StreamPlayer
        accent={accent}
        nickname={team.nickname}
        onClose={closeStream}
        stream={selectedStream}
      />
      {listening ? (
        <AudioPlayer
          artist={team.name}
          onFailed={() => {
            setAudioError({
              key: listening.key,
              message: 'Audio could not start.',
            });
            setListening(undefined);
          }}
          stream={listening.stream}
          title={`${team.nickname} game`}
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
});
