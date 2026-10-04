import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import {
  liveRelayFromNative,
  relayStartFailureForCode,
  relayStatusFromNative,
  type RelayMediaKind,
  type RelayStartResult,
  type RelayStatus,
} from './liveRelay';

export {
  relayKindForContentType,
  relayStillServing,
  type LiveRelay,
  type RelayMediaKind,
  type RelayStartFailure,
  type RelayStartResult,
  type RelayStatus,
} from './liveRelay';

type DannerLiveHlsModule = {
  getProxyStatus: () => Promise<unknown>;
  startProxy: (
    sourceUrl: string,
    referer: string,
    kind: RelayMediaKind,
  ) => Promise<unknown>;
  stopProxy: () => Promise<void>;
};

const nativeModule = requireOptionalNativeModule<DannerLiveHlsModule>(
  'DannerLiveHls',
);

export function isLiveHlsAvailable(): boolean {
  return nativeModule != null && Platform.OS !== 'web';
}

/**
 * Publishes an approved page's own HLS, DASH, or MP4 stream from a phone origin. The
 * provider serves its media only to the player page, and a Cast receiver cannot be told
 * to send that `Referer`, so the phone relays the manifests and passes the media through
 * unchanged. Every start is a new relay session with its own token; the previous
 * session's URLs stop answering.
 *
 * On Android this also starts a foreground service holding a wake lock and a Wi-Fi lock, so
 * the receiver keeps reaching the phone after the screen goes off.
 */
export async function startLiveRelay(
  sourceUrl: string,
  referer: string,
  kind: RelayMediaKind,
): Promise<RelayStartResult> {
  if (!nativeModule?.startProxy) {
    return { ok: false, reason: 'unsupported' };
  }

  let raw: unknown;
  try {
    raw = await nativeModule.startProxy(sourceUrl, referer, kind);
  } catch (error) {
    const code =
      error && typeof error === 'object'
        ? (error as { code?: unknown }).code
        : undefined;
    return { ok: false, reason: relayStartFailureForCode(code) };
  }

  const result = liveRelayFromNative(raw, kind);
  if (!result.ok) {
    // The native relay started, but on an origin or route the receiver cannot use.
    await stopHlsProxy();
  }
  return result;
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

export async function getHlsProxyStatus(): Promise<RelayStatus> {
  if (!nativeModule?.getProxyStatus) {
    return { running: false };
  }

  try {
    return relayStatusFromNative(await nativeModule.getProxyStatus());
  } catch {
    return { running: false };
  }
}
