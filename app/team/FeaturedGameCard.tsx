import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { adapterFor } from '../leagues/registry.ts';
import { sportLabel } from '../leagues/sports.ts';
import type { LivePoll, TeamKey, TeamRef } from '../leagues/types.ts';
import { BaseballScoreboard } from '../scoreboards/BaseballScoreboard';
import { BasketballArenaBoard } from '../scoreboards/basketball/BasketballArenaBoard';
import { PeriodScoreboard } from '../scoreboards/PeriodScoreboard';
import type { SourcesOptions } from '../streams/fetchSources.ts';
import { fetchSources } from '../streams/fetchSources.ts';
import {
  getVideoText,
  NO_VIDEO_TEXT,
  pollForStream,
  progressView,
  requestGetVideo,
  type GetVideoView,
} from '../streams/getVideo.ts';
import type { PlayableStream } from '../streams/sources.ts';
import { isGetVideoAvailable } from '../streams/workerConfig.ts';
import { countdownLabel, gameTimeLabel } from './engine/dates.ts';
import { authorizedStreamsForGame } from './engine/streamMatch.ts';
import type {
  GameInterruption,
  LiveBoard,
  TeamGame,
} from './engine/types.ts';
import {
  gameInterruption,
  isVideoWindowOpen,
  playbackBlocked,
  recapResult,
} from './engine/videoWindow.ts';
import { teamBoardLabel } from './theme';
import { useWinChance } from './useWinChance';
import { WinChanceBar } from './WinChanceBar';

const LIVE_SCOREBOARD_INTERVAL_MS = 5_000;
const COUNTDOWN_INTERVAL_MS = 1_000;
// A delayed game shows no countdown, but the video window still opens on the clock.
const DELAYED_TICK_INTERVAL_MS = 30_000;
const HARNESS_ACTIVE = __DEV__ && Boolean(process.env.EXPO_PUBLIC_TEAM_TEST_URL);

export type LoadFn = (
  showRefresh?: boolean,
  sourceOptions?: SourcesOptions,
  forceSnapshot?: boolean,
) => Promise<void>;

type GetVideoState =
  | { kind: 'idle' }
  | { kind: 'finding'; view: GetVideoView }
  | { kind: 'failed'; message: string };

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

// Baseball and football boards draw above the countdown; the basketball arena board draws last,
// after the Play/Listen row, the audio error and Get video.
function LiveScoreboard({
  accent,
  board,
  game,
  team,
}: {
  accent: string;
  board: LiveBoard;
  game: TeamGame;
  team: TeamRef;
}) {
  if (board.kind === 'baseball') {
    return (
      <BaseballScoreboard
        accentColor={accent}
        isHome={game.isHome}
        opponentName={game.opponentName}
        scoreboard={board}
        teamLabel={teamBoardLabel(team)}
      />
    );
  }
  if (board.kind === 'periods') {
    return (
      <PeriodScoreboard
        accentColor={accent}
        isHome={game.isHome}
        opponentName={game.opponentName}
        scoreboard={board}
        teamId={Number(team.espnId)}
        teamLabel={teamBoardLabel(team)}
      />
    );
  }
  return null;
}

