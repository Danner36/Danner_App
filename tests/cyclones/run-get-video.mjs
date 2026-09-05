import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = fileURLToPath(new URL('../../app/', import.meta.url));
const expoCliPath = fileURLToPath(
  new URL('../../app/node_modules/expo/bin/cli', import.meta.url),
);
const sdkRoot =
  process.env.ANDROID_HOME ??
  process.env.ANDROID_SDK_ROOT ??
  path.join(homedir(), 'AppData', 'Local', 'Android', 'Sdk');
const adbPath = path.join(
  sdkRoot,
  'platform-tools',
  process.platform === 'win32' ? 'adb.exe' : 'adb',
);
const emulatorPath = path.join(
  sdkRoot,
  'emulator',
  process.platform === 'win32' ? 'emulator.exe' : 'emulator',
);
const packageName = 'com.example.location_helper';
const metroPort = 8081;
const port = 8113;
const familyPin = 'debug-pin';
const staleMs = 12_000;

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

const officialDate = chicagoDateString(new Date());
const publishedStream = {
  allowInsecureHttp: false,
  gameDates: [officialDate],
  gameNumbers: [1],
  kind: 'web',
  sport: 'football',
  trustedHosts: [],
  url: 'https://example.com/cyclones-stream',
};
let publishedAt = 0;

const children = [];

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      ...options,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });

const adb = async (args) => {
  const result = await run(adbPath, args);
  if (result.code !== 0) {
    throw new Error(
      result.stderr.trim() || result.stdout.trim() || args.join(' '),
    );
  }
  return result.stdout;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (label, timeoutMs, check) => {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await check();
      if (value) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(400);
  }
  throw new Error(lastError ? `${label}: ${lastError.message}` : label);
};

const spawnTracked = (command, args, options) => {
  const child = spawn(command, args, options);
  children.push(child);
  return child;
};

const waitForExit = (child, label) =>
  new Promise((resolve, reject) => {
    child.once('error', (error) =>
      reject(new Error(`${label} could not start: ${error.message}`)),
    );
    child.once('exit', (code) => resolve(code ?? 1));
  });

const parseBounds = (value) => {
  const match = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(value);
  if (!match) {
    return undefined;
  }
  return {
    x: Math.round((Number(match[1]) + Number(match[3])) / 2),
    y: Math.round((Number(match[2]) + Number(match[4])) / 2),
  };
};

const dumpUi = async () => {
  await run(adbPath, [
    'shell',
    'uiautomator',
    'dump',
    '/data/local/tmp/uidump.xml',
  ]);
  const result = await run(adbPath, [
    'exec-out',
    'cat',
    '/data/local/tmp/uidump.xml',
  ]);
  return result.stdout || result.stderr;
};

const dumpLabels = async () => {
  try {
    const xml = await dumpUi();
    const descs = [...xml.matchAll(/content-desc="([^"]+)"/g)].map(
      (match) => match[1],
    );
    const texts = [...xml.matchAll(/text="([^"]+)"/g)].map((match) => match[1]);
    return `descs=${descs.filter(Boolean).join('|')} texts=${texts.filter(Boolean).join('|')}`;
  } catch (error) {
    return error instanceof Error ? error.message : 'dump failed';
  }
};

const nodeCenter = (xml, predicate) => {
  const nodes = xml.match(/<node\b[^>]*>/g) ?? [];
  for (const node of nodes) {
    if (!predicate(node)) {
      continue;
    }
    const bounds = /bounds="([^"]+)"/.exec(node);
    if (!bounds) {
      continue;
    }
    const center = parseBounds(bounds[1]);
    if (center) {
      return center;
    }
  }
  return undefined;
};

const tapNode = async (label, predicate) => {
  const xml = await dumpUi();
  const center = nodeCenter(xml, predicate);
  if (!center) {
    throw new Error(`No on-screen control for ${label}`);
  }
  await adb(['shell', 'input', 'tap', String(center.x), String(center.y)]);
};

const tapIfPresent = async (label, predicate) => {
  try {
    await tapNode(label, predicate);
    return true;
  } catch {
    return false;
  }
};

const hasDesc = (needle) => (node) => node.includes(`content-desc="${needle}"`);
const hasText = (needle) => (node) => node.includes(`text="${needle}"`);

const sourcesReady = () => publishedAt > 0 && Date.now() >= publishedAt;

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

