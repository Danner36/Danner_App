import { setTimeout as delay } from 'node:timers/promises';
import {
  parseStreamsDocument,
  serializeStreamsDocument,
} from './streamsDocument.mjs';

const GITHUB_API = 'https://api.github.com';
const GITHUB_TIMEOUT_MS = 20_000;
export const PUBLISH_MAX_RETRIES = 3;
const PUBLISH_BACKOFF_MS = 1_000;

function encodePath(path) {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function contentsUrl({ owner, repo, path }) {
  return `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodePath(path)}`;
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

// Current streams file on the branch and the blob SHA it was read at. Undefined when the file
// does not exist yet.
export async function readRemoteStreamsDocument({
  owner,
  repo,
  branch,
  path,
  token,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl(
    `${contentsUrl({ owner, repo, path })}?ref=${encodeURIComponent(branch)}`,
    {
      headers: githubHeaders(token),
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    },
  );

  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`GitHub read failed with ${response.status}.`);
  }

  const payload = await response.json();
  if (payload.encoding !== 'base64' || typeof payload.content !== 'string') {
    throw new Error('GitHub read returned no base64 content for the streams file.');
  }
  const text = Buffer.from(payload.content, 'base64').toString('utf8');
  return { document: parseStreamsDocument(text), sha: payload.sha };
}

// Read-modify-write against the branch. `update(document)` is applied to the copy just read and
// returns `{ document }` to publish or anything without `document` to stop. The PUT carries the
// SHA of that copy, so a concurrent change answers 409/422 and the whole cycle runs again.
export async function publishStreamsUpdate({
  owner,
  repo,
  branch,
  path,
  token,
  message,
  update,
  fallbackDocument,
  fetchImpl = fetch,
  sleep = delay,
  maxRetries = PUBLISH_MAX_RETRIES,
  backoffMs = PUBLISH_BACKOFF_MS,
}) {
  for (let attempt = 0; ; attempt += 1) {
    const remote = await readRemoteStreamsDocument({
      owner,
      repo,
      branch,
      path,
      token,
      fetchImpl,
    });
    const base = remote?.document ?? fallbackDocument;
    if (!base) {
      throw new Error('Streams file does not exist on the branch.');
    }

    const change = await update(base);
    if (!change?.document) {
      return { attempts: attempt + 1, change, published: false };
    }

    const content = serializeStreamsDocument(change.document);
    const response = await fetchImpl(contentsUrl({ owner, repo, path }), {
      method: 'PUT',
      headers: {
        ...githubHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        branch,
        content: Buffer.from(content, 'utf8').toString('base64'),
        message,
        ...(remote?.sha ? { sha: remote.sha } : {}),
      }),
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });

    if (response.ok) {
      return {
        attempts: attempt + 1,
        change,
        commit: await response.json(),
        document: change.document,
        published: true,
      };
    }

    const conflict = response.status === 409 || response.status === 422;
    if (conflict && attempt < maxRetries) {
      await sleep(backoffMs * 2 ** attempt + Math.floor(Math.random() * 250));
      continue;
    }

    const body = await response.text();
    throw new Error(`GitHub publish failed with ${response.status}: ${body}`);
  }
}
