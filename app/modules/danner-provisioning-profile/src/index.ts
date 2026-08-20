import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type DannerProvisioningProfileModule = {
  getExpirationTimestamp: () => number | null;
};

const nativeModule =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<DannerProvisioningProfileModule>(
        'DannerProvisioningProfile',
      )
    : null;

export function getProvisioningExpirationTimestamp(): number | undefined {
  const timestamp = nativeModule?.getExpirationTimestamp();
  return typeof timestamp === 'number' && Number.isFinite(timestamp)
    ? timestamp
    : undefined;
}
