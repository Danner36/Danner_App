import {
  authorizedStreamsForGame,
  type GuardiansGameIdentity,
  type PlayableGuardiansStream,
} from './guardiansSources';

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
  return `${GET_VIDEO_URL.replace(/\/$/, '')}/streams`;
}

function getVideoEndpoint(): string {
  const base = GET_VIDEO_URL?.replace(/\/$/, '') ?? '';
  return `${base}/get-video`;
}

export async function requestGetVideo(): Promise<void> {
  if (!isGetVideoAvailable()) {
    throw new Error('Get video is not configured.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(getVideoEndpoint(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pin: FAMILY_PIN }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
  clearTimeout(timeout);

  if (response.status === 401) {
    throw new Error('Get video is not authorized.');
  }
  // 429 means a run for this module is already in progress; its result is what the poll
  // waits for.
  if (response.status === 429) {
    return;
  }
  if (!response.ok) {
    throw new Error('Get video could not start.');
  }
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal?.addEventListener('abort', finish);
  });
}

/** Resolves undefined when the deadline passes or `signal` aborts first. */
export async function pollForStream(
  game: GuardiansGameIdentity,
  fetchSources: () => Promise<PlayableGuardiansStream[]>,
  options?: {
    intervalMs?: number;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<PlayableGuardiansStream | undefined> {
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
