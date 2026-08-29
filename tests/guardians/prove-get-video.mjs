import { createServer } from 'node:http';

const officialDate = '2026-08-28';
const publishedStream = {
  allowInsecureHttp: false,
  gameDates: [officialDate],
  gameNumbers: [1],
  kind: 'web',
  trustedHosts: [],
  url: 'https://gooz.aapmains.net/new-stream-embed/55387?ad=111',
};

function authorizedStreamsForGame(streams, game) {
  return streams.filter(
    (stream) =>
      stream.gameDates.includes(game.officialDate) &&
      stream.gameNumbers.includes(game.gameNumber),
  );
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function pollForStream(game, fetchSources, options) {
  const intervalMs = options.intervalMs;
  const timeoutMs = options.timeoutMs;
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const streams = await fetchSources();
    const match = authorizedStreamsForGame(streams, game)[0];
    if (match) {
      return match;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return undefined;
    }
    await wait(Math.min(intervalMs, remaining));
  }
}

async function agentLog(hypothesisId, location, message, data) {
  const payload = {
    sessionId: 'af2248',
    runId: 'post-fix',
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function startServer(port, staleMs) {
  let publishedAt = 0;
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const requestUrl = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    if (request.method === 'POST' && requestUrl.pathname === '/get-video') {
      if (!publishedAt) {
        publishedAt = Date.now() + staleMs;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(`${JSON.stringify({ ok: true })}\n`);
      return;
    }
    if (
      request.method === 'GET' &&
      (requestUrl.pathname === '/streams' ||
        requestUrl.pathname === '/guardians-sources.json')
    ) {
      const ready = publishedAt > 0 && Date.now() >= publishedAt;
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({ streams: ready ? [publishedStream] : [] }),
      );
      return;
    }
    response.writeHead(404);
    response.end('Not found');
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

const port = 8110;
const staleMs = 4_000;
const server = await startServer(port, staleMs);
const game = { officialDate, gameNumber: 1 };
const started = Date.now();

const trigger = await fetch(`http://127.0.0.1:${port}/get-video`, {
  method: 'POST',
});
const before = await (await fetch(`http://127.0.0.1:${port}/streams`)).json();
const found = await pollForStream(
  game,
  async () => {
    const document = await (
      await fetch(`http://127.0.0.1:${port}/streams`)
    ).json();
    return document.streams ?? [];
  },
  { intervalMs: 500, timeoutMs: 15_000 },
);
const elapsedMs = Date.now() - started;

await agentLog('A', 'prove-get-video.mjs', 'delayed publish poll', {
  triggerStatus: trigger.status,
  beforeCount: before.streams.length,
  foundDates: found?.gameDates,
  foundUrlHost: found ? new URL(found.url).host : undefined,
  elapsedMs,
});

const raw = await fetch(
  'https://raw.githubusercontent.com/Danner36/Danner_App/main/guardians_streams.json?refresh=1',
);
const rawSecond = await fetch(
  'https://raw.githubusercontent.com/Danner36/Danner_App/main/guardians_streams.json?refresh=2',
);
const commits = await fetch(
  'https://api.github.com/repos/Danner36/Danner_App/commits?path=guardians_streams.json&per_page=1',
  { headers: { 'User-Agent': 'danner-apps', Accept: 'application/vnd.github+json' } },
);
const commitList = await commits.json();
const sha = commitList[0]?.sha;
const bySha = await fetch(
  `https://raw.githubusercontent.com/Danner36/Danner_App/${sha}/guardians_streams.json`,
);
const byShaDoc = await bySha.json();
const has28 = (byShaDoc.streams ?? []).some(
  (stream) =>
    stream &&
    typeof stream === 'object' &&
    Array.isArray(stream.gameDates) &&
    stream.gameDates.includes('2026-08-28'),
);

await agentLog('A', 'prove-get-video.mjs:github', 'raw vs commit-sha freshness', {
  rawCache: raw.headers.get('x-cache'),
  rawSecondCache: rawSecond.headers.get('x-cache'),
  rawMaxAge: raw.headers.get('cache-control'),
  sha,
  byShaHas28: has28,
});

server.close();

if (!found || found.gameDates[0] !== officialDate || elapsedMs < staleMs) {
  process.exitCode = 1;
  throw new Error(
    `Poll did not wait for publish. found=${Boolean(found)} elapsedMs=${elapsedMs}`,
  );
}

if (!has28) {
  process.exitCode = 1;
  throw new Error('Commit-sha raw fetch missing 2026-08-28 stream.');
}

process.stdout.write('prove-get-video passed\n');
