import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const port = Number.parseInt(process.env.GUARDIANS_HARNESS_PORT ?? '8108', 10);
const fixtureUrl = new URL('./live-game.fixture.json', import.meta.url);
const appleMediaRoot = new URL(
  'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/',
);
const validScenarios = new Set(['delayed', 'live', 'ready', 'today']);

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

  if (scenario === 'live') {
    const gameDate = new Date(now - 90 * 60_000);
    return {
      liveGame: {
        ...fixture.liveGame,
        gameDate: gameDate.toISOString(),
        officialDate: easternDateString(gameDate),
      },
      losses: fixture.losses,
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
    guardiansScore: 0,
    opponentScore: 0,
    officialDate: easternDateString(gameDate),
    status: scenario === 'delayed' ? 'Delayed Start' : 'Scheduled',
  };
  return {
    losses: fixture.losses,
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

  if (request.method === 'GET' && requestUrl.pathname === '/guardians') {
    try {
      const scenario = requestUrl.searchParams.get('scenario') ?? 'live';
      if (!validScenarios.has(scenario)) {
        response.writeHead(400, {
          'Content-Type': 'text/plain; charset=utf-8',
        });
        response.end('Unknown Guardians scenario');
        return;
      }
      const fixture = await readFixtureDocument();
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      response.end(JSON.stringify(snapshotForScenario(fixture, scenario)));
    } catch {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Invalid Guardians fixture');
    }
    return;
  }

  if (
    request.method === 'GET' &&
    requestUrl.pathname === '/guardians-sources.json'
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
      response.end('Invalid Guardians stream fixture');
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

  if (request.method === 'GET' && request.url === '/popup-player') {
    response.writeHead(200, {
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
      'Content-Type': 'text/html; charset=utf-8',
    });
    response.end(`<!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            body { background: #081f37; color: white; font-family: sans-serif; margin: 0; padding: 32px 20px; }
            button { display: block; font-size: 20px; margin: 18px 0; min-height: 58px; width: 100%; }
            p { font-size: 18px; line-height: 1.5; }
          </style>
        </head>
        <body>
          <h1>Popup safety test</h1>
          <p id="status">Choose a harness check.</p>
          <button onclick="approvedPopup()">Open approved player popup</button>
          <button onclick="blockedPopup()">Consume unapproved popup</button>
          <button onclick="approvedRedirect()">Follow approved redirect</button>
          <button onclick="blockedRedirect()">Block unapproved redirect</button>
          <script>
            function approvedPopup() {
              document.getElementById('status').textContent = 'Approved popup requested.';
              window.open('/approved-popup', '_blank');
            }
            function blockedPopup() {
              document.getElementById('status').textContent = 'Unapproved popup was requested. This page should remain visible.';
              window.open('https://example.com/unapproved-popup', '_blank');
            }
            function approvedRedirect() {
              window.location.assign('/approved-redirect');
            }
            function blockedRedirect() {
              document.getElementById('status').textContent = 'Unapproved redirect was requested. This page should remain visible.';
              window.location.assign('/blocked-redirect');
            }
          </script>
        </body>
      </html>`);
    return;
  }

  if (
    request.method === 'GET' &&
    (request.url === '/approved-popup' || request.url === '/approved-redirect')
  ) {
    response.writeHead(302, { Location: '/approved-player' });
    response.end();
    return;
  }

  if (request.method === 'GET' && request.url === '/approved-player') {
    response.writeHead(200, {
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'Content-Type': 'text/html; charset=utf-8',
    });
    response.end(`<!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            body { align-items: center; background: #081f37; color: white; display: flex; font-family: sans-serif; justify-content: center; margin: 0; min-height: 100vh; text-align: center; }
            h1 { font-size: 30px; padding: 24px; }
          </style>
        </head>
        <body><h1>Approved player opened safely</h1></body>
      </html>`);
    return;
  }

  if (request.method === 'GET' && request.url === '/blocked-redirect') {
    response.writeHead(302, { Location: 'https://example.com/unapproved-redirect' });
    response.end();
    return;
  }

  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`Guardians harness listening on http://localhost:${port}\n`);
});

const stop = () => server.close(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
