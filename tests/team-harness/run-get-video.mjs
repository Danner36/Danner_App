// Get video against a Worker v2 mock on port 8111. One app session walks three presses: a run that
// no site has, a run stopped by `too_early`, and a three-site run that stalls on site 1 and succeeds
// on site 3. Each phone text is checked, and Play must appear without a restart.
// Usage: node run-get-video.mjs --team <key>
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import {
  TEST_SELECTION,
  TILE_LABELS,
  adb,
  buildAndroid,
  clearAppData,
  dumpNodes,
  ensureEmulator,
  killChildren,
  labelsOf,
  launchApp,
  openTile,
  reversePorts,
  sleep,
  startMetro,
  tapIfPresent,
  waitFor,
} from './device.mjs';

const teamIndex = process.argv.indexOf('--team');
const teamKey = teamIndex >= 0 ? process.argv[teamIndex + 1] : 'mlb-5';
if (!TILE_LABELS[teamKey]) {
  throw new Error('Pass --team mlb-5|nfl-17|ncaa-66.');
}
const isSchool = teamKey === 'ncaa-66';
const mockPort = 8111;
const fixturePort = 8108;
const appKey = 'debug-app-key';
const PLAY_DELAY_MS = 6_000;
const STALL_MS = 112_000;

const fixture = JSON.parse(
  await readFile(new URL(`./fixtures/${teamKey}.fixture.json`, import.meta.url), 'utf8'),
);
const eventId = fixture.liveGame.gameId;

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
const officialDate = easternDateString(new Date(Date.now() - 90 * 60_000));

const publishedStream = {
  allowInsecureHttp: false,
  eventId,
  gameDates: [officialDate],
  gameNumbers: [1],
  kind: 'web',
  source: 'pipeline',
  ...(isSchool ? { sport: fixture.liveGame.sport ?? 'football' } : {}),
  trustedHosts: [],
  url: 'https://example.com/team-stream',
};

// Each press starts the next script; a step's `at` is milliseconds after the press.
const scripts = [
  [
    { at: 0, runState: 'queued' },
    { at: 6_000, progress: { k: 1, n: 2, step: 'source_start' }, runState: 'queued' },
    { at: 18_000, progress: { k: 2, n: 2, step: 'source_start' }, runState: 'queued' },
    { at: 30_000, runState: 'no_video' },
  ],
  [
    { at: 0, runState: 'queued' },
    { at: 6_000, runState: 'too_early' },
  ],
  [
    { at: 0, runState: 'queued' },
    { at: 6_000, progress: { k: 1, n: 3, step: 'source_start' }, runState: 'queued' },
    { at: 6_000 + STALL_MS, progress: { k: 2, n: 3, step: 'source_start' }, runState: 'queued' },
    { at: 6_000 + STALL_MS + 12_000, progress: { k: 3, n: 3, step: 'source_start' }, runState: 'queued' },
    { at: 6_000 + STALL_MS + 24_000, progress: { k: 3, n: 3, step: 'found' }, runState: 'queued' },
    { at: 6_000 + STALL_MS + 24_000 + PLAY_DELAY_MS * 2, progress: { k: 3, n: 3, step: 'found' }, runState: 'published', stream: true },
  ],
];

let pressCount = 0;
let pressedAt = 0;

function currentStep() {
  if (pressCount === 0) {
    return { runState: 'none' };
  }
  const script = scripts[Math.min(pressCount - 1, scripts.length - 1)];
  const elapsed = Date.now() - pressedAt;
  let active = script[0];
  for (const step of script) {
    if (elapsed >= step.at) {
      active = step;
    }
  }
  return active;
}

const streamsDocument = (step) => ({
  schemaVersion: 2,
  streams: step.stream ? [publishedStream] : [],
  team: { key: teamKey, name: fixture.liveGame.opponentName },
});

