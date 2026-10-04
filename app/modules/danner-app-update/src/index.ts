import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type DannerAppUpdateModule = {
  installApk: (url: string, sha256: string) => Promise<string>;
};

export type ReleaseApkInstallResult =
  | { status: 'cancelled' | 'installed' | 'prompted' }
  | { message: string; status: 'failed' | 'needs-permission' };

const INSTALL_FAILED_MESSAGE = 'The update could not be installed.';

const nativeModule =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<DannerAppUpdateModule>('DannerAppUpdate')
    : null;

// Module scope so a hub that remounts mid-download follows the same install instead of
// starting a second one.
let activeInstall: Promise<ReleaseApkInstallResult> | undefined;

export function isAppUpdateInstallAvailable(): boolean {
  return nativeModule != null && Platform.OS === 'android';
}

export function getActiveReleaseApkInstall():
  | Promise<ReleaseApkInstallResult>
  | undefined {
  return activeInstall;
}

export function installReleaseApk(
  url: string,
  sha256: string,
): Promise<ReleaseApkInstallResult> {
  if (!activeInstall) {
    activeInstall = runInstall(url, sha256).finally(() => {
      activeInstall = undefined;
    });
  }
  return activeInstall;
}

async function runInstall(
  url: string,
  sha256: string,
): Promise<ReleaseApkInstallResult> {
  if (!nativeModule) {
    return { message: 'This phone cannot install the Android update.', status: 'failed' };
  }

  try {
    const result = await nativeModule.installApk(url, sha256);
    if (result === 'cancelled' || result === 'installed') {
      return { status: result };
    }

    return { status: 'prompted' };
  } catch (error) {
    const message =
      error instanceof Error && error.message.length > 0
        ? error.message
        : INSTALL_FAILED_MESSAGE;
    const code =
      error != null && typeof error === 'object' && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
    return {
      message,
      status: code === 'ERR_INSTALL_PERMISSION' ? 'needs-permission' : 'failed',
    };
  }
}
