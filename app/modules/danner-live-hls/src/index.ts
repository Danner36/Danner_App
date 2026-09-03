import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export type LiveHlsOrigin = {
  origin: string;
  port: number;
};

export type LiveHlsCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LiveHlsStatus = {
  origin?: string;
  port?: number;
  running: boolean;
};

type DannerLiveHlsModule = {
  getProxyStatus: () => Promise<LiveHlsStatus>;
  getStatus: () => Promise<LiveHlsStatus>;
  showAirPlayPicker: () => Promise<void>;
  start: (
    x: number,
    y: number,
    width: number,
    height: number,
  ) => Promise<LiveHlsOrigin>;
  startProxy: (sourceUrl: string, referer: string) => Promise<LiveHlsOrigin>;
  stop: () => Promise<void>;
  stopProxy: () => Promise<void>;
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

export async function startLiveHls(
  crop?: LiveHlsCrop,
): Promise<LiveHlsOrigin | undefined> {
  if (!nativeModule) {
    return undefined;
  }

  try {
    const result = await nativeModule.start(
      crop?.x ?? 0,
      crop?.y ?? 0,
      crop?.width ?? 0,
      crop?.height ?? 0,
    );
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

/**
 * Publishes an approved page's own HLS stream from a phone origin. The provider serves its
 * playlists only to the player page, and a Cast receiver cannot be told to send that
 * `Referer`, so the phone relays the playlists and passes the media through unchanged.
 */
export async function startHlsProxy(
  sourceUrl: string,
  referer: string,
): Promise<LiveHlsOrigin | undefined> {
  if (!nativeModule?.startProxy) {
    return undefined;
  }

  try {
    const result = await nativeModule.startProxy(sourceUrl, referer);
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

export async function stopHlsProxy(): Promise<void> {
  if (!nativeModule?.stopProxy) {
    return;
  }

  try {
    await nativeModule.stopProxy();
  } catch {
    return;
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
