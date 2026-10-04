import { isGoozHost, isValidGoozPlayerUrl } from './extractGooz.mjs';

// Mirrors playableGuardiansStream / playableCyclonesStream in app/guardians/guardiansSources.ts
// and app/cyclones/cyclonesSources.ts. An entry that fails here is discarded by the phone,
// so the pipeline must not report it as ready or publish it.
export const MAX_REMOTE_STREAMS = 200;
const MAX_GAME_DATES = 200;
const MAX_TRUSTED_HOSTS = 10;
const MAX_URL_LENGTH = 2048;
const BASE_FIELDS = [
  'allowInsecureHttp',
  'gameDates',
  'gameNumbers',
  'kind',
  'trustedHosts',
  'url',
];
const GUARDIANS_FIELDS = new Set(BASE_FIELDS);
const CYCLONES_FIELDS = new Set([...BASE_FIELDS, 'sport']);
export const CYCLONES_SPORTS = new Set([
  'football',
  'mens-basketball',
  'womens-basketball',
]);

function isEntryObject(candidate) {
  return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
}

// The phone skips guide strings and reads only the last MAX_REMOTE_STREAMS objects of
// `streams`; it never rejects the document for its length.
export function entriesInPhoneScope(streams) {
  return streams.filter(isEntryObject).slice(-MAX_REMOTE_STREAMS);
}

export function isValidGameDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function youtubeVideoId(url) {
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

function isValidWebUrl(url) {
  try {
    const parsed = new URL(url);
    if (!isGoozHost(parsed.hostname)) {
      return true;
    }
    return isValidGoozPlayerUrl(url);
  } catch {
    return false;
  }
}

// `requireSport` selects the Cyclones schema (six fields plus required `sport`). Without it the
// Guardians/Patriots schema applies, which rejects a `sport` key.
export function playableStream(candidate, { requireSport = false } = {}) {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    return undefined;
  }
  const fields = requireSport ? CYCLONES_FIELDS : GUARDIANS_FIELDS;
  const stream = candidate;
  if (
    Object.keys(candidate).some((key) => !fields.has(key)) ||
    (requireSport && !CYCLONES_SPORTS.has(stream.sport)) ||
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
      return { ...stream, gameDates, gameNumbers, playbackUrl: parsed.toString() };
    }

    if (stream.trustedHosts.length > MAX_TRUSTED_HOSTS || !isValidWebUrl(stream.url)) {
      return undefined;
    }
    const hosts = [
      parsed.hostname.toLowerCase(),
      ...stream.trustedHosts.map((host) => host.trim().toLowerCase()),
    ];
    if (hosts.some((host) => !host || !/^[a-z0-9.-]+$/.test(host))) {
      return undefined;
    }
    return { ...stream, gameDates, gameNumbers, playbackUrl: parsed.toString() };
  } catch {
    return undefined;
  }
}

export function isPlayableStream(candidate, options) {
  return playableStream(candidate, options) !== undefined;
}
