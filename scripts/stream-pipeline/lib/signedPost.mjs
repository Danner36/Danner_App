// POSTs a JSON body signed with HMAC-SHA256 to the Worker. The Worker checks the signature over
// the exact bytes sent, and the body's `at` against its replay window.

import { createHmac } from 'node:crypto';

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

// `at` is seconds since the epoch.
export function epochSeconds(now = new Date()) {
  return Math.floor(now.getTime() / 1000);
}
