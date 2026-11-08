// Drives the hub and the picker on an emulator against the fixture catalog: a fresh install, a pro
// add, a two-sport school becoming one tile, a remove-one-sport, tile actions, the 30-team cap, and
// `adb install -r` keeping tiles and TV keys. It clears the app, so run it on an emulator only;
// pin one with ANDROID_SERIAL. Set SKIP_ANDROID_BUILD=1 to use the debug APK already built.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  adb,
  appDirectory,
  buildAndroid,
  dumpNodes,
  ensureEmulator,
  killChildren,
  labelsOf,
  launchApp,
  packageName,
  reversePorts,
  sleep,
  startMetro,
  tapIfPresent,
  tapNode,
  waitFor,
} from './device.mjs';
import { fileExistsInApp, readStorage, writeStorage } from './storage.mjs';

const serverPort = 8108;
const SELECTION_KEY = 'danner.selection.v1';
const SEED_KEY = 'danner.seed.v1';
const MIN_TAP_HEIGHT_PX = 150;
const debugApk = path.join(appDirectory, 'android/app/build/outputs/apk/debug/app-debug.apk');

const step = (name) => process.stdout.write(`ok - ${name}\n`);
const hasLabel = (nodes, label) => labelsOf(nodes).includes(label);
const nodeWith = (nodes, label) =>
  nodes.find((node) => node.bounds && (node.desc === label || node.text === label));

async function waitForLabel(label, timeoutMs = 45_000) {
  return waitFor(`"${label}" on screen`, timeoutMs, async () => {
    const nodes = await dumpNodes();
    return hasLabel(nodes, label) ? nodes : false;
  }).catch(async (error) => {
    throw new Error(`${error.message}. labels=${labelsOf(await dumpNodes()).join('|')}`);
  });
}

async function tapLabel(label) {
  await waitForLabel(label);
  await waitFor(`tap ${label}`, 15_000, () => tapIfPresent((value) => value === label));
}

const selection = () => JSON.parse(readStorage().get(SELECTION_KEY));
const tileKeys = () => selection().tiles.map((tile) => tile.key);
const tile = (key) => selection().tiles.find((entry) => entry.key === key);

async function waitForTile(label) {
  await waitForLabel(label);
  await waitForLabel('Add team');
}

async function longPress(label) {
  const nodes = await waitForLabel(label);
  const { bottom, left, right, top } = nodeWith(nodes, label).bounds;
  const x = String(Math.round((left + right) / 2));
  const y = String(Math.round((top + bottom) / 2));
  await adb(['shell', 'input', 'swipe', x, y, x, y, '900']);
}

async function freshInstall() {
  await adb(['uninstall', packageName]).catch(() => {});
  await adb(['install', '-t', debugApk]);
}

async function relaunch(label) {
  await reversePorts([8081, serverPort]);
  await launchApp(label);
}

async function checkFreshInstall() {
  await relaunch('TV Location');
  const nodes = await waitForLabel('Add team');
  const labels = labelsOf(nodes);
  for (const preset of ['Cleveland Guardians', 'New England Patriots', 'Iowa State Cyclones']) {
    assert.ok(!labels.includes(preset), `${preset} is not on a fresh install`);
  }
  const stored = readStorage();
  assert.deepEqual(JSON.parse(stored.get(SELECTION_KEY)).tiles, []);
  const seed = JSON.parse(stored.get(SEED_KEY));
  assert.equal(seed.decision, 'fresh');
  assert.equal(seed.signal, 'none');
  step('a first install shows TV Location and Add team, and records a fresh seed');
}

async function openPickerRow(rowLabel) {
  await tapLabel('Add team');
  await waitForLabel('Add a team');
  await waitForLabel(rowLabel);
  await tapLabel(rowLabel);
}

