/**
 * Relay result parsing shared by the native wrapper and the Node checks. Nothing here
 * touches the native module, so the rules run without a device.
 */
export type RelayMediaKind = 'hls' | 'dash' | 'mp4';

export type LiveRelay = {
  origin: string;
  port: number;
  token: string;
  kind: RelayMediaKind;
  /** `origin` + the kind's relay path. */
  mediaUrl: string;
  contentType: string;
  live: boolean;
  segmentFormat?: 'ts' | 'fmp4';
};

export type RelayStartFailure =
  | 'no-network'
  | 'source-unavailable'
  | 'unsupported'
  | 'failed';

export type RelayStartResult =
  | { ok: true; relay: LiveRelay }
  | { ok: false; reason: RelayStartFailure };

export type RelayStatus = {
  running: boolean;
  origin?: string;
  port?: number;
  token?: string;
  kind?: RelayMediaKind;
};

const RELAY_PATH_FILE: Record<RelayMediaKind, string> = {
  dash: 'live.mpd',
  hls: 'live.m3u8',
  mp4: 'media.mp4',
};

const RELAY_CONTENT_TYPE: Record<RelayMediaKind, string> = {
  dash: 'application/dash+xml',
  hls: 'application/x-mpegURL',
  mp4: 'video/mp4',
};

const TOKEN_PATTERN = /^[0-9a-f]{32}$/;

export function isRelayMediaKind(value: unknown): value is RelayMediaKind {
  return value === 'hls' || value === 'dash' || value === 'mp4';
}

/** Maps a page-reported content type to the relay route that can serve it. */
export function relayKindForContentType(
  contentType: string,
): RelayMediaKind | undefined {
  if (typeof contentType !== 'string') {
    return undefined;
  }
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  switch (type) {
    case 'application/x-mpegurl':
    case 'application/vnd.apple.mpegurl':
      return 'hls';
    case 'application/dash+xml':
      return 'dash';
    case 'video/mp4':
      return 'mp4';
    default:
      return undefined;
  }
}

/** Native rejection code to the reason the TV control reports. */
export function relayStartFailureForCode(code: unknown): RelayStartFailure {
  switch (code) {
    case 'ERR_NO_NETWORK':
      return 'no-network';
    case 'ERR_SOURCE':
      return 'source-unavailable';
    case 'ERR_UNSUPPORTED':
      return 'unsupported';
    default:
      return 'failed';
  }
}

/**
 * A receiver on the home network can reach only an RFC 1918 IPv4 address. Loopback,
 * link-local, carrier NAT, `192.0.0.0/29` translation, and public addresses are not
 * a Wi-Fi LAN address.
 */
export function isPrivateLanIpv4(host: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) {
    return false;
  }
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) {
    return false;
  }
  const [a, b] = octets as [number, number, number, number];
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function parseRelayOrigin(
  origin: string,
): { host: string; port: number } | undefined {
  const match = /^http:\/\/([0-9.]+):(\d{1,5})\/?$/.exec(origin);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }
  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return undefined;
  }
  return { host: match[1], port };
}

/**
 * Validates what the native `startProxy` resolved with. An origin the TV cannot reach
 * counts as no network; any other mismatch with the requested relay is a failure.
 */
export function liveRelayFromNative(
  raw: unknown,
  kind: RelayMediaKind,
): RelayStartResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'failed' };
  }
  const value = raw as Record<string, unknown>;
  if (typeof value.origin !== 'string') {
    return { ok: false, reason: 'failed' };
  }
  const parsed = parseRelayOrigin(value.origin);
  if (!parsed) {
    return { ok: false, reason: 'no-network' };
  }
  if (!isPrivateLanIpv4(parsed.host)) {
    return { ok: false, reason: 'no-network' };
  }
  if (value.port !== undefined && value.port !== parsed.port) {
    return { ok: false, reason: 'failed' };
  }
  if (typeof value.token !== 'string' || !TOKEN_PATTERN.test(value.token)) {
    return { ok: false, reason: 'failed' };
  }
  if (value.kind !== undefined && value.kind !== kind) {
    return { ok: false, reason: 'failed' };
  }
  const path = `/${value.token}/${RELAY_PATH_FILE[kind]}`;
  if (value.path !== undefined && value.path !== path) {
    return { ok: false, reason: 'failed' };
  }
  const origin = `http://${parsed.host}:${parsed.port}`;
  const segmentFormat =
    kind === 'hls' &&
    (value.segmentFormat === 'ts' || value.segmentFormat === 'fmp4')
      ? value.segmentFormat
      : undefined;
  return {
    ok: true,
    relay: {
      contentType:
        typeof value.contentType === 'string' && value.contentType.length > 0
          ? value.contentType
          : RELAY_CONTENT_TYPE[kind],
      kind,
      live: typeof value.live === 'boolean' ? value.live : kind !== 'mp4',
      mediaUrl: `${origin}${path}`,
      origin,
      port: parsed.port,
      token: value.token,
      ...(segmentFormat ? { segmentFormat } : {}),
    },
  };
}

export function relayStatusFromNative(raw: unknown): RelayStatus {
  if (!raw || typeof raw !== 'object') {
    return { running: false };
  }
  const value = raw as Record<string, unknown>;
  return {
    running: value.running === true,
    ...(typeof value.origin === 'string' ? { origin: value.origin } : {}),
    ...(typeof value.port === 'number' && Number.isFinite(value.port)
      ? { port: value.port }
      : {}),
    ...(typeof value.token === 'string' ? { token: value.token } : {}),
    ...(isRelayMediaKind(value.kind) ? { kind: value.kind } : {}),
  };
}

/** A relay is still serving the receiver only while the same session is listening. */
export function relayStillServing(status: RelayStatus, token: string): boolean {
  return status.running && status.token === token;
}