const startServer = () =>
  new Promise((resolve) => {
    const server = createServer(async (request, response) => {
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Cache-Control', 'no-store');
      const requestUrl = new URL(
        request.url ?? '/',
        `http://localhost:${port}`,
      );

      if (request.method === 'GET' && requestUrl.pathname === '/health') {
        response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('ok');
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/cyclones') {
        const now = Date.now();
        response.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
        });
        response.end(
          JSON.stringify({
            liveGame: {
              abstractState: 'Live',
              gamePk: 401856779,
              gameDate: new Date(now - 90 * 60_000).toISOString(),
              gameNumber: 1,
              status: 'Q2 8:42',
              isHome: true,
              cyclonesScore: 21,
              opponentName: 'Southeast Missouri State Redhawks',
              opponentScore: 7,
              officialDate,
              seasonType: 2,
              sport: 'football',
              timeValid: true,
              notes: '',
              scoreboard: {
                kind: 'football',
                status: 'Q2 8:42',
                clock: '8:42',
                period: 2,
                down: 2,
                distance: 7,
                situation: '2nd & 7 at SEMO 33',
                possessionTeamId: 66,
                away: { points: 7, periods: [0, 7] },
                home: { points: 21, periods: [14, 7] },
              },
            },
            losses: 0,
            ties: 0,
            upcomingGames: [],
            wins: 0,
          }),
        );
        return;
      }

      if (
        request.method === 'GET' &&
        (requestUrl.pathname === '/cyclones-sources.json' ||
          requestUrl.pathname === '/streams')
      ) {
        if (
          requestUrl.pathname === '/streams' &&
          requestUrl.searchParams.get('module') !== 'cyclones'
        ) {
          response.writeHead(400, {
            'Content-Type': 'application/json; charset=utf-8',
          });
          response.end(`${JSON.stringify({ error: 'Unknown module.' })}\n`);
          return;
        }
        const streams = sourcesReady() ? [publishedStream] : [];
        response.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
        });
        response.end(JSON.stringify({ streams }));
        return;
      }

      if (request.method === 'POST' && requestUrl.pathname === '/get-video') {
        const body = await readJsonBody(request);
        const pin = typeof body.pin === 'string' ? body.pin : '';
        if (body.module !== 'cyclones') {
          response.writeHead(400, {
            'Content-Type': 'application/json; charset=utf-8',
          });
          response.end(`${JSON.stringify({ error: 'Unknown module.' })}\n`);
          return;
        }
        if (body.sport !== 'football') {
          response.writeHead(400, {
            'Content-Type': 'application/json; charset=utf-8',
          });
          response.end(`${JSON.stringify({ error: 'Unknown sport.' })}\n`);
          return;
        }
        if (pin !== familyPin) {
          response.writeHead(401, {
            'Content-Type': 'application/json; charset=utf-8',
          });
          response.end(`${JSON.stringify({ error: 'Unauthorized.' })}\n`);
          return;
        }
        if (!publishedAt) {
          publishedAt = Date.now() + staleMs;
        }
        response.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
        });
        response.end(
          `${JSON.stringify({ message: 'Pipeline started.', module: 'cyclones', sport: 'football', ok: true })}\n`,
        );
        return;
      }

      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    });
    server.listen(port, '0.0.0.0', () => resolve(server));
  });

const ensureEmulator = async () => {
  const devices = await run(adbPath, ['devices']);
  if (devices.stdout.includes('\tdevice')) {
    return;
  }
  spawn(
    emulatorPath,
    ['-avd', 'Pixel_7_API_34', '-netdelay', 'none', '-netspeed', 'full'],
    {
      detached: true,
      stdio: 'ignore',
    },
  ).unref();
  await waitFor('emulator', 180_000, async () => {
    const listed = await run(adbPath, ['devices']);
    return listed.stdout.includes('\tdevice');
  });
  await waitFor('boot', 180_000, async () => {
    const boot = await run(adbPath, ['shell', 'getprop', 'sys.boot_completed']);
    return boot.stdout.trim() === '1';
  });
};

const harnessUrl = `http://10.0.2.2:${port}/cyclones?scenario=live`;
const sourcesUrl = `http://10.0.2.2:${port}/cyclones-sources.json`;
const getVideoUrl = `http://10.0.2.2:${port}`;

const env = {
  ...process.env,
  EXPO_NO_TELEMETRY: '1',
  EXPO_PUBLIC_CYCLONES_SOURCES_URL: sourcesUrl,
  EXPO_PUBLIC_CYCLONES_TEST_URL: harnessUrl,
  EXPO_PUBLIC_GUARDIANS_FAMILY_PIN: familyPin,
  EXPO_PUBLIC_GUARDIANS_GET_VIDEO_URL: getVideoUrl,
};

