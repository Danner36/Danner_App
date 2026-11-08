// Shared helpers of the team-screen device drivers: adb, UI dumps, Metro and app launch.
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const appDirectory = fileURLToPath(new URL('../../app/', import.meta.url));
export const expoCliPath = fileURLToPath(
  new URL('../../app/node_modules/expo/bin/cli', import.meta.url),
);
export const packageName = 'com.example.location_helper';
export const metroPort = 8081;
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

export const TILE_LABELS = {
  'mlb-5': 'Cleveland Guardians',
  'ncaa-66': 'Iowa State Cyclones',
  'nfl-17': 'New England Patriots',
};

const children = [];

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, ...options });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code: code ?? 1, stderr, stdout }));
  });

export const adb = async (args) => {
  const result = await run(adbPath, args);
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || args.join(' '));
  }
  return result.stdout;
};

export const waitFor = async (label, timeoutMs, check) => {
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

export const spawnTracked = (command, args, options) => {
  const child = spawn(command, args, options);
  children.push(child);
  return child;
};

export const killChildren = () => {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
};

export const waitForExit = (child, label) =>
  new Promise((resolve, reject) => {
    child.once('error', (error) =>
      reject(new Error(`${label} could not start: ${error.message}`)),
    );
    child.once('exit', (code) => resolve(code ?? 1));
  });

export const ensureEmulator = async () => {
  const devices = await run(adbPath, ['devices']);
  if (devices.stdout.includes('\tdevice')) {
    return;
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
};

export const dumpUi = async () => {
  await run(adbPath, ['shell', 'uiautomator', 'dump', '/data/local/tmp/uidump.xml']);
  const result = await run(adbPath, ['exec-out', 'cat', '/data/local/tmp/uidump.xml']);
  return result.stdout || result.stderr;
};

const unescapeXml = (value) =>
  value
    .replaceAll('&#10;', '\n')
    .replaceAll('&apos;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');

export const parseNodes = (xml) =>
  (xml.match(/<node\b[^>]*>/g) ?? []).map((node) => {
    const attribute = (name) => {
      const match = new RegExp(`${name}="([^"]*)"`).exec(node);
      return match ? unescapeXml(match[1]) : '';
    };
    const boundsMatch = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(attribute('bounds'));
    return {
      bounds: boundsMatch
        ? {
            bottom: Number(boundsMatch[4]),
            left: Number(boundsMatch[1]),
            right: Number(boundsMatch[3]),
            top: Number(boundsMatch[2]),
          }
        : undefined,
      desc: attribute('content-desc'),
      text: attribute('text'),
    };
  });

export const labelsOf = (nodes) => nodes.flatMap((node) => [node.desc, node.text]).filter(Boolean);

export const dumpNodes = async () => parseNodes(await dumpUi());

export const tapNode = async (node) => {
  await adb([
    'shell',
    'input',
    'tap',
    String(Math.round((node.bounds.left + node.bounds.right) / 2)),
    String(Math.round((node.bounds.top + node.bounds.bottom) / 2)),
  ]);
};

// Taps the first node whose label satisfies `match`. False when none is on screen.
export const tapIfPresent = async (match) => {
  const node = (await dumpNodes()).find(
    (entry) => entry.bounds && (match(entry.desc) || match(entry.text)),
  );
  if (!node) {
    return false;
  }
  await tapNode(node);
  return true;
};

const relaunchKeys = async () => {
  await adb(['shell', 'input', 'keyevent', '224']).catch(() => {});
  await adb(['shell', 'wm', 'dismiss-keyguard']).catch(() => {});
};

export const startMetro = async (env) => {
  try {
    const existing = await fetch(`http://127.0.0.1:${metroPort}/status`);
    if (existing.ok) {
      throw new Error(`Metro port ${metroPort} is already in use.`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('already in use')) {
      throw error;
    }
  }
  const metro = spawnTracked(
    process.execPath,
    [expoCliPath, 'start', '--port', String(metroPort)],
    { cwd: appDirectory, env, stdio: 'ignore' },
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
  return metro;
};

// Installs the native build through Expo. `SKIP_ANDROID_BUILD=1` uses the app already installed.
export const buildAndroid = async (env) => {
  if (process.env.SKIP_ANDROID_BUILD === '1') {
    return;
  }
  const nativeBuild = spawnTracked(
    process.execPath,
    [expoCliPath, 'run:android', '--no-bundler'],
    { cwd: appDirectory, env, stdio: 'inherit' },
  );
  const buildCode = await waitForExit(nativeBuild, 'Android build');
  if (buildCode !== 0) {
    throw new Error(`Android build exited with code ${buildCode}.`);
  }
};

export const reversePorts = async (ports) => {
  for (const port of ports) {
    await adb(['reverse', `tcp:${port}`, `tcp:${port}`]).catch(() => {});
  }
};

// Starts the app from cold and waits for the hub, answering the development bundler's prompts.
export const launchApp = async (tileLabel) => {
  await relaunchKeys();
  await adb(['shell', 'am', 'force-stop', packageName]);
  await adb(['shell', 'am', 'start', '-n', `${packageName}/.MainActivity`]);
  await waitFor(`hub tile ${tileLabel}`, 300_000, async () => {
    const nodes = await dumpNodes();
    if (nodes.some((node) => node.desc === tileLabel)) {
      return true;
    }
    for (const label of ['Continue', 'RELOAD']) {
      const node = nodes.find((entry) => entry.bounds && entry.text.startsWith(label));
      if (node) {
        await tapNode(node);
      }
    }
    return false;
  }).catch(async (error) => {
    throw new Error(`${error.message}. labels=${labelsOf(await dumpNodes()).join('|')}`);
  });
};

export const openTile = async (tileLabel) => {
  await waitFor(`open ${tileLabel}`, 120_000, async () => {
    const labels = labelsOf(await dumpNodes());
    if (labels.includes('Return to Danner Apps')) {
      return true;
    }
    await tapIfPresent((label) => label === tileLabel);
    await sleep(1_500);
    return false;
  });
};
