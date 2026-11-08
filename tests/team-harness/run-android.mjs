// Drives a development build through the fixture scenarios of one preset, or every preset with
// `--all`, and asserts what each card shows.
// Usage: node run-android.mjs --team <key> --scenario <s> | --all
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  TILE_LABELS,
  adb,
  buildAndroid,
  dumpNodes,
  ensureEmulator,
  killChildren,
  labelsOf,
  launchApp,
  openTile,
  reversePorts,
  sleep,
  startMetro,
  waitFor,
} from './device.mjs';

const serverPort = 8108;
const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const SCENARIOS = ['today', 'ready', 'delayed', 'live', 'final'];
const runAll = process.argv.includes('--all');
const teamArgument = argument('--team');
const scenarioArgument = argument('--scenario') ?? 'today';
if (!runAll && !TILE_LABELS[teamArgument ?? '']) {
  throw new Error('Pass --team mlb-5|nfl-17|ncaa-66 and --scenario, or --all.');
}
const matrix = runAll
  ? [
      ...Object.keys(TILE_LABELS).flatMap((team) =>
        SCENARIOS.map((scenario) => ({ scenario, team })),
      ),
      { narrow: true, scenario: 'live-basketball', team: 'ncaa-66' },
      { scenario: 'two-games', team: 'ncaa-66' },
    ]
  : [{ narrow: scenarioArgument === 'live-basketball', scenario: scenarioArgument, team: teamArgument }];

const BOARD_LABEL = { 'mlb-5': 'GUARDIANS', 'ncaa-66': 'CYCLONES', 'nfl-17': 'PATRIOTS' };

const has = (labels, text) => labels.some((label) => label === text);
const hasPrefix = (labels, text) => labels.some((label) => label.startsWith(text));

