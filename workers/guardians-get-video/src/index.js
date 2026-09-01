const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 3;
const RATE_BUCKET_MAX = 10_000;
const rateBuckets = new Map();

const MODULES = {
  guardians: {
    eventType: 'guardians-get-video',
    streamsPath: 'guardians_streams.json',
    userAgent: 'danner-guardians-get-video',
  },
  patriots: {
    eventType: 'patriots-get-video',
    streamsPath: 'patriots_streams.json',
    userAgent: 'danner-patriots-get-video',
  },
};

function json(data, status = 200) {
  return new Response(`${JSON.stringify(data)}\n`, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown';
}

function pruneRateBuckets(now) {
  if (rateBuckets.size < RATE_BUCKET_MAX) {
    return;
  }
  for (const [key, stamps] of rateBuckets) {
    if (stamps.every((stamp) => now - stamp >= RATE_WINDOW_MS)) {
      rateBuckets.delete(key);
    }
  }
}

function rateLimited(ip) {
  const now = Date.now();
  pruneRateBuckets(now);
  const bucket = rateBuckets.get(ip) ?? [];
  const recent = bucket.filter((stamp) => now - stamp < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    rateBuckets.set(ip, recent);
    return true;
  }
  recent.push(now);
  rateBuckets.set(ip, recent);
  return false;
}

// Compares in time independent of where the first mismatch falls, so a caller cannot learn
// the PIN one character at a time from response timing.
function pinMatches(candidate, expected) {
  if (typeof candidate !== 'string' || typeof expected !== 'string') {
    return false;
  }
  let mismatch = candidate.length ^ expected.length;
  for (let index = 0; index < expected.length; index += 1) {
    // charCodeAt past the end is NaN, which coerces to 0 in a bitwise op; a short
    // candidate is already caught by the length check above.
    mismatch |= candidate.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
}

function resolveModule(value) {
  if (value === undefined || value === null || value === '') {
    return 'guardians';
  }
  if (value === 'guardians' || value === 'patriots') {
    return value;
  }
  return undefined;
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

// Last body seen per module, keyed by the ETag GitHub returned with it.
const streamsCache = new Map();

async function fetchStreamsDocument(env, moduleName) {
  const repo = env.GITHUB_REPO ?? 'Danner36/Danner_App';
  const module = MODULES[moduleName];
  const cached = streamsCache.get(moduleName);
  const response = await fetch(
    `https://api.github.com/repos/${repo}/contents/${module.streamsPath}?ref=main`,
    {
      headers: {
        Accept: 'application/vnd.github.raw',
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'User-Agent': module.userAgent,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(cached ? { 'If-None-Match': cached.etag } : {}),
      },
    },
  );

  // A 304 does not count against the token's rate limit, and GitHub only sends one when the
  // file genuinely has not changed. So this cuts quota use without adding any staleness --
  // unlike a TTL cache, which would undo the Get video freshness fix this endpoint exists for.
  if (response.status === 304 && cached) {
    return cached.body;
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub streams read failed with ${response.status}: ${detail}`);
  }

  const body = await response.text();
  const etag = response.headers.get('ETag');
  if (etag) {
    streamsCache.set(moduleName, { body, etag });
  }
  return body;
}

async function dispatchGetVideo(env, moduleName) {
  const repo = env.GITHUB_REPO ?? 'Danner36/Danner_App';
  const module = MODULES[moduleName];
  const response = await fetch(
    `https://api.github.com/repos/${repo}/dispatches`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'User-Agent': module.userAgent,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        client_payload: { module: moduleName, source: 'phone' },
        event_type: module.eventType,
      }),
    },
  );

  if (response.status !== 204) {
    const detail = await response.text();
    throw new Error(`GitHub dispatch failed with ${response.status}: ${detail}`);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response('ok', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    if (request.method === 'GET' && url.pathname === '/streams') {
      const moduleName = resolveModule(url.searchParams.get('module'));
      if (!moduleName) {
        return json({ error: 'Unknown module.' }, 400);
      }
      if (!env.GITHUB_TOKEN) {
        return json({ error: 'Worker secrets are not configured.' }, 500);
      }
      try {
        const documentText = await fetchStreamsDocument(env, moduleName);
        return new Response(documentText, {
          headers: {
            'Cache-Control': 'no-store',
            'Content-Type': 'application/json; charset=utf-8',
          },
        });
      } catch (error) {
        return json(
          {
            error: error instanceof Error ? error.message : String(error),
          },
          502,
        );
      }
    }

    if (request.method !== 'POST' || url.pathname !== '/get-video') {
      return json({ error: 'Not found.' }, 404);
    }

    if (!env.FAMILY_PIN || !env.GITHUB_TOKEN) {
      return json({ error: 'Worker secrets are not configured.' }, 500);
    }

    const body = await readJsonBody(request);
    const pin = typeof body.pin === 'string' ? body.pin : '';
    const moduleName = resolveModule(body.module);
    if (!moduleName) {
      return json({ error: 'Unknown module.' }, 400);
    }

    // Rate limit before checking the PIN. The other way round, a wrong PIN costs nothing
    // and the family PIN can be guessed without limit.
    if (rateLimited(clientIp(request))) {
      return json({ error: 'Too many requests.' }, 429);
    }

    if (!pinMatches(pin, env.FAMILY_PIN)) {
      return json({ error: 'Unauthorized.' }, 401);
    }

    try {
      await dispatchGetVideo(env, moduleName);
    } catch (error) {
      return json(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        502,
      );
    }

    return json({ message: 'Pipeline started.', module: moduleName, ok: true });
  },
};