const reply = (response, status, body) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(body)}\n`);
};

const readJsonBody = async (request) => {
  try {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
};

const mock = createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store');
  const url = new URL(request.url ?? '/', `http://localhost:${mockPort}`);

  if (request.method === 'GET' && url.pathname === '/health') {
    reply(response, 200, { contract: 2, ok: true });
    return;
  }

  if (request.method === 'GET' && (url.pathname === '/streams' || url.pathname === '/sources.json')) {
    if (url.pathname === '/streams' && url.searchParams.get('team') !== teamKey) {
      reply(response, 400, { code: 'bad_team', ok: false });
      return;
    }
    const step = currentStep();
    if (url.searchParams.get('event')) {
      response.setHeader('X-Run-State', step.runState);
      if (step.progress) {
        response.setHeader(
          'X-Run-Progress',
          JSON.stringify({ ...step.progress, updatedSecondsAgo: 0 }),
        );
      }
    }
    reply(response, 200, streamsDocument(step));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/get-video') {
    const body = await readJsonBody(request);
    if (body.team !== teamKey) {
      reply(response, 400, { code: 'bad_team', ok: false });
      return;
    }
    if (isSchool ? body.sport !== (fixture.liveGame.sport ?? 'football') : body.sport !== undefined) {
      reply(response, 400, { code: 'bad_sport', ok: false });
      return;
    }
    if (body.eventId !== eventId) {
      reply(response, 400, { code: 'bad_event', ok: false });
      return;
    }
    if (body.appKey !== appKey) {
      reply(response, 401, { code: 'unauthorized', ok: false });
      return;
    }
    pressCount += 1;
    pressedAt = Date.now();
    reply(response, 202, { code: 'started', ok: true });
    return;
  }

  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
});

const fixtureServer = spawn(
  process.execPath,
  [fileURLToPath(new URL('./server.mjs', import.meta.url))],
  { stdio: 'ignore' },
);

const env = {
  ...process.env,
  EXPO_NO_TELEMETRY: '1',
  EXPO_PUBLIC_DANNER_APP_KEY: appKey,
  EXPO_PUBLIC_DANNER_WORKER_URL: `http://10.0.2.2:${mockPort}`,
  EXPO_PUBLIC_TEAM_SOURCES_URL: `http://10.0.2.2:${mockPort}/sources.json`,
  EXPO_PUBLIC_TEAM_TEST_URL: `http://10.0.2.2:${fixturePort}/team?scenario=live`,
  EXPO_PUBLIC_TEST_SELECTION: TEST_SELECTION,
};

// Collects labels until `done` is seen, so each short-lived phone text is recorded.
const watchLabels = async (done, timeoutMs, seen) => {
  await waitFor(`labels ${[...seen].join('|')}`, timeoutMs, async () => {
    const labels = labelsOf(await dumpNodes());
    labels.forEach((label) => seen.add(label));
    return labels.some(done);
  });
};

const pressGetVideo = () =>
  waitFor('Get video', 30_000, () => tapIfPresent((label) => label === 'Get video'));

const requireTexts = (seen, texts) => {
  for (const text of texts) {
    assert.ok(seen.has(text), `phone text ${text}; saw ${[...seen].join('|')}`);
  }
};

let passed = false;
try {
  await new Promise((resolve) => mock.listen(mockPort, '0.0.0.0', resolve));
  await waitFor('fixture server', 8_000, async () => {
    const response = await fetch(`http://127.0.0.1:${fixturePort}/health`);
    return response.ok;
  });
  await ensureEmulator();
  await startMetro(env);
  await reversePorts([8081, fixturePort, mockPort, 7664]);
  await buildAndroid(env);
  await clearAppData();
  await reversePorts([8081, fixturePort, mockPort, 7664]);
  const tile = TILE_LABELS[teamKey];
  await launchApp(tile);
  await openTile(tile);

  await pressGetVideo();
  // The progress line and its dots sit under the button; keep them on screen.
  await adb(['shell', 'input', 'swipe', '540', '1700', '540', '1200', '300']).catch(() => {});
  const noVideo = new Set();
  await watchLabels(
    (label) => label === 'No video found. Try again in a few minutes.',
    60_000,
    noVideo,
  );
  requireTexts(noVideo, ['Looking for video (1 of 2)…', 'Looking for video (2 of 2)…']);

  await sleep(500);
  await pressGetVideo();
  const tooEarly = new Set();
  await watchLabels(
    (label) => label === 'Get video opens 15 minutes before the start.',
    60_000,
    tooEarly,
  );

  await sleep(500);
  await pressGetVideo();
  const success = new Set();
  await watchLabels(
    (label) => label.startsWith('Play video'),
    STALL_MS + 120_000,
    success,
  );
  requireTexts(success, [
    'Looking for video (1 of 3)…',
    'Still looking…',
    'Looking for video (2 of 3)…',
    'Looking for video (3 of 3)…',
    'Video found. Getting it ready…',
  ]);
  passed = true;
  process.stdout.write(`PASS Get video ${teamKey}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
} finally {
  killChildren();
  mock.close();
  fixtureServer.kill();
}

if (passed) {
  process.exitCode = 0;
}
