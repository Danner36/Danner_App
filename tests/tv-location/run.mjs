import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import {
  DEFAULT_LOCATION_STORAGE_KEY,
  DESTINATION_STORAGE_KEY,
  TV_LOCATION_READ_FAILED,
  accountControls,
  defaultButtonLabel,
  destinationFromStored,
  pickerControls,
  resolveTvLocation,
  sessionStatusText,
  showUseDefaultOnStepOne,
} from '../../app/tvLocation/destination.ts';
import { createGeolocationInjection } from '../../app/tvLocation/geolocationInjection.ts';
import {
  SIGN_IN_URL,
  SWITCH_ACCOUNT_URL,
  VERIFY_URL,
  accountViewProgress,
  allowVerifyNavigation,
  httpsHost,
  isGoogleBlockPage,
} from '../../app/tvLocation/verifyNavigation.ts';

const appRoot = path.resolve(import.meta.dirname, '../../app');
const ames = { label: 'Ames, Iowa', latitude: 42.0308, longitude: -93.6319 };
const boise = { label: 'Boise City, Idaho', latitude: 43.6, longitude: -116.2 };
const stored = (value) => JSON.stringify(value);

// Key names are a storage contract with installed phones.
assert.equal(DESTINATION_STORAGE_KEY, 'danner.destination.v1');
assert.equal(DEFAULT_LOCATION_STORAGE_KEY, 'danner.tv.default.v1');

// resolveTvLocation: every combination of stored values.
assert.deepEqual(resolveTvLocation(null, null), {
  defaultLocation: undefined,
  current: undefined,
  writeDefault: false,
  loadError: false,
});
assert.deepEqual(resolveTvLocation(undefined, undefined), resolveTvLocation(null, null));

// A phone that saved a point under v1.x keeps it, and it becomes the default once.
assert.deepEqual(resolveTvLocation(null, stored(ames)), {
  defaultLocation: ames,
  current: ames,
  writeDefault: true,
  loadError: false,
});
assert.deepEqual(resolveTvLocation(stored(ames), null), {
  defaultLocation: ames,
  current: ames,
  writeDefault: false,
  loadError: false,
});
assert.deepEqual(resolveTvLocation(stored(ames), stored(boise)), {
  defaultLocation: ames,
  current: boise,
  writeDefault: false,
  loadError: false,
});

// The old built-in point is an ordinary saved point now, with its stored label.
const savedTripoli = { label: 'Tripoli, Iowa', latitude: 42.808371, longitude: -92.2578433 };
assert.deepEqual(resolveTvLocation(null, stored(savedTripoli)).current, savedTripoli);

for (const bad of ['not json', '', '{}', '[]', 'null', '{"latitude":91,"longitude":0}', '{"latitude":1}']) {
  assert.deepEqual(resolveTvLocation(bad, bad), {
    defaultLocation: undefined,
    current: undefined,
    writeDefault: false,
    loadError: true,
  }, `both keys holding ${bad}`);
  assert.deepEqual(resolveTvLocation(null, bad), {
    defaultLocation: undefined,
    current: undefined,
    writeDefault: false,
    loadError: true,
  }, `current holding ${bad}`);
  assert.deepEqual(resolveTvLocation(stored(ames), bad), {
    defaultLocation: ames,
    current: ames,
    writeDefault: false,
    loadError: true,
  }, `default kept when current holds ${bad}`);
  assert.deepEqual(resolveTvLocation(bad, stored(boise)), {
    defaultLocation: boise,
    current: boise,
    writeDefault: true,
    loadError: true,
  }, `current kept when default holds ${bad}`);
}
assert.deepEqual(TV_LOCATION_READ_FAILED, { writeDefault: false, loadError: true });

assert.deepEqual(
  destinationFromStored({ latitude: 40, longitude: -100 }),
  { label: 'Saved map location', latitude: 40, longitude: -100 },
);
assert.deepEqual(
  destinationFromStored({ label: '  Ames, Iowa ', latitude: 42.0308, longitude: -93.6319 }),
  ames,
);
assert.equal(destinationFromStored({ label: 'x', latitude: 0, longitude: 181 }), undefined);

