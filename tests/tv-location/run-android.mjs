// Drives TV Location on an Android emulator through the system UI. Run against an emulator
// only: it clears the app's data. Select one with ANDROID_SERIAL when several are attached.
//
//   node tests/tv-location/run-android.mjs --apk <release apk>
//   node tests/tv-location/run-android.mjs --apk <new apk> --upgrade-from <older apk>
//
// With no --apk the installed build is used. Nothing here signs in to Google.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PACKAGE = 'com.example.location_helper';
const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};
const apk = argument('--apk');
const olderApk = argument('--upgrade-from');
const dumpDirectory = mkdtempSync(path.join(tmpdir(), 'tv-location-'));
const dumpPath = path.join(dumpDirectory, 'window.xml');
const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function adb(...args) {
  return execFileSync('adb', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function unescapeXml(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Nodes in document order, each with its ancestors, so a pressable parent can be read
// from the text node inside it.
function parseNodes(xml) {
  const nodes = [];
  const open = [];
  for (const match of xml.matchAll(/<(\/?)node\b([^>]*?)(\/?)>/g)) {
    if (match[1]) {
      open.pop();
      continue;
    }
    const attribute = (name) => {
      const found = new RegExp(`\\b${name}="([^"]*)"`).exec(match[2]);
      return found ? unescapeXml(found[1]) : '';
    };
    const bounds = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(attribute('bounds'));
    const node = {
      text: attribute('text'),
      description: attribute('content-desc'),
      className: attribute('class'),
      enabled: attribute('enabled') === 'true',
      clickable: attribute('clickable') === 'true',
      bounds: bounds ? bounds.slice(1).map(Number) : [0, 0, 0, 0],
      parent: open.at(-1),
    };
    nodes.push(node);
    if (!match[3]) {
      open.push(node);
    }
  }
  return nodes;
}

async function dump() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      adb('shell', 'uiautomator', 'dump', '/sdcard/tv-location.xml');
      adb('pull', '/sdcard/tv-location.xml', dumpPath);
      return parseNodes(readFileSync(dumpPath, 'utf8'));
    } catch {
      await delay(700);
    }
  }
  throw new Error('The screen could not be read.');
}

const hasLabel = (node, label) =>
  node.text === label || node.description === label;

const findNode = (nodes, label) => nodes.find((node) => hasLabel(node, label));

async function waitFor(check, description, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  let nodes = [];
  while (Date.now() < deadline) {
    nodes = await dump();
    if (check(nodes)) {
      return nodes;
    }
    await delay(500);
  }
  const shown = [...new Set(nodes.map((node) => node.text).filter(Boolean))];
  throw new Error(`Timed out waiting for ${description}. Shown: ${shown.join(' | ')}`);
}

const waitForLabel = (label, timeoutMs) =>
  waitFor((nodes) => findNode(nodes, label), `"${label}"`, timeoutMs);

function tapNode(node) {
  const [left, top, right, bottom] = node.bounds;
  adb(
    'shell',
    'input',
    'tap',
    String(Math.round((left + right) / 2)),
    String(Math.round((top + bottom) / 2)),
  );
}

async function tapLabel(label) {
  const nodes = await waitForLabel(label);
  tapNode(findNode(nodes, label));
}

async function scrollToLabel(label) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const nodes = await dump();
    const node = findNode(nodes, label);
    if (node && node.bounds[3] < 2200) {
      return nodes;
    }
    adb('shell', 'input', 'swipe', '540', '1900', '540', '900', '350');
    await delay(700);
  }
  throw new Error(`"${label}" did not scroll into view.`);
}

async function scrollToTop() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    adb('shell', 'input', 'swipe', '540', '700', '540', '2000', '250');
    await delay(350);
  }
  await delay(400);
}

const buttonOf = (node) => {
  let current = node;
  while (current && !current.clickable) {
    current = current.parent;
  }
  return current;
};

// A fresh install has no YouTube TV tile until it is added under Custom modules.
async function addTvModuleIfMissing() {
  const nodes = await waitForLabel('Add team', 40_000);
  if (findNode(nodes, 'TV Location')) {
    return;
  }
  await tapLabel('Add team');
  await tapLabel('Custom modules');
  await tapLabel('YouTube TV');
}

async function openTvLocation() {
  adb('shell', 'am', 'force-stop', PACKAGE);
  adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1');
  await addTvModuleIfMissing();
  await waitForLabel('TV Location', 40_000);
  await tapLabel('TV Location');
  await waitFor(
    (nodes) =>
      findNode(nodes, 'Step 1 of 4') &&
      (findNode(nodes, 'No location chosen yet') ||
        findNode(nodes, 'Change map location')),
    'the first step',
  );
}

