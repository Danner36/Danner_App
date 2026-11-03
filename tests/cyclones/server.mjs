import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const port = Number.parseInt(process.env.CYCLONES_HARNESS_PORT ?? '8108', 10);
const fixtureUrl = new URL('./live-game.fixture.json', import.meta.url);
// Live women's basketball game whose board is a trimmed ESPN summary with the capability flags the
// board needs turned on.
const basketballFixtureUrl = new URL(
  './live-basketball.fixture.json',
  import.meta.url,
);
const appleMediaRoot = new URL(
  'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/',
);
const validScenarios = new Set([
  'delayed',
  'final',
  'live',
  'live-basketball',
  'ready',
  'today',
  'two-games',
]);

async function readFixtureDocument(scenario) {
  const url =
    scenario === 'live-basketball' || scenario === 'two-games'
      ? basketballFixtureUrl
      : fixtureUrl;
  return JSON.parse(await readFile(url, 'utf8'));
}

function chicagoDateString(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Chicago',
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
      officialDate: chicagoDateString(gameDate),
    };
  });

  if (scenario === 'final') {
    const gameDate = new Date(now - 4 * 60 * 60_000);
    return {
      liveGame: {
        ...fixture.liveGame,
        abstractState: 'Final',
        gameDate: gameDate.toISOString(),
        officialDate: chicagoDateString(new Date()),
        opponentScore: 7,
        cyclonesScore: 24,
        scoreboard: undefined,
        status: 'Final',
      },
      losses: fixture.losses,
      ties: fixture.ties ?? 0,
      upcomingGames: futureGames,
      wins: fixture.wins,
    };
  }

  // The live basketball game plus a men's basketball final from earlier the same day: two cards.
  if (scenario === 'two-games') {
    const liveDate = new Date(now - 60 * 60_000);
    const finalDate = new Date(now - 3 * 60 * 60_000);
    const today = chicagoDateString(new Date());
    return {
      boardFlags: fixture.boardFlags,
      liveGame: {
        ...fixture.liveGame,
        gameDate: liveDate.toISOString(),
        officialDate: chicagoDateString(liveDate),
      },
      losses: fixture.losses,
      ties: fixture.ties ?? 0,
      upcomingGames: [
        {
          ...fixture.liveGame,
          abstractState: 'Final',
          cyclonesScore: 72,
          gameDate: finalDate.toISOString(),
          gamePk: fixture.liveGame.gamePk + 1,
          officialDate: today,
          opponentScore: 66,
          scoreboard: undefined,
          sport: 'mens-basketball',
          status: 'Final',
        },
        ...futureGames,
      ],
      wins: fixture.wins,
    };
  }

  if (scenario === 'live' || scenario === 'live-basketball') {
    const gameDate = new Date(now - 90 * 60_000);
    return {
      boardFlags: fixture.boardFlags,
      liveGame: {
        ...fixture.liveGame,
        gameDate: gameDate.toISOString(),
        officialDate: chicagoDateString(gameDate),
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
    officialDate: chicagoDateString(gameDate),
    cyclonesScore: 0,
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

  if (request.method === 'GET' && requestUrl.pathname === '/cyclones') {
    try {
      const scenario = requestUrl.searchParams.get('scenario') ?? 'live';
      if (!validScenarios.has(scenario)) {
        response.writeHead(400, {
          'Content-Type': 'text/plain; charset=utf-8',
        });
        response.end('Unknown Cyclones scenario');
        return;
      }
      const fixture = await readFixtureDocument(scenario);
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      response.end(JSON.stringify(snapshotForScenario(fixture, scenario)));
    } catch {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Invalid Cyclones fixture');
    }
    return;
  }

  if (
    request.method === 'GET' &&
    requestUrl.pathname === '/cyclones-sources.json'
  ) {
    try {
      const fixture = await readFixtureDocument(
        requestUrl.searchParams.get('scenario'),
      );
      const gameDate = chicagoDateString(new Date());
      const streams = fixture.streams.map((stream) => ({
        allowInsecureHttp: stream.allowInsecureHttp ?? false,
        gameDates: [gameDate],
        gameNumbers: [1],
        kind: stream.kind,
        sport: stream.sport ?? 'football',
        trustedHosts: stream.trustedHosts ?? [],
        url: stream.url,
      }));
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      response.end(JSON.stringify({ streams }));
    } catch {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Invalid Cyclones stream fixture');
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
    response.end('<!doctype html><html><body>Cyclones popup fixture</body></html>');
    return;
  }

  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`Cyclones harness listening on http://localhost:${port}\n`);
});

const stop = () => server.close(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
