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
const harnessUrl = 'http://10.0.2.2:8108/guardians?scenario=live';
const sourcesUrl = 'http://10.0.2.2:8108/guardians-sources.json';
const metroPort = 8081;

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

const hasDesc = (needle) => (node) =>
  new RegExp(`content-desc="${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(node);
const hasText = (needle) => (node) =>
  new RegExp(`text="${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(node);
const isPermissionDeny = (node) =>
  node.includes('permission_deny_button') ||
  hasText('Deny')(node) ||
  /text="Don.t allow"/i.test(node) ||
  /text="Don.t Allow"/i.test(node);

const ensureEmulator = async () => {
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

const waitForRenderedUi = async () => {
  await waitFor('rendered UI', 120_000, async () => {
    const labels = await dumpLabels();
    return labels.includes('Cleveland Guardians') ||
      labels.includes('Continue') ||
      labels.includes('Play video') ||
      labels.includes('RELOAD');
  });
};

const openGuardians = async (label) => {
  await waitForRenderedUi();
  await waitFor(label, 180_000, async () => {
    await tapIfPresent('Continue', hasText('Continue'));
    await tapIfPresent('Reload', hasText('RELOAD\n(R, R)'));
    await tapIfPresent('Reload short', (node) => node.includes('text="RELOAD'));
    await tapIfPresent('http localhost', hasText('http://localhost:8081'));
    await tapIfPresent('http 10', hasText('http://10.0.2.2:8081'));
    return tapIfPresent('Guardians', hasDesc('Cleveland Guardians'));
  }).catch(async (error) => {
    throw new Error(`${error.message}. ${await dumpLabels()}`);
  });
};

const dismissPermissionDialogs = async () => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const denied = await tapIfPresent('permission deny', isPermissionDeny);
    if (!denied) {
      return;
    }
    await sleep(400);
  }
};

const server = spawnTracked(process.execPath, [serverPath], {
  cwd: harnessDirectory,
  stdio: 'inherit',
});

let metro;
let nativeBuild;
const findings = [];