// A tap away from the center moves the map under the pin and reports a selection.
async function tapMap(offsetX, offsetY) {
  const nodes = await waitFor(
    (found) => found.some((node) => node.className === 'android.webkit.WebView'),
    'the map',
  );
  const web = nodes.find((node) => node.className === 'android.webkit.WebView');
  const [left, top, right, bottom] = web.bounds;
  adb(
    'shell',
    'input',
    'tap',
    String(Math.round((left + right) / 2 + offsetX)),
    String(Math.round((top + bottom) / 2 + offsetY)),
  );
}

const selectedLabel = (nodes) => {
  const heading = nodes.findIndex((node) => node.text === 'SELECTED AREA');
  assert.ok(heading >= 0, 'the picker shows the selected area');
  return nodes[heading + 1].text;
};

const step = (name) => console.log(`ok - ${name}`);

async function waitForMapReady() {
  await waitFor(
    (nodes) => !findNode(nodes, 'Opening the offline map...'),
    'the map to finish loading',
    40_000,
  );
  await delay(1_200);
}

function assertEmulator() {
  const qemu = adb('shell', 'getprop', 'ro.kernel.qemu').trim();
  const hardware = adb('shell', 'getprop', 'ro.hardware').trim();
  assert.ok(
    qemu === '1' || hardware === 'ranchu' || hardware === 'goldfish',
    'This harness clears app data and runs only on an emulator.',
  );
}

function installOlderBuild() {
  try {
    adb('uninstall', PACKAGE);
  } catch {
    // Nothing was installed.
  }
  adb('install', olderApk);
}

async function openOlderTvLocation() {
  adb('shell', 'am', 'force-stop', PACKAGE);
  adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1');
  await waitForLabel('TV Location', 40_000);
  await tapLabel('TV Location');
  await waitForLabel('Change map location');
}

async function runUpgrade() {
  installOlderBuild();
  await openOlderTvLocation();
  adb('install', '-r', apk);
  await openTvLocation();
  const neverSaved = await dump();
  assert.ok(findNode(neverSaved, 'No location chosen yet'), 'no saved point means first use');
  assert.ok(!findNode(neverSaved, 'Use this location'), 'first use cannot confirm a location');
  step('update without a saved point starts at first use');

  // The older build writes only danner.destination.v1.
  installOlderBuild();
  await openOlderTvLocation();
  await tapLabel('Change map location');
  await waitForLabel('Use this map location');
  await waitForMapReady();
  const startLabel = selectedLabel(await dump());
  await tapMap(150, -120);
  const pickerNodes = await waitFor(
    (nodes) => selectedLabel(nodes) !== startLabel,
    'a selected place',
  );
  const savedLabel = selectedLabel(pickerNodes);
  await tapLabel('Use this map location');
  await waitForLabel(savedLabel);
  adb('shell', 'am', 'force-stop', PACKAGE);
  step(`older build saved a point (${savedLabel})`);

  adb('install', '-r', apk);
  await openTvLocation();
  const restored = await dump();
  assert.ok(findNode(restored, savedLabel), 'the saved point survives the update');
  assert.ok(!findNode(restored, 'No location chosen yet'), 'an updated phone is not first use');
  assert.ok(findNode(restored, 'Use this location'), 'step 1 can continue');
  step('update keeps the saved point');

  await scrollToLabel('Forget location');
  await waitForLabel(`Default: ${savedLabel}`);
  step('the saved point became the default');

  await openTvLocation();
  await waitForLabel(savedLabel);
  await scrollToLabel('Forget location');
  await waitForLabel(`Default: ${savedLabel}`);
  step('the migrated default is still there after a relaunch');
}

