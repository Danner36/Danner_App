const appJson = require('./app.json');
const { parseReleaseVersion } = require('./hub/releaseVersion.js');

function readRelease(tag) {
  if (tag === undefined || tag === '') {
    return undefined;
  }

  const release = parseReleaseVersion(tag);
  if (!release) {
    throw new Error(
      `RELEASE_TAG "${tag}" must be vMAJOR.MINOR.PATCH with digits only and minor and patch from 0 to 99.`,
    );
  }
  return release;
}

const release = readRelease(process.env.RELEASE_TAG);
const expo = appJson.expo;

module.exports = {
  expo: {
    ...expo,
    version: release?.version ?? expo.version,
    ios: {
      ...expo.ios,
      buildNumber: release ? String(release.versionCode) : expo.ios.buildNumber,
    },
    android: {
      ...expo.android,
      versionCode: release?.versionCode ?? expo.android.versionCode,
    },
  },
};
