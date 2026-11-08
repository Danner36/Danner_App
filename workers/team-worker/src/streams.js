// Reads streams/<league>/<espnId>.json through a per-league folder index and the blob cache.

import { FolderIndex } from './github.js';

const STREAMS_REFRESH_MS = 10 * 1000;
const STREAMS_MISSING_MS = 60 * 1000;
const MAX_REMOTE_STREAMS = 200;

export function createStreamsStore({ blobs, client, log, now }) {
  const indexes = new Map();

  function indexFor(league) {
    let index = indexes.get(league);
    if (!index) {
      index = new FolderIndex({
        client,
        log,
        missingTtlMs: STREAMS_MISSING_MS,
        now,
        path: `streams/${league}`,
        ttlMs: STREAMS_REFRESH_MS,
      });
      indexes.set(league, index);
    }
    return index;
  }

  async function shaFor(env, league, espnId) {
    return (await indexFor(league).read(env)).get(`${espnId}.json`);
  }

  return {
    // { sha, text } of the team's file, or undefined when it has none.
    async read(env, league, espnId) {
      const sha = await shaFor(env, league, espnId);
      return sha ? { sha, text: await blobs.text(env, sha) } : undefined;
    },

    // The parsed document, or undefined when the team has no file or it is not valid JSON.
    async readParsed(env, league, espnId) {
      const sha = await shaFor(env, league, espnId);
      return sha ? blobs.json(env, sha) : undefined;
    },
  };
}

export function emptyDocumentText(entry) {
  return `${JSON.stringify({
    schemaVersion: 2,
    streams: [],
    team: { key: entry.key, name: entry.name },
  })}\n`;
}

function hasPlayableShape(entry) {
  if (
    !['direct', 'web', 'youtube'].includes(entry.kind) ||
    typeof entry.url !== 'string' ||
    !Array.isArray(entry.gameNumbers) ||
    entry.gameNumbers.length === 0
  ) {
    return false;
  }
  try {
    const { protocol } = new URL(entry.url);
    return protocol === 'https:' || (protocol === 'http:' && entry.allowInsecureHttp === true);
  } catch {
    return false;
  }
}

// The phone's match rule for an event-keyed entry: the same event id, the event's current official
// date inside `gameDates`, and the same sport in a school file, within the phone's last 200 objects.
export function hasReadyEntry(document, { eventId, officialDate, sport }) {
  const streams = Array.isArray(document?.streams) ? document.streams : [];
  return streams
    .filter((entry) => typeof entry === 'object' && entry !== null && !Array.isArray(entry))
    .slice(-MAX_REMOTE_STREAMS)
    .some(
      (entry) =>
        entry.source === 'pipeline' &&
        entry.eventId === eventId &&
        Array.isArray(entry.gameDates) &&
        entry.gameDates.includes(officialDate) &&
        (sport === undefined || entry.sport === sport) &&
        hasPlayableShape(entry),
    );
}