async function checkProAdd() {
  await tapLabel('Add team');
  const first = await waitForLabel('Add a team');
  await waitForLabel('MLB');
  const rows = labelsOf(await dumpNodes());
  for (const row of ['MLB', 'NFL', 'NCAA football', "NCAA men's basketball", "NCAA women's basketball"]) {
    assert.ok(rows.includes(row), `step 1 offers ${row}: ${labelsOf(first).join('|')}`);
  }
  await tapLabel('MLB');
  await waitForLabel('Search teams');
  await waitForLabel('Detroit Tigers');
  await tapLabel('Detroit Tigers');
  await waitForTile('Detroit Tigers');
  assert.deepEqual(tileKeys(), ['mlb-6']);
  assert.equal(tile('mlb-6').team.statsapi.teamId, 116);
  step('a pro add appends one tile with its statsapi ids');

  await waitFor('the logo file', 60_000, async () => fileExistsInApp('files/logos/mlb-6.png'));
  assert.equal(JSON.parse(readStorage().get('danner.logos.v1'))['mlb-6'].name, 'logos/mlb-6.png');
  step('the logo is downloaded and indexed by its relative name');

  await openPickerRow('MLB');
  const nodes = await waitForLabel('Detroit Tigers');
  assert.ok(hasLabel(nodes, 'On hub'), 'a team already added shows On hub');
  await tapIfPresent((value) => value === 'Detroit Tigers');
  await sleep(1_000);
  assert.ok(hasLabel(await dumpNodes(), 'Search teams'), 'a team on the hub cannot be added again');
  assert.deepEqual(tileKeys(), ['mlb-6']);
  await tapLabel('Back');
  await waitForLabel('Add a team');
  await tapLabel('Return to Danner Apps');
  await waitForTile('Detroit Tigers');
  step('a pro team on the hub shows On hub and is disabled');
}

async function checkSchoolMerge() {
  await openPickerRow('NCAA football');
  await waitForLabel('Iowa Hawkeyes');
  const list = labelsOf(await dumpNodes());
  assert.ok(!list.includes('Northern Plains Retired'), 'retired schools are not offered');
  assert.ok(!list.includes('Hidden Valley Hidden'), 'hidden schools are not offered');
  await tapLabel('Iowa Hawkeyes');
  await waitForLabel('Football');
  await waitForLabel("Women's basketball");
  await tapLabel('Save');
  await waitForTile('Iowa Hawkeyes');
  assert.deepEqual(tileKeys(), ['mlb-6', 'ncaa-2294']);
  assert.deepEqual(tile('ncaa-2294').sports, ['football']);
  step('a school add makes one tile with the picked sport');

  await openPickerRow("NCAA men's basketball");
  const nodes = await waitForLabel('Iowa Hawkeyes');
  assert.ok(hasLabel(nodes, 'On hub · Football'), 'the school shows its sports');
  await tapLabel('Iowa Hawkeyes');
  await waitForLabel('Save');
  await tapLabel('Save');
  await waitForTile('Iowa Hawkeyes');
  assert.deepEqual(tileKeys(), ['mlb-6', 'ncaa-2294']);
  assert.deepEqual(tile('ncaa-2294').sports, ['football', 'mens-basketball']);
  step('a second sport merges into the same tile');

  await openPickerRow('NCAA football');
  await waitForLabel('Lakeside Otters');
  await tapLabel('Lakeside Otters');
  await waitForLabel('Football');
  assert.ok(!hasLabel(await dumpNodes(), "Men's basketball"), 'a retired sport is not offered');
  await tapLabel('Back');
  await waitForLabel('Search teams');
  await tapLabel('Back');
  await waitForLabel('Add a team');
  await tapLabel('Return to Danner Apps');
  await waitForTile('Iowa Hawkeyes');
  step('a retired sport is not offered');
}

async function checkRemoveOneSport() {
  await longPress('Iowa Hawkeyes');
  await waitForLabel('Change sports');
  await tapLabel('Change sports');
  await waitForLabel('Football');
  await tapLabel('Football');
  await tapLabel('Save');
  await waitForTile('Iowa Hawkeyes');
  assert.deepEqual(tile('ncaa-2294').sports, ['mens-basketball']);
  step('removing one sport keeps the tile');

  await longPress('Iowa Hawkeyes');
  await waitForLabel('Change sports');
  await tapLabel('Change sports');
  await waitForLabel("Men's basketball");
  await tapLabel("Men's basketball");
  await tapLabel('Save');
  await waitForLabel('Remove Iowa Hawkeyes?');
  await waitFor('Remove button', 10_000, () =>
    tapIfPresent((value) => value.toLowerCase() === 'remove'),
  );
  await waitForLabel('Detroit Tigers');
  await waitFor('the tile to leave', 10_000, async () => !hasLabel(await dumpNodes(), 'Iowa Hawkeyes'));
  assert.deepEqual(tileKeys(), ['mlb-6']);
  step('unchecking the last sport asks, then removes the tile');
}