try {
  await waitFor('harness', 8_000, async () => {
    const response = await fetch('http://127.0.0.1:8108/health');
    return response.ok;
  });
  await ensureEmulator();

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

  metro = spawnTracked(
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
  await waitFor('metro', 120_000, async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${metroPort}/status`);
      return response.ok;
    } catch {
      return false;
    }
  });

  const skipNativeBuild = process.env.SKIP_ANDROID_BUILD === '1';
  if (!skipNativeBuild) {
    nativeBuild = spawnTracked(
      process.execPath,
      [expoCliPath, 'run:android', '--no-bundler'],
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
    const buildCode = await waitForExit(nativeBuild, 'Android build');
    if (buildCode !== 0) {
      throw new Error(`Android build exited with code ${buildCode}.`);
    }
  }

  const packageDump = await adb(['shell', 'dumpsys', 'package', packageName]);
  const requestedBlock = /requested permissions:([\s\S]*?)(?:\n    [a-z]|\n  [A-Z])/i.exec(
    packageDump,
  )?.[1] ?? '';
  const uniqueRequested = [
    ...new Set(
      [...requestedBlock.matchAll(/android\.permission\.[A-Z0-9_]+/g)].map((match) => match[0]),
    ),
  ];
  const hasFine = uniqueRequested.includes('android.permission.ACCESS_FINE_LOCATION');
  const hasCoarse = uniqueRequested.includes('android.permission.ACCESS_COARSE_LOCATION');
  findings.push(
    `permissions fine=${hasFine} coarse=${hasCoarse} nearby=${uniqueRequested.includes('android.permission.NEARBY_WIFI_DEVICES')}`,
  );
  if (hasFine || hasCoarse) {
    throw new Error(`Package still requests location: ${uniqueRequested.join(', ')}`);
  }

  await adb(['reverse', 'tcp:8081', 'tcp:8081']).catch(() => {});
  await adb(['reverse', 'tcp:8108', 'tcp:8108']).catch(() => {});
  await adb(['reverse', 'tcp:7664', 'tcp:7664']).catch(() => {});
  await adb(['shell', 'input', 'keyevent', '224']).catch(() => {});
  await adb(['shell', 'wm', 'dismiss-keyguard']).catch(() => {});
  await adb(['shell', 'pm', 'revoke', packageName, 'android.permission.RECORD_AUDIO']).catch(
    () => {},
  );
  await adb(['shell', 'pm', 'revoke', packageName, 'android.permission.POST_NOTIFICATIONS']).catch(
    () => {},
  );
  await adb(['shell', 'pm', 'revoke', packageName, 'android.permission.NEARBY_WIFI_DEVICES']).catch(
    () => {},
  );
  await adb(['shell', 'pm', 'revoke', packageName, 'android.permission.ACCESS_FINE_LOCATION']).catch(
    () => {},
  );

  await adb(['shell', 'am', 'force-stop', packageName]);
  await adb([
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    `dannerapp://expo-development-client/?url=${encodeURIComponent('http://10.0.2.2:8081')}`,
    packageName,
  ]);
  await sleep(4_000);

  await openGuardians('Guardians tile');
  await sleep(2_000);
  await waitFor('Play video', 30_000, () =>
    tapIfPresent('Play video 1', hasDesc('Play video 1')),
  ).catch(async (error) => {
    throw new Error(`${error.message}. ${await dumpLabels()}`);
  });
  await sleep(1_500);
  const playerOpen = await dumpLabels();
  if (!playerOpen.includes('Close video')) {
    throw new Error(`Play did not open a player. ${playerOpen}`);
  }
  await adb(['shell', 'input', 'keyevent', '4']);
  await sleep(1_000);
  const afterPlayerBack = await dumpLabels();
  if (afterPlayerBack.includes('Close video')) {
    throw new Error(`Back left the player open. ${afterPlayerBack}`);
  }
  if (!afterPlayerBack.includes('Play video') && !afterPlayerBack.includes('Return to Danner Apps')) {
    throw new Error(`Back from Play left Guardians. ${afterPlayerBack}`);
  }
  findings.push('back-from-play=guardians');

  await adb(['shell', 'input', 'keyevent', '4']);
  await sleep(1_000);
  const afterHubBack = await dumpLabels();
  if (!afterHubBack.includes('Cleveland Guardians') || afterHubBack.includes('Return to Danner Apps')) {
    throw new Error(`Second Back did not return to the hub. ${afterHubBack}`);
  }
  findings.push('back-from-guardians=hub');

  await openGuardians('Guardians after hub');
  await sleep(2_000);
  await waitFor('web Play', 30_000, async () =>
    (await tapIfPresent('Play video 6', hasDesc('Play video 6'))) ||
    (await tapIfPresent('Play video', hasDesc('Play video'))),
  ).catch(async (error) => {
    throw new Error(`${error.message}. ${await dumpLabels()}`);
  });
  await sleep(2_000);
  await adb(['shell', 'input', 'tap', '540', '1100']);
  await waitFor('Send to TV', 20_000, () =>
    tapIfPresent('Send to TV', hasDesc('Send to TV')),
  ).catch(async (error) => {
    throw new Error(`${error.message}. ${await dumpLabels()}`);
  });
  await sleep(800);
  await dismissPermissionDialogs();
  await sleep(1_000);
  const afterTvDeny = await dumpLabels();
  const askedLocation =
    afterTvDeny.toLowerCase().includes('location') &&
    (afterTvDeny.includes("Don't allow") || afterTvDeny.includes('Allow'));
  if (askedLocation) {
    throw new Error(`TV send showed a location prompt. ${afterTvDeny}`);
  }
  if (!afterTvDeny.includes('TV send needs permission')) {
    throw new Error(`Denied TV send did not show the failure. ${afterTvDeny}`);
  }
  findings.push('tv-deny=permission-text');

  process.stdout.write(`${findings.join('\n')}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
} finally {
  metro?.kill();
  nativeBuild?.kill();
  server.kill();
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
}