const expectations = {
  delayed: (labels) => {
    assert.ok(has(labels, 'DELAYED'), 'DELAYED badge');
    assert.ok(has(labels, 'The game is delayed.'), 'delay message');
    assert.ok(!hasPrefix(labels, 'STARTS IN'), 'no countdown');
  },
  final: (labels) => {
    assert.ok(has(labels, 'WIN'), 'WIN badge');
    assert.ok(has(labels, 'Final'), 'Final status');
    assert.ok(!hasPrefix(labels, 'Play video'), 'no Play after Final');
    assert.ok(!hasPrefix(labels, 'Listen to audio'), 'no Listen after Final');
  },
  live: (labels, team) => {
    assert.ok(has(labels, 'LIVE'), 'LIVE badge');
    assert.ok(hasPrefix(labels, 'Play video'), 'Play');
    assert.ok(labels.some((label) => label.includes(BOARD_LABEL[team])), `board label ${BOARD_LABEL[team]}`);
  },
  ready: (labels) => {
    assert.ok(hasPrefix(labels, 'TODAY'), 'TODAY badge');
    assert.ok(has(labels, 'STARTS IN'), 'countdown');
    assert.ok(hasPrefix(labels, 'Play video'), 'Play opens inside 15 minutes');
  },
  today: (labels) => {
    assert.ok(hasPrefix(labels, 'TODAY'), 'TODAY badge');
    assert.ok(has(labels, 'STARTS IN'), 'countdown');
    assert.ok(has(labels, 'Video starts 15 minutes before game time.'), 'video timing');
    assert.ok(!hasPrefix(labels, 'Play video'), 'no Play before the window');
  },
  'two-games': (labels) => {
    assert.ok(has(labels, 'LIVE'), 'LIVE card');
    assert.ok(has(labels, "Men's basketball") || labels.some((label) => /men's basketball/i.test(label)), 'sport label');
    assert.ok(labels.filter((label) => label === 'WIN').length >= 1, 'Final card');
  },
  'live-basketball': (labels) => {
    assert.ok(has(labels, 'LIVE'), 'LIVE badge');
    assert.ok(hasPrefix(labels, 'Play video'), 'Play');
    assert.ok(labels.some((label) => label.startsWith('Cyclones 6') && label.includes('Wildcats')), 'center summary');
    const tables = labels.filter((label) => /players on the floor|top scorers/i.test(label) && label.includes('Number'));
    assert.equal(tables.length, 2, 'two table summaries');
  },
};

// At 360 dp the board fits with no sideways scroll, Play stays above it, and the board has three
// accessibility elements.
const isCenterPanel = (node) => node.desc.startsWith('Cyclones 6') && node.desc.includes('Wildcats');
const isPlay = (node) => node.desc.startsWith('Play video');

function assertNoSidewaysOverflow(nodes) {
  const width = Math.max(...nodes.map((node) => node.bounds?.right ?? 0));
  assert.ok(width <= 1080, `no node past the window: ${width}`);
}

function narrowBoardOnScreen(nodes) {
  return nodes.some(isPlay) && nodes.some(isCenterPanel);
}

function assertPlayAboveBoard(nodes) {
  assert.ok(nodes.find(isPlay).bounds.top < nodes.find(isCenterPanel).bounds.top, 'Play above the board');
}

async function setControlScenario(scenario) {
  const response = await fetch(
    `http://127.0.0.1:${serverPort}/control?scenario=${scenario}`,
    { method: 'POST' },
  );
  assert.ok(response.ok, `control ${scenario}`);
}

async function runCase({ narrow, scenario, team }) {
  const label = TILE_LABELS[team];
  await setControlScenario(scenario);
  if (narrow) {
    await adb(['shell', 'wm', 'density', '480']);
  }
  try {
    await launchApp(label);
    await openTile(label);
    // Labels gather across scrolls, so cards and tables below the first screen count.
    const seen = new Set();
    let layoutChecked = !narrow;
    await waitFor(`${team} ${scenario}`, 90_000, async () => {
      const nodes = await dumpNodes();
      labelsOf(nodes).forEach((entry) => seen.add(entry));
      if (narrow) {
        assertNoSidewaysOverflow(nodes);
        if (!layoutChecked && narrowBoardOnScreen(nodes)) {
          assertPlayAboveBoard(nodes);
          layoutChecked = true;
        }
      }
      try {
        expectations[scenario]([...seen], team);
      } catch (error) {
        if (seen.size > 0) {
          await adb(['shell', 'input', 'swipe', '540', '1700', '540', '900', '300']).catch(() => {});
        }
        throw error;
      }
      assert.ok(layoutChecked, 'Play and the board shown on one screen');
      return true;
    }).catch(async (error) => {
      throw new Error(`${error.message}. labels=${labelsOf(await dumpNodes()).join('|')}`);
    });
  } finally {
    if (narrow) {
      await adb(['shell', 'wm', 'density', 'reset']).catch(() => {});
    }
  }
  process.stdout.write(`PASS ${team} ${scenario}\n`);
}

const harnessUrl = `http://10.0.2.2:${serverPort}/team`;
const sourcesUrl = `http://10.0.2.2:${serverPort}/sources.json`;
const env = {
  ...process.env,
  EXPO_NO_TELEMETRY: '1',
  EXPO_PUBLIC_TEAM_SOURCES_URL: sourcesUrl,
  EXPO_PUBLIC_TEAM_TEST_URL: harnessUrl,
};

const server = spawn(
  process.execPath,
  [fileURLToPath(new URL('./server.mjs', import.meta.url))],
  { stdio: 'ignore' },
);

let failed = false;
try {
  await waitFor('fixture server', 8_000, async () => {
    const response = await fetch(`http://127.0.0.1:${serverPort}/health`);
    return response.ok;
  });
  await ensureEmulator();
  await startMetro(env);
  await reversePorts([8081, serverPort, 7664]);
  await buildAndroid(env);
  await reversePorts([8081, serverPort, 7664]);
  for (const entry of matrix) {
    try {
      await runCase(entry);
    } catch (error) {
      failed = true;
      process.stderr.write(
        `FAIL ${entry.team} ${entry.scenario}: ${error instanceof Error ? error.message : error}\n`,
      );
    }
    await sleep(500);
  }
} catch (error) {
  failed = true;
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
} finally {
  killChildren();
  server.kill();
}
process.exitCode = failed ? 1 : 0;