async function checkTileActions() {
  await openPickerRow('NFL');
  await waitForLabel('Detroit Lions');
  await tapLabel('Detroit Lions');
  await waitForTile('Detroit Lions');
  assert.deepEqual(tileKeys(), ['mlb-6', 'nfl-8']);

  await longPress('Detroit Lions');
  await waitForLabel('Move to front');
  await tapLabel('Move to front');
  await waitFor('the move', 10_000, async () => tileKeys()[0] === 'nfl-8');
  step('Move to front reorders the tiles');

  await longPress('Detroit Lions');
  await waitForLabel('Remove from hub');
  await tapLabel('Remove from hub');
  await waitForLabel('Remove Detroit Lions?');
  await waitFor('Cancel button', 10_000, () =>
    tapIfPresent((value) => value.toLowerCase() === 'cancel'),
  );
  await sleep(800);
  assert.deepEqual(tileKeys(), ['nfl-8', 'mlb-6']);
  await longPress('Detroit Lions');
  await waitForLabel('Remove from hub');
  await tapLabel('Remove from hub');
  await waitForLabel('Remove Detroit Lions?');
  await waitFor('Remove button', 10_000, () =>
    tapIfPresent((value) => value.toLowerCase() === 'remove'),
  );
  await waitFor('the tile to leave', 10_000, async () => tileKeys().length === 1);
  assert.deepEqual(tileKeys(), ['mlb-6']);
  step('Remove from hub asks, and Cancel keeps the tile');
}

function capSelection() {
  const tiles = Array.from({ length: 30 }, (_, index) => {
    const espnId = String(index + 100);
    return {
      key: `nfl-${espnId}`,
      kind: 'pro',
      league: 'nfl',
      team: {
        abbreviation: `T${espnId}`,
        espnId,
        location: 'Town',
        name: `Town Team ${espnId}`,
        nickname: `Team${espnId}`,
      },
    };
  });
  return JSON.stringify({ schema: 1, tiles, updatedAt: '2026-11-08T12:00:00.000Z' });
}

async function scrollToLabel(label) {
  await waitFor(`scroll to ${label}`, 60_000, async () => {
    const node = nodeWith(await dumpNodes(), label);
    if (node && node.bounds.bottom - node.bounds.top >= MIN_TAP_HEIGHT_PX) {
      return true;
    }
    await adb(['shell', 'input', 'swipe', '540', '2050', '540', '1450', '400']);
    await sleep(600);
    return false;
  });
}

async function checkCap() {
  await adb(['shell', 'am', 'force-stop', packageName]);
  writeStorage({ [SELECTION_KEY]: capSelection() });
  await relaunch('Town Team 100');
  await scrollToLabel('Add team');
  await tapLabel('Add team');
  const nodes = await waitForLabel('Hub is full (30 teams)');
  await tapNode(nodeWith(nodes, 'NFL'));
  await sleep(1_000);
  assert.ok(hasLabel(await dumpNodes(), 'Add a team'), 'every add row is disabled at the cap');
  await tapLabel('Return to Danner Apps');
  await waitForLabel('Town Team 100');
  step('at 30 teams the picker says the hub is full and adding is disabled');
}

async function checkInstallReplace() {
  const tiles = JSON.stringify({
    schema: 1,
    tiles: [{
      key: 'mlb-6',
      kind: 'pro',
      league: 'mlb',
      team: {
        abbreviation: 'DET',
        espnId: '6',
        location: 'Detroit',
        name: 'Detroit Tigers',
        nickname: 'Tigers',
        statsapi: { leagueId: 103, teamId: 116 },
      },
    }],
    updatedAt: '2026-11-08T12:00:00.000Z',
  });
  const tvValues = {
    'danner.destination.v1': '{"label":"Test place"}',
    'danner.tv.default.v1': '{"label":"Default place"}',
  };
  await adb(['shell', 'am', 'force-stop', packageName]);
  writeStorage({ [SELECTION_KEY]: tiles, ...tvValues });
  await adb(['install', '-r', '-t', debugApk]);
  await relaunch('Detroit Tigers');
  await waitForLabel('TV Location');
  await adb(['shell', 'am', 'force-stop', packageName]);
  const stored = readStorage();
  assert.equal(stored.get(SELECTION_KEY), tiles);
  for (const [key, value] of Object.entries(tvValues)) {
    assert.equal(stored.get(key), value);
  }
  step('adb install -r keeps the tiles and the TV keys');
}

const env = {
  ...process.env,
  EXPO_NO_TELEMETRY: '1',
  EXPO_PUBLIC_TEAM_CATALOG_URL: `http://10.0.2.2:${serverPort}/catalog`,
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
  await reversePorts([8081, serverPort]);
  await buildAndroid(env);
  assert.ok(existsSync(debugApk), `${debugApk} does not exist`);
  await freshInstall();
  await checkFreshInstall();
  await checkProAdd();
  await checkSchoolMerge();
  await checkRemoveOneSport();
  await checkTileActions();
  await checkCap();
  await checkInstallReplace();
  process.stdout.write('Picker checks passed.\n');
} catch (error) {
  failed = true;
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
} finally {
  killChildren();
  server.kill();
}
process.exit(failed ? 1 : 0);
