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

export async function requestGetVideo(sport: CyclonesSport): Promise<void> {
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
      body: JSON.stringify({
        module: 'cyclones',
        pin: FAMILY_PIN,
        sport,
      }),
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
  game: CyclonesGameIdentity,
  fetchSources: () => Promise<PlayableCyclonesStream[]>,
  options?: {
    intervalMs?: number;
    timeoutMs?: number;
  },
): Promise<PlayableCyclonesStream | undefined> {
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
