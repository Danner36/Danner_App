export type GuardiansPlaybackKind = 'direct' | 'web' | 'youtube';

export type AuthorizedGuardiansStream = {
  allowInsecureHttp: boolean;
  gameDates: string[];
  gameNumbers: number[];
  kind: GuardiansPlaybackKind;
  trustedHosts: string[];
  url: string;
};

export type PlayableGuardiansStream = AuthorizedGuardiansStream & {
  allowedNavigationHosts: string[];
  playbackUrl: string;
};

export type GuardiansGameIdentity = {
  gameNumber: number;
  officialDate: string;
};

const MAX_GAME_DATES = 200;
const MAX_REMOTE_STREAMS = 50;
const MAX_TRUSTED_HOSTS = 10;
const MAX_URL_LENGTH = 2048;
const STREAM_FIELDS = new Set([
  'allowInsecureHttp',
  'gameDates',
  'gameNumbers',
  'kind',
  'trustedHosts',
  'url',
]);

function isValidGameDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function youtubeVideoId(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return undefined;
    }

    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : undefined;
    }

    if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'youtube-nocookie.com'
    ) {
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      const id =
        parsed.pathname === '/watch'
          ? parsed.searchParams.get('v') ?? undefined
          : pathParts[0] === 'live' || pathParts[0] === 'embed'
            ? pathParts[1]
            : undefined;

      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : undefined;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function isValidGoozWebUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.toLowerCase().endsWith('gooz.aapmains.net')) {
      return true;
    }
    const match = parsed.pathname.match(/\/new-stream-embed\/([^/?#]+)/);
    if (!match) {
      return false;
    }
    const segment = match[1];
    return Boolean(segment && /\d/.test(segment));
  } catch {
    return false;
  }
}

export function playableGuardiansStream(
  stream: AuthorizedGuardiansStream,
): PlayableGuardiansStream | undefined {
  const gameDates = [...new Set(stream.gameDates)];
  const gameNumbers = [...new Set(stream.gameNumbers)];
  if (
    gameDates.length === 0 ||
    gameDates.length > MAX_GAME_DATES ||
    gameDates.some((gameDate) => !isValidGameDate(gameDate)) ||
    gameNumbers.length === 0 ||
    gameNumbers.some(
      (gameNumber) =>
        !Number.isInteger(gameNumber) || gameNumber < 1 || gameNumber > 9,
    ) ||
    (stream.kind !== 'web' && stream.trustedHosts.length > 0) ||
    stream.url.length > MAX_URL_LENGTH
  ) {
    return undefined;
  }

  if (stream.kind === 'youtube') {
    const videoId = youtubeVideoId(stream.url);
    if (!videoId) {
      return undefined;
    }

    return {
      ...stream,
      allowedNavigationHosts: ['www.youtube-nocookie.com'],
      gameDates,
      gameNumbers,
      playbackUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1`,
    };
  }

  try {
    const parsed = new URL(stream.url);
    const protocolAllowed =
      parsed.protocol === 'https:' ||
      (parsed.protocol === 'http:' && stream.allowInsecureHttp === true);
    if (!protocolAllowed) {
      return undefined;
    }

    if (stream.kind === 'direct') {
      return {
        ...stream,
        allowedNavigationHosts: [],
        gameDates,
        gameNumbers,
        playbackUrl: parsed.toString(),
      };
    }

    if (stream.kind === 'web') {
      if (stream.trustedHosts.length > MAX_TRUSTED_HOSTS) {
        return undefined;
      }
      if (!isValidGoozWebUrl(stream.url)) {
        return undefined;
      }
      const trustedHosts = [
        parsed.hostname.toLowerCase(),
        ...stream.trustedHosts.map((host) => host.trim().toLowerCase()),
      ];
      if (
        trustedHosts.some(
          (host) => !host || !/^[a-z0-9.-]+$/.test(host),
        )
      ) {
        return undefined;
      }

      return {
        ...stream,
        allowedNavigationHosts: [...new Set(trustedHosts)],
        gameDates,
        gameNumbers,
        playbackUrl: parsed.toString(),
        trustedHosts: stream.trustedHosts.map((host) =>
          host.trim().toLowerCase(),
        ),
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function streamFromUnknown(
  candidate: unknown,
): PlayableGuardiansStream | undefined {
  if (typeof candidate !== 'object' || candidate === null) {
    return undefined;
  }

  const stream = candidate as Partial<AuthorizedGuardiansStream>;
  if (
    Object.keys(candidate).some((key) => !STREAM_FIELDS.has(key)) ||
    typeof stream.allowInsecureHttp !== 'boolean' ||
    !Array.isArray(stream.gameDates) ||
    stream.gameDates.some((gameDate) => typeof gameDate !== 'string') ||
    !Array.isArray(stream.gameNumbers) ||
    stream.gameNumbers.some((gameNumber) => typeof gameNumber !== 'number') ||
    (stream.kind !== 'direct' &&
      stream.kind !== 'web' &&
      stream.kind !== 'youtube') ||
    typeof stream.url !== 'string' ||
    !Array.isArray(stream.trustedHosts) ||
    stream.trustedHosts.some((host) => typeof host !== 'string')
  ) {
    return undefined;
  }

  return playableGuardiansStream(stream as AuthorizedGuardiansStream);
}

export function guardiansStreamsFromDocument(
  value: unknown,
): PlayableGuardiansStream[] | undefined {
  if (typeof value !== 'object' || value === null || !('streams' in value)) {
    return undefined;
  }

  const streams = value.streams;
  if (!Array.isArray(streams) || streams.length > MAX_REMOTE_STREAMS) {
    return undefined;
  }

  const uniqueStreams = new Map<string, PlayableGuardiansStream>();
  for (const candidate of streams) {
    const playable = streamFromUnknown(candidate);
    if (playable) {
      const gameKey = `${playable.gameDates.join(',')}:${playable.gameNumbers.join(',')}`;
      const key = `${gameKey}:${playable.kind}:${playable.playbackUrl}`;
      uniqueStreams.set(key, playable);
    }
  }

  return [...uniqueStreams.values()];
}

export function authorizedStreamsForGame(
  streams: PlayableGuardiansStream[],
  game: GuardiansGameIdentity,
): PlayableGuardiansStream[] {
  return streams.filter(
    (stream) =>
      stream.gameDates.includes(game.officialDate) &&
      stream.gameNumbers.includes(game.gameNumber),
  );
}
