import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
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

assert.deepEqual(parseReleaseVersion('v1.3.4'), {
  version: '1.3.4',
  versionCode: 10304,
});
assert.deepEqual(parseReleaseVersion('1.0'), {
  version: '1.0',
  versionCode: 10000,
});
assert.equal(parseReleaseVersion(undefined), undefined);
assert.equal(parseReleaseVersion('nope'), undefined);
assert.equal(compareSemver('1.3.4', '1.3.3') > 0, true);
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

const here = dirname(fileURLToPath(import.meta.url));
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
assert.deepEqual(parseReleaseVersion('1.3.10'), {
  version: '1.3.10',
  versionCode: 10310,
});

const liveManifest = await fetchVersionManifest();
assert.ok(liveManifest === undefined || typeof liveManifest.version === 'string');

console.log('App update version checks passed.');
