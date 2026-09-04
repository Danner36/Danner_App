import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const harnessDirectory = fileURLToPath(new URL('.', import.meta.url));
const appDirectory = fileURLToPath(new URL('../../app/', import.meta.url));
const expoCliPath = fileURLToPath(
  new URL('../../app/node_modules/expo/bin/cli', import.meta.url),
);
const serverPath = fileURLToPath(new URL('./server.mjs', import.meta.url));
const sdkRoot = process.env.ANDROID_HOME
  ?? process.env.ANDROID_SDK_ROOT
  ?? path.join(homedir(), 'AppData', 'Local', 'Android', 'Sdk');
const adbPath = path.join(sdkRoot, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const emulatorPath = path.join(
  sdkRoot,
  'emulator',
  process.platform === 'win32' ? 'emulator.exe' : 'emulator',
);
const packageName = 'com.example.location_helper';
const metroPort = 8081;

const loadMediaUrls = (logs) => {
  const joined = logs.replace(/\r?\n/g, ' ');
  return [...joined.matchAll(/\[DannerCast\] loadMedia\s+(\S+)/g)].map((match) => match[1]);
};

const converterPlayback = (logs) => {
  if (!logs.includes('[DannerCast] converter')) {
    return undefined;
  }
  if (logs.includes('[DannerCast] discovered')) {
    return undefined;
  }
  const joined = logs.replace(/\r?\n/g, ' ');
  const loadAt = joined.lastIndexOf('[DannerCast] loadMedia');
  if (loadAt < 0) {
    return undefined;
  }
  const afterLoad = joined.slice(loadAt);
  const urls = loadMediaUrls(afterLoad);
  const live = urls.filter(
    (url) => url.includes('/live.m3u8') || url.includes('/live.mp4'),
  );
  if (live.length === 0) {
    return undefined;
  }
  if (urls.some((url) => !url.includes('/live.m3u8') && !url.includes('/live.mp4'))) {
    return undefined;
  }
  if (afterLoad.includes('idleReason=error')) {
    return undefined;
  }
  const states = [...afterLoad.matchAll(/\[DannerCast\] playerState (\S+)/g)].map(
    (match) => match[1],
  );
  if (!states.includes('playing')) {
    return undefined;
  }
  return live.at(-1);
};

const children = [];
let startedServer;
let startedMetro;
let startedNativeBuild;
let reusedMetro = false;
let reusedServer = false;
let passed = false;
let report = '';

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
    throw new Error(result.stderr.trim() || result.stdout.trim() || args.join(' '));
  }
  return result.stdout;
};

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

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
  await run(adbPath, ['shell', 'uiautomator', 'dump', '/data/local/tmp/uidump.xml']);
  const result = await run(adbPath, ['exec-out', 'cat', '/data/local/tmp/uidump.xml']);
  return result.stdout || result.stderr;
};

