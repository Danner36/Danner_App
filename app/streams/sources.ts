import { isSportKey } from '../leagues/sports.ts';
import type { SportKey, TeamKey } from '../leagues/types.ts';

export type PlaybackKind = 'direct' | 'web' | 'youtube';

export type AuthorizedStream = {
  allowInsecureHttp: boolean;
  eventId?: string;
  gameDates: string[];
  gameNumbers: number[];
  kind: PlaybackKind;
  sport?: SportKey;
  trustedHosts: string[];
  url: string;
};

export type PlayableStream = AuthorizedStream & {
  allowedNavigationHosts: string[];
  playbackUrl: string;
};

export type StreamsDocumentOptions = {
  // School files require `sport` on every entry; pro files have none.
  school: boolean;
};

const MAX_GAME_DATES = 200;
const MAX_REMOTE_STREAMS = 200;
const MAX_TRUSTED_HOSTS = 10;
const MAX_URL_LENGTH = 2048;
const EVENT_ID_PATTERN = /^\d{1,12}$/;

// The repository path of a team's streams file; the same rule as the pipeline's `streamsPathForKey`.
export function streamsPathForKey(teamKey: TeamKey): string {
  const separator = teamKey.indexOf('-');
  const league = teamKey.slice(0, separator);
  const espnId = teamKey.slice(separator + 1);
  return `streams/${league}/${espnId}.json`;
}

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

const GOOZ_HOST = 'gooz.aapmains.net';

function isValidGoozWebUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    // Match on a label boundary, so `notgooz.aapmains.net` is not treated as the same host.
    if (host !== GOOZ_HOST && !host.endsWith(`.${GOOZ_HOST}`)) {
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

export function playableStream(
  stream: AuthorizedStream,
): PlayableStream | undefined {
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
      if (trustedHosts.some((host) => !host || !/^[a-z0-9.-]+$/.test(host))) {
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

// Unknown keys are ignored.
function streamFromUnknown(
  candidate: unknown,
  options: StreamsDocumentOptions,
): PlayableStream | undefined {
  if (typeof candidate !== 'object' || candidate === null) {
    return undefined;
  }

  const stream = candidate as Partial<AuthorizedStream>;
  if (
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
    stream.trustedHosts.some((host) => typeof host !== 'string') ||
    (options.school && !isSportKey(stream.sport)) ||
    (stream.eventId !== undefined &&
      (typeof stream.eventId !== 'string' ||
        !EVENT_ID_PATTERN.test(stream.eventId)))
  ) {
    return undefined;
  }

  const entry: AuthorizedStream = {
    allowInsecureHttp: stream.allowInsecureHttp,
    gameDates: stream.gameDates,
    gameNumbers: stream.gameNumbers,
    kind: stream.kind,
    trustedHosts: stream.trustedHosts,
    url: stream.url,
  };
  if (stream.eventId !== undefined) {
    entry.eventId = stream.eventId;
  }
  if (options.school) {
    entry.sport = stream.sport;
  }
  return playableStream(entry);
}

export function streamsFromDocument(
  value: unknown,
  options: StreamsDocumentOptions,
): PlayableStream[] | undefined {
  if (typeof value !== 'object' || value === null || !('streams' in value)) {
    return undefined;
  }

  const streams = value.streams;
  if (!Array.isArray(streams)) {
    return undefined;
  }

  // Guide strings inside `streams` are not entries. The pipeline appends each new game, so past
  // the cap the newest entries are the ones kept.
  const entries = streams
    .filter(
      (candidate) =>
        typeof candidate === 'object' &&
        candidate !== null &&
        !Array.isArray(candidate),
    )
    .slice(-MAX_REMOTE_STREAMS);
  const uniqueStreams = new Map<string, PlayableStream>();
  for (const candidate of entries) {
    const playable = streamFromUnknown(candidate, options);
    if (playable) {
      const gameKey = `${playable.sport ?? ''}:${playable.eventId ?? ''}:${playable.gameDates.join(',')}:${playable.gameNumbers.join(',')}`;
      const key = `${gameKey}:${playable.kind}:${playable.playbackUrl}`;
      uniqueStreams.set(key, playable);
    }
  }

  return [...uniqueStreams.values()];
}
