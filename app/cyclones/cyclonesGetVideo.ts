import type { CyclonesSport } from './cyclonesSnapshot';
import {
  authorizedStreamsForGame,
  type CyclonesGameIdentity,
  type PlayableCyclonesStream,
} from './cyclonesSources';

const GET_VIDEO_URL = process.env.EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL;
const FAMILY_PIN = process.env.EXPO_PUBLIC_GUARDIANS_FAMILY_PIN;
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 300_000;
const REQUEST_TIMEOUT_MS = 20_000;

export function isGetVideoAvailable(): boolean {
  return Boolean(GET_VIDEO_URL && FAMILY_PIN);
}

export function liveStreamsUrl(): string | undefined {
  if (!GET_VIDEO_URL) {
    return undefined;
  }
  return `${GET_VIDEO_URL.replace(/\/$/, '')}/streams?module=cyclones`;
}

function getVideoEndpoint(): string {
  const base = GET_VIDEO_URL?.replace(/\/$/, '') ?? '';
  return `${base}/get-video`;
}

export async function requestGetVideo(
  sport: CyclonesSport,
  signal?: AbortSignal,
): Promise<void> {
  if (!isGetVideoAvailable()) {
    throw new Error('Get video is not configured.');
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, REQUEST_TIMEOUT_MS);
  signal?.addEventListener('abort', abort);
  if (signal?.aborted) {
    controller.abort();
  }
  let response: Response;
  try {
    response = await fetch(getVideoEndpoint(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        module: 'cyclones',
        pin: FAMILY_PIN,
        sport,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }

  if (response.status === 401) {
    throw new Error('Get video is not authorized.');
  }
  // 429 means a run is already in progress; it publishes to the same list being polled.
  if (response.status === 429) {
    return;
  }
  if (!response.ok) {
    throw new Error('Get video could not start.');
  }
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done);
  });
}

export async function pollForStream(
  game: CyclonesGameIdentity,
  fetchSources: () => Promise<PlayableCyclonesStream[]>,
  options?: {
    intervalMs?: number;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<PlayableCyclonesStream | undefined> {
  const intervalMs = options?.intervalMs ?? POLL_INTERVAL_MS;
  const timeoutMs = options?.timeoutMs ?? POLL_TIMEOUT_MS;
  const signal = options?.signal;
  const deadline = Date.now() + timeoutMs;

  while (!signal?.aborted) {
    const streams = await fetchSources();
    if (signal?.aborted) {
      return undefined;
    }
    const match = authorizedStreamsForGame(streams, game)[0];
    if (match) {
      return match;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return undefined;
    }
    await wait(Math.min(intervalMs, remaining), signal);
  }
  return undefined;
}