// Picker buttons.
assert.deepEqual(pickerControls(undefined, undefined), {
  primaryLabel: 'Save this location',
  primaryEnabled: false,
  showUseDefault: false,
  showMakeDefault: false,
});
assert.deepEqual(pickerControls(ames, undefined), {
  primaryLabel: 'Save this location',
  primaryEnabled: true,
  showUseDefault: false,
  showMakeDefault: false,
});
assert.deepEqual(pickerControls(ames, ames), {
  primaryLabel: 'Use this map location',
  primaryEnabled: true,
  showUseDefault: false,
  showMakeDefault: false,
});
assert.deepEqual(pickerControls({ ...ames, label: 'Other name' }, ames), {
  primaryLabel: 'Use this map location',
  primaryEnabled: true,
  showUseDefault: false,
  showMakeDefault: false,
});
assert.deepEqual(pickerControls(boise, ames), {
  primaryLabel: 'Use this map location',
  primaryEnabled: true,
  showUseDefault: true,
  showMakeDefault: true,
});
assert.equal(defaultButtonLabel(ames), 'Use my default (Ames, Iowa)');

// Step 1 offers the default only when the current point differs from it.
assert.equal(showUseDefaultOnStepOne(undefined, undefined), false);
assert.equal(showUseDefaultOnStepOne(ames, undefined), false);
assert.equal(showUseDefaultOnStepOne(ames, ames), false);
assert.equal(showUseDefaultOnStepOne(boise, ames), true);

// Account buttons and status line.
assert.deepEqual(accountControls('signed-in'), { signIn: false, switchAccount: true, signOut: true });
assert.deepEqual(accountControls('signed-out'), { signIn: true, switchAccount: false, signOut: false });
assert.deepEqual(accountControls('unknown'), { signIn: true, switchAccount: true, signOut: true });
assert.equal(sessionStatusText('signed-in'), 'Signed in on this phone');
assert.equal(sessionStatusText('signed-out'), 'Not signed in on this phone');
assert.equal(sessionStatusText('unknown'), 'Sign-in status is not available');

// App-opened pages stay inside the navigation gate.
assert.equal(VERIFY_URL, 'https://tv.youtube.com/verify');
for (const url of [VERIFY_URL, SIGN_IN_URL, SWITCH_ACCOUNT_URL]) {
  assert.equal(allowVerifyNavigation({ url, isTopFrame: true }), true, url);
}
assert.equal(httpsHost(SWITCH_ACCOUNT_URL), 'accounts.google.com');
assert.equal(httpsHost(new URL(SWITCH_ACCOUNT_URL).searchParams.get('continue')), 'tv.youtube.com');
assert.equal(allowVerifyNavigation({ url: 'https://example.com/', isTopFrame: true }), false);
assert.equal(allowVerifyNavigation({ url: 'https://notyoutube.com/', isTopFrame: true }), false);
assert.equal(allowVerifyNavigation({ url: 'http://tv.youtube.com/', isTopFrame: true }), false);

// The account view returns only after Google's account pages lead back to YouTube TV.
const signIn = (seen, url, title) => accountViewProgress(seen, url, title);
assert.deepEqual(signIn(false, 'https://tv.youtube.com/verify'), {
  sawAccountsPage: false,
  blocked: false,
  finished: false,
});
assert.deepEqual(signIn(false, 'https://accounts.google.com/v3/signin/identifier'), {
  sawAccountsPage: true,
  blocked: false,
  finished: false,
});
assert.deepEqual(signIn(true, 'https://accounts.youtube.com/accounts/SetSID'), {
  sawAccountsPage: true,
  blocked: false,
  finished: false,
});
assert.deepEqual(signIn(true, 'https://tv.youtube.com/verify'), {
  sawAccountsPage: true,
  blocked: false,
  finished: true,
});

