const appJson = require('./app.json');

function parseReleaseVersion(raw) {
  if (typeof raw !== 'string') {
    return undefined;
  }

  const version = raw.trim().replace(/^v/i, '');
  const parts = version.split('.').map((part) => Number.parseInt(part, 10));
  if (
    parts.length < 2 ||
    parts.length > 3 ||
    parts.some((part) => !Number.isFinite(part) || part < 0)
  ) {
    return undefined;
  }

  const [major = 0, minor = 0, patch = 0] = parts;
  return {
    version:
      parts.length === 2 ? `${major}.${minor}` : `${major}.${minor}.${patch}`,
    versionCode: major * 10000 + minor * 100 + patch,
  };
}

const release =
  parseReleaseVersion(process.env.RELEASE_TAG) ||
  parseReleaseVersion(process.env.EXPO_PUBLIC_APP_VERSION);
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
