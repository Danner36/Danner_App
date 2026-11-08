import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

// Fixture server for the team-screen device harness: GET /team and GET /sources.json, keyed by
// team key, plus the page and media routes the playback drivers use. POST /control sets the scenario
// that requests without one read, so one development bundle serves every scenario.

const port = Number.parseInt(process.env.TEAM_HARNESS_PORT ?? '8108', 10);
const fixtureDirectory = new URL('./fixtures/', import.meta.url);
const appleMediaRoot = new URL(
  'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/',
);
const TEAM_KEYS = new Set(['mlb-5', 'nfl-17', 'ncaa-66']);
const validScenarios = new Set([
  'delayed',
  'final',
  'live',
  'live-basketball',
  'ready',
  'today',
  'two-games',
]);
let currentScenario = 'live';

async function readFixture(teamKey, scenario) {
  const name =
    teamKey === 'ncaa-66' && (scenario === 'live-basketball' || scenario === 'two-games')
      ? 'live-basketball'
      : teamKey;
  return JSON.parse(await readFile(new URL(`${name}.fixture.json`, fixtureDirectory), 'utf8'));
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

// The app shows an MLB Final recap only on the phone's local official date. The harness host's zone
// stands in for the phone's; run this server with TZ set to match a phone elsewhere.
function localDateString(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// Every official date a scenario can assign at this moment. Near Eastern midnight a live game that
// started 90 minutes ago, a game starting in 45 minutes, and the recap can each fall on a different
// date, and the stream entry must match whichever one is featured.
function scenarioOfficialDates(now) {
  return [
    ...new Set([
      easternDateString(new Date(now - 90 * 60_000)),
      easternDateString(new Date(now)),
      easternDateString(new Date(now + 10 * 60_000)),
      easternDateString(new Date(now + 45 * 60_000)),
      localDateString(new Date(now)),
    ]),
  ];
}

function recordsFor(teamKey, fixture) {
  const record = { losses: fixture.losses, ties: fixture.ties ?? 0, wins: fixture.wins };
  if (teamKey === 'ncaa-66') {
    return {
      'ncaa/football': record,
      'ncaa/mens-basketball': { losses: 0, ties: 0, wins: 0 },
      'ncaa/womens-basketball': { losses: 0, ties: 0, wins: 0 },
    };
  }
  return { [teamKey === 'mlb-5' ? 'mlb' : 'nfl']: record };
}

function snapshotForScenario(teamKey, fixture, scenario) {
  const now = Date.now();
  const records = recordsFor(teamKey, fixture);
  const futureGames = fixture.upcomingGames.map((game, index) => {
    const gameDate = new Date(now + (index + 1) * 86_400_000);
    return { ...game, gameDate: gameDate.toISOString(), officialDate: easternDateString(gameDate) };
  });

  if (scenario === 'final') {
    const gameDate = new Date(now - 4 * 60 * 60_000);
    return {
      liveGame: {
        ...fixture.liveGame,
        abstractState: 'Final',
        board: undefined,
        gameDate: gameDate.toISOString(),
        officialDate: localDateString(new Date(now)),
        opponentScore: 3,
        status: 'Final',
        teamScore: 7,
      },
      records,
      upcomingGames: futureGames,
    };
  }

  // The live basketball game plus a men's basketball final from earlier the same day: two cards.
  if (scenario === 'two-games') {
    const liveDate = new Date(now - 60 * 60_000);
    const finalDate = new Date(now - 3 * 60 * 60_000);
    return {
      boardFlags: fixture.boardFlags,
      liveGame: {
        ...fixture.liveGame,
        gameDate: liveDate.toISOString(),
        officialDate: easternDateString(liveDate),
      },
      records,
      upcomingGames: [
        {
          ...fixture.liveGame,
          abstractState: 'Final',
          board: undefined,
          gameDate: finalDate.toISOString(),
          gameId: String(Number(fixture.liveGame.gameId) + 1),
          officialDate: easternDateString(finalDate),
          opponentScore: 66,
          sport: 'mens-basketball',
          status: 'Final',
          teamScore: 72,
        },
        ...futureGames,
      ],
    };
  }

  if (scenario === 'live' || scenario === 'live-basketball') {
    const gameDate = new Date(now - 90 * 60_000);
    return {
      boardFlags: fixture.boardFlags,
      liveGame: {
        ...fixture.liveGame,
        gameDate: gameDate.toISOString(),
        officialDate: easternDateString(gameDate),
      },
      records,
      upcomingGames: futureGames,
    };
  }

  const startsInMinutes = scenario === 'ready' ? 10 : 45;
  const gameDate = new Date(now + startsInMinutes * 60_000);
  const todayGame = {
    ...fixture.liveGame,
    abstractState: 'Preview',
    board: undefined,
    gameDate: gameDate.toISOString(),
    officialDate: easternDateString(gameDate),
    opponentScore: 0,
    status: scenario === 'delayed' ? 'Delayed Start' : 'Scheduled',
    teamScore: 0,
  };
  return { records, upcomingGames: [todayGame, ...futureGames] };
}

function scenarioFrom(requestUrl) {
  return requestUrl.searchParams.get('scenario') ?? currentScenario;
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

  if (request.method === 'POST' && requestUrl.pathname === '/control') {
    const scenario = requestUrl.searchParams.get('scenario') ?? '';
    if (!validScenarios.has(scenario)) {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Unknown scenario');
      return;
    }
    currentScenario = scenario;
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/team') {
    try {
      const teamKey = requestUrl.searchParams.get('team') ?? '';
      const scenario = scenarioFrom(requestUrl);
      if (!TEAM_KEYS.has(teamKey) || !validScenarios.has(scenario)) {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Unknown team or scenario');
        return;
      }
      const fixture = await readFixture(teamKey, scenario);
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(snapshotForScenario(teamKey, fixture, scenario)));
    } catch {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Invalid fixture');
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/sources.json') {
    try {
      const teamKey = requestUrl.searchParams.get('team') ?? '';
      const scenario = scenarioFrom(requestUrl);
      const fixture = await readFixture(teamKey, scenario);
      const gameDates = scenarioOfficialDates(Date.now());
      const advertisedHost = request.headers.host ?? `10.0.2.2:${port}`;
      const streams = fixture.streams.map((stream) => ({
        allowInsecureHttp: stream.allowInsecureHttp ?? false,
        gameDates,
        gameNumbers: [1],
        kind: stream.kind,
        ...(teamKey === 'ncaa-66' ? { sport: stream.sport ?? fixture.liveGame.sport ?? 'football' } : {}),
        trustedHosts: stream.trustedHosts ?? [],
        url: stream.url.replaceAll('10.0.2.2:8108', advertisedHost),
      }));
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ streams }));
    } catch {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Invalid stream fixture');
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

  if (
    request.method === 'GET' &&
    requestUrl.pathname === '/native-hls-player'
  ) {
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
    });
    response.end(`<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Cast web source</title>
        </head>
        <body style="background:#000;margin:0">
          <div style="color:#fff;font:16px sans-serif;left:12px;position:absolute;top:12px;z-index:2">Cast web source</div>
          <video
            controls
            playsinline
            preload="metadata"
            src="https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8"
            style="height:100vh;width:100%"
            x-webkit-airplay="allow"
          ></video>
          <script>
            fetch('https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8');
          </script>
        </body>
      </html>`);
    return;
  }

  if (
    request.method === 'GET' &&
    requestUrl.pathname === '/capture-pattern'
  ) {
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
    });
    response.end(`<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Convert source</title>
        </head>
        <body style="background:#081f37;margin:0">
          <div style="color:#fff;font:16px sans-serif;left:12px;position:absolute;top:12px;z-index:2">Convert source</div>
          <canvas id="board" style="display:block;height:100vh;width:100%"></canvas>
          <script>
            const board = document.getElementById('board');
            const context = board.getContext('2d');
            let x = 40;
            let y = 80;
            let dx = 4;
            let dy = 3;
            const audio = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audio.createOscillator();
            const gain = audio.createGain();
            oscillator.frequency.value = 440;
            gain.gain.value = 0.05;
            oscillator.connect(gain);
            gain.connect(audio.destination);
            oscillator.start();
            document.addEventListener('click', () => audio.resume(), { once: true });
            audio.resume();
            function draw(now) {
              board.width = board.clientWidth;
              board.height = board.clientHeight;
              x += dx;
              y += dy;
              if (x < 20 || x > board.width - 20) dx *= -1;
              if (y < 20 || y > board.height - 20) dy *= -1;
              context.fillStyle = '#081f37';
              context.fillRect(0, 0, board.width, board.height);
              context.fillStyle = '#E31937';
              context.fillRect(x - 36, y - 36, 72, 72);
              context.fillStyle = '#F7F7F2';
              context.font = '32px sans-serif';
              context.fillText(new Date().toISOString(), 24, 48);
              requestAnimationFrame(draw);
            }
            requestAnimationFrame(draw);
          </script>
        </body>
      </html>`);
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
  process.stdout.write(`Team harness listening on http://localhost:${port}\n`);
});

const stop = () => server.close(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
