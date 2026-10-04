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
  cyclones: {
    eventType: 'cyclones-get-video',
    streamsPath: 'cyclones_streams.json',
    userAgent: 'danner-cyclones-get-video',
  },
};

const CYCLONES_SPORTS = new Set([
  'football',
  'mens-basketball',
  'womens-basketball',
]);

function json(data, status = 200) {
  return new Response(`${JSON.stringify(data)}\n`, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipv4Key(address) {
  const match = address.match(IPV4_PATTERN);
  if (!match || match.slice(1).some((part) => Number(part) > 255)) {
    return undefined;
  }
  return `v4:${match.slice(1).map(Number).join('.')}`;
}

// First four hextets of an IPv6 address, or undefined when it does not parse.
function ipv6Prefix64(address) {
  let value = address.toLowerCase().split('%')[0];
  if (value.includes('.')) {
    const lastColon = value.lastIndexOf(':');
    const embedded = value.slice(lastColon + 1).match(IPV4_PATTERN);
    if (!embedded || embedded.slice(1).some((part) => Number(part) > 255)) {
      return undefined;
    }
    const [a, b, c, d] = embedded.slice(1).map(Number);
    value = `${value.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = value.split('::');
  if (halves.length > 2) {
    return undefined;
  }
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) {
    return undefined;
  }
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
    return undefined;
  }
  return groups.slice(0, 4).map((group) => group.padStart(4, '0')).join(':');
}

// One bucket per IPv4 address and per IPv6 /64, the block a single subscriber is normally
// given. Keying on the full IPv6 address would let one client rotate through its /64.
function rateLimitKey(request) {
  const address = (request.headers.get('CF-Connecting-IP') ?? '').trim();
  if (!address) {
    return 'unknown';
  }
  const mapped = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  const v4 = ipv4Key(mapped ? mapped[1] : address);
  if (v4) {
    return v4;
  }
  const prefix = address.includes(':') ? ipv6Prefix64(address) : undefined;
  return prefix ? `v6:${prefix}::/64` : `raw:${address.toLowerCase()}`;
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

function rateLimitedInMemory(key) {
  const now = Date.now();
  pruneRateBuckets(now);
  const bucket = rateBuckets.get(key) ?? [];
  const recent = bucket.filter((stamp) => now - stamp < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    rateBuckets.set(key, recent);
    return true;
  }
  recent.push(now);
  rateBuckets.set(key, recent);
  return false;
}

// A Workers rate-limit binding named RATE_LIMITER counts across isolates. Without it, or if the
// binding call fails, the per-isolate map applies.
async function rateLimited(env, key) {
  if (env.RATE_LIMITER && typeof env.RATE_LIMITER.limit === 'function') {
    try {
      const { success } = await env.RATE_LIMITER.limit({ key });
      return !success;
    } catch {}
  }
  return rateLimitedInMemory(key);
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
  if (value === 'guardians' || value === 'patriots' || value === 'cyclones') {
    return value;
  }
  return undefined;
}

function resolveCyclonesSport(value) {
  return typeof value === 'string' && CYCLONES_SPORTS.has(value)
    ? value
    : undefined;
}

// Undefined unless the body is a JSON object. `null`, arrays, and invalid JSON are rejected
// with a JSON 400 instead of throwing into Cloudflare's HTML error page.
async function readJsonObjectBody(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return undefined;
  }
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? body
    : undefined;
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

async function dispatchGetVideo(env, moduleName, sport) {
  const repo = env.GITHUB_REPO ?? 'Danner36/Danner_App';
  const module = MODULES[moduleName];
  const clientPayload = { module: moduleName, source: 'phone' };
  if (sport) {
    clientPayload.sport = sport;
  }
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
        client_payload: clientPayload,
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

    const body = await readJsonObjectBody(request);
    if (!body) {
      return json({ error: 'Request body must be a JSON object.' }, 400);
    }
    const pin = typeof body.pin === 'string' ? body.pin : '';
    const moduleName = resolveModule(body.module);
    if (!moduleName) {
      return json({ error: 'Unknown module.' }, 400);
    }
    const sport =
      moduleName === 'cyclones' ? resolveCyclonesSport(body.sport) : undefined;
    if (moduleName === 'cyclones' && !sport) {
      return json({ error: 'Unknown sport.' }, 400);
    }

    // Rate limit before checking the PIN. The other way round, a wrong PIN costs nothing
    // and the family PIN can be guessed without limit.
    if (await rateLimited(env, rateLimitKey(request))) {
      return json({ error: 'Too many requests.' }, 429);
    }

    if (!pinMatches(pin, env.FAMILY_PIN)) {
      return json({ error: 'Unauthorized.' }, 401);
    }

    try {
      await dispatchGetVideo(env, moduleName, sport);
    } catch (error) {
      return json(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        502,
      );
    }

    return json({
      message: 'Pipeline started.',
      module: moduleName,
      ok: true,
      ...(sport ? { sport } : {}),
    });
  },
};
