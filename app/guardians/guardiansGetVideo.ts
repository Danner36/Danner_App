import {
  authorizedStreamsForGame,
  type GuardiansGameIdentity,
  type PlayableGuardiansStream,
} from './guardiansSources';

const GET_VIDEO_URL = process.env.EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL;
const FAMILY_PIN = process.env.EXPO_PUBLIC_GUARDIANS_FAMILY_PIN;
const TEST_URL = process.env.EXPO_PUBLIC_GUARDIANS_TEST_URL;
const POLL_INTERVAL_MS = 15_000;
const POLL_TIMEOUT_MS = 300_000;

export function isGetVideoAvailable(): boolean {
  return Boolean(GET_VIDEO_URL && FAMILY_PIN && !TEST_URL);
}

function getVideoEndpoint(): string {
  const base = GET_VIDEO_URL?.replace(/\/$/, '') ?? '';
  return `${base}/get-video`;
}

export async function requestGetVideo(): Promise<void> {
  if (!isGetVideoAvailable()) {
    throw new Error('Get video is not configured.');
  }

  const response = await fetch(getVideoEndpoint(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pin: FAMILY_PIN }),
  });

  if (response.status === 401) {
    throw new Error('Get video is not authorized.');
  }
  if (response.status === 429) {
    throw new Error('Get video is already running. Try again in a few minutes.');
  }
  if (!response.ok) {
    throw new Error('Get video could not start.');
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function pollForStream(
  game: GuardiansGameIdentity,
  fetchSources: () => Promise<PlayableGuardiansStream[]>,
  options?: {
    intervalMs?: number;
    timeoutMs?: number;
  },
): Promise<PlayableGuardiansStream | undefined> {
  const intervalMs = options?.intervalMs ?? POLL_INTERVAL_MS;
  const timeoutMs = options?.timeoutMs ?? POLL_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const streams = await fetchSources();
    const match = authorizedStreamsForGame(streams, game)[0];
    if (match) {
      return match;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return undefined;
    }
    await wait(Math.min(intervalMs, remaining));
  }
}
