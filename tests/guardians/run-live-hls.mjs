import { spawn } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
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
const firstPort = 8108;
const lastPort = 8127;

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

const tapIfPresent = async (label, predicate) => {
  try {
    await tapNode(label, predicate);
    return true;
  } catch {
    return false;
  }
};

const fetchPlaylist = async (hostPort) => {
  const response = await fetch(`http://127.0.0.1:${hostPort}/live.m3u8`);
  if (!response.ok) {
    return undefined;
  }
  const body = await response.text();
  if (!body.includes('#EXTM3U') || !body.includes('#EXTINF')) {
    return undefined;
  }
  return body;
};

const hasFfprobe = async () => {
  try {
    const result = await run('ffprobe', ['-version']);
    return result.code === 0;
  } catch {
    return false;
  }
};

// TS framing alone proves nothing: a stream whose audio and video sit on different clocks is
// still 188-byte aligned and still starts with 0x47, and it renders as a black screen on the
// Chromecast. Decode the segment and check the two elementary streams agree.
const probeSegment = async (bytes) => {
  const file = path.join(tmpdir(), `danner-live-hls-probe-${Date.now()}.ts`);
  await writeFile(file, bytes);
  try {
    const result = await run('ffprobe', [
      '-v', 'error',
      '-of', 'json',
      '-show_streams',
      '-show_packets',
      '-read_intervals', '%+2',
      file,
    ]);
    if (result.code !== 0) {
      throw new Error(`ffprobe failed: ${result.stderr.trim() || result.code}`);
    }

    let probed;
    try {
      probed = JSON.parse(result.stdout);
    } catch {
      throw new Error('ffprobe did not return JSON');
    }

    const streams = probed.streams ?? [];
    const video = streams.find((entry) => entry.codec_name === 'h264');
    if (!video) {
      throw new Error(
        `Segment has no h264 stream (found ${
          streams.map((entry) => entry.codec_name).join(', ') || 'nothing'
        })`,
      );
    }

    const packets = probed.packets ?? [];
    const firstPts = (index) => {
      const packet = packets.find(
        (entry) => entry.stream_index === index && entry.pts_time !== undefined,
      );
      return packet ? Number(packet.pts_time) : undefined;
    };

    const videoPts = firstPts(video.index);
    if (videoPts === undefined || !Number.isFinite(videoPts)) {
      throw new Error('Segment has no decodable video packet');
    }

    const audio = streams.find((entry) => entry.codec_type === 'audio');
    if (audio) {
      const audioPts = firstPts(audio.index);
      if (audioPts === undefined || !Number.isFinite(audioPts)) {
        throw new Error('Segment declares audio but has no decodable audio packet');
      }
      const skew = Math.abs(audioPts - videoPts);
      if (skew >= 1) {
        throw new Error(
          `Audio and video are on different timebases: first video pts ${videoPts}s, ` +
            `first audio pts ${audioPts}s, skew ${skew.toFixed(3)}s`,
        );
      }
      return `h264 + ${audio.codec_name}, a/v skew ${skew.toFixed(3)}s`;
    }

    return `h264 video only, first pts ${videoPts}s`;
  } finally {
    await rm(file, { force: true }).catch(() => {});
  }
};

