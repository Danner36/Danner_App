import { requireOptionalNativeModule } from 'expo';

export type YouTubeSessionState = 'signed-in' | 'signed-out' | 'unknown';

type DannerWebViewCookiesModule = {
  flushCookies?: () => Promise<boolean>;
  clearYouTubeSession: () => Promise<boolean>;
  youTubeSessionState: () => Promise<string>;
};

const nativeModule = requireOptionalNativeModule<DannerWebViewCookiesModule>(
  'DannerWebViewCookies',
);

// Writes pending WebView cookie changes to disk. iPhone has no equivalent call, so this
// does nothing there. A failed flush leaves the cookies to the WebView's own timed write.
export async function flushWebViewCookies(): Promise<void> {
  try {
    await nativeModule?.flushCookies?.();
  } catch {
    return;
  }
}

// On Android this clears every WebView cookie and all web storage in the app; CookieManager
// has no per-domain delete. On iPhone it clears only Google and YouTube data.
export async function clearYouTubeSession(): Promise<boolean> {
  try {
    return (await nativeModule?.clearYouTubeSession()) === true;
  } catch {
    return false;
  }
}

export async function youTubeSessionState(): Promise<YouTubeSessionState> {
  try {
    const state = await nativeModule?.youTubeSessionState();
    return state === 'signed-in' || state === 'signed-out' ? state : 'unknown';
  } catch {
    return 'unknown';
  }
}
