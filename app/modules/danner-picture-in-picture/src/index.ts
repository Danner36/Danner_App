import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

type Subscription = { remove: () => void };

type DannerPictureInPictureModule = {
  addListener: (event: 'onPictureInPictureClosed', listener: () => void) => Subscription;
  enter: () => Promise<boolean>;
  isSupported: () => boolean;
  setArmed: (armed: boolean) => Promise<void>;
};

// Android only. iPhone has no module, so every call does nothing there.
const nativeModule =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<DannerPictureInPictureModule>('DannerPictureInPicture')
    : null;

export function pictureInPictureSupported(): boolean {
  try {
    return nativeModule?.isSupported() === true;
  } catch {
    return false;
  }
}

// Armed while a player is open, so leaving the app moves the game into the small window.
export function setPictureInPictureArmed(armed: boolean): void {
  nativeModule?.setArmed(armed).catch(() => undefined);
}

export async function enterPictureInPicture(): Promise<boolean> {
  try {
    return (await nativeModule?.enter()) === true;
  } catch {
    return false;
  }
}

// Called when the person closes the small window.
export function onPictureInPictureClosed(listener: () => void): Subscription {
  return nativeModule?.addListener('onPictureInPictureClosed', listener) ?? { remove: () => {} };
}
