import type { TeamKey } from '../leagues/types.ts';

const WORKER_URL = process.env.EXPO_PUBLIC_DANNER_WORKER_URL;
const APP_KEY = process.env.EXPO_PUBLIC_DANNER_APP_KEY;

function workerOrigin(): string | undefined {
  return WORKER_URL ? WORKER_URL.replace(/\/$/, '') : undefined;
}

export function isGetVideoAvailable(): boolean {
  return Boolean(WORKER_URL && APP_KEY);
}

export function appKey(): string {
  return APP_KEY ?? '';
}

export function getVideoEndpoint(): string {
  return `${workerOrigin() ?? ''}/get-video`;
}

// `event` asks the Worker for that game's run state and progress headers.
export function workerStreamsUrl(
  teamKey: TeamKey,
  event?: string,
): string | undefined {
  const origin = workerOrigin();
  if (!origin) {
    return undefined;
  }
  const query = event === undefined ? '' : `&event=${encodeURIComponent(event)}`;
  return `${origin}/streams?team=${encodeURIComponent(teamKey)}${query}`;
}
