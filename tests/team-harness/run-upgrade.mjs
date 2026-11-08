// Installs a release build in place over an older release on an emulator and checks preset seeding.
// It uninstalls the app between states, so run it on an emulator only; pin one with ANDROID_SERIAL.
//
//   node run-upgrade.mjs --apk <new.apk> --older <v1.4.16.apk> [--states fresh,legacy,install-times,marker]
//
// A release APK cannot be inspected, so without `android:debuggable` the checks read the hub. Built
// with it, the checks read `danner.seed.v1` and the other keys, and the `marker` state can run: the
// marker state writes only `danner.install.v1` after the update and before the first launch, which
// stands in for a v1.5.x phone, because a non-debuggable older build cannot be written to.
import assert from 'node:assert/strict';
import {
  adb,
  dumpNodes,
  labelsOf,
  packageName,
  sleep,
  tapIfPresent,
  waitFor,
} from './device.mjs';
import { isInspectable, readStorage, writeStorage } from './storage.mjs';

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};
const newApk = argument('--apk');
const olderApk = argument('--older');
const states = (argument('--states') ?? 'fresh,legacy,install-times,marker').split(',');
assert.ok(newApk && olderApk, 'Pass --apk and --older.');

const PRESET_LABELS = ['Cleveland Guardians', 'New England Patriots', 'Iowa State Cyclones'];
const PRESET_KEYS = ['mlb-5', 'nfl-17', 'ncaa-66'];
const SELECTION_KEY = 'danner.selection.v1';
const SEED_KEY = 'danner.seed.v1';
const INSTALL_KEY = 'danner.install.v1';
const DESTINATION_KEY = 'danner.destination.v1';
const SOURCES_KEYS = [
  'danner.guardians.sources.v2',
  'danner.patriots.sources.v1',
  'danner.cyclones.sources.v1',
];
const IN_PLACE_WAIT_MS = 65_000;

const step = (text) => process.stdout.write(`ok - ${text}\n`);
const has = (nodes, label) => labelsOf(nodes).includes(label);

async function assertEmulator() {
  const qemu = (await adb(['shell', 'getprop', 'ro.kernel.qemu'])).trim();
  const hardware = (await adb(['shell', 'getprop', 'ro.hardware'])).trim();
  assert.ok(qemu === '1' || hardware === 'ranchu', 'This harness uninstalls the app: emulator only.');
}

async function stopApp() {
  await adb(['shell', 'am', 'force-stop', packageName]);
}

async function startApp() {
  await adb(['shell', 'input', 'keyevent', '224']).catch(() => {});
  await adb(['shell', 'wm', 'dismiss-keyguard']).catch(() => {});
  await stopApp();
  await adb(['shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1']);
}

async function waitForLabel(label, timeoutMs = 45_000) {
  return waitFor(`"${label}"`, timeoutMs, async () => {
    const nodes = await dumpNodes();
    // v1.4.16 may offer its own update on launch.
    if (nodes.some((node) => node.text.toLowerCase() === 'yes')) {
      await tapIfPresent((value) => value.toLowerCase() === 'no');
    }
    return has(nodes, label) ? nodes : false;
  }).catch(async (error) => {
    throw new Error(`${error.message}. labels=${labelsOf(await dumpNodes()).join('|')}`);
  });
}

async function tapLabel(label) {
  await waitForLabel(label);
  await waitFor(`tap ${label}`, 15_000, () => tapIfPresent((value) => value === label));
}

async function installOlder() {
  await adb(['uninstall', packageName]).catch(() => {});
  await adb(['install', olderApk]);
  return Date.now();
}

async function openOlderHub() {
  await startApp();
  await waitForLabel('TV Location', 60_000);
}

async function backToHub() {
  await adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
  await waitForLabel('TV Location');
}

// Writes the legacy keys the way v1.4.16 does: a team screen caches its streams file, and the map
// saves a point.
async function createLegacyKeysOnOlder() {
  await openOlderHub();
  await tapLabel('Cleveland Guardians');
  await waitForLabel('Return to Danner Apps', 30_000);
  await sleep(15_000);
  await backToHub();
  await tapLabel('TV Location');
  await waitForLabel('Change map location');
  await tapLabel('Change map location');
  await waitForLabel('Use this map location');
  await sleep(6_000);
  const nodes = await dumpNodes();
  const web = nodes.find((node) => node.bounds && node.className === 'android.webkit.WebView');
  assert.ok(web, 'the map is on screen');
  await adb([
    'shell',
    'input',
    'tap',
    String(Math.round((web.bounds.left + web.bounds.right) / 2 + 150)),
    String(Math.round((web.bounds.top + web.bounds.bottom) / 2 - 120)),
  ]);
  await sleep(2_000);
  await tapLabel('Use this map location');
  await sleep(2_500);
  await stopApp();
}

async function installNew() {
  await adb(['install', '-r', newApk]);
}

async function assertHub(expected, stateName) {
  await startApp();
  const nodes = await waitForLabel('Add team', 90_000);
  await waitForLabel('TV Location');
  const labels = labelsOf(nodes);
  for (const label of PRESET_LABELS) {
    assert.equal(labels.includes(label), expected === 'seeded', `${stateName}: ${label}`);
  }
  step(`${stateName}: the hub shows ${expected === 'seeded' ? 'the three presets, TV Location and +' : 'only TV Location and +'}`);
}