const validateSegment = async (hostPort, playlist) => {
  const matches = [...playlist.matchAll(/seg-(\d+)\.ts/g)];
  const match = matches.at(-1);
  if (!match) {
    throw new Error('Playlist has no segments');
  }
  const response = await fetch(`http://127.0.0.1:${hostPort}/seg-${match[1]}.ts`);
  if (!response.ok) {
    throw new Error(`Segment HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 188 || bytes.length % 188 !== 0 || bytes[0] !== 0x47) {
    throw new Error('Segment is not MPEG-TS');
  }
  const decode = (await hasFfprobe())
    ? await probeSegment(bytes)
    : 'skipped (ffprobe is not on PATH)';
  return { bytes: bytes.length, decode };
};

const readOriginFromLogcat = async () => {
  const result = await run(adbPath, ['logcat', '-d', '-s', 'DannerLiveHls:I']);
  const match = /origin=(http:\/\/[^ \r\n]+)/.exec(result.stdout);
  return match?.[1];
};

const probeHls = async () => {
  const origin = await readOriginFromLogcat();
  const ports = [];
  if (origin) {
    const parsed = Number(new URL(origin).port);
    if (Number.isFinite(parsed)) {
      ports.push(parsed);
    }
  }
  for (let port = firstPort; port <= lastPort; port += 1) {
    if (!ports.includes(port)) {
      ports.push(port);
    }
  }
  for (const port of ports) {
    const hostPort = 18_000 + port;
    await run(adbPath, ['forward', '--remove', `tcp:${hostPort}`]).catch(() => {});
    try {
      await run(adbPath, ['forward', `tcp:${hostPort}`, `tcp:${port}`]);
      const playlist = await waitFor(`playlist ${port}`, 8_000, () => fetchPlaylist(hostPort));
      if (!playlist) {
        continue;
      }
      // A playlist here means this is the live origin. Anything wrong with its segments is a
      // real failure, not a reason to keep scanning ports and report "no playlist" instead.
      let segment;
      try {
        segment = await validateSegment(hostPort, playlist);
      } catch (error) {
        throw new Error(
          `Port ${port} served a playlist but its segment failed: ${
            error instanceof Error ? error.message : error
          }`,
          { cause: error },
        );
      }
      return {
        origin: origin ?? `http://127.0.0.1:${hostPort}`,
        playlist,
        bytes: segment.bytes,
        decode: segment.decode,
        port,
      };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Port ')) {
        throw error;
      }
      continue;
    } finally {
      await run(adbPath, ['forward', '--remove', `tcp:${hostPort}`]).catch(() => {});
    }
  }
  throw new Error('No live playlist on ports 8108-8127');
};

const server = spawnTracked(process.execPath, [serverPath], {
  cwd: harnessDirectory,
  stdio: 'inherit',
});

let metro;
let nativeBuild;
let passed = false;
let report = '';

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
  await waitFor('metro', 60_000, async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${metroPort}/status`);
      return response.ok;
    } catch {
      return false;
    }
  });

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

  await grantCapture();
  await adb(['logcat', '-c']);
  await adb(['reverse', 'tcp:8081', 'tcp:8081']).catch(() => {});
  await adb(['reverse', 'tcp:8108', 'tcp:8108']).catch(() => {});
  await adb(['shell', 'am', 'force-stop', packageName]);
  await adb([
    'shell',
    'am',
    'start',
    '-n',
    `${packageName}/.MainActivity`,
  ]);

  await waitFor('Guardians tile', 90_000, async () => {
    await tapIfPresent('Continue', hasText('Continue'));
    await tapIfPresent('Reload', hasText('RELOAD\n(R, R)'));
    await tapIfPresent('Reload short', (node) => node.includes('text="RELOAD'));
    return tapIfPresent('Guardians', hasDesc('Cleveland Guardians'));
  }).catch(async (error) => {
    throw new Error(`${error.message}. ${await dumpLabels()}`);
  });
  await sleep(2_000);
  await waitFor('capture pattern play', 30_000, () =>
    tapIfPresent('Play video 6', hasDesc('Play video 6')),
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
  await sleep(1_000);
  await tapIfPresent('Start now', hasText('Start now'));
  await tapIfPresent('Allow', hasText('Allow'));
  await sleep(12_000);

  const result = await probeHls();
  report = [
    `origin ${result.origin}`,
    `device port ${result.port}`,
    `segment bytes ${result.bytes}`,
    `segment decode ${result.decode}`,
    result.playlist.trim(),
  ].join('\n');
  await writeFile(path.join(tmpdir(), 'danner-live-hls.last.txt'), `${report}\n`);
  passed = true;
  process.stdout.write(`${report}\n`);
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

if (passed) {
  process.exitCode = 0;
}
