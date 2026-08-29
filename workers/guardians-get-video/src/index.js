const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 3;
const rateBuckets = new Map();

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

function rateLimited(ip) {
  const now = Date.now();
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

async function readPin(request) {
  try {
    const body = await request.json();
    return typeof body?.pin === 'string' ? body.pin : '';
  } catch {
    return '';
  }
}

async function fetchStreamsDocument(env) {
  const repo = env.GITHUB_REPO ?? 'Danner36/Danner_App';
  const response = await fetch(
    `https://api.github.com/repos/${repo}/contents/guardians_streams.json?ref=main`,
    {
      headers: {
        Accept: 'application/vnd.github.raw',
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'User-Agent': 'danner-guardians-get-video',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub streams read failed with ${response.status}: ${detail}`);
  }
  return response.text();
}

async function dispatchGetVideo(env) {
  const repo = env.GITHUB_REPO ?? 'Danner36/Danner_App';
  const response = await fetch(
    `https://api.github.com/repos/${repo}/dispatches`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'User-Agent': 'danner-guardians-get-video',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        client_payload: { source: 'phone' },
        event_type: 'guardians-get-video',
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
      if (!env.GITHUB_TOKEN) {
        return json({ error: 'Worker secrets are not configured.' }, 500);
      }
      try {
        const documentText = await fetchStreamsDocument(env);
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

    const pin = await readPin(request);
    if (pin !== env.FAMILY_PIN) {
      return json({ error: 'Unauthorized.' }, 401);
    }

    if (rateLimited(clientIp(request))) {
      return json({ error: 'Too many requests.' }, 429);
    }

    try {
      await dispatchGetVideo(env);
    } catch (error) {
      return json(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        502,
      );
    }

    return json({ message: 'Pipeline started.', ok: true });
  },
};