function assertSeed(stored, decision, signal, stateName) {
  const seed = JSON.parse(stored.get(SEED_KEY));
  assert.equal(seed.decision, decision, `${stateName}: seed decision`);
  assert.equal(seed.signal, signal, `${stateName}: seed signal`);
  const tiles = JSON.parse(stored.get(SELECTION_KEY)).tiles.map((tile) => tile.key);
  assert.deepEqual(tiles, decision === 'fresh' ? [] : PRESET_KEYS, `${stateName}: tiles`);
  step(`${stateName}: danner.seed.v1 is ${decision} / ${signal}`);
}

async function assertSurvivesReinstall(stateName, expected, inspectable) {
  const before = inspectable ? readStorage() : undefined;
  await stopApp();
  await installNew();
  await assertHub(expected, `${stateName} after a further install -r`);
  if (inspectable) {
    await stopApp();
    const after = readStorage();
    for (const key of [SELECTION_KEY, SEED_KEY, DESTINATION_KEY, 'danner.tv.default.v1', INSTALL_KEY]) {
      assert.equal(after.get(key), before.get(key), `${stateName}: ${key} is unchanged`);
    }
    step(`${stateName}: tiles, seed and TV keys are unchanged after a further install -r`);
  }
}

async function runFresh(inspectable) {
  await adb(['uninstall', packageName]).catch(() => {});
  await adb(['install', newApk]);
  await assertHub('fresh', 'fresh install');
  if (inspectable) {
    await stopApp();
    assertSeed(readStorage(), 'fresh', 'none', 'fresh install');
  }
}

async function runLegacy(inspectable) {
  await installOlder();
  await createLegacyKeysOnOlder();
  await installNew();
  let before;
  if (inspectable) {
    before = readStorage();
    assert.ok(before.has(SOURCES_KEYS[0]), 'the older build wrote the Guardians streams cache');
    assert.ok(before.has(DESTINATION_KEY), 'the older build saved a TV point');
    assert.ok(!before.has(SELECTION_KEY), 'nothing has seeded yet');
    step('legacy keys: v1.4.16 wrote its own stream cache and TV point');
  }
  await assertHub('seeded', 'legacy keys');
  if (inspectable) {
    await stopApp();
    const stored = readStorage();
    assertSeed(stored, 'legacy-family', 'legacy-keys', 'legacy keys');
    for (const key of SOURCES_KEYS) {
      assert.ok(!stored.has(key), `${key} is removed after the new keys are written`);
    }
    assert.ok(stored.has(DESTINATION_KEY), 'the saved TV point is kept');
    step('legacy keys: the sources caches are gone and the TV point is kept');
  }
  await assertSurvivesReinstall('legacy keys', 'seeded', inspectable);
}

async function runInstallTimes(inspectable) {
  const installed = await installOlder();
  await openOlderHub();
  await stopApp();
  const remaining = IN_PLACE_WAIT_MS - (Date.now() - installed);
  if (remaining > 0) {
    await sleep(remaining);
  }
  await installNew();
  if (inspectable) {
    const before = readStorage();
    for (const key of [...SOURCES_KEYS, INSTALL_KEY, DESTINATION_KEY]) {
      assert.ok(!before.has(key), `${key} is absent before the first launch`);
    }
    step('install times: no legacy key exists before the first launch');
  }
  await assertHub('seeded', 'install times');
  if (inspectable) {
    await stopApp();
    assertSeed(readStorage(), 'legacy-family', 'install-times', 'install times');
  }
  await assertSurvivesReinstall('install times', 'seeded', inspectable);
}

async function runMarker(inspectable) {
  assert.ok(inspectable, 'The marker state needs a build with android:debuggable.');
  await installOlder();
  await openOlderHub();
  // The TV screen opens the storage database, so the key can be written beside it.
  await tapLabel('TV Location');
  await waitForLabel('Change map location');
  await stopApp();
  await installNew();
  const marker = JSON.stringify({ at: '2026-11-01T12:00:00.000Z', firstVersion: '1.5.0' });
  writeStorage({ [INSTALL_KEY]: marker });
  const before = readStorage();
  assert.deepEqual([...before.keys()], [INSTALL_KEY], 'danner.install.v1 is the only key');
  step('marker: danner.install.v1 is the only key before the first launch');
  await assertHub('seeded', 'marker');
  await stopApp();
  const stored = readStorage();
  assertSeed(stored, 'legacy-family', 'legacy-keys', 'marker');
  assert.equal(stored.get(INSTALL_KEY), marker, 'the marker is read and never rewritten');
  await assertSurvivesReinstall('marker', 'seeded', inspectable);
}

const RUNNERS = {
  fresh: runFresh,
  'install-times': runInstallTimes,
  legacy: runLegacy,
  marker: runMarker,
};

await assertEmulator();
await adb(['uninstall', packageName]).catch(() => {});
await adb(['install', newApk]);
const inspectable = isInspectable();
process.stdout.write(`The build under test is ${inspectable ? 'inspectable' : 'not inspectable'}.\n`);

for (const state of states) {
  assert.ok(RUNNERS[state], `unknown state ${state}`);
  await RUNNERS[state](inspectable);
}
process.stdout.write('Upgrade checks passed.\n');
process.exit(0);
