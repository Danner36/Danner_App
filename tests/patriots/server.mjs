import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const port = Number.parseInt(process.env.PATRIOTS_HARNESS_PORT ?? '8108', 10);
const fixtureUrl = new URL('./live-game.fixture.json', import.meta.url);
const appleMediaRoot = new URL(
  'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/',
);
const validScenarios = new Set(['delayed', 'final', 'live', 'ready', 'today']);

async function readFixtureDocument() {
  return JSON.parse(await readFile(fixtureUrl, 'utf8'));
}

function easternDateString(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/New_York',
    year: 'numeric',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function snapshotForScenario(fixture, scenario) {
  const now = Date.now();
  const futureGames = fixture.upcomingGames.map((game, index) => {
    const gameDate = new Date(now + (index + 1) * 86_400_000);
    return {
      ...game,
      gameDate: gameDate.toISOString(),
      officialDate: easternDateString(gameDate),
    };
  });

  if (scenario === 'final') {
    const gameDate = new Date(now - 4 * 60 * 60_000);
    return {
      liveGame: {
        ...fixture.liveGame,
        abstractState: 'Final',
        gameDate: gameDate.toISOString(),
        officialDate: easternDateString(new Date()),
        opponentScore: 17,
        patriotsScore: 24,
        scoreboard: undefined,
        status: 'Final',
      },
      losses: fixture.losses,
      ties: fixture.ties ?? 0,
      upcomingGames: futureGames,
      wins: fixture.wins,
    };
  }

  if (scenario === 'live') {
    const gameDate = new Date(now - 90 * 60_000);
    return {
      liveGame: {
        ...fixture.liveGame,
        gameDate: gameDate.toISOString(),
        officialDate: easternDateString(gameDate),
      },
      losses: fixture.losses,
      ties: fixture.ties ?? 0,
      upcomingGames: futureGames,
      wins: fixture.wins,
    };
  }

  const startsInMinutes = scenario === 'ready' ? 10 : 45;
  const gameDate = new Date(now + startsInMinutes * 60_000);
  const todayGame = {
    ...fixture.liveGame,
    abstractState: 'Preview',
    gameDate: gameDate.toISOString(),
    opponentScore: 0,
    officialDate: easternDateString(gameDate),
    patriotsScore: 0,
    scoreboard: undefined,
    status: scenario === 'delayed' ? 'Delayed Start' : 'Scheduled',
  };
  return {
    losses: fixture.losses,
    ties: fixture.ties ?? 0,
    upcomingGames: [todayGame, ...futureGames],
    wins: fixture.wins,
  };
}

const server = createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store');
  const requestUrl = new URL(request.url ?? '/', `http://localhost:${port}`);

  if (request.method === 'GET' && requestUrl.pathname === '/health') {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('ok');
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/patriots') {
    try {
      const scenario = requestUrl.searchParams.get('scenario') ?? 'live';
      if (!validScenarios.has(scenario)) {
        response.writeHead(400, {
          'Content-Type': 'text/plain; charset=utf-8',
        });
        response.end('Unknown Patriots scenario');
        return;
      }
      const fixture = await readFixtureDocument();
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      response.end(JSON.stringify(snapshotForScenario(fixture, scenario)));
    } catch {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Invalid Patriots fixture');
    }
    return;
  }

  if (
    request.method === 'GET' &&
    requestUrl.pathname === '/patriots-sources.json'
  ) {
    try {
      const fixture = await readFixtureDocument();
      const gameDate = easternDateString(new Date());
      const streams = fixture.streams.map((stream) => ({
        allowInsecureHttp: stream.allowInsecureHttp ?? false,
        gameDates: [gameDate],
        gameNumbers: [1],
        kind: stream.kind,
        trustedHosts: stream.trustedHosts ?? [],
        url: stream.url,
      }));
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      response.end(JSON.stringify({ streams }));
    } catch {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Invalid Patriots stream fixture');
    }
    return;
  }

  if (
    request.method === 'GET' &&
    requestUrl.pathname.startsWith('/http-media/')
  ) {
    try {
      const relativePath = decodeURIComponent(
        requestUrl.pathname.slice('/http-media/'.length),
      );
      const upstreamUrl = new URL(relativePath, appleMediaRoot);
      if (
        upstreamUrl.origin !== appleMediaRoot.origin ||
        !upstreamUrl.pathname.startsWith(appleMediaRoot.pathname)
      ) {
        response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Media path is outside the test source');
        return;
      }
      const headers = request.headers.range
        ? { Range: request.headers.range }
        : undefined;
      const upstream = await fetch(upstreamUrl, { headers });
      if (!upstream.ok && upstream.status !== 206) {
        response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Test media is unavailable');
        return;
      }
      for (const header of [
        'accept-ranges',
        'content-length',
        'content-range',
        'content-type',
      ]) {
        const value = upstream.headers.get(header);
        if (value) {
          response.setHeader(header, value);
        }
      }
      response.writeHead(upstream.status);
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Test media proxy failed');
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/popup-player') {
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
    });
    response.end('<!doctype html><html><body>Patriots popup fixture</body></html>');
    return;
  }

  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`Patriots harness listening on http://localhost:${port}\n`);
});

const stop = () => server.close(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
