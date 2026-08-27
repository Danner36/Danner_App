import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export type LiveHlsOrigin = {
  origin: string;
  port: number;
};

type LiveHlsStatus = {
  origin?: string;
  port?: number;
  running: boolean;
};

type DannerLiveHlsModule = {
  getStatus: () => Promise<LiveHlsStatus>;
  showAirPlayPicker: () => Promise<void>;
  start: () => Promise<LiveHlsOrigin>;
  stop: () => Promise<void>;
};

const nativeModule = requireOptionalNativeModule<DannerLiveHlsModule>(
  'DannerLiveHls',
);

export function isLiveHlsAvailable(): boolean {
  return nativeModule != null && Platform.OS !== 'web';
}

export function liveHlsPlaylistUrl(origin: string): string {
  return `${origin.replace(/\/$/, '')}/live.m3u8`;
}

export async function startLiveHls(): Promise<LiveHlsOrigin | undefined> {
  if (!nativeModule) {
    return undefined;
  }

  try {
    const result = await nativeModule.start();
    if (
      typeof result?.origin !== 'string' ||
      result.origin.length === 0 ||
      typeof result.port !== 'number' ||
      !Number.isFinite(result.port)
    ) {
      return undefined;
    }
    return { origin: result.origin, port: result.port };
  } catch {
    return undefined;
  }
}

export async function stopLiveHls(): Promise<void> {
  if (!nativeModule) {
    return;
  }

  try {
    await nativeModule.stop();
  } catch {
    return;
  }
}

export async function getLiveHlsStatus(): Promise<LiveHlsStatus> {
  if (!nativeModule) {
    return { running: false };
  }

  try {
    return await nativeModule.getStatus();
  } catch {
    return { running: false };
  }
}

export async function showLiveHlsAirPlayPicker(): Promise<void> {
  if (!nativeModule || Platform.OS !== 'ios') {
    return;
  }

  try {
    await nativeModule.showAirPlayPicker();
  } catch {
    return;
  }
}
