import type { SportKey, TeamKey } from '../leagues/types.ts';
import {
  authorizedStreamsForGame,
  type GameIdentity,
} from '../team/engine/streamMatch.ts';
import type { PlayableStream } from './sources.ts';
import { appKey, getVideoEndpoint, isGetVideoAvailable } from './workerConfig.ts';

export const POLL_INTERVAL_MS = 5_000;
// The longest a Get video session waits for the run's result.
export const POLL_TIMEOUT_MS = 900_000;
// Nothing new for this long reads `Still looking…`.
export const STILL_LOOKING_AFTER_MS = 90_000;
const REQUEST_TIMEOUT_MS = 20_000;
const SECONDS_PER_MINUTE = 60;

export type RunProgress = {
  k: number;
  n: number;
  step: 'found' | 'source_start';
};

// What the phone shows under the Get video button.
export type GetVideoView =
  | { kind: 'looking' }
  | { kind: 'site'; k: number; n: number }
  | { kind: 'found' }
  | { kind: 'still' };

export type GetVideoOutcome =
  | { kind: 'found'; stream: PlayableStream }
  | { kind: 'none' }
  | { kind: 'message'; message: string };

export type GetVideoStart =
  | { kind: 'poll' }
  | { kind: 'ready' }
  | { kind: 'refused'; message: string };

export type PollResult = {
  progress?: RunProgress;
  runState?: string;
  streams: PlayableStream[];
};

export const NO_VIDEO_TEXT = 'No video found. Try again in a few minutes.';
const NOT_IN_WINDOW_TEXT =
  'Get video works from 15 minutes before the start until the game ends.';
const ERROR_TEXT = 'Get video could not start.';
const UNAUTHORIZED_TEXT = 'Get video is not authorized.';

// Final codes that end a wait without a video. Each message states why.
const FINAL_MESSAGES: Readonly<Record<string, string>> = {
  blocked: 'This game is not being played.',
  game_over: 'The game is over.',
  no_game: 'There is no game to find video for.',
  too_early: 'Get video opens 15 minutes before the start.',
};

// `published` and the other states that mean an entry exists end the wait only when it appears.
const NON_FINAL_RUN_STATES = new Set([
  'found',
  'none',
  'published',
  'queued',
  'unchanged',
  'video_ready',
]);

export function progressView(
  progress: RunProgress | undefined,
): GetVideoView {
  if (!progress) {
    return { kind: 'looking' };
  }
  return progress.step === 'found'
    ? { kind: 'found' }
    : { k: progress.k, kind: 'site', n: progress.n };
}

export function getVideoText(view: GetVideoView): string {
  if (view.kind === 'site') {
    return `Looking for video (${view.k} of ${view.n})…`;
  }
  if (view.kind === 'found') {
    return 'Video found. Getting it ready…';
  }
  return view.kind === 'still' ? 'Still looking…' : 'Looking for video…';
}

function tooOftenText(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / SECONDS_PER_MINUTE));
  return `Get video was asked for too often. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
}

// Maps one Worker answer to what the phone does next.
export async function getVideoStartFromResponse(
  response: Response,
): Promise<GetVideoStart> {
  let code: unknown;
  let retryAfterSeconds: unknown;
  try {
    ({ code, retryAfterSeconds } = (await response.json()) as {
      code?: unknown;
      retryAfterSeconds?: unknown;
    });
  } catch {}

  if (response.status === 200 && code === 'video_ready') {
    return { kind: 'ready' };
  }
  if (response.status === 202) {
    return { kind: 'poll' };
  }
  if (response.status === 409) {
    return { kind: 'refused', message: NOT_IN_WINDOW_TEXT };
  }
  if (response.status === 401) {
    return { kind: 'refused', message: UNAUTHORIZED_TEXT };
  }
  if (response.status === 429 || response.status === 503) {
    const header = Number(response.headers.get('Retry-After'));
    const seconds =
      Number.isFinite(header) && header > 0
        ? header
        : typeof retryAfterSeconds === 'number'
          ? retryAfterSeconds
          : SECONDS_PER_MINUTE;
    return { kind: 'refused', message: tooOftenText(seconds) };
  }
  return { kind: 'refused', message: ERROR_TEXT };
}

export async function requestGetVideo(
  target: { eventId: string; sport?: SportKey; teamKey: TeamKey },
  signal?: AbortSignal,
): Promise<GetVideoStart> {
  if (!isGetVideoAvailable()) {
    return { kind: 'refused', message: ERROR_TEXT };
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, REQUEST_TIMEOUT_MS);
  signal?.addEventListener('abort', abort);
  if (signal?.aborted) {
    controller.abort();
  }
  try {
    const body = {
      appKey: appKey(),
      eventId: target.eventId,
      ...(target.sport ? { sport: target.sport } : {}),
      team: target.teamKey,
    };
    const response = await fetch(getVideoEndpoint(), {
      body: JSON.stringify(body),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: controller.signal,
    });
    return await getVideoStartFromResponse(response);
  } catch {
    return { kind: 'refused', message: ERROR_TEXT };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done);
  });
}

export type PollOptions = {
  intervalMs?: number;
  now?: () => number;
  onView?: (view: GetVideoView) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
};

// Polls until an entry matches, the run reports a final code, or the deadline passes.
export async function pollForStream(
  game: GameIdentity,
  poll: () => Promise<PollResult>,
  options: PollOptions = {},
): Promise<GetVideoOutcome> {
  const intervalMs = options.intervalMs ?? POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? POLL_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const { signal } = options;
  const deadline = now() + timeoutMs;
  let lastChange = now();
  let lastSignature: string | undefined;

  while (!signal?.aborted) {
    const result = await poll();
    if (signal?.aborted) {
      return { kind: 'none' };
    }
    const match = authorizedStreamsForGame(result.streams, game)[0];
    if (match) {
      return { kind: 'found', stream: match };
    }

    const state = result.runState;
    if (state && !NON_FINAL_RUN_STATES.has(state)) {
      const message = FINAL_MESSAGES[state];
      return message ? { kind: 'message', message } : { kind: 'none' };
    }

    const signature = JSON.stringify(result.progress ?? null);
    if (signature !== lastSignature) {
      lastSignature = signature;
      lastChange = now();
    }
    options.onView?.(
      now() - lastChange >= STILL_LOOKING_AFTER_MS
        ? { kind: 'still' }
        : progressView(result.progress),
    );

    const remaining = deadline - now();
    if (remaining <= 0) {
      return { kind: 'none' };
    }
    await wait(Math.min(intervalMs, remaining), signal);
  }
  return { kind: 'none' };
}
