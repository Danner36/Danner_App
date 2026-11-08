// POSTs a JSON body signed with HMAC-SHA256 to the Worker. The Worker checks the signature over
// the exact bytes sent, and the body's `at` against its replay window.

import { createHmac } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export const SIGNATURE_HEADER = 'X-Signature';
const POST_TIMEOUT_MS = 5_000;

export function signBody(key, body) {
  return createHmac('sha256', key).update(body).digest('hex');
}

// Never throws and never reports the URL: a Worker that does not answer must not fail the run.
export async function postSigned({ fetchImpl = fetch, key, path, payload, workerUrl }) {
  const body = JSON.stringify(payload);
  try {
    const response = await fetchImpl(`${workerUrl.replace(/\/+$/, '')}${path}`, {
      body,
      headers: { 'Content-Type': 'application/json', [SIGNATURE_HEADER]: signBody(key, body) },
      method: 'POST',
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false };
  }
}

// Up to `attempts` posts of the same signed body, with a doubling wait between them.
export async function postSignedWithRetry({ attempts = 3, backoffMs = 1_000, sleep = delay, ...post }) {
  let result = { ok: false };
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      await sleep(backoffMs * 2 ** (attempt - 1));
    }
    result = await postSigned(post);
    if (result.ok) {
      return result;
    }
  }
  return result;
}

// `at` is seconds since the epoch.
export function epochSeconds(now = new Date()) {
  return Math.floor(now.getTime() / 1000);
}
