import { readFile, writeFile } from 'node:fs/promises';
import { isGoozHost } from './extractGooz.mjs';
import {
  CYCLONES_SPORTS,
  entriesInPhoneScope,
  isValidGameDate,
  playableStream,
} from './playableStream.mjs';

const STREAM_FIELDS = new Set([
  'allowInsecureHttp',
  'gameDates',
  'gameNumbers',
  'kind',
  'sport',
  'trustedHosts',
  'url',
]);

export const STALE_ENTRY_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// Structural parse only. Used to find entries that name a game, whether or not the phone
// would accept them; playableStream decides that.
export function streamFromUnknown(candidate) {
  if (typeof candidate !== 'object' || candidate === null) {
    return undefined;
  }

  if (Object.keys(candidate).some((key) => !STREAM_FIELDS.has(key))) {
    return undefined;
  }

  const stream = candidate;
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
    (stream.sport !== undefined && !CYCLONES_SPORTS.has(stream.sport))
  ) {
    return undefined;
  }

  if (
    stream.gameDates.length === 0 ||
    stream.gameDates.some((gameDate) => !isValidGameDate(gameDate)) ||
    stream.gameNumbers.length === 0 ||
    stream.gameNumbers.some(
      (gameNumber) =>
        !Number.isInteger(gameNumber) || gameNumber < 1 || gameNumber > 9,
    )
  ) {
    return undefined;
  }

  return stream;
}

export function parseStreamsDocument(text) {
  const document = JSON.parse(text);
  if (typeof document !== 'object' || document === null || !Array.isArray(document.streams)) {
    throw new Error('Streams file is missing a streams array.');
  }
  return document;
}

export async function readStreamsDocument(path) {
  return parseStreamsDocument(await readFile(path, 'utf8'));
}

