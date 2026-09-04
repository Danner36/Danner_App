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
  getProxyStatus: () => Promise<LiveHlsStatus>;
  startProxy: (sourceUrl: string, referer: string) => Promise<LiveHlsOrigin>;
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

/**
 * Publishes an approved page's own HLS stream from a phone origin. The provider serves its
 * playlists only to the player page, and a Cast receiver cannot be told to send that
 * `Referer`, so the phone relays the playlists and passes the media through unchanged.
 *
 * On Android this also starts a foreground service holding a wake lock and a Wi-Fi lock, so
 * the receiver keeps reaching the phone after the screen goes off.
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

export async function getHlsProxyStatus(): Promise<LiveHlsStatus> {
  if (!nativeModule?.getProxyStatus) {
    return { running: false };
  }

  try {
    return await nativeModule.getProxyStatus();
  } catch {
    return { running: false };
  }
}
