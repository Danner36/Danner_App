import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  APP_UPDATE_MANIFEST_URL,
  compareSemver,
  dismissAppUpdatePrompt,
  fetchVersionManifest,
  isNewerRelease,
  isTrustedReleaseAssetUrl,
  parseReleaseVersion,
  parseVersionManifest,
  resetAppUpdatePromptForTests,
  shouldOfferAppUpdate,
  sideStoreInstallUrl,
} from '../../app/hub/appUpdate.ts';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const validVersions = [
  ['v1.3.4', '1.3.4', 10304],
  ['1.3.4', '1.3.4', 10304],
  ['v1.3.10', '1.3.10', 10310],
  ['v1.4.12', '1.4.12', 10412],
  ['v0.0.1', '0.0.1', 1],
  ['v1.99.99', '1.99.99', 19999],
  ['v2.0.0', '2.0.0', 20000],
  ['v10.0.0', '10.0.0', 100000],
  ['v99999.99.99', '99999.99.99', 999999999],
];
const invalidVersions = [
  undefined,
  '',
  'v',
  'nope',
  '1.0',
  'v1.0',
  '1.4.12.0',
  '99.0whatever',
  'v1.4.1-beta',
  'v1.4.12+build',
  'v1.4.100',
  'v1.100.0',
  'v01.4.12',
  'v1.04.12',
  'v1.4.012',
  'V1.4.12',
  'vv1.4.12',
  ' v1.4.12',
  'v1.4.12 ',
  'v1..12',
  'v-1.4.12',
  'v1e3.0.0',
  'v100000.0.0',
];

for (const [raw, version, versionCode] of validVersions) {
  assert.deepEqual(parseReleaseVersion(raw), { version, versionCode }, raw);
}
for (const raw of invalidVersions) {
  assert.equal(parseReleaseVersion(raw), undefined, String(raw));
}
assert.equal(compareSemver('1.3.4', '1.3.3') > 0, true);
assert.equal(compareSemver('1.3.10', '1.3.9') > 0, true);
assert.equal(compareSemver('1.4.0', '1.3.99') > 0, true);
assert.equal(compareSemver('1.0', '1.0.0'), 0);
assert.equal(isNewerRelease('1.3.4', '1.3.3'), true);
assert.equal(isNewerRelease('1.3.3', '1.3.3'), false);
assert.equal(isNewerRelease('1.3.2', '1.3.3'), false);

assert.equal(
  isTrustedReleaseAssetUrl(
    'https://github.com/Danner36/Danner_App/releases/download/v1.3.4/Danner-Apps-Android.apk',
  ),
  true,
);
assert.equal(
  isTrustedReleaseAssetUrl(
    'https://objects.githubusercontent.com/github-production-release-asset/1',
  ),
  true,
);
assert.equal(isTrustedReleaseAssetUrl('http://github.com/Danner36/Danner_App/a.apk'), false);
assert.equal(isTrustedReleaseAssetUrl('https://example.com/app.apk'), false);

const asset = {
  sha256: 'a'.repeat(64),
  size: 10,
  url: 'https://github.com/Danner36/Danner_App/releases/download/v1.3.4/Danner-Apps-Android.apk',
  versionCode: 10304,
};
const manifest = parseVersionManifest({
  version: '1.3.4',
  tag: 'v1.3.4',
  android: asset,
  ios: {
    ...asset,
    url: 'https://github.com/Danner36/Danner_App/releases/download/v1.3.4/Danner-Apps-iOS.ipa',
  },
});
assert.equal(manifest?.version, '1.3.4');
assert.equal(parseVersionManifest({ version: '1.3.4' }), undefined);
for (const [version, tag] of [
  ['1.3.4', '1.3.4'],
  ['1.3.4', 'v1.3.5'],
  ['1.3.4', 'v1.3.4-beta'],
  ['1.3', 'v1.3'],
  ['1.3.100', 'v1.3.100'],
]) {
  assert.equal(
    parseVersionManifest({ version, tag, android: asset, ios: asset }),
    undefined,
    `${version} ${tag}`,
  );
}
assert.equal(
  parseVersionManifest({
    version: '1.3.4',
    tag: 'v1.3.4',
    android: { ...asset, url: 'https://evil.example/app.apk' },
    ios: asset,
  }),
  undefined,
);

resetAppUpdatePromptForTests();
assert.equal(
  shouldOfferAppUpdate({
    embeddedVersion: '1.3.3',
    remoteVersion: '1.3.4',
    signingWarningVisible: false,
  }),
  true,
);
assert.equal(
  shouldOfferAppUpdate({
    embeddedVersion: '1.3.4',
    remoteVersion: '1.3.4',
    signingWarningVisible: false,
  }),
  false,
);
assert.equal(
  shouldOfferAppUpdate({
    embeddedVersion: '1.3.3',
    remoteVersion: '1.3.4',
    signingWarningVisible: true,
  }),
  false,
);
assert.equal(
  shouldOfferAppUpdate({
    embeddedVersion: undefined,
    remoteVersion: '1.3.4',
    signingWarningVisible: false,
  }),
  false,
);
assert.equal(
  shouldOfferAppUpdate({
    embeddedVersion: '1.3.3',
    hubVisible: false,
    remoteVersion: '1.3.4',
    signingWarningVisible: false,
  }),
  false,
);
assert.equal(
  shouldOfferAppUpdate({
    embeddedVersion: '1.3.3',
    hubVisible: true,
    remoteVersion: '1.3.4',
    signingWarningVisible: false,
  }),
  true,
);

dismissAppUpdatePrompt();
assert.equal(
  shouldOfferAppUpdate({
    embeddedVersion: '1.3.3',
    remoteVersion: '1.3.4',
    signingWarningVisible: false,
  }),
  false,
);
resetAppUpdatePromptForTests();

