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
import { scoreHeaderFor } from './engine/scoreHeader.ts';
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
import { GameScoreHeader, type HeaderBadgeTone } from './GameScoreHeader';
import { opponentLogoFor } from './opponentLogo';
import { teamBoardLabel } from './theme';
import { useWinChance } from './useWinChance';

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

function badgeToneFor(
  interruption: GameInterruption | undefined,
  isLive: boolean,
  recap: string | undefined,
): HeaderBadgeTone {
  if (interruption) {
    return 'alert';
  }
  if (isLive) {
    return 'live';
  }
  if (recap === 'WIN') {
    return 'win';
  }
  return recap === 'LOSS' ? 'loss' : 'plain';
}

// The score, clock and situation live in the header, so every sport's board holds only the detail
// below the video controls: innings and the count, quarters, or fouls and players.
function LiveScoreboard({
  board,
  game,
  team,
}: {
  board: LiveBoard;
  game: TeamGame;
  team: TeamRef;
}) {
  if (board.kind === 'baseball') {
    return (
      <BaseballScoreboard
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
        isHome={game.isHome}
        opponentName={game.opponentName}
        scoreboard={board}
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
  teamKey,
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
  teamKey: TeamKey;
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
  const getVideoBusy = getVideo.kind === 'finding';
  const showVideoTiming = !videoWindowOpen && !blocksVideo && game.timeValid;
  const showGetVideoBlock = videoWindowOpen && visibleStreams.length === 0;
  const hasBoardDetail =
    isLive && game.board !== undefined && game.board.kind !== 'basketball';
  const hasContentBelowHeader = Boolean(
    sportStatusLabel ||
      interruption ||
      showVideoTiming ||
      visibleStreams.length > 0 ||
      showStandaloneStop ||
      audioError ||
      showGetVideoBlock ||
      hasBoardDetail ||
      arenaBoard,
  );

  return (
    <View
      style={[
        styles.liveCard,
        { borderColor: accent },
        usesTodayCard && styles.todayCard,
        interruption && styles.interruptedCard,
      ]}
    >
      <GameScoreHeader
        badge={badgeText}
        badgeTone={badgeToneFor(interruption, isLive, recap)}
        countdown={
          isTodayScheduled && game.timeValid
            ? countdownLabel(game.gameDate, nowMs)
            : undefined
        }
        header={scoreHeaderFor(game, team.nickname, Number(team.espnId))}
        isLastSection={!hasContentBelowHeader}
        opponentLogo={opponentLogoFor(game)}
        opponentName={game.opponentName}
        sportName={showSportLabel && game.sport ? sportLabel(game.sport) : undefined}
        team={team}
        teamKey={teamKey}
        winChance={winChance}
      />

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

      {showVideoTiming ? (
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

      {showGetVideoBlock ? (
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
                : showGetVideo
                  ? 'Finds a stream for this game.'
                  : 'Video is not ready yet. The app checks again automatically.'}
          </Text>
        </View>
      ) : null}

      {hasBoardDetail && game.board ? (
        <LiveScoreboard
          board={game.board}
          game={game}
          team={team}
        />
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
      teamKey={teamKey}
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
    overflow: 'hidden',
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
  sportStatusText: {
    color: '#8A4B00',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 14,
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
    alignSelf: 'center',
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
