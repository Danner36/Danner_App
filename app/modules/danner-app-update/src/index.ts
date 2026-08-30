import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type DannerAppUpdateModule = {
  installApk: (url: string, sha256: string) => Promise<string>;
};

const nativeModule =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<DannerAppUpdateModule>('DannerAppUpdate')
    : null;

export function isAppUpdateInstallAvailable(): boolean {
  return nativeModule != null && Platform.OS === 'android';
}

export async function installReleaseApk(
  url: string,
  sha256: string,
): Promise<{ message?: string; status: 'cancelled' | 'failed' | 'installed' }> {
  if (!nativeModule) {
    return { message: 'This phone cannot install the Android update.', status: 'failed' };
  }

  try {
    const result = await nativeModule.installApk(url, sha256);
    if (result === 'cancelled') {
      return { status: 'cancelled' };
    }

    return { status: 'installed' };
  } catch (error) {
    const message =
      error instanceof Error && error.message.length > 0
        ? error.message
        : 'The update could not be installed.';
    return { message, status: 'failed' };
  }
}