assert.equal(
  sideStoreInstallUrl(
    'https://github.com/Danner36/Danner_App/releases/download/v1.3.4/Danner-Apps-iOS.ipa',
  ),
  'sidestore://install?url=https%3A%2F%2Fgithub.com%2FDanner36%2FDanner_App%2Freleases%2Fdownload%2Fv1.3.4%2FDanner-Apps-iOS.ipa',
);
assert.equal(
  APP_UPDATE_MANIFEST_URL,
  'https://github.com/Danner36/Danner_App/releases/latest/download/version-manifest.json',
);

// app.config.js bakes RELEASE_TAG into the native version with the same parser and fails loudly
// on anything else. Without RELEASE_TAG the build stays 1.0 / 1, whatever
// EXPO_PUBLIC_APP_VERSION says.
const appConfigPath = join(here, '../../app/app.config.js');
function loadAppConfig(env) {
  const saved = {
    EXPO_PUBLIC_APP_VERSION: process.env.EXPO_PUBLIC_APP_VERSION,
    RELEASE_TAG: process.env.RELEASE_TAG,
  };
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  delete require.cache[require.resolve(appConfigPath)];
  try {
    const { expo } = require(appConfigPath);
    return {
      buildNumber: expo.ios.buildNumber,
      version: expo.version,
      versionCode: expo.android.versionCode,
    };
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

assert.deepEqual(
  loadAppConfig({ EXPO_PUBLIC_APP_VERSION: 'v9.9.9', RELEASE_TAG: undefined }),
  { buildNumber: '1', version: '1.0', versionCode: 1 },
);
assert.deepEqual(
  loadAppConfig({ EXPO_PUBLIC_APP_VERSION: undefined, RELEASE_TAG: '' }),
  { buildNumber: '1', version: '1.0', versionCode: 1 },
);
for (const [raw, version, versionCode] of validVersions) {
  assert.deepEqual(
    loadAppConfig({ EXPO_PUBLIC_APP_VERSION: undefined, RELEASE_TAG: raw }),
    { buildNumber: String(versionCode), version, versionCode },
    raw,
  );
}
for (const raw of invalidVersions) {
  if (raw === undefined || raw === '') {
    continue;
  }
  assert.throws(
    () => loadAppConfig({ EXPO_PUBLIC_APP_VERSION: undefined, RELEASE_TAG: raw }),
    /RELEASE_TAG/,
    raw,
  );
}

// The release workflow checks the tag with a shell regex before either build starts and filters
// tags with the same regex when choosing Latest; it must accept exactly the `v`-prefixed tags the
// shared parser accepts.
const workflow = readFileSync(join(here, '../../.github/workflows/release.yml'), 'utf8');
const workflowPatterns = [
  ...workflow.matchAll(/"\$RELEASE_TAG" =~ (\S+) \]\]/g),
  ...workflow.matchAll(/grep -E '(\^v[^']+)'/g),
].map((match) => match[1]);
assert.equal(workflowPatterns.length, 3);
for (const pattern of workflowPatterns) {
  const workflowTag = new RegExp(pattern);
  for (const raw of [...validVersions.map(([tag]) => tag), ...invalidVersions]) {
    if (raw === undefined) {
      continue;
    }
    assert.equal(
      workflowTag.test(raw),
      raw.startsWith('v') && parseReleaseVersion(raw) !== undefined,
      raw,
    );
  }
}

const workDir = mkdtempSync(join(tmpdir(), 'danner-update-'));
const apkPath = join(workDir, 'Danner-Apps-Android.apk');
const ipaPath = join(workDir, 'Danner-Apps-iOS.ipa');
writeFileSync(apkPath, 'android-apk');
writeFileSync(ipaPath, 'ios-ipa');
execFileSync(
  process.execPath,
  [
    join(here, '../../release/build-update-assets.mjs'),
    'v1.3.4',
    apkPath,
    ipaPath,
    workDir,
  ],
  {
    env: {
      ...process.env,
      GITHUB_REPOSITORY: 'Danner36/Danner_App',
    },
  },
);

const written = JSON.parse(readFileSync(join(workDir, 'version-manifest.json'), 'utf8'));
assert.equal(written.version, '1.3.4');
assert.equal(written.tag, 'v1.3.4');
assert.equal(written.android.versionCode, 10304);
assert.equal(
  written.android.url,
  'https://github.com/Danner36/Danner_App/releases/download/v1.3.4/Danner-Apps-Android.apk',
);
assert.match(written.android.sha256, /^[0-9a-f]{64}$/);
assert.equal(parseVersionManifest(written)?.version, '1.3.4');

const source = JSON.parse(readFileSync(join(workDir, 'sidestore-source.json'), 'utf8'));
assert.equal(source.apps[0].bundleIdentifier, 'com.danner.locationhelper');
assert.equal(source.apps[0].versions[0].version, '1.3.4');
assert.equal(source.apps[0].versions[0].buildVersion, '10304');
assert.equal(source.apps[0].marketplaceID, undefined);

// The manifest writer rejects any tag the phones could not parse, including a bare version.
for (const badTag of ['1.3.4', 'v1.3.4-beta', 'v1.3.100', 'v1.3']) {
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [join(here, '../../release/build-update-assets.mjs'), badTag, apkPath, ipaPath, workDir],
        { stdio: 'pipe' },
      ),
    /must be vMAJOR\.MINOR\.PATCH/,
    badTag,
  );
}

const liveManifest = await fetchVersionManifest();
assert.ok(liveManifest === undefined || typeof liveManifest.version === 'string');

console.log('App update version checks passed.');
