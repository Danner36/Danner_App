// Tells the Worker which listing source the run is on. A body holds only numbers and the request's
// own identifiers, so no label or host can reach the phone. Posts leave one at a time and in order,
// but the caller never waits for them, so a slow Worker cannot eat a source's budget.

import { epochSeconds, postSigned } from './signedPost.mjs';

export const PROGRESS_PATH = '/run-progress';

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
