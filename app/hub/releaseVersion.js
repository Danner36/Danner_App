// Shared by app.config.js (native version bake), hub/appUpdate.ts (embedded and published
// versions), and release/build-update-assets.mjs (update manifest), so all three accept exactly
// the same tags. CommonJS keeps it loadable by Expo config evaluation, Metro, and plain Node.
// .github/workflows/release.yml repeats this pattern in shell; tests/app-update keeps them equal.

// MAJOR.MINOR.PATCH with an optional leading `v`, digits only, no leading zeros. Minor and patch
// stay below 100 so versionCode (major * 10000 + minor * 100 + patch) is unique and ordered, and
// major stays below 100000 so versionCode stays under Android's 2100000000 limit.
const RELEASE_VERSION_PATTERN = /^v?(0|[1-9]\d{0,4})\.(0|[1-9]\d?)\.(0|[1-9]\d?)$/;

/**
 * @param {unknown} raw
 * @returns {{ version: string, versionCode: number } | undefined}
 */
function parseReleaseVersion(raw) {
  if (typeof raw !== 'string') {
    return undefined;
  }

  const match = RELEASE_VERSION_PATTERN.exec(raw);
  if (!match) {
    return undefined;
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return {
    version: `${major}.${minor}.${patch}`,
    versionCode: major * 10000 + minor * 100 + patch,
  };
}

module.exports = { parseReleaseVersion };
