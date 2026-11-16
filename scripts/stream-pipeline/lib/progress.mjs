// Tells the Worker which listing source the run is on. A body holds only numbers and the request's
// own identifiers, so no label or host can reach the phone. Posts leave one at a time and in order,
// but the caller never waits for them, so a slow Worker cannot eat a source's budget.

import { epochSeconds, postSigned, postSignedWithRetry } from './signedPost.mjs';

export const PROGRESS_PATH = '/run-progress';
export const ENTRY_PATH = '/run-entry';

// Hands a found entry to the Worker so the phone can play it before the publish job commits it.
// The Worker re-checks it with the same rules publish uses. The body carries only the game key
// and the entry, never the per-source table. Never throws.
export async function postFoundEntry({ candidate, fetchImpl, key, now = () => new Date(), runId, workerUrl, ...retry }) {
  if (!key || !workerUrl || candidate?.outcome !== 'found' || !candidate.eventId || !candidate.entry) {
    return { ok: false, skipped: true };
  }
  const { entry, eventId, game, schemaVersion, sport, team } = candidate;
  return postSignedWithRetry({
    attempts: 2,
    ...retry,
    fetchImpl,
    key,
    path: ENTRY_PATH,
    payload: {
      at: epochSeconds(now()),
      candidate: { entry, eventId, game, outcome: 'found', schemaVersion, ...(sport ? { sport } : {}), team },
      eventId,
      runId,
      ...(sport ? { sport } : {}),
      team,
    },
    workerUrl,
  });
}

export function createProgressReporter({
  dryRun = false,
  eventId,
  fetchImpl,
  key,
  now = () => new Date(),
  runId,
  sport,
  team,
  workerUrl,
}) {
  const enabled = Boolean(!dryRun && eventId && key && workerUrl);
  let queue = Promise.resolve();

  return {
    send(step, k, n) {
      if (!enabled) {
        return;
      }
      const payload = {
        at: epochSeconds(now()),
        eventId,
        k,
        n,
        runId,
        ...(sport ? { sport } : {}),
        step,
        team,
      };
      queue = queue.then(() =>
        postSigned({ fetchImpl, key, path: PROGRESS_PATH, payload, workerUrl }),
      );
    },
    flush: () => queue,
  };
}