// Google's refusal pages.
assert.equal(isGoogleBlockPage('https://accounts.google.com/v3/signin/rejected?x=1'), true);
assert.equal(isGoogleBlockPage('https://accounts.google.com/signin/rejected'), true);
assert.equal(
  isGoogleBlockPage('https://accounts.google.com/signin/oauth/error?authError=disallowed_useragent'),
  true,
);
assert.equal(
  isGoogleBlockPage('https://accounts.google.com/v3/signin/x', 'This browser or app may not be secure'),
  true,
);
assert.equal(isGoogleBlockPage('https://accounts.google.com/v3/signin/identifier', 'Sign in'), false);
assert.equal(isGoogleBlockPage('https://tv.youtube.com/signin/rejected'), false);
assert.equal(signIn(true, 'https://accounts.google.com/v3/signin/rejected').blocked, true);

// Host guard: the injection runs against fake page objects.
function runInjection(hostname) {
  const posted = [];
  const window = {
    location: { hostname, href: `https://${hostname}/verify` },
    ReactNativeWebView: { postMessage: (message) => posted.push(JSON.parse(message)) },
  };
  const navigator = {};
  const context = {
    window,
    navigator,
    document: { addEventListener() {}, body: null, querySelectorAll: () => [] },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: () => 1,
  };
  vm.runInNewContext(createGeolocationInjection(ames), context);
  return { posted, navigator, window };
}

for (const hostname of ['tv.youtube.com', 'youtube.com', 'www.youtube.com', 'accounts.youtube.com']) {
  const page = runInjection(hostname);
  assert.equal(page.window.__DANNER_GEOLOCATION_SHIM__, true, hostname);
  assert.ok(page.navigator.geolocation, `${hostname} has the shim`);
  assert.deepEqual(page.posted.map((message) => message.event), ['ready'], hostname);
  assert.equal(page.posted[0].latitude, ames.latitude);
  assert.equal(page.posted[0].longitude, ames.longitude);
}
for (const hostname of [
  'accounts.google.com',
  'www.google.com',
  'myaccount.google.com',
  'notyoutube.com',
  'youtube.com.example.com',
  '',
]) {
  const page = runInjection(hostname);
  assert.equal(page.window.__DANNER_GEOLOCATION_SHIM__, undefined, `${hostname} is guarded`);
  assert.equal(page.navigator.geolocation, undefined, `${hostname} is guarded`);
  assert.deepEqual(page.posted, [], `${hostname} posts nothing`);
}

// Source checks over every app source file.
function sourceFiles(directory) {
  const skipped = new Set(['node_modules', 'android', 'ios', '.expo', 'dist', 'assets']);
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!skipped.has(entry.name)) {
        files.push(...sourceFiles(full));
      }
    } else if (/\.(ts|tsx|html)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const files = sourceFiles(appRoot);
assert.ok(files.length > 20, 'source scan found the app');
const screenSource = readFileSync(path.join(appRoot, 'tvLocation/TvLocationScreen.tsx'), 'utf8');
let incognitoWebViews = 0;
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const relative = path.relative(appRoot, file);

  assert.ok(!/42\.808371|92\.2578433/.test(source), `${relative} holds the old built-in point`);
  assert.ok(!/TRIPOLI_DESTINATION|isTripoli|DEFAULT_START/.test(source), `${relative} names a built-in point`);

  const code = source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'));
  for (const line of code) {
    if (/\bincognito\b/.test(line)) {
      assert.equal(line.trim(), "incognito={Platform.OS === 'ios'}", `${relative}: ${line.trim()}`);
      incognitoWebViews += 1;
    }
  }
}
assert.ok(incognitoWebViews >= 1, 'source scan found the team player WebViews');
assert.ok(!/\bincognito\b/.test(screenSource), 'TV Location WebViews never set incognito');

// The account view carries no script and no credential field.
const accountView = screenSource.slice(
  screenSource.indexOf('function AccountView('),
  screenSource.indexOf('export function TvLocationScreen('),
);
assert.ok(accountView.length > 200, 'AccountView source found');
assert.ok(!/inject/i.test(accountView), 'AccountView has no injection');
for (const word of ['password', 'credential', 'TextInput', 'secureTextEntry']) {
  const uses = screenSource
    .split('\n')
    .filter((line) => line.toLowerCase().includes(word.toLowerCase()))
    .filter((line) => !line.includes('use your password'));
  assert.deepEqual(uses, [], `${word} does not appear in the screen`);
}

console.log('TV Location checks passed.');