const dumpLabels = async () => {
  try {
    const xml = await dumpUi();
    const descs = [...xml.matchAll(/content-desc="([^"]+)"/g)].map((match) => match[1]);
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

const hasDesc = (needle) => (node) =>
  node.includes(`content-desc="${needle}"`);
const hasText = (needle) => (node) => node.includes(`text="${needle}"`);

const tapIfPresent = async (label, predicate) => {
  try {
    await tapNode(label, predicate);
    return true;
  } catch {
    return false;
  }
};

const dismissCaptureSheet = async () => {
  await tapIfPresent('Entire screen', hasText('Entire screen'));
  await tapIfPresent('Start now', hasText('Start now'));
  await tapIfPresent('Allow', hasText('Allow'));
  await tapIfPresent('Share screen', hasText('Share screen'));
  await tapIfPresent('Living Room TV', hasText('Living Room TV'));
  await tapIfPresent('Living Room TV', hasDesc('Living Room TV'));
};

const firstDeviceSerial = async () => {
  const listed = await run(adbPath, ['devices']);
  const match = /^(\S+)\s+device$/m.exec(
    listed.stdout
      .split('\n')
      .slice(1)
      .join('\n'),
  );
  return match?.[1];
};

const ensureDevice = async () => {
  const existing = process.env.ANDROID_SERIAL || await firstDeviceSerial();
  if (existing) {
    return existing;
  }
  spawn(emulatorPath, ['-avd', 'Pixel_7_API_34', '-netdelay', 'none', '-netspeed', 'full'], {
    detached: true,
    stdio: 'ignore',
  }).unref();
  await waitFor('emulator', 180_000, async () => {
    const listed = await run(adbPath, ['devices']);
    return listed.stdout.includes('\tdevice');
  });
  await waitFor('boot', 180_000, async () => {
    const boot = await run(adbPath, ['shell', 'getprop', 'sys.boot_completed']);
    return boot.stdout.trim() === '1';
  });
  return process.env.ANDROID_SERIAL || await firstDeviceSerial();
};

const healthyHttp = async (url) => {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
};

const findHarnessPort = async () => {
  for (const port of [8109, 8108]) {
    if (await healthyHttp(`http://127.0.0.1:${port}/health`)) {
      return port;
    }
  }
  return undefined;
};

const readLogcat = async () => {
  const result = await run(adbPath, ['logcat', '-d']);
  return `${result.stdout}\n${result.stderr}`;
};

const packageInstalled = async () => {
  const result = await run(adbPath, ['shell', 'pm', 'path', packageName]);
  return result.code === 0 && result.stdout.includes(packageName);
};

const screenSize = async () => {
  const output = await adb(['shell', 'wm', 'size']);
  const match = /(\d+)x(\d+)/.exec(output);
  return {
    width: match ? Number(match[1]) : 1080,
    height: match ? Number(match[2]) : 1920,
  };
};

const swipeUp = async () => {
  const size = await screenSize();
  const x = Math.round(size.width / 2);
  const fromY = Math.round(size.height * 0.72);
  const toY = Math.round(size.height * 0.38);
  await adb(['shell', 'input', 'swipe', String(x), String(fromY), String(x), String(toY), '350']);
};

const grantCapture = async () => {
  await run(adbPath, ['shell', 'pm', 'grant', packageName, 'android.permission.RECORD_AUDIO']).catch(
    () => {},
  );
  await run(adbPath, [
    'shell',
    'pm',
    'grant',
    packageName,
    'android.permission.POST_NOTIFICATIONS',
  ]).catch(() => {});
  await run(adbPath, ['shell', 'cmd', 'appops', 'set', packageName, 'PROJECT_MEDIA', 'allow']).catch(
    () => {},
  );
};

try {
  let harnessPort = await findHarnessPort();
  if (harnessPort) {
    reusedServer = true;
  } else {
    harnessPort = 8108;
    startedServer = spawnTracked(process.execPath, [serverPath], {
      cwd: harnessDirectory,
      env: {
        ...process.env,
        GUARDIANS_HARNESS_PORT: String(harnessPort),
      },
      stdio: 'inherit',
    });
    await waitFor('harness', 8_000, () =>
      healthyHttp(`http://127.0.0.1:${harnessPort}/health`),
    );
  }

  const serial = await ensureDevice();
  if (!serial) {
    throw new Error('No Android device');
  }

  const emulator = serial.startsWith('emulator-');
  const deviceHost = emulator ? '10.0.2.2' : '127.0.0.1';
  const harnessUrl = `http://${deviceHost}:${harnessPort}/guardians?scenario=live`;
  const sourcesUrl = `http://${deviceHost}:${harnessPort}/guardians-sources.json`;

  if (await healthyHttp(`http://127.0.0.1:${metroPort}/status`)) {
    reusedMetro = true;
  } else {
    startedMetro = spawnTracked(
      process.execPath,
      [expoCliPath, 'start', '--dev-client', '--port', String(metroPort)],
      {
        cwd: appDirectory,
        env: {
          ...process.env,
          EXPO_NO_TELEMETRY: '1',
          EXPO_PUBLIC_GUARDIANS_SOURCES_URL: sourcesUrl,
          EXPO_PUBLIC_GUARDIANS_TEST_URL: harnessUrl,
        },
        stdio: 'inherit',
      },
    );
    await waitFor('metro', 60_000, () =>
      healthyHttp(`http://127.0.0.1:${metroPort}/status`),
    );
  }

  if (!(await packageInstalled())) {
    startedNativeBuild = spawnTracked(
      process.execPath,
      [expoCliPath, 'run:android', '--no-bundler'],
      {
        cwd: appDirectory,
        env: {
          ...process.env,
          ANDROID_SERIAL: serial,
          EXPO_NO_TELEMETRY: '1',
          EXPO_PUBLIC_GUARDIANS_SOURCES_URL: sourcesUrl,
          EXPO_PUBLIC_GUARDIANS_TEST_URL: harnessUrl,
        },
        stdio: 'inherit',
      },
    );
    const buildCode = await waitForExit(startedNativeBuild, 'Android build');
    if (buildCode !== 0) {
      throw new Error(`Android build exited with code ${buildCode}.`);
    }
  }

  await grantCapture();
  await adb(['reverse', `tcp:${metroPort}`, `tcp:${metroPort}`]).catch(() => {});
  await adb(['reverse', `tcp:${harnessPort}`, `tcp:${harnessPort}`]).catch(() => {});
  await adb(['logcat', '-c']);
  await adb(['shell', 'am', 'force-stop', packageName]);
  await adb(['shell', 'am', 'start', '-n', `${packageName}/.MainActivity`]);

  await waitFor('Guardians tile', 90_000, async () => {
    await tapIfPresent('Continue', hasText('Continue'));
    await tapIfPresent('Reload', hasText('RELOAD\n(R, R)'));
    await tapIfPresent('Reload short', (node) => node.includes('text="RELOAD'));
    return tapIfPresent('Guardians', hasDesc('Cleveland Guardians'));
  }).catch(async (error) => {
    throw new Error(`${error.message}. ${await dumpLabels()}`);
  });
  await sleep(2_000);
  await waitFor('capture pattern play', 30_000, async () => {
    if (await tapIfPresent('Play video 6', hasDesc('Play video 6'))) {
      return true;
    }
    await swipeUp();
    return false;
  }).catch(async (error) => {
    throw new Error(`${error.message}. ${await dumpLabels()}`);
  });
  await sleep(2_000);
  await adb(['logcat', '-c']);
  await waitFor('Send to TV', 20_000, () =>
    tapIfPresent('Send to TV', hasDesc('Send to TV')),
  ).catch(async (error) => {
    throw new Error(`${error.message}. ${await dumpLabels()}`);
  });

  const logs = await waitFor('converter playing', 70_000, async () => {
    await dismissCaptureSheet();
    const current = await readLogcat();
    if (current.includes('[DannerCast] discovered')) {
      throw new Error('Page reported a URL; converter path was not used.');
    }
    return converterPlayback(current) ? current : undefined;
  }).catch(async (error) => {
    throw new Error(`${error.message}. ${await dumpLabels()}`);
  });

  report = [
    'page Play video 6',
    `loadMedia ${converterPlayback(logs)}`,
    'playerState playing',
    'converter origin',
  ].join('\n');
  passed = true;
  process.stdout.write(`${report}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
} finally {
  if (startedNativeBuild && !startedNativeBuild.killed) {
    startedNativeBuild.kill();
  }
  if (startedMetro && !reusedMetro && !startedMetro.killed) {
    startedMetro.kill();
  }
  if (startedServer && !reusedServer && !startedServer.killed) {
    startedServer.kill();
  }
  for (const child of children) {
    if (!child.killed && child !== startedMetro && child !== startedServer) {
      child.kill();
    }
  }
}

if (passed) {
  process.exitCode = 0;
}
