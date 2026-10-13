import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type DannerWebViewCookiesModule = {
  flushCookies: () => Promise<boolean>;
};

const nativeModule =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<DannerWebViewCookiesModule>(
        'DannerWebViewCookies',
      )
    : null;

// Writes pending WebView cookie changes to disk. iPhone has no equivalent call, so this
// does nothing there. A failed flush leaves the cookies to the WebView's own timed write.
export async function flushWebViewCookies(): Promise<void> {
  try {
    await nativeModule?.flushCookies();
  } catch {
    return;
  }
}
