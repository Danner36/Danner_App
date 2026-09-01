export const APP_UPDATE_MANIFEST_URL =
  process.env.EXPO_PUBLIC_APP_UPDATE_MANIFEST_URL ??
  'https://github.com/Danner36/Danner_App/releases/latest/download/version-manifest.json';

export const APP_UPDATE_PROMPT_TITLE = 'Update available';
export const APP_UPDATE_PROMPT_ANDROID =
  'Install the new Danner Apps version on this phone?';
export const APP_UPDATE_PROMPT_IOS =
  'Connect to Wi-Fi, open LocalDevVPN, then update in SideStore.';
export const APP_UPDATE_DOWNLOADING = 'Downloading update…';
export const APP_UPDATE_SIDESTORE_MISSING =
  'SideStore must be installed to update on iPhone.';

const MANIFEST_TIMEOUT_MS = 8_000;

export type VersionManifest = {
  android: ReleaseAsset;
  ios: ReleaseAsset;
  tag: string;
  version: string;
};

export type ReleaseAsset = {
  sha256: string;
  size: number;
  url: string;
  versionCode: number;
};

let updatePromptDismissed = false;

export function getEmbeddedAppVersion(): string | undefined {
  return parseReleaseVersion(process.env.EXPO_PUBLIC_APP_VERSION)?.version;
}

export function parseReleaseVersion(
  raw: string | undefined,
): { version: string; versionCode: number } | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }

  const version = raw.trim().replace(/^v/i, '');
  // parseInt alone accepts trailing garbage, so "99.0whatever" would read as 99.0 and could
  // trigger an update prompt. Require the whole string to be digits and dots first.
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
    // Two decimal digits per component, matching the Android versionCode baked in by
    // app.config.js. A minor or patch reaching 100 would collide (1.0.100 == 1.1.0), so
    // both must stay below that.
    versionCode: major * 10000 + minor * 100 + patch,
  };
}

export function compareSemver(left: string, right: string): number {
  const first = parseReleaseVersion(left);
  const second = parseReleaseVersion(right);
  if (!first || !second) {
    return 0;
  }

  return first.versionCode - second.versionCode;
}

export function isNewerRelease(remote: string, embedded: string): boolean {
  return compareSemver(remote, embedded) > 0;
}

export function isTrustedReleaseAssetUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    return host === 'github.com' || host.endsWith('.githubusercontent.com');
  } catch {
    return false;
  }
}

export function parseVersionManifest(data: unknown): VersionManifest | undefined {
  if (data == null || typeof data !== 'object') {
    return undefined;
  }

  const document = data as Record<string, unknown>;
  const version = parseReleaseVersion(
    typeof document.version === 'string' ? document.version : undefined,
  );
  const tag = typeof document.tag === 'string' ? document.tag.trim() : '';
  const android = parseReleaseAsset(document.android);
  const ios = parseReleaseAsset(document.ios);
  if (
    !version ||
    !/^v\d+\.\d+(?:\.\d+)?$/i.test(tag) ||
    !android ||
    !ios
  ) {
    return undefined;
  }

  return {
    android,
    ios,
    tag,
    version: version.version,
  };
}

export function shouldOfferAppUpdate(options: {
  embeddedVersion: string | undefined;
  hubVisible?: boolean;
  remoteVersion: string | undefined;
  signingWarningVisible: boolean;
}): boolean {
  if (options.hubVisible === false) {
    return false;
  }

  if (options.signingWarningVisible || updatePromptDismissed) {
    return false;
  }

  if (!options.embeddedVersion || !options.remoteVersion) {
    return false;
  }

  return isNewerRelease(options.remoteVersion, options.embeddedVersion);
}

export function dismissAppUpdatePrompt(): void {
  updatePromptDismissed = true;
}

export function wasAppUpdatePromptDismissed(): boolean {
  return updatePromptDismissed;
}

export function resetAppUpdatePromptForTests(): void {
  updatePromptDismissed = false;
}

export function sideStoreInstallUrl(ipaUrl: string): string {
  return `sidestore://install?url=${encodeURIComponent(ipaUrl)}`;
}

export async function fetchVersionManifest(
  url: string = APP_UPDATE_MANIFEST_URL,
): Promise<VersionManifest | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MANIFEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'danner-apps',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return undefined;
    }

    return parseVersionManifest(await response.json());
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

function parseReleaseAsset(value: unknown): ReleaseAsset | undefined {
  if (value == null || typeof value !== 'object') {
    return undefined;
  }

  const asset = value as Record<string, unknown>;
  const url = typeof asset.url === 'string' ? asset.url : '';
  const sha256 = typeof asset.sha256 === 'string' ? asset.sha256.trim() : '';
  const size = typeof asset.size === 'number' ? asset.size : Number.NaN;
  const versionCode =
    typeof asset.versionCode === 'number'
      ? asset.versionCode
      : Number.parseInt(String(asset.versionCode ?? ''), 10);
  if (
    !isTrustedReleaseAssetUrl(url) ||
    !/^[0-9a-f]{64}$/i.test(sha256) ||
    !Number.isFinite(size) ||
    size <= 0 ||
    !Number.isFinite(versionCode) ||
    versionCode < 1
  ) {
    return undefined;
  }

  return {
    sha256: sha256.toLowerCase(),
    size,
    url,
    versionCode,
  };
}