export function serializeStreamsDocument(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function streamMatchesGame(stream, game) {
  const datesAndNumber =
    stream.gameDates.includes(game.officialDate) &&
    stream.gameNumbers.includes(game.gameNumber);
  if (!datesAndNumber) {
    return false;
  }
  if (game.sport) {
    return stream.sport === game.sport;
  }
  return stream.sport === undefined;
}

function isProviderEntry(stream) {
  try {
    return stream.kind === 'web' && isGoozHost(new URL(stream.url).hostname);
  } catch {
    return false;
  }
}

// Removes one (date, game number) pair from an entry that covers every date x number
// combination, returning the pieces that still cover everything else.
function withoutGameKey(candidate, officialDate, gameNumber) {
  const otherDates = candidate.gameDates.filter((date) => date !== officialDate);
  const otherNumbers = candidate.gameNumbers.filter((number) => number !== gameNumber);
  const pieces = [];
  if (otherDates.length > 0) {
    pieces.push({ ...candidate, gameDates: otherDates });
  }
  if (otherNumbers.length > 0) {
    pieces.push({ ...candidate, gameDates: [officialDate], gameNumbers: otherNumbers });
  }
  return pieces;
}

// Takes this game's keys away from entries the pipeline owns (provider embeds) and from entries
// the phone would reject, then inserts `entry` where the first of them stood. Other valid sources
// for the same game, and every other date or game number an entry covers, stay.
export function upsertStream(document, entry, game, validation = {}) {
  const streams = [];
  let placed = false;

  for (const candidate of document.streams) {
    const stream = streamFromUnknown(candidate);
    const replaceable =
      stream &&
      streamMatchesGame(stream, game) &&
      (isProviderEntry(stream) || !playableStream(stream, validation));
    if (!replaceable) {
      streams.push(candidate);
      continue;
    }
    streams.push(...withoutGameKey(candidate, game.officialDate, game.gameNumber));
    if (!placed) {
      streams.push(entry);
      placed = true;
    }
  }

  if (!placed) {
    streams.push(entry);
  }

  // The phone reads only the last MAX_REMOTE_STREAMS entry objects; an entry replaced in place
  // outside that range moves to the end.
  if (!entriesInPhoneScope(streams).includes(entry)) {
    streams.splice(streams.indexOf(entry), 1);
    streams.push(entry);
  }

  return {
    ...document,
    streams,
  };
}

function daysBefore(gameDate, today) {
  return Math.round(
    (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${gameDate}T00:00:00Z`).getTime()) /
      DAY_MS,
  );
}

// Drops entries whose every date is more than `keepDays` before `today`. Root keys such as
// HOW_TO_GUIDE, marker strings, and the inactive example (its placeholder date does not parse)
// are never touched.
export function pruneStaleStreams(document, today, keepDays = STALE_ENTRY_DAYS) {
  const streams = document.streams.filter((candidate) => {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      return true;
    }
    const dates = candidate.gameDates;
    if (!Array.isArray(dates) || dates.length === 0) {
      return true;
    }
    const stale = dates.every(
      (gameDate) => isValidGameDate(gameDate) && daysBefore(gameDate, today) > keepDays,
    );
    return !stale;
  });
  return { ...document, streams };
}

export function playableStreamsForGame(document, game, validation = {}) {
  const matches = [];
  for (const candidate of entriesInPhoneScope(document.streams)) {
    const stream = streamFromUnknown(candidate);
    if (!stream || !streamMatchesGame(stream, game)) {
      continue;
    }
    const playable = playableStream(stream, validation);
    if (playable) {
      matches.push(stream);
    }
  }
  return matches;
}

export function findPlayableStreamForGame(document, game, validation = {}) {
  return playableStreamsForGame(document, game, validation)[0];
}

export function findStreamForGame(document, game) {
  for (const candidate of document.streams) {
    const stream = streamFromUnknown(candidate);
    if (stream && streamMatchesGame(stream, game)) {
      return stream;
    }
  }
  return undefined;
}

function sameStreamTarget(existing, nextEntry) {
  return (
    existing.kind === nextEntry.kind &&
    existing.url === nextEntry.url &&
    existing.allowInsecureHttp === nextEntry.allowInsecureHttp &&
    existing.trustedHosts.join(',') === nextEntry.trustedHosts.join(',') &&
    existing.sport === nextEntry.sport
  );
}

export function findEquivalentStream(document, game, nextEntry, validation = {}) {
  return playableStreamsForGame(document, game, validation).find((stream) =>
    sameStreamTarget(stream, nextEntry),
  );
}

// Decides what one publish attempt does with the current copy of the streams file. Runs again
// on every retry, so a change published by another run in the meantime is seen. Pruning runs
// before the upsert so the entry being written is never aged out (a resumed game keeps an old
// official date).
export function planStreamUpdate(document, { entry, force = false, game, requireSport = false, today }) {
  const validation = { requireSport };
  if (!force) {
    const ready = findPlayableStreamForGame(document, game, validation);
    if (ready) {
      return { outcome: 'video_ready', streamEntry: ready };
    }
  }
  const equivalent = findEquivalentStream(document, game, entry, validation);
  if (equivalent) {
    return { outcome: 'unchanged', streamEntry: equivalent };
  }
  const updated = upsertStream(pruneStaleStreams(document, today), entry, game, validation);
  return { document: updated, outcome: 'update' };
}

export async function writeStreamsDocument(path, document) {
  const text = serializeStreamsDocument(document);
  await writeFile(path, text, 'utf8');
  return text;
}

export function buildStreamEntry(game, probeResult, playback) {
  return {
    gameDates: [game.officialDate],
    gameNumbers: [game.gameNumber],
    kind: probeResult.kind,
    url: probeResult.url,
    allowInsecureHttp: probeResult.allowInsecureHttp,
    trustedHosts: probeResult.trustedHosts ?? playback.trustedHosts ?? [],
    ...(game.sport ? { sport: game.sport } : {}),
  };
}
