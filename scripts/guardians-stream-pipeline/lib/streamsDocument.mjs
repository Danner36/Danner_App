import { readFile, writeFile } from 'node:fs/promises';

const STREAM_FIELDS = new Set([
  'allowInsecureHttp',
  'gameDates',
  'gameNumbers',
  'kind',
  'trustedHosts',
  'url',
]);

function isValidGameDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

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
    stream.trustedHosts.some((host) => typeof host !== 'string')
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

export async function readStreamsDocument(path) {
  const text = await readFile(path, 'utf8');
  const document = JSON.parse(text);
  if (typeof document !== 'object' || document === null || !Array.isArray(document.streams)) {
    throw new Error('guardians_streams.json is missing a streams array.');
  }
  return document;
}

export function streamMatchesGame(stream, game) {
  return (
    stream.gameDates.includes(game.officialDate) &&
    stream.gameNumbers.includes(game.gameNumber)
  );
}

export function upsertStream(document, entry, game) {
  const nextStreams = [];
  let replaced = false;

  for (const candidate of document.streams) {
    const stream = streamFromUnknown(candidate);
    if (stream && streamMatchesGame(stream, game)) {
      if (!replaced) {
        nextStreams.push(entry);
        replaced = true;
      }
      continue;
    }
    nextStreams.push(candidate);
  }

  if (!replaced) {
    nextStreams.push(entry);
  }

  return {
    ...document,
    streams: nextStreams,
  };
}

export function entryChanged(existing, nextEntry) {
  if (!existing) {
    return true;
  }

  return (
    existing.kind !== nextEntry.kind ||
    existing.url !== nextEntry.url ||
    existing.allowInsecureHttp !== nextEntry.allowInsecureHttp ||
    existing.trustedHosts.join(',') !== nextEntry.trustedHosts.join(',')
  );
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

export async function writeStreamsDocument(path, document) {
  const text = `${JSON.stringify(document, null, 2)}\n`;
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
  };
}