function FeaturedGameCard({
  accent,
  audioError,
  game,
  getVideo,
  listeningStream,
  nowMs,
  onGetVideo,
  onListen,
  onSelectStream,
  onStopListen,
  showGetVideo,
  showSportLabel,
  sportStatusLabel,
  streams,
  team,
}: {
  accent: string;
  audioError?: string;
  game: TeamGame;
  getVideo: GetVideoState;
  listeningStream?: PlayableStream;
  nowMs: number;
  onGetVideo: () => void;
  onListen: (stream: PlayableStream) => void;
  onSelectStream: (stream: PlayableStream) => void;
  onStopListen: () => void;
  showGetVideo: boolean;
  showSportLabel: boolean;
  sportStatusLabel?: string;
  streams: PlayableStream[];
  team: TeamRef;
}) {
  const winChance = useWinChance(game, team);
  const interruption = gameInterruption(game.status);
  const isLive = game.abstractState === 'Live';
  const isFinal = game.abstractState === 'Final' && !interruption;
  const arenaBoard =
    isLive && game.scoreboard === 'basketball' && game.board?.kind === 'basketball'
      ? game.board
      : undefined;
  const recap = isFinal ? recapResult(game) : undefined;
  const blocksVideo = playbackBlocked(game);
  const videoWindowOpen = isVideoWindowOpen(game, nowMs);
  const visibleStreams = videoWindowOpen ? streams : [];
  const isListeningTo = (stream: PlayableStream) =>
    listeningStream?.playbackUrl === stream.playbackUrl &&
    listeningStream.kind === stream.kind;
  // Listen toggles exist only for direct streams on screen; any other playing audio gets a
  // standalone Stop control.
  const showStandaloneStop =
    listeningStream !== undefined &&
    !visibleStreams.some(
      (stream) => stream.kind === 'direct' && isListeningTo(stream),
    );
  // The inning belongs to the baseball board; a delay or suspension in the game status wins.
  const statusText =
    isLive &&
    !interruption &&
    game.board?.kind === 'baseball' &&
    game.board.status
      ? game.board.status
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
      ? game.neutralSite
        ? `vs ${game.opponentName}`
        : game.isHome
          ? `Home vs ${game.opponentName}`
          : `Away v ${game.opponentName}`
      : `${team.nickname} ${game.isHome || game.neutralSite ? 'vs' : 'at'} ${game.opponentName}`;
  const getVideoBusy = getVideo.kind === 'finding';

  return (
    <View
      style={[
        styles.liveCard,
        { borderColor: accent },
        usesTodayCard && styles.todayCard,
        interruption && styles.interruptedCard,
      ]}
    >
      {showSportLabel && game.sport ? (
        <Text style={styles.sportName}>{sportLabel(game.sport)}</Text>
      ) : null}
      <View
        style={[
          styles.liveBadge,
          usesTodayCard && styles.todayBadge,
          interruption && styles.interruptedBadge,
        ]}
      >
        {isLive && !interruption ? (
          <View style={[styles.liveDot, { backgroundColor: accent }]} />
        ) : null}
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

      {winChance ? (
        <WinChanceBar
          chance={winChance}
          opponentName={game.opponentName}
          teamName={team.nickname}
        />
      ) : null}

      {arenaBoard ? null : isLive && game.board ? (
        <LiveScoreboard
          accent={accent}
          board={game.board}
          game={game}
          team={team}
        />
      ) : isLive || isFinal ? (
        <View style={styles.scoreBox}>
          <View style={styles.scoreRow}>
            <Text style={styles.scoreTeam}>{team.nickname}</Text>
            <Text style={styles.scoreNumber}>{game.teamScore}</Text>
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
            const streamKey = `${stream.sport ?? ''}-${stream.eventId ?? ''}-${stream.gameDates.join(',')}-${stream.gameNumbers.join(',')}-${stream.url}`;
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
                    { backgroundColor: accent },
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
                      { backgroundColor: accent },
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
              accessibilityHint={`Finds the approved ${team.nickname} video for this game`}
              accessibilityLabel={getVideoBusy ? 'Getting video' : 'Get video'}
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
          {getVideo.kind === 'finding' && getVideo.view.kind === 'site' ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.siteDots}
            >
              {Array.from({ length: getVideo.view.n }, (_, index) => {
                const filled =
                  getVideo.view.kind === 'site' && index < getVideo.view.k;
                return (
                  <View
                    key={index}
                    style={[styles.siteDot, filled && styles.siteDotFilled]}
                  />
                );
              })}
            </View>
          ) : null}
          <Text
            accessibilityLiveRegion="polite"
            accessibilityRole={getVideo.kind === 'failed' ? 'alert' : 'text'}
            style={styles.noStreamText}
          >
            {getVideo.kind === 'finding'
              ? getVideoText(getVideo.view)
              : getVideo.kind === 'failed'
                ? getVideo.message
                : 'Video is not ready yet. The app checks again automatically.'}
          </Text>
        </View>
      ) : null}

      {arenaBoard ? (
        <BasketballArenaBoard
          accentColor={accent}
          isHome={game.isHome}
          model={arenaBoard}
          opponentName={game.opponentName}
          teamLabel={teamBoardLabel(team)}
          teamSpokenName={team.nickname}
        />
      ) : null}
    </View>
  );
}

