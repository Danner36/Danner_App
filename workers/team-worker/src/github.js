// GitHub access for the Worker: one authenticated request helper, a per-isolate folder index read
// by conditional request, and a per-isolate blob cache keyed by SHA.

const DEFAULT_REPO = 'Danner36/Danner_App';
const USER_AGENT = 'danner-team-worker';
const REQUEST_TIMEOUT_MS = 8000;
const REFRESH_AFTER_ERROR_MS = 10_000;
const BLOB_CACHE_MAX = 128;
const API_ACCEPT = 'application/vnd.github+json';
const RAW_ACCEPT = 'application/vnd.github.raw';

export class UpstreamError extends Error {
  constructor(stage, detail) {
    super(`${stage}: ${detail}`);
    this.name = 'UpstreamError';
    this.stage = stage;
  }
}

class WaitTimeoutError extends UpstreamError {}

// Bounds a wait on a shared read by this request's own timer. The read may belong to another
// request whose context has already ended, and then it never settles.
function withinRequestTimeout(promise, stage) {
  let timer;
  const expiry = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new WaitTimeoutError(stage, 'timed out')), REQUEST_TIMEOUT_MS);
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}

// Joins the in-flight read unless it is old enough that its request may be gone, in which case a
// new read replaces it. `clear` removes an entry only while it is still the current one.
function sharedRead({ current, nowMs, start, store, clear }) {
  if (current && nowMs - current.startedAt < REQUEST_TIMEOUT_MS) {
    return current.promise;
  }
  const entry = { startedAt: nowMs };
  entry.promise = start().finally(() => clear(entry));
  store(entry);
  return entry.promise;
}

export function githubRepo(env) {
  return env.GITHUB_REPO ?? DEFAULT_REPO;
}

export function createGithubClient({ fetchImpl }) {
  return {
    request(env, path, { accept = API_ACCEPT, body, etag, method = 'GET' } = {}) {
      return fetchImpl(`https://api.github.com/repos/${githubRepo(env)}${path}`, {
        body,
        headers: {
          Accept: accept,
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          'User-Agent': USER_AGENT,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(etag ? { 'If-None-Match': etag } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        method,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    },
  };
}

// Maps each file in one repository folder to its blob SHA. A 304 costs no primary rate limit. A
// failed refresh serves the last good index when one exists and retries after a short pause.
export class FolderIndex {
  constructor({ client, log, missingTtlMs, now, path, ttlMs }) {
    this.client = client;
    this.freshUntil = 0;
    this.log = log;
    this.missingTtlMs = missingTtlMs;
    this.now = now;
    this.path = path;
    this.ttlMs = ttlMs;
  }

  async read(env) {
    if (this.entries && this.now() < this.freshUntil) {
      return this.entries;
    }
    const pending = sharedRead({
      clear: (entry) => {
        if (this.pending === entry) {
          this.pending = undefined;
        }
      },
      current: this.pending,
      nowMs: this.now(),
      start: () => this.refresh(env),
      store: (entry) => {
        this.pending = entry;
      },
    });
    try {
      return await withinRequestTimeout(pending, `folder ${this.path}`);
    } catch (error) {
      if (error instanceof WaitTimeoutError) {
        return this.failed('timed out');
      }
      throw error;
    }
  }

  async refresh(env) {
    let response;
    try {
      response = await this.client.request(env, `/contents/${this.path}?ref=main`, {
        etag: this.etag,
      });
    } catch (error) {
      return this.failed(error instanceof Error ? error.name : 'network error');
    }

    if (response.status === 304 && this.entries) {
      this.freshUntil = this.now() + this.ttlMs;
      return this.entries;
    }
    if (response.status === 404) {
      this.entries = new Map();
      this.etag = undefined;
      this.freshUntil = this.now() + this.missingTtlMs;
      return this.entries;
    }
    if (!response.ok) {
      return this.failed(String(response.status));
    }

    let listing;
    try {
      listing = await response.json();
    } catch {
      return this.failed('unreadable body');
    }
    if (!Array.isArray(listing)) {
      return this.failed('unexpected shape');
    }

    this.entries = new Map(
      listing
        .filter((item) => item?.type === 'file' && typeof item.name === 'string' && typeof item.sha === 'string')
        .map((item) => [item.name, item.sha]),
    );
    this.etag = response.headers.get('ETag') ?? undefined;
    this.freshUntil = this.now() + this.ttlMs;
    return this.entries;
  }

  failed(detail) {
    this.log('github folder read failed', this.path, detail);
    if (this.entries) {
      this.freshUntil = this.now() + REFRESH_AFTER_ERROR_MS;
      return this.entries;
    }
    throw new UpstreamError(`folder ${this.path}`, detail);
  }
}

// A blob SHA names one immutable body, so a cached copy never needs revalidating.
export class BlobCache {
  constructor({ client, log, now }) {
    this.client = client;
    this.log = log;
    this.now = now;
    this.items = new Map();
    this.pending = new Map();
  }

  remember(sha, text) {
    if (this.items.size >= BLOB_CACHE_MAX) {
      this.items.delete(this.items.keys().next().value);
    }
    const item = { text };
    this.items.set(sha, item);
    return item;
  }

  item(env, sha) {
    const cached = this.items.get(sha);
    if (cached) {
      this.items.delete(sha);
      this.items.set(sha, cached);
      return Promise.resolve(cached);
    }
    const pending = sharedRead({
      clear: (entry) => {
        if (this.pending.get(sha) === entry) {
          this.pending.delete(sha);
        }
      },
      current: this.pending.get(sha),
      nowMs: this.now(),
      start: () => this.load(env, sha),
      store: (entry) => {
        this.pending.set(sha, entry);
      },
    });
    return withinRequestTimeout(pending, 'blob');
  }

  async load(env, sha) {
    let response;
    try {
      response = await this.client.request(env, `/git/blobs/${sha}`, { accept: RAW_ACCEPT });
    } catch (error) {
      this.log('github blob read failed', sha, error instanceof Error ? error.name : 'network error');
      throw new UpstreamError('blob', 'network error');
    }
    if (!response.ok) {
      this.log('github blob read failed', sha, String(response.status));
      throw new UpstreamError('blob', String(response.status));
    }
    try {
      return this.remember(sha, await withinRequestTimeout(response.text(), 'blob'));
    } catch (error) {
      this.log('github blob body read failed', sha, error instanceof Error ? error.name : 'error');
      throw new UpstreamError('blob', 'body read failed');
    }
  }

  async text(env, sha) {
    return (await this.item(env, sha)).text;
  }

  // The parsed body, or undefined when the file is not valid JSON.
  async json(env, sha) {
    const item = await this.item(env, sha);
    if (!('parsed' in item)) {
      try {
        item.parsed = JSON.parse(item.text);
      } catch {
        item.parsed = undefined;
      }
    }
    return item.parsed;
  }
}

// Throws only for a network failure; any other answer is reported as the status.
export async function dispatchTeamGetVideo(client, env, clientPayload, log) {
  const response = await client.request(env, '/dispatches', {
    body: JSON.stringify({ client_payload: clientPayload, event_type: 'team-get-video' }),
    method: 'POST',
  });
  if (response.status === 204) {
    return true;
  }
  log('github dispatch failed', String(response.status), (await response.text()).slice(0, 300));
  return false;
}
