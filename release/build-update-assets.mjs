import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseReleaseVersion(raw) {
  if (typeof raw !== 'string') {
    return undefined;
  }

  const version = raw.trim().replace(/^v/i, '');
  // Keeps this in step with app/hub/appUpdate.ts: parseInt alone accepts trailing garbage,
  // which would also land unvalidated in the release asset URLs built below.
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(version)) {
    return undefined;
  }

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

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const tag = process.argv[2];
const apkPath = process.argv[3];
const ipaPath = process.argv[4];
const outDir = process.argv[5];
const parsed = parseReleaseVersion(tag);
if (!parsed || !apkPath || !ipaPath || !outDir) {
  throw new Error('Usage: build-update-assets.mjs <tag> <apk> <ipa> <outDir>');
}

const repo = process.env.GITHUB_REPOSITORY || 'Danner36/Danner_App';
const apkSha = sha256File(apkPath);
const ipaSha = sha256File(ipaPath);
const apkSize = statSync(apkPath).size;
const ipaSize = statSync(ipaPath).size;
const apkUrl = `https://github.com/${repo}/releases/download/${tag}/Danner-Apps-Android.apk`;
const ipaUrl = `https://github.com/${repo}/releases/download/${tag}/Danner-Apps-iOS.ipa`;
const sourceUrl = `https://github.com/${repo}/releases/latest/download/sidestore-source.json`;
const date = new Date().toISOString().slice(0, 10);

const manifest = {
  version: parsed.version,
  tag,
  android: {
    versionCode: parsed.versionCode,
    url: apkUrl,
    sha256: apkSha,
    size: apkSize,
  },
  ios: {
    versionCode: parsed.versionCode,
    url: ipaUrl,
    sha256: ipaSha,
    size: ipaSize,
  },
};

const source = {
  name: 'Danner Apps',
  identifier: 'com.danner.locationhelper.source',
  sourceURL: sourceUrl,
  apps: [
    {
      name: 'Danner Apps',
      bundleIdentifier: 'com.danner.locationhelper',
      developerName: 'Danner',
      subtitle: 'Danner family tools',
      localizedDescription: 'Guardians, Patriots, and TV Location.',
      iconURL: `https://raw.githubusercontent.com/${repo}/main/Docs/Art/media/ic_launcher_danner.jpg`,
      tintColor: '1F6F55',
      versions: [
        {
          version: parsed.version,
          buildVersion: String(parsed.versionCode),
          date,
          localizedDescription: `Danner Apps ${tag}`,
          downloadURL: ipaUrl,
          size: ipaSize,
        },
      ],
    },
  ],
};

writeFileSync(
  resolve(outDir, 'version-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
writeFileSync(
  resolve(outDir, 'sidestore-source.json'),
  `${JSON.stringify(source, null, 2)}\n`,
);