// One featured card plus the state of its game: the countdown, the refresh at the start time, the
// five-second live poll, its streams and its Get video session.
export function FeaturedGameSlot({
  accent,
  audioError,
  authorizedStreams,
  game,
  listeningStream,
  load,
  onApplyLive,
  onListen,
  onSelectStream,
  onStopListen,
  onStreamFound,
  school,
  showSportLabel,
  sportStatusLabel,
  team,
  teamKey,
}: {
  accent: string;
  audioError?: string;
  authorizedStreams: PlayableStream[];
  game: TeamGame;
  listeningStream?: PlayableStream;
  load: LoadFn;
  onApplyLive: (gameKey: string, poll: LivePoll, requestedAt: number) => void;
  onListen: (gameKey: string, stream: PlayableStream) => void;
  onSelectStream: (stream: PlayableStream) => void;
  onStopListen: (gameKey: string) => void;
  onStreamFound: (game: TeamGame, stream: PlayableStream) => void;
  school: boolean;
  showSportLabel: boolean;
  sportStatusLabel?: string;
  team: TeamRef;
  teamKey: TeamKey;
}) {
  const [nowMs, setNowMs] = useState(Date.now());
  const [getVideo, setGetVideo] = useState<GetVideoState>({ kind: 'idle' });
  const gameRef = useRef(game);
  const pendingStartRef = useRef(false);
  const finalRefreshedRef = useRef(false);
  const getVideoAbortRef = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  const state = game.abstractState;
  const status = game.status;
  const gameKey = game.key;
  // nowMs drives the countdown and the video window. A delayed game that has not started keeps a
  // slow tick so the video window still opens on time.
  const countdownTickMs = useMemo(() => {
    if (state === 'Live' || state === 'Final') {
      return undefined;
    }
    const interruption = gameInterruption(status);
    if (!interruption) {
      return COUNTDOWN_INTERVAL_MS;
    }
    return interruption === 'delayed' ? DELAYED_TICK_INTERVAL_MS : undefined;
  }, [state, status]);

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
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        setNowMs(Date.now());
      }
    });
    return () => {
      clearInterval(interval);
      appState.remove();
    };
  }, [countdownTickMs]);

  const awaitingStart = state !== 'Live' && state !== 'Final';
  const startReached =
    game.timeValid && nowMs >= new Date(game.gameDate).getTime();
  const blocked = playbackBlocked(game);
  // The live poll also runs once the start time passes, so Live does not wait for the ten-minute
  // schedule refresh.
  const pollsLive =
    state === 'Live' || (awaitingStart && startReached && !blocked);

  // The countdown reaching zero refreshes the games once. Opening the screen after the start time
  // does not count.
  useEffect(() => {
    if (!awaitingStart) {
      pendingStartRef.current = false;
      return;
    }
    if (!startReached) {
      pendingStartRef.current = true;
      return;
    }
    if (pendingStartRef.current) {
      pendingStartRef.current = false;
      void load(false, undefined, true);
    }
  }, [awaitingStart, load, startReached]);

  useEffect(() => {
    if (!pollsLive || HARNESS_ACTIVE) {
      return;
    }
    const adapter = adapterFor(gameRef.current.adapter);
    if (!adapter) {
      return;
    }

    let cancelled = false;
    let inFlight = false;
    let latestRequest = 0;
    let latestApplied = 0;
    let appliedBoard: LiveBoard | undefined = gameRef.current.board;

    const refresh = async () => {
      // A poll can outlast one interval; a request still running skips the tick.
      if (AppState.currentState !== 'active' || inFlight) {
        return;
      }

      inFlight = true;
      const request = ++latestRequest;
      const requestedAt = Date.now();
      let poll: LivePoll | undefined;
      try {
        poll = await adapter.fetchLive(gameRef.current, appliedBoard);
      } finally {
        inFlight = false;
      }
      if (cancelled || !poll || request <= latestApplied) {
        return;
      }
      latestApplied = request;

      if (poll.board) {
        appliedBoard = poll.board;
      }
      onApplyLive(gameKey, poll, requestedAt);
      if (poll.final && !finalRefreshedRef.current) {
        finalRefreshedRef.current = true;
        void load(false, undefined, true);
      }
    };

    void refresh();
    const interval = setInterval(
      () => void refresh(),
      LIVE_SCOREBOARD_INTERVAL_MS,
    );
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void refresh();
      }
    });
    return () => {
      cancelled = true;
      clearInterval(interval);
      appState.remove();
    };
  }, [gameKey, load, onApplyLive, pollsLive]);

  useEffect(
    () => () => {
      getVideoAbortRef.current?.abort();
      getVideoAbortRef.current = undefined;
    },
    [],
  );

  const listening = listeningStream !== undefined;
  useEffect(() => {
    if (blocked && listening) {
      onStopListen(gameKey);
    }
  }, [blocked, gameKey, listening, onStopListen]);

  const streams = useMemo(
    () => authorizedStreamsForGame(authorizedStreams, game),
    [authorizedStreams, game],
  );

  useEffect(() => {
    if (streams.length > 0 && getVideo.kind !== 'idle') {
      setGetVideo({ kind: 'idle' });
    }
  }, [streams.length, getVideo.kind]);

  const beginSession = useCallback(
    (sendRequest: boolean) => {
      const target = gameRef.current;
      getVideoAbortRef.current?.abort();
      const controller = new AbortController();
      getVideoAbortRef.current = controller;
      const { signal } = controller;
      const sourceOptions: SourcesOptions = {
        allowStaleCache: false,
        event: target.gameId,
        preferLive: true,
        session: {},
        signal,
      };

      const run = async () => {
        setGetVideo({ kind: 'finding', view: { kind: 'looking' } });
        try {
          if (sendRequest) {
            const started = await requestGetVideo(
              { eventId: target.gameId, sport: target.sport, teamKey },
              signal,
            );
            if (signal.aborted) {
              return;
            }
            if (started.kind === 'refused') {
              setGetVideo({ kind: 'failed', message: started.message });
              return;
            }
            if (started.kind === 'ready') {
              const { streams: refreshed } = await fetchSources(
                teamKey,
                school,
                sourceOptions,
              );
              if (signal.aborted) {
                return;
              }
              const ready = authorizedStreamsForGame(refreshed, target)[0];
              if (ready) {
                onStreamFound(target, ready);
                setGetVideo({ kind: 'idle' });
              } else {
                setGetVideo({ kind: 'failed', message: NO_VIDEO_TEXT });
              }
              return;
            }
          }

          const outcome = await pollForStream(
            target,
            () => fetchSources(teamKey, school, sourceOptions),
            {
              onView: (view) => setGetVideo({ kind: 'finding', view }),
              signal,
            },
          );
          if (signal.aborted) {
            return;
          }
          if (outcome.kind === 'found') {
            onStreamFound(target, outcome.stream);
            setGetVideo({ kind: 'idle' });
          }
          await load(true, sourceOptions);
          if (signal.aborted) {
            return;
          }
          if (outcome.kind === 'none') {
            setGetVideo({ kind: 'failed', message: NO_VIDEO_TEXT });
          } else if (outcome.kind === 'message') {
            setGetVideo({ kind: 'failed', message: outcome.message });
          }
        } catch {
          if (!signal.aborted) {
            setGetVideo({ kind: 'failed', message: NO_VIDEO_TEXT });
          }
        } finally {
          if (getVideoAbortRef.current === controller) {
            getVideoAbortRef.current = undefined;
          }
        }
      };
      void run();
    },
    [load, onStreamFound, school, teamKey],
  );

  const handleGetVideo = useCallback(() => {
    if (getVideo.kind === 'finding') {
      return;
    }
    beginSession(true);
  }, [beginSession, getVideo.kind]);

  // Returning to the screen during a run picks the progress up again from the next poll.
  const canResume =
    isGetVideoAvailable() && isVideoWindowOpen(game, nowMs) && streams.length === 0;
  const resumeCheckedRef = useRef(false);
  useEffect(() => {
    if (!canResume || resumeCheckedRef.current) {
      return;
    }
    resumeCheckedRef.current = true;
    const controller = new AbortController();
    void (async () => {
      const result = await fetchSources(teamKey, school, {
        event: gameRef.current.gameId,
        signal: controller.signal,
      });
      if (controller.signal.aborted || !result.runState) {
        return;
      }
      if (result.runState === 'queued' || result.progress) {
        setGetVideo({ kind: 'finding', view: progressView(result.progress) });
        beginSession(false);
      }
    })();
    return () => controller.abort();
  }, [beginSession, canResume, school, teamKey]);

  return (
    <FeaturedGameCard
      accent={accent}
      audioError={audioError}
      game={game}
      getVideo={getVideo}
      listeningStream={listeningStream}
      nowMs={nowMs}
      onGetVideo={handleGetVideo}
      onListen={(stream) => onListen(gameKey, stream)}
      onSelectStream={onSelectStream}
      onStopListen={() => onStopListen(gameKey)}
      showGetVideo={isGetVideoAvailable()}
      showSportLabel={showSportLabel}
      sportStatusLabel={sportStatusLabel}
      streams={streams}
      team={team}
    />
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.99 }],
  },
  liveCard: {
    backgroundColor: '#FFFFFF',
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
  siteDots: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  siteDot: {
    backgroundColor: '#D7DEE5',
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  siteDotFilled: {
    backgroundColor: '#0B2B4C',
  },
});