let metro;
let nativeBuild;
let server;
let passed = false;

try {
  server = await startServer();
  await waitFor('harness', 8_000, async () => {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    return response.ok;
  });
  await ensureEmulator();

  try {
    const existing = await fetch(`http://127.0.0.1:${metroPort}/status`);
    if (existing.ok) {
      throw new Error(`Metro port ${metroPort} is already in use.`);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('already in use')
    ) {
      throw error;
    }
  }

  metro = spawnTracked(
    process.execPath,
    [expoCliPath, 'start', '--dev-client', '--port', String(metroPort)],
    {
      cwd: appDirectory,
      env,
      stdio: 'inherit',
    },
  );
  await waitFor('metro', 120_000, async () => {
    for (const host of ['127.0.0.1', 'localhost']) {
      try {
        const response = await fetch(`http://${host}:${metroPort}/status`);
        if (response.ok) {
          return true;
        }
      } catch {}
    }
    return false;
  });

  const skipNativeBuild = process.env.SKIP_ANDROID_BUILD === '1';
  if (!skipNativeBuild) {
    nativeBuild = spawnTracked(
      process.execPath,
      [expoCliPath, 'run:android', '--no-bundler'],
      {
        cwd: appDirectory,
        env,
        stdio: 'inherit',
      },
    );
    const buildCode = await waitForExit(nativeBuild, 'Android build');
    if (buildCode !== 0) {
      throw new Error(`Android build exited with code ${buildCode}.`);
    }
  }

  await adb(['reverse', 'tcp:8081', 'tcp:8081']).catch(() => {});
  await adb(['reverse', `tcp:${port}`, `tcp:${port}`]).catch(() => {});
  await adb(['reverse', 'tcp:7664', 'tcp:7664']).catch(() => {});
  await adb(['shell', 'input', 'keyevent', '224']).catch(() => {});
  await adb(['shell', 'wm', 'dismiss-keyguard']).catch(() => {});
  await adb(['shell', 'am', 'force-stop', packageName]);
  const metroUrl = 'http://10.0.2.2:8081';
  await adb([
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    `dannerapp://expo-development-client/?url=${encodeURIComponent(metroUrl)}`,
    packageName,
  ]);

  await waitFor('Cyclones tile', 180_000, async () => {
    await tapIfPresent('Continue', hasText('Continue'));
    await tapIfPresent('Reload', hasText('RELOAD\n(R, R)'));
    await tapIfPresent('Reload short', (node) => node.includes('text="RELOAD'));
    await tapIfPresent('http localhost', hasText('http://localhost:8081'));
    await tapIfPresent('http 10', hasText('http://10.0.2.2:8081'));
    return tapIfPresent('Cyclones', hasDesc('Iowa State Cyclones'));
  }).catch(async (error) => {
    throw new Error(`${error.message}. ${await dumpLabels()}`);
  });

  await waitFor('Get video', 30_000, () =>
    tapIfPresent('Get video', hasDesc('Get video')),
  ).catch(async (error) => {
    throw new Error(`${error.message}. ${await dumpLabels()}`);
  });

  await sleep(4_000);
  await waitFor('stream published', 20_000, () => sourcesReady());
  await sleep(8_000);
  const afterPublish = await dumpLabels();
  const playAfterPublish =
    afterPublish.includes('Play video') &&
    !afterPublish.includes('Getting video');

  if (playAfterPublish) {
    passed = true;
    process.stdout.write('Play appeared after publish without restart.\n');
  } else {
    await adb(['shell', 'am', 'force-stop', packageName]);
    await adb(['shell', 'am', 'start', '-n', `${packageName}/.MainActivity`]);
    await waitFor('Cyclones after restart', 90_000, async () => {
      await tapIfPresent('Continue', hasText('Continue'));
      await tapIfPresent('Reload', hasText('RELOAD\n(R, R)'));
      return tapIfPresent('Cyclones', hasDesc('Iowa State Cyclones'));
    });
    await sleep(4_000);
    const afterRestart = await dumpLabels();
    const playAfterRestart = afterRestart.includes('Play video');
    if (playAfterRestart && !playAfterPublish) {
      process.stdout.write(
        'Play appeared only after restart. In-session poll did not update the card.\n',
      );
    }
    passed = playAfterRestart;
    if (!passed) {
      throw new Error(`Play never appeared. ${afterRestart}`);
    }
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
} finally {
  metro?.kill();
  nativeBuild?.kill();
  server?.close();
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
}

if (passed) {
  process.exitCode = 0;
}