async function runFirstUse() {
  adb('shell', 'pm', 'clear', PACKAGE);
  await openTvLocation();

  const firstScreen = await dump();
  assert.ok(findNode(firstScreen, 'Choose on map'), 'first use offers the map');
  assert.ok(!findNode(firstScreen, 'Use this location'), 'first use cannot confirm a location');
  assert.ok(!findNode(firstScreen, 'The TV is ready'), 'step 2 has not started');
  assert.ok(
    !firstScreen.some((node) => /Tripoli/.test(node.text)),
    'no built-in location is shown',
  );
  step('first use blocks steps 2-4');

  await scrollToLabel('On this phone');
  const panel = await waitForLabel('Not signed in on this phone');
  assert.ok(findNode(panel, 'Sign in'), 'a signed-out phone offers Sign in');
  assert.ok(!findNode(panel, 'Switch account'), 'a signed-out phone has no Switch account');
  assert.ok(!findNode(panel, 'Sign out'), 'a signed-out phone has no Sign out');
  assert.ok(!findNode(panel, 'Forget location'), 'no location to forget');
  step('On this phone reports the signed-out session');
  await scrollToTop();

  await tapLabel('Choose on map');
  const emptyPicker = await waitForLabel('Save this location');
  await waitForMapReady();
  const blocked = await dump();
  assert.equal(selectedLabel(blocked), 'Move the map or search for a town');
  const saveButton = buttonOf(findNode(blocked, 'Save this location'));
  assert.ok(saveButton, 'the save control is a button');
  assert.equal(saveButton.enabled, false, 'Save this location is disabled');
  assert.ok(findNode(emptyPicker, 'Choose a map location'), 'the picker is open');
  tapNode(findNode(blocked, 'Save this location'));
  await delay(1_000);
  assert.ok(findNode(await dump(), 'Choose a map location'), 'a disabled save does nothing');
  step('Save this location waits for a selection');

  await tapMap(150, -120);
  const selected = await waitFor((nodes) => {
    const node = findNode(nodes, 'Save this location');
    return node && buttonOf(node)?.enabled !== false &&
      selectedLabel(nodes) !== 'Move the map or search for a town';
  }, 'a selected place');
  const savedLabel = selectedLabel(selected);
  assert.match(savedLabel, /, /);
  step(`the map reports a selection (${savedLabel})`);

  await tapLabel('Save this location');
  await waitForLabel('Use this location');
  await waitForLabel(savedLabel);
  step('saving sets the location');

  await openTvLocation();
  const restored = await dump();
  assert.ok(findNode(restored, savedLabel), 'the saved point is restored');
  assert.ok(!findNode(restored, 'No location chosen yet'), 'first use has ended');
  assert.ok(findNode(restored, 'Use this location'), 'step 1 can continue');
  step('relaunch restores the point');

  await tapLabel('Change map location');
  await waitForLabel('Use this map location');
  await waitForMapReady();
  const unmoved = await dump();
  assert.ok(!findNode(unmoved, 'Make this my default'), 'the default needs no second copy');
  await tapMap(-180, 160);
  const moved = await waitForLabel('Make this my default');
  assert.ok(findNode(moved, `Use my default (${savedLabel})`), 'the picker offers the default');
  const movedLabel = selectedLabel(moved);
  assert.notEqual(movedLabel, savedLabel);
  await tapLabel('Use this map location');
  await waitForLabel(movedLabel);
  await waitForLabel(`Use my default (${savedLabel})`);
  step('a moved point keeps the default and offers it on step 1');

  await tapLabel(`Use my default (${savedLabel})`);
  await waitForLabel(savedLabel);
  await waitFor(
    (nodes) => !findNode(nodes, `Use my default (${savedLabel})`),
    'the default button to hide',
  );
  step('Use my default restores the default');

  await scrollToLabel('Forget location');
  await waitForLabel(`Default: ${savedLabel}`);
  await tapLabel('Forget location');
  await waitForLabel('Forget this location?');
  const dialog = await dump();
  const forget = dialog.find(
    (node) => node.clickable && node.text.toLowerCase() === 'forget',
  );
  assert.ok(forget, 'the confirm dialog offers Forget');
  tapNode(forget);
  await waitForLabel('No location chosen yet');
  const forgotten = await dump();
  assert.ok(!findNode(forgotten, 'Use this location'), 'forgetting returns to first use');
  step('forget returns to step 1');

  await openTvLocation();
  const afterRelaunch = await dump();
  assert.ok(findNode(afterRelaunch, 'No location chosen yet'), 'forget persists');
  assert.ok(!findNode(afterRelaunch, savedLabel), 'the point is gone');
  step('forget persists after a relaunch');
}

try {
  assertEmulator();
  if (olderApk) {
    assert.ok(apk, '--upgrade-from needs --apk');
    await runUpgrade();
  } else {
    if (apk) {
      adb('install', '-r', apk);
    }
    await runFirstUse();
  }
  console.log('TV Location Android checks passed.');
} finally {
  rmSync(dumpDirectory, { force: true, recursive: true });
}
